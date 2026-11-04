import type { ContentScriptContext } from '#imports';
import { sendTrackEvent } from '~/utils/analytics';
import { updateSettings, watchSettings } from '~/utils/settings';
import { Toast } from '~/utils/toast';

const MODE_ATTR = 'data-alfred-sidekick';
// Set while the bar flies into the nav, which keeps the new item hidden until the bar lands on it.
const ARRIVING_ATTR = 'data-alfred-sidekick-arriving';
const NAV_ID = 'alfred-sidekick-nav';
const NAV_ITEM = '[data-navitem="item"]';
// The Settings item at the bottom of the admin nav, which the Sidekick item copies.
const SETTINGS_ITEM = `[data-sticky-bottom-nav] li:not(#${NAV_ID}) ${NAV_ITEM}`;
// The Sidekick item's row: the wrapper that draws a nav item's background, or the item where there's none.
const NAV_ROW = `#${NAV_ID} [data-navitem="item-inner-wrapper"], #${NAV_ID} ${NAV_ITEM}`;

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
/* The bar controls sit just outside the bar's ends while it is hovered. */
${BAR} {
  anchor-name: --alfred-sidekick;
}
.alfred-sidekick-control {
  position: fixed;
  position-anchor: --alfred-sidekick;
  bottom: calc(anchor(bottom) + 11px);
  z-index: 400;
  display: flex;
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
  visibility: hidden;
  opacity: 0;
  transition: opacity 0.15s, visibility 0.15s;
}
.alfred-sidekick-control:hover {
  color: rgb(26 26 26);
}
/* An invisible margin as tall as the bar fills the gap, so the pointer never
   leaves both the bar and the control on its way across. */
.alfred-sidekick-control::before {
  content: '';
  position: absolute;
  inset: -12px -10px;
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
/* With no bar to anchor to, the controls go too, even the one still under the pointer. */
html[${MODE_ATTR}] .alfred-sidekick-control {
  display: none;
}
/* Matches the secondary actions on Shopify's own nav items, such as Online Store's. */
.alfred-sidekick-restore {
  position: absolute;
  top: 50%;
  right: 8px;
  translate: 0 -50%;
  display: flex;
  padding: 2px;
  border: 0;
  border-radius: 8px;
  background: transparent;
  color: var(--p-color-nav-icon);
  visibility: hidden;
  cursor: pointer;
}
#${NAV_ID}:is(:hover, :focus-within) .alfred-sidekick-restore {
  visibility: visible;
}
.alfred-sidekick-restore:hover {
  background: var(--p-color-bg-fill-transparent-hover);
  color: var(--p-color-nav-icon-hover);
}
html[${ARRIVING_ATTR}] #${NAV_ID} {
  visibility: hidden;
}
/* The condensed nav is icons only, with no room for a second button. */
[data-navigation-condensed="true"] .alfred-sidekick-restore {
  display: none;
}
`;

/** A button showing one of the admin's own icons, which follow the button's text color. */
function button(
  className: string,
  label: string,
  icon: string,
  onClick: () => void,
  size: 'small' | 'base' = 'small'
): HTMLButtonElement {
  const el = document.createElement('button');
  el.type = 'button';
  el.className = className;
  el.title = label;
  el.setAttribute('aria-label', label);
  el.innerHTML = `<s-internal-icon type="${icon}" tone="legacy-inherit" size="${size}"></s-internal-icon>`;
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

/** An element's class names without Shopify's selected-state ones, which the copy drops. */
function unselectedClasses(el: Element): string {
  return [...el.classList].filter((name) => !/selected|active/i.test(name)).join(' ');
}

/**
 * Clones the Settings item and places the copy above it, so the Sidekick item
 * picks up Shopify's current (hashed) classes.
 */
function createNavItem(settings: HTMLLIElement, onRestore: () => void): void {
  const li = settings.cloneNode(true) as HTMLLIElement;
  li.id = NAV_ID;
  for (const el of li.querySelectorAll('[class]')) el.setAttribute('class', unselectedClasses(el));

  const item = li.querySelector<HTMLElement>(NAV_ITEM)!;
  for (const name of ['href', 'aria-current', 'data-discover']) item.removeAttribute(name);
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

  item.after(
    button('alfred-sidekick-restore', 'Move Sidekick back to the floating bar', 'layout-footer', onRestore, 'base')
  );
  settings.before(li);
}

const EASE_OUT = 'cubic-bezier(0.23, 1, 0.32, 1)';
// Overshoots its target a little before settling.
const OVERSHOOT = 'cubic-bezier(0.34, 1.56, 0.64, 1)';
const BAR_SHADOW = '0 0 0 1px rgb(0 0 0 / 0.06), 0 4px 16px rgb(0 0 0 / 0.1)';
const NO_SHADOW = '0 0 0 1px rgb(0 0 0 / 0), 0 4px 16px rgb(0 0 0 / 0)';
const WHITE: Keyframe = { backgroundColor: '#fff', boxShadow: BAR_SHADOW };

const center = (r: DOMRect) => `translate(${r.left + r.width / 2}px, ${r.top + r.height / 2}px)`;
const size = (r: DOMRect, radius: number): Keyframe => ({
  width: `${r.width}px`,
  height: `${r.height}px`,
  borderRadius: `${radius}px`
});

/** The first opaque background at or behind an element: the nav's own color. */
function backdrop(el: Element): string {
  for (let e: Element | null = el; e; e = e.parentElement) {
    const bg = getComputedStyle(e).backgroundColor;
    if (bg !== 'transparent' && !bg.endsWith(', 0)')) return bg;
  }
  return '#fff';
}

// The pill in flight, so teardown can remove it.
let pill: HTMLElement | null = null;

/**
 * Flies a white pill the bar's size into the nav, where it takes on the look of a hovered row, then the real
 * row takes its place lit up and settles. `arrive` moves Sidekick into the nav and returns the row the pill
 * lands as, which must stay invisible until `land`. With motion reduced, or no row on screen to fly to,
 * `land` follows right away.
 */
async function flyToNav(bar: HTMLElement, arrive: () => HTMLElement | null, land: () => void): Promise<void> {
  // Measured first, since arriving hides the bar.
  const from = bar.getBoundingClientRect();
  const row = arrive();
  // A nav that's off screen, as at mobile widths, has nowhere to land.
  const to = row?.getBoundingClientRect();
  const reducedMotion = globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  if (reducedMotion || !row || !to?.width || to.right <= 0) return land();

  const el = (pill = document.createElement('div'));
  try {
    const radius = Math.min(from.height / 2, parseFloat(getComputedStyle(bar).borderTopLeftRadius) || from.height / 2);
    const style = getComputedStyle(row);
    // The row's text color faintly over the nav, like a hovered item, so it suits a light or a dark nav.
    const fill = `color-mix(in srgb, ${style.color} 14%, ${backdrop(row)})`;
    el.style.cssText = 'position:fixed;left:0;top:0;z-index:2147483000;pointer-events:none;translate:-50% -50%';
    document.body.append(el);
    const anims = [
      el.animate([{ transform: center(from) }, { transform: center(to) }], {
        duration: 500,
        easing: EASE_OUT,
        fill: 'forwards'
      }),
      el.animate([size(from, radius), size(to, parseFloat(style.borderTopLeftRadius) || 8)], {
        duration: 600,
        easing: OVERSHOOT,
        fill: 'forwards'
      }),
      el.animate([WHITE, { ...WHITE, offset: 0.15 }, { backgroundColor: fill, boxShadow: NO_SHADOW }], {
        duration: 420,
        easing: EASE_OUT,
        fill: 'forwards'
      })
    ];
    await Promise.all(anims.map((anim) => anim.finished.catch(() => {})));
    row.animate([{ backgroundColor: fill }, { backgroundColor: 'transparent' }], {
      duration: 900,
      delay: 250,
      easing: EASE_OUT,
      fill: 'backwards'
    });
  } finally {
    el.remove();
    land();
  }
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

  // Shopify re-renders the nav on some navigations, dropping foreign nodes, and
  // restyles its items when the nav is condensed, so the copy is redone whenever
  // its classes fall out of step with Settings. The check runs at most once a
  // frame, since the admin mutates constantly.
  const ensureNavItem = () => {
    if (root.getAttribute(MODE_ATTR) !== 'sidebar') return;
    const settings = document.querySelector(SETTINGS_ITEM);
    if (!settings || document.querySelector(`#${NAV_ID} ${NAV_ITEM}`)?.className === unselectedClasses(settings)) {
      return;
    }
    document.getElementById(NAV_ID)?.remove();
    createNavItem(settings.closest('li')!, () => setMode('default'));
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
      observer.observe(document.body, {
        childList: true,
        subtree: true,
        attributeFilter: ['data-navigation-condensed']
      });
    } else {
      observer.disconnect();
      document.getElementById(NAV_ID)?.remove();
    }
  };

  const style = document.createElement('style');
  style.textContent = CSS;

  // The bar flies into the nav and lands on its new item.
  const toNav = button('alfred-sidekick-control', 'Move Sidekick to the sidebar', 'chevron-left', () => {
    const bar = document.querySelector<HTMLElement>(BAR);
    if (!bar) return setMode('sidebar');
    void flyToNav(
      bar,
      () => {
        root.setAttribute(ARRIVING_ATTR, '');
        setMode('sidebar');
        return document.querySelector<HTMLElement>(NAV_ROW);
      },
      () => root.removeAttribute(ARRIVING_ATTR)
    );
  });
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
    const bar = ((e as PointerEvent).relatedTarget as Element | null)?.closest(BAR);
    for (const el of [toNav, hide]) el.toggleAttribute('data-bar-hover', !!bar);
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
    root.removeAttribute(ARRIVING_ATTR);
    document.removeEventListener('pointerout', onPointerOut, true);
    for (const el of [style, toNav, hide, pill]) el?.remove();
  });
}
