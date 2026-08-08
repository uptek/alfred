import { sendTrackEvent } from '@/utils/analytics';
import { addToTray, removeFromTray, getTray, watchTray, COMPARE_TRAY_LIMIT, isAppHandle } from '~/utils/compareTray';
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

  .alfred-compare-fly {
    position: fixed;
    z-index: 2147483001;
    border-radius: 10px;
    border: 1px solid rgba(26, 26, 26, 0.15);
    box-shadow: 0 8px 24px rgba(26, 26, 26, 0.25);
    object-fit: cover;
    pointer-events: none;
    will-change: transform, opacity;
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
  const label = inTray ? 'Remove from comparison' : 'Add to comparison';
  button.title = label;
  button.setAttribute('aria-label', label);
}

function refreshButtons() {
  document.querySelectorAll<HTMLButtonElement>(`.${BUTTON_CLASS}`).forEach(applyButtonState);
}

/**
 * Fly a clone of the app icon from its card into the compare tray,
 * Horizon-theme style: an arced path that shrinks and fades on landing.
 */
function flyToTray(sourceImage: HTMLImageElement | null, iconUrl: string | undefined, fallbackOrigin: DOMRect) {
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    return;
  }

  const src = sourceImage?.currentSrc || sourceImage?.src || iconUrl;

  if (!src) {
    return;
  }

  const origin = sourceImage?.getBoundingClientRect() ?? fallbackOrigin;

  // The tray pill sits fixed bottom-right; aim for its icon strip. On the
  // very first add it hasn't mounted yet, so fall back to where it will be.
  const tray = document.querySelector('aside[aria-label="Compare apps tray"]');
  const target = tray?.getBoundingClientRect() ?? new DOMRect(window.innerWidth - 240, window.innerHeight - 76, 56, 56);

  const ghost = document.createElement('img');
  ghost.src = src;
  ghost.className = 'alfred-compare-fly';
  ghost.style.left = `${origin.left}px`;
  ghost.style.top = `${origin.top}px`;
  ghost.style.width = `${Math.min(origin.width, 96)}px`;
  ghost.style.height = `${Math.min(origin.height, 96)}px`;
  document.body.appendChild(ghost);

  const deltaX = target.left + 28 - (origin.left + origin.width / 2);
  const deltaY = target.top + target.height / 2 - (origin.top + origin.height / 2);
  const lift = Math.min(160, Math.abs(deltaX) * 0.18 + 80);

  const animation = ghost.animate(
    [
      { transform: 'translate(0, 0) scale(1)', opacity: 1, offset: 0, easing: 'cubic-bezier(0.3, 0, 0.4, 1)' },
      {
        transform: `translate(${deltaX * 0.55}px, ${deltaY * 0.4 - lift}px) scale(0.65)`,
        opacity: 1,
        offset: 0.5,
        easing: 'cubic-bezier(0.5, 0, 0.6, 1)'
      },
      // Touch down…
      { transform: `translate(${deltaX}px, ${deltaY}px) scale(0.35)`, opacity: 1, offset: 0.78, easing: 'ease-out' },
      // …bounce…
      {
        transform: `translate(${deltaX}px, ${deltaY - 16}px) scale(0.32)`,
        opacity: 0.9,
        offset: 0.89,
        easing: 'ease-in'
      },
      // …settle and fade
      { transform: `translate(${deltaX}px, ${deltaY}px) scale(0.3)`, opacity: 0, offset: 1 }
    ],
    { duration: 1000 }
  );

  animation.onfinish = () => {
    ghost.remove();

    // Give the tray a little landing pop (re-query: on the first add the
    // tray mounts mid-flight)
    document
      .querySelector('aside[aria-label="Compare apps tray"]')
      ?.animate([{ transform: 'scale(1)' }, { transform: 'scale(1.07)', offset: 0.4 }, { transform: 'scale(1)' }], {
        duration: 250,
        easing: 'ease-out'
      });
  };
  animation.oncancel = () => ghost.remove();
}

function createButton(item: CompareTrayItem, getSourceImage?: () => HTMLImageElement | null): HTMLButtonElement {
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
      flyToTray(getSourceImage?.() ?? null, item.iconUrl, button.getBoundingClientRect());
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
      createButton(
        {
          handle,
          name,
          iconUrl: card.getAttribute('data-app-card-icon-url-value') ?? undefined
        },
        () => card.querySelector('figure img')
      )
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
  const segment = window.location.pathname.replace(/^\//, '');
  const handle = !segment.includes('/') && isAppHandle(segment) ? segment : null;
  const h1 = hero.querySelector('h1');

  if (!handle || !h1) {
    return;
  }

  const button = createButton(
    {
      handle,
      name: h1.textContent?.trim() ?? handle,
      iconUrl: getListingIconUrl()
    },
    () => hero.querySelector('img')
  );
  button.classList.add(`${BUTTON_CLASS}--listing`);
  h1.parentElement?.appendChild(button);
}

export function initCompareButtons(): () => void {
  trayHandles = new Set();
  injectStyles();

  const injectAll = () => {
    injectCardButtons();
    injectListingButton();
  };

  let observer: MutationObserver | undefined;
  // One pending pass at a time: a mutation burst coalesces into a single run.
  let pendingInjectTimeout: number | undefined;
  const scheduleInjectAll = () => {
    clearTimeout(pendingInjectTimeout);
    pendingInjectTimeout = window.setTimeout(() => {
      pendingInjectTimeout = undefined;
      injectAll();
    }, 100);
  };

  const unwatch = watchTray((items) => {
    trayHandles = new Set(items.map((item) => item.handle));
    refreshButtons();
  });

  getTray().then((items) => {
    trayHandles = new Set(items.map((item) => item.handle));
    injectAll();
    refreshButtons();

    observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        if (mutation.type !== 'childList') {
          continue;
        }
        for (const node of mutation.addedNodes) {
          if (
            node.nodeType === Node.ELEMENT_NODE &&
            ((node as Element).matches('[data-controller="app-card"]') ||
              (node as Element).querySelector('[data-controller="app-card"]') !== null)
          ) {
            scheduleInjectAll();
            return;
          }
        }
      }
    });

    observer.observe(document.body, { childList: true, subtree: true });
  });

  return () => {
    clearTimeout(pendingInjectTimeout);
    observer?.disconnect();
    unwatch();
    document.getElementById(STYLE_ID)?.remove();
  };
}
