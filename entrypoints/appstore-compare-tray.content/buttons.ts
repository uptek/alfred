import { sendTrackEvent } from '@/utils/analytics';
import { addToTray, removeFromTray, getTray, watchTray, COMPARE_TRAY_LIMIT } from '~/utils/compareTray';
import { Toast } from '~/utils/toast';

const BUTTON_CLASS = 'alfred-compare-button';
const STYLE_ID = 'alfred-compare-button-styles';

const BUTTON_STYLES = `
  .${BUTTON_CLASS} {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    align-self: start;
    padding: 2px 8px;
    border: 1px solid rgba(26, 26, 26, 0.3);
    border-radius: 4px;
    background: #ffffff;
    color: #1a1a1a;
    font-size: 12px;
    font-weight: 550;
    line-height: 18px;
    cursor: pointer;
    white-space: nowrap;
    transition: background 150ms ease, border-color 150ms ease;
  }

  .${BUTTON_CLASS}:hover {
    background: #f1f1f1;
  }

  .${BUTTON_CLASS}--active {
    background: #1a1a1a;
    border-color: #1a1a1a;
    color: #ffffff;
  }

  .${BUTTON_CLASS}--active:hover {
    background: #303030;
  }

  .${BUTTON_CLASS}--listing {
    margin-top: 8px;
    font-size: 13px;
    padding: 4px 12px;
  }
`;

let trayHandles = new Set<string>();

function injectStyles() {
  if (document.getElementById(STYLE_ID)) {
    return;
  }

  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = BUTTON_STYLES;
  document.head.appendChild(style);
}

function applyButtonState(button: HTMLButtonElement) {
  const inTray = trayHandles.has(button.dataset.handle ?? '');
  button.textContent = inTray ? '✓ Compare' : '+ Compare';
  button.classList.toggle(`${BUTTON_CLASS}--active`, inTray);
  button.title = inTray ? 'Remove from comparison' : 'Add to comparison';
}

function refreshButtons() {
  document.querySelectorAll<HTMLButtonElement>(`.${BUTTON_CLASS}`).forEach(applyButtonState);
}

function createButton(item: CompareTrayItem): HTMLButtonElement {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = BUTTON_CLASS;
  button.dataset.handle = item.handle;
  applyButtonState(button);

  button.addEventListener('click', async (event) => {
    // Cards are wrapped in links — keep the click from navigating
    event.preventDefault();
    event.stopPropagation();

    if (trayHandles.has(item.handle)) {
      await removeFromTray(item.handle);
      return;
    }

    const result = await addToTray(item);

    if (result === 'full') {
      Toast.error(`You can compare up to ${COMPARE_TRAY_LIMIT} apps`);
    } else if (result === 'added') {
      sendTrackEvent('compare_add_app', {
        handle: item.handle,
        page_url: window.location.href
      });
    }
  });

  return button;
}

function injectCardButtons() {
  const cards = document.querySelectorAll<HTMLElement>('[data-controller="app-card"]');

  cards.forEach((card) => {
    if (card.dataset.alfredCompare) {
      return;
    }

    const handle = card.getAttribute('data-app-card-handle-value');
    const name = card.getAttribute('data-app-card-name-value');
    const target = card.querySelector('figure')?.nextElementSibling;

    if (!handle || !name || !target) {
      return;
    }

    target.appendChild(
      createButton({
        handle,
        name,
        iconUrl: card.getAttribute('data-app-card-icon-url-value') ?? undefined
      })
    );
    card.dataset.alfredCompare = 'true';
  });
}

function getListingIconUrl(): string | undefined {
  try {
    const script = document.querySelector('script[type="application/ld+json"]');
    const data = JSON.parse(script?.textContent ?? '') as { image?: string | string[] };
    return Array.isArray(data.image) ? data.image[0] : data.image;
  } catch {
    return undefined;
  }
}

function injectListingButton() {
  const hero = document.querySelector('#adp-hero');

  if (!hero || hero.querySelector(`.${BUTTON_CLASS}`)) {
    return;
  }

  // Only individual listings live at a single-segment path like /judgeme
  const match = window.location.pathname.match(/^\/([a-z0-9][a-z0-9_-]*)$/);
  const h1 = hero.querySelector('h1');

  if (!match?.[1] || !h1) {
    return;
  }

  const button = createButton({
    handle: match[1],
    name: h1.textContent?.trim() ?? match[1],
    iconUrl: getListingIconUrl()
  });
  button.classList.add(`${BUTTON_CLASS}--listing`);
  h1.parentElement?.appendChild(button);
}

export function initCompareButtons(): () => void {
  injectStyles();

  const injectAll = () => {
    injectCardButtons();
    injectListingButton();
  };

  getTray().then((items) => {
    trayHandles = new Set(items.map((item) => item.handle));
    injectAll();
    refreshButtons();
  });

  const unwatch = watchTray((items) => {
    trayHandles = new Set(items.map((item) => item.handle));
    refreshButtons();
  });

  const observer = new MutationObserver((mutations) => {
    const hasNewCards = mutations.some(
      (mutation) =>
        mutation.type === 'childList' &&
        Array.from(mutation.addedNodes).some(
          (node) =>
            node.nodeType === Node.ELEMENT_NODE &&
            ((node as Element).matches('[data-controller="app-card"]') ||
              (node as Element).querySelector('[data-controller="app-card"]') !== null)
        )
    );

    if (hasNewCards) {
      setTimeout(injectAll, 100);
    }
  });

  observer.observe(document.body, { childList: true, subtree: true });

  return () => {
    observer.disconnect();
    unwatch();
  };
}
