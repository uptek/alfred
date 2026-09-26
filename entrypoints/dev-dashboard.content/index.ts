import { storage } from '#imports';
import { getItem, setItem } from '@/utils/storage';
import { initSidebar, syncSidebar } from './sidebar';
import './style.css';

type ThemeMode = 'light' | 'dark' | 'system';
const STORAGE_KEY = 'devDashboardTheme';

// Light mode mirrors the Shopify admin: the frame (and the nav inside it)
// stays dark while the main canvas follows the chosen theme. See style.css.
const DARK_ONLY = '.altair-app-frame';
const CANVAS = '.altair-app-frame__main';

export default defineContentScript({
  matches: ['https://dev.shopify.com/dashboard/*'],
  runAt: 'document_start',

  async main() {
    const [saved] = await Promise.all([getItem<ThemeMode>(STORAGE_KEY), initSidebar()]);
    // Kept current via storage.watch so DOM mutations don't hit storage.
    let mode: ThemeMode = saved ?? 'system';

    applyTheme(mode);

    // Set by injectToggle so a theme picked in another dashboard tab moves the
    // live toggle too, not just the document.
    let syncToggle: ((next: ThemeMode) => void) | undefined;

    storage.watch<ThemeMode>(`local:${STORAGE_KEY}`, (value) => {
      mode = value ?? 'system';
      applyTheme(mode);
      syncToggle?.(mode);
    });

    // The observer re-applies `mode` on every theme attribute change, so a pick
    // updates it before touching the page.
    const pick = (next: ThemeMode) => {
      mode = next;
      applyTheme(next);
      setItem(STORAGE_KEY, next);
    };

    const tryInject = () => {
      syncSidebar();
      if (document.getElementById('alfred-theme-toggle')) return;
      syncToggle = injectToggle(mode, pick);
    };

    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', () => tryInject(), { once: true });
    } else {
      tryInject();
    }

    // Turbo navigation swaps <body>, which arrives with the server's dark theme
    // and without our toggles, so theme, nav state and toggles are re-applied
    // before the next paint.
    const observer = new MutationObserver((records) => {
      // Charts redraw their SVG on hover and resize, so the document-wide theme
      // pass only runs for mutations that can bring in a themed element.
      if (records.some(bringsThemedElement)) applyTheme(mode);
      tryInject();
    });

    // Back/Forward and preview visits render a cached clone of the page, whose
    // toggle has no listeners, so it is rebuilt. sidebar.ts does the same.
    document.addEventListener('turbo:render', () => {
      document.getElementById('alfred-theme-toggle')?.remove();
      tryInject();
    });
    observer.observe(document.documentElement, {
      childList: true,
      subtree: true,
      attributeFilter: ['data-altair-theme']
    });

    // Listen for system color scheme changes once (not per-injection)
    PREFERS_DARK.addEventListener('change', () => {
      if (mode === 'system') {
        applyTheme('system');
      }
    });
  }
});

const PREFERS_DARK = window.matchMedia('(prefers-color-scheme: dark)');
const THEMED = `[data-altair-theme], ${CANVAS}`;

function bringsThemedElement(record: MutationRecord) {
  if (record.type === 'attributes') return true;
  return [...record.addedNodes].some(
    (node) => node instanceof Element && (node.matches(THEMED) || node.querySelector(THEMED))
  );
}

function applyTheme(mode: ThemeMode) {
  const resolved = mode === 'system' ? (PREFERS_DARK.matches ? 'dark' : 'light') : mode;

  const html = document.documentElement;
  // style.css scopes the light theme under html.light, as do a few dashboard
  // light variants.
  html.classList.toggle('light', resolved === 'light');
  html.classList.toggle('dark', resolved === 'dark');
  html.style.colorScheme = resolved;

  // Altair design tokens resolve from the nearest data-altair-theme ancestor.
  document.querySelectorAll<HTMLElement>(THEMED).forEach((el) => {
    const target = el.matches(DARK_ONLY) ? 'dark' : resolved;
    // Guarded write: the observer watches this attribute, so an unconditional set would loop.
    if (el.dataset.altairTheme !== target) el.dataset.altairTheme = target;
  });
}

const MODES: ThemeMode[] = ['light', 'dark', 'system'];
const REDUCED_MOTION = window.matchMedia('(prefers-reduced-motion: reduce)');
const ARROW_STEPS: Record<string, number> = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 };

// Polaris SunIcon, MoonIcon and DesktopIcon, matching the dashboard nav icons.
const icon = (paths: string) =>
  `<svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true" focusable="false">${paths}</svg>`;

const ICONS: Record<ThemeMode, string> = {
  light: icon(
    '<path d="M10 2a.75.75 0 0 1 .75.75v1.5a.75.75 0 0 1-1.5 0v-1.5a.75.75 0 0 1 .75-.75Z"/><path fill-rule="evenodd" d="M6.25 10a3.75 3.75 0 1 1 7.5 0 3.75 3.75 0 0 1-7.5 0Zm3.75-2.25a2.25 2.25 0 1 0 0 4.5 2.25 2.25 0 0 0 0-4.5Z"/><path d="M10.75 15.75a.75.75 0 0 0-1.5 0v1.5a.75.75 0 0 0 1.5 0v-1.5Zm-8.75-6a.75.75 0 0 1 .75-.75h1.5a.75.75 0 0 1 0 1.5h-1.5a.75.75 0 0 1-.75-.75Zm13.75-.75a.75.75 0 0 0 0 1.5h1.5a.75.75 0 0 0 0-1.5h-1.5Zm-11.23-4.834a.75.75 0 0 1 1.061 0l1.06 1.061a.75.75 0 0 1-1.06 1.06l-1.06-1.06a.75.75 0 0 1 0-1.06Zm10.253 9.193a.75.75 0 1 0-1.061 1.06l1.06 1.061a.75.75 0 0 0 1.061-1.06l-1.06-1.061Zm-10.606 2.121a.75.75 0 0 1 0-1.06l1.06-1.061a.75.75 0 1 1 1.061 1.06l-1.06 1.06a.75.75 0 0 1-1.061 0Zm9.191-10.253a.75.75 0 0 0 1.061 1.06l1.06-1.06a.75.75 0 1 0-1.06-1.06l-1.06 1.06Z"/>'
  ),
  dark: icon(
    '<path d="M9.636 3.191a.75.75 0 0 1 .104.787 5.5 5.5 0 0 0 6.28 7.625.75.75 0 0 1 .856 1.04 7.001 7.001 0 1 1-7.992-9.705.75.75 0 0 1 .752.253Zm-1.759 1.723a5.5 5.5 0 1 0 6.866 8.336 7 7 0 0 1-6.866-8.336Z"/>'
  ),
  system: icon(
    '<path fill-rule="evenodd" d="M3.5 6.25a2.75 2.75 0 0 1 2.75-2.75h7.5a2.75 2.75 0 0 1 2.75 2.75v4.5a2.75 2.75 0 0 1-2.75 2.75h-1.25v1.5h.75a.75.75 0 0 1 0 1.5h-6.5a.75.75 0 0 1 0-1.5h.75v-1.5h-1.25a2.75 2.75 0 0 1-2.75-2.75v-4.5Zm5.5 7.25h2v1.5h-2v-1.5Zm-2.75-8.5c-.69 0-1.25.56-1.25 1.25v3.25h10v-3.25c0-.69-.56-1.25-1.25-1.25h-7.5Zm8.725 6c-.116.57-.62 1-1.225 1h-7.5a1.25 1.25 0 0 1-1.225-1h9.95Z"/>'
  )
};

/**
 * Builds the segmented light/dark/system control above the side nav footer.
 * Visuals live in style.css; this only wires the markup and state.
 * @param onPick Applies and saves a mode the user picked.
 * @returns A setter that moves the toggle to a mode chosen elsewhere, or undefined if the side nav wasn't ready.
 */
function injectToggle(
  currentMode: ThemeMode,
  onPick: (mode: ThemeMode) => void
): ((next: ThemeMode) => void) | undefined {
  const footer = document.querySelector('nav.side-nav > .side-nav__footer');
  if (!footer) return;

  const container = document.createElement('div');
  container.id = 'alfred-theme-toggle';
  container.setAttribute('role', 'radiogroup');
  container.setAttribute('aria-label', 'Theme');

  const buttons = MODES.map((mode, index) => {
    const label = mode.charAt(0).toUpperCase() + mode.slice(1);
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.innerHTML = ICONS[mode];
    btn.dataset.mode = mode;
    // Slot position, read by style.css
    btn.style.setProperty('--i', String(index));
    btn.dataset.label = label;
    btn.setAttribute('role', 'radio');
    btn.setAttribute('aria-label', `${label} theme`);
    btn.addEventListener('click', () => {
      setActive(mode);
      onPick(mode);
    });
    return btn;
  });

  // The sliding indicator (::before in style.css) reads its slot from this
  // index. Its slot geometry is relative to the toggle's width, which CSS
  // transitions interpolate from a wrong start, so the slide is animated here
  // instead: from the old position to the new one, in pixels.
  function setActive(mode: ThemeMode) {
    const before = pillPosition();
    container.style.setProperty('--alfred-theme-index', String(MODES.indexOf(mode)));
    buttons.forEach((btn) => {
      const checked = btn.dataset.mode === mode;
      btn.setAttribute('aria-checked', String(checked));
      // Only the checked radio is a Tab stop; arrow keys move between them
      btn.tabIndex = checked ? 0 : -1;
    });
    const after = pillPosition();
    if (!before || !after || REDUCED_MOTION.matches) return;
    const [dx, dy] = [before[0] - after[0], before[1] - after[1]];
    if (!dx && !dy) return;
    container.animate(
      { translate: [`${dx}px ${dy}px`, '0 0'] },
      { duration: 250, easing: 'cubic-bezier(0.4, 0, 0.2, 1)', pseudoElement: '::before' }
    );
  }

  function pillPosition(): [number, number] | undefined {
    if (!container.isConnected) return;
    const style = getComputedStyle(container, '::before');
    return [parseFloat(style.left), parseFloat(style.marginTop)];
  }

  container.addEventListener('keydown', (e) => {
    const step = ARROW_STEPS[e.key];
    // Modified arrows stay with the browser, e.g. Alt+Left goes back
    if (!step || e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return;
    e.preventDefault();
    // A held arrow moves once instead of flashing through every theme
    if (e.repeat) return;
    const focused = buttons.indexOf(e.target as HTMLButtonElement);
    const current = focused >= 0 ? focused : buttons.findIndex((btn) => btn.tabIndex === 0);
    const next = buttons[(current + step + buttons.length) % buttons.length]!;
    next.focus();
    next.click();
  });

  container.append(...buttons);
  setActive(currentMode);
  footer.before(container);

  return setActive;
}
