import type { ContentScriptContext } from '#imports';
import { sendTrackEvent } from '~/utils/analytics';
import { updateSettings, watchSettings } from '~/utils/settings';
import { Toast } from '~/utils/toast';

const MODE_ATTR = 'data-alfred-sidekick';
const NAV_ID = 'alfred-sidekick-nav';

// Shopify renders the floating bar in the center outlet of the frame's footer
// ribbon (a zero-height fixed overlay) and a floating button at mobile widths.
// The Home page renders its own Sidekick field inline, outside the ribbon.
const BAR = '[data-frame-footer-outlet="center"] [data-sidekick-field]';
// The bar's own button that docks Sidekick as the full-height right panel.
const DOCK_BUTTON = `${BAR} button:has(s-internal-icon[type="layout-sidebar-right"])`;

const CSS = `
html[${MODE_ATTR}] [data-frame-footer-outlet="center"]:has([data-sidekick-field]),
html[${MODE_ATTR}] [data-component-name="mobile-frame-actions-sidekick"] {
  display: none !important;
}
.alfred-sidekick-control {
  position: fixed;
  z-index: 400;
  display: none;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  padding: 0;
  border: 1px solid rgb(0 0 0 / 0.08);
  border-radius: 50%;
  background: #fff;
  color: rgb(74 74 74);
  box-shadow: 0 4px 12px rgb(0 0 0 / 0.12);
  cursor: pointer;
}
.alfred-sidekick-control:hover {
  color: rgb(26 26 26);
}
/* The bar controls sit just outside the bar's ends while it is hovered. Their
   fade-out keeps them hoverable long enough to cross the gap. */
@supports (anchor-name: --a) {
  ${BAR} {
    anchor-name: --alfred-sidekick;
  }
  .alfred-sidekick-control {
    display: flex;
    visibility: hidden;
    opacity: 0;
    position-anchor: --alfred-sidekick;
    bottom: calc(anchor(bottom) + 11px);
    transition: opacity 0.15s, visibility 0.15s;
  }
  #alfred-sidekick-to-nav {
    right: calc(anchor(left) + 8px);
  }
  #alfred-sidekick-hide {
    left: calc(anchor(right) + 8px);
  }
  html:not([${MODE_ATTR}]) .alfred-sidekick-control[data-bar-hover],
  .alfred-sidekick-control:hover {
    visibility: visible;
    opacity: 1;
    transition-delay: 0.15s;
  }
}
#${NAV_ID} {
  position: relative;
}
.alfred-sidekick-restore {
  position: absolute;
  top: 50%;
  right: 8px;
  translate: 0 -50%;
  display: flex;
  padding: 4px;
  border: 0;
  border-radius: 6px;
  background: transparent;
  color: inherit;
  opacity: 0;
  cursor: pointer;
}
#${NAV_ID}:hover .alfred-sidekick-restore,
.alfred-sidekick-restore:focus-visible {
  opacity: 1;
}
.alfred-sidekick-restore:hover {
  background: rgb(255 255 255 / 0.1);
}
`;

/** A button showing one of the admin's own icons, which follow the button's text color. */
function button(className: string, label: string, icon: string, onClick: () => void): HTMLButtonElement {
  const el = document.createElement('button');
  el.type = 'button';
  el.className = className;
  el.title = label;
  el.setAttribute('aria-label', label);
  el.innerHTML = `<s-internal-icon type="${icon}" tone="legacy-inherit" size="small"></s-internal-icon>`;
  el.addEventListener('click', onClick);
  return el;
}

/** Docks Sidekick on the right, or focuses its field where there's no bar to dock from. */
function openSidekick(): void {
  const dock = document.querySelector<HTMLElement>(DOCK_BUTTON);
  if (dock) dock.click();
  else document.querySelector<HTMLElement>('[data-sidekick-field] :is(input, textarea)')?.focus();
  sendTrackEvent('admin.sidekick.open');
}

/**
 * Clones the Settings item at the bottom of the admin nav and places the copy
 * above it, so the Sidekick item picks up Shopify's current (hashed) classes.
 * Does nothing until the nav renders.
 */
function createNavItem(onRestore: () => void): void {
  const settings = document.querySelector('[data-sticky-bottom-nav] [data-navitem="item"]')?.closest('li');
  if (!settings) return;

  const li = settings.cloneNode(true) as HTMLLIElement;
  li.id = NAV_ID;

  const item = li.querySelector<HTMLElement>('[data-navitem="item"]')!;
  for (const name of ['href', 'aria-current', 'data-discover']) item.removeAttribute(name);
  item.classList.remove(...[...item.classList].filter((name) => /selected/i.test(name)));
  item.setAttribute('role', 'button');
  item.tabIndex = 0;
  item.querySelector('s-internal-icon')?.setAttribute('type', 'sidekick');
  const label = [...item.querySelectorAll('*')].find((el) => !el.childElementCount && el.textContent?.trim());
  if (label) label.textContent = 'Sidekick';

  const open = (e: Event) => {
    e.preventDefault();
    openSidekick();
  };
  item.addEventListener('click', open);
  item.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') open(e);
  });

  li.append(button('alfred-sidekick-restore', 'Move Sidekick back to the floating bar', 'layout-footer', onRestore));
  settings.before(li);
}

/**
 * Lets merchants move Shopify's floating Sidekick bar out of the way. Controls
 * at the bar's ends hide it or move it into the admin nav, where its item
 * opens Sidekick docked on the right. Once hidden, only Options brings it back.
 * Every switch writes `admin.sidekick`, so all admin tabs and Options follow.
 * @param mode - The setting's value at page load.
 */
export function setupSidekick(ctx: ContentScriptContext, mode: SidekickMode): void {
  const root = document.documentElement;

  const setMode = (next: SidekickMode) => {
    apply(next);
    void updateSettings({ admin: { sidekick: next } });
    sendTrackEvent('admin.sidekick.placement_switch', { placement: next });
  };

  // Shopify re-renders the nav on some navigations and drops foreign nodes.
  // The check runs at most once a frame, since the admin mutates constantly.
  const ensureNavItem = () => {
    if (root.getAttribute(MODE_ATTR) === 'sidebar' && !document.getElementById(NAV_ID)) {
      createNavItem(() => setMode('default'));
    }
  };
  let queued = false;
  const observer = new MutationObserver(() => {
    if (queued) return;
    queued = true;
    requestAnimationFrame(() => {
      queued = false;
      ensureNavItem();
    });
  });

  const apply = (next: SidekickMode) => {
    if (next === 'default') root.removeAttribute(MODE_ATTR);
    else root.setAttribute(MODE_ATTR, next);

    if (next === 'sidebar') {
      ensureNavItem();
      observer.observe(document.body, { childList: true, subtree: true });
    } else {
      observer.disconnect();
      document.getElementById(NAV_ID)?.remove();
    }
  };

  const style = document.createElement('style');
  style.textContent = CSS;

  const toNav = button('alfred-sidekick-control', 'Move Sidekick to the sidebar', 'chevron-left', () =>
    setMode('sidebar')
  );
  toNav.id = 'alfred-sidekick-to-nav';

  const hide = button('alfred-sidekick-control', 'Hide Sidekick', 'x', () => {
    setMode('hidden');
    Toast.success('Sidekick hidden. You can toggle it back from Alfred settings.', 6000);
  });
  hide.id = 'alfred-sidekick-hide';

  // Bar hover is tracked here: a `:has(:hover)` rule on the root would re-match
  // the whole admin page on every pointer move. relatedTarget is the element
  // the pointer moved into, or null when it left the page.
  const onPointerOut = (e: Event) => {
    const over = !!((e as PointerEvent).relatedTarget as Element | null)?.closest(BAR);
    for (const el of [toNav, hide]) el.toggleAttribute('data-bar-hover', over);
  };

  document.head.append(style);
  document.body.append(toNav, hide);
  document.addEventListener('pointerout', onPointerOut, true);
  apply(mode);
  if (mode !== 'default') sendTrackEvent('admin.sidekick.placement_apply', { placement: mode });
  const unwatch = watchSettings((settings) => apply(settings.admin.sidekick ?? 'default'));

  ctx.onInvalidated(() => {
    unwatch();
    apply('default');
    document.removeEventListener('pointerout', onPointerOut, true);
    for (const el of [style, toNav, hide]) el.remove();
  });
}
