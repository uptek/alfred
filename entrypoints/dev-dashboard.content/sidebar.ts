import { storage } from '#imports';
import { getItem, setItem } from '@/utils/storage';

// The dashboard's side nav ships a collapsed icon rail (Altair's side-nav
// controller, driven by its state value) but no control for it. This adds one
// modeled on the Shopify admin: a button beside the logo, ⌘B / Ctrl+B, and a
// remembered state.

const STORAGE_KEY = 'devDashboardNavCollapsed';
const STATE_ATTR = 'data-altair--side-nav-state-value';
const IS_MAC = /Mac|iPhone|iPad/.test(navigator.platform);
// Below 48rem the nav is a drawer, which has no collapsed layout.
const WIDE = window.matchMedia('(min-width: 48rem)');

const ICON =
  '<svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" aria-hidden="true" focusable="false"><path d="M4.75 4.75v6.5"/><rect width="12.5" height="12.5" x="1.75" y="1.75" rx="3"/></svg>';

// Icons for the text-only links of a second-level nav (inside an app). Names
// are nav icons to clone from the page; markup is a Polaris icon.
const L2_ICONS: [RegExp, string][] = [
  [/\boverview\b/i, 'home'],
  [/\bsettings\b/i, 'settings'],
  [
    /\blogs?\b/i,
    '<svg viewBox="0 0 20 20" fill="currentColor"><path d="M4 6a1 1 0 1 0 0-2 1 1 0 0 0 0 2Z"/><path d="M4 11a1 1 0 1 0 0-2 1 1 0 0 0 0 2Z"/><path d="M5 15a1 1 0 1 1-2 0 1 1 0 0 1 2 0Z"/><path d="M7.25 4.25a.75.75 0 0 0 0 1.5h9a.75.75 0 0 0 0-1.5h-9Z"/><path d="M6.5 10a.75.75 0 0 1 .75-.75h9a.75.75 0 0 1 0 1.5h-9a.75.75 0 0 1-.75-.75Z"/><path d="M7.25 14.25a.75.75 0 0 0 0 1.5h9a.75.75 0 0 0 0-1.5h-9Z"/></svg>'
  ],
  [
    /\bversions?\b/i,
    '<svg viewBox="0 0 20 20" fill="currentColor"><path d="M10.75 6a.75.75 0 0 0-1.5 0v4c0 .199.079.39.22.53l2 2a.75.75 0 1 0 1.06-1.06l-1.78-1.78v-3.69Z"/><path fill-rule="evenodd" d="M17 10a7 7 0 1 1-14 0 7 7 0 0 1 14 0Zm-1.5 0a5.5 5.5 0 1 1-11 0 5.5 5.5 0 0 1 11 0Z"/></svg>'
  ]
];

let collapsed = false;

/** Loads the saved state, follows changes from other tabs, and binds the shortcut. */
export async function initSidebar() {
  collapsed = (await getItem<boolean>(STORAGE_KEY)) ?? false;

  storage.watch<boolean>(`local:${STORAGE_KEY}`, (value) => {
    collapsed = value ?? false;
    syncSidebar();
  });
  WIDE.addEventListener('change', syncSidebar);

  // Back/Forward and preview visits render a cached clone of the page, whose
  // toggle has no listeners, so it is rebuilt.
  document.addEventListener('turbo:render', () => {
    document.getElementById('alfred-nav-toggle')?.remove();
    syncSidebar();
  });

  document.addEventListener('keydown', (e) => {
    // Chrome autofill dispatches keydown events without a key
    if (e.key?.toLowerCase() !== 'b' || e.shiftKey || e.altKey || !(IS_MAC ? e.metaKey : e.ctrlKey)) return;
    // Leave bold to rich text editors and the key to page handlers that took
    // it; the narrow drawer nav has no rail. A held key toggles once.
    if ((e.target as HTMLElement).isContentEditable || e.defaultPrevented || e.repeat || !WIDE.matches) return;
    e.preventDefault();
    toggle();
  });
}

function toggle() {
  pinCharts();
  collapsed = !collapsed;
  setItem(STORAGE_KEY, collapsed);
  syncSidebar();
}

/**
 * Dashboard charts redraw their whole SVG whenever their canvas resizes, which
 * drops frames while the main column animates with the nav. Pins each canvas
 * at its current width (clipped, in case the column narrows) until the nav's
 * width transition ends, so every chart redraws once instead of every frame.
 */
function pinCharts() {
  const nav = document.querySelector<HTMLElement>('nav.side-nav');
  // Each canvas keeps the box it was pinned in, since a page update can detach
  // a canvas before its release
  const pins = [...document.querySelectorAll<HTMLElement>('[data-altair--chart-target~="canvas"]')].map((canvas) => ({
    canvas,
    box: canvas.parentElement!
  }));
  if (!nav || !pins.length || !WIDE.matches) return;

  // All reads before any write, so pinning costs one layout, not one per chart
  const widths = pins.map(({ canvas }) => canvas.getBoundingClientRect().width);
  pins.forEach(({ canvas, box }, i) => {
    canvas.style.width = `${widths[i]}px`;
    box.style.overflow = 'clip';
  });

  const unpin = ({ canvas, box }: (typeof pins)[number]) => {
    canvas.style.removeProperty('width');
    box.style.removeProperty('overflow');
  };
  // Turbo is about to snapshot the page for Back/Forward, which must not keep
  // the pins, so whatever is still pinned is released at once
  const releaseAll = () => {
    document.removeEventListener('turbo:before-cache', releaseAll);
    pins.splice(0).forEach(unpin);
  };

  let timer: ReturnType<typeof setTimeout>;
  const release = (e?: TransitionEvent) => {
    if (e && (e.target !== nav || e.propertyName !== 'width')) return;
    nav.removeEventListener('transitionend', release);
    clearTimeout(timer);
    // One chart per frame, so their redraws don't pile into one long frame
    const next = () => {
      const pin = pins.shift();
      if (!pin) return document.removeEventListener('turbo:before-cache', releaseAll);
      unpin(pin);
      requestAnimationFrame(next);
    };
    next();
  };
  nav.addEventListener('transitionend', release);
  document.addEventListener('turbo:before-cache', releaseAll);
  // Fallback for a transition that never runs (reduced motion) or is interrupted
  timer = setTimeout(release, 600);
}

/**
 * Applies the collapsed state to the side nav and injects the toggle when Turbo
 * has swapped the nav out. Runs on every DOM mutation, so every write is guarded.
 */
export function syncSidebar() {
  const nav = document.querySelector<HTMLElement>('nav.side-nav');
  if (!nav) return;

  const state = collapsed && WIDE.matches ? 'collapsed' : 'expanded';
  if (nav.getAttribute(STATE_ATTR) !== state) nav.setAttribute(STATE_ATTR, state);

  // Second-level links are text only, which leaves the rail blank. The :has()
  // guard skips links already done, so the prepend can't loop the observer.
  for (const link of nav.querySelectorAll('.side-nav__list--secondary .side-nav-link:not(:has(.side-nav__icon))')) {
    const icon = railIcon(nav, link.querySelector('.side-nav__label')?.textContent?.trim() ?? '');
    if (icon) link.prepend(icon);
  }

  const toggleEl = nav.querySelector<HTMLElement>('#alfred-nav-toggle') ?? injectToggle(nav);
  if (!toggleEl) return;

  const expanded = state === 'expanded';
  const label = expanded ? 'Collapse navigation' : 'Expand navigation';
  const button = toggleEl.querySelector('button')!;
  if (button.getAttribute('aria-label') !== label) {
    button.setAttribute('aria-label', label);
    button.setAttribute('aria-expanded', String(expanded));
    toggleEl.querySelector('.alfred-nav-toggle__label')!.textContent = label;
    // The rail is too narrow for a tooltip underneath, so it opens to the side.
    toggleEl.dataset.placement = expanded ? 'bottom' : 'side';
  }
}

/** Builds the toggle as an Altair tooltip around an icon button, beside the logo. */
function injectToggle(nav: HTMLElement): HTMLElement | undefined {
  const brand = nav.querySelector('.side-nav__brand');
  if (!brand) return;

  const wrapper = document.createElement('span');
  wrapper.id = 'alfred-nav-toggle';
  wrapper.className = 'altair-tooltip';

  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'altair-tooltip__trigger';
  button.setAttribute('aria-keyshortcuts', IS_MAC ? 'Meta+B' : 'Control+B');
  button.innerHTML = ICON;
  // Hover and focus would keep the tooltip open after a click, so it stays
  // hidden until the pointer comes back or focus arrives anew, like the admin's.
  button.addEventListener('click', () => {
    wrapper.dataset.disabled = '';
    toggle();
  });
  for (const type of ['pointerenter', 'focusin']) {
    wrapper.addEventListener(type, () => delete wrapper.dataset.disabled);
  }

  const bubble = document.createElement('span');
  bubble.className = 'altair-tooltip__bubble';
  bubble.setAttribute('aria-hidden', 'true');
  const keys = (IS_MAC ? ['⌘', 'B'] : ['Ctrl', 'B']).map((key) => `<kbd>${key}</kbd>`).join('');
  bubble.innerHTML = `<span class="alfred-nav-toggle__tip"><span class="alfred-nav-toggle__label"></span><span class="alfred-nav-toggle__keys">${keys}</span></span>`;

  wrapper.append(button, bubble);
  brand.after(wrapper);
  return wrapper;
}

/**
 * An icon for a text-only nav link, shown only in the collapsed rail. Unknown
 * labels get a monogram. Returns undefined while the page is still parsing (no
 * label yet, or the nav icon to clone not yet in the DOM), so a later mutation
 * retries.
 */
function railIcon(nav: HTMLElement, label: string): HTMLElement | undefined {
  if (!label) return;
  const icon = L2_ICONS.find(([pattern]) => pattern.test(label))?.[1];

  const box = document.createElement('span');
  box.className = 'side-nav__icon alfred-rail-icon';
  box.setAttribute('aria-hidden', 'true');

  if (icon?.startsWith('<')) {
    box.innerHTML = `<span class="altair-icon altair-icon--base altair-icon--default">${icon}</span>`;
  } else if (icon) {
    const pageIcon = nav.querySelector(`[data-icon-name="${icon}"] .altair-icon`);
    if (!pageIcon) return;
    box.append(pageIcon.cloneNode(true));
  } else {
    const monogram = document.createElement('span');
    monogram.className = 'alfred-rail-monogram';
    monogram.textContent = label.charAt(0).toUpperCase();
    box.append(monogram);
  }
  return box;
}
