import { storage } from '#imports';
import { getItem, setItem } from '@/utils/storage';
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
    const saved = await getItem<ThemeMode>(STORAGE_KEY);
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

    const tryInject = () => {
      if (document.getElementById('alfred-theme-toggle')) return;
      syncToggle = injectToggle(mode);
    };

    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', () => tryInject(), { once: true });
    } else {
      tryInject();
    }

    // Turbo navigation swaps <body>, which arrives with the server's dark theme
    // and without our toggle. Theme is re-applied immediately to avoid a flash;
    // the toggle re-inject is debounced to skip rapid DOM churn.
    let debounceTimer: ReturnType<typeof setTimeout>;
    const observer = new MutationObserver(() => {
      applyTheme(mode);
      if (document.getElementById('alfred-theme-toggle')) return;
      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(tryInject, 200);
    });
    observer.observe(document.documentElement, {
      childList: true,
      subtree: true,
      attributeFilter: ['data-altair-theme']
    });

    // Listen for system color scheme changes once (not per-injection)
    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
      if (mode === 'system') {
        applyTheme('system');
      }
    });
  }
});

function applyTheme(mode: ThemeMode) {
  const resolved =
    mode === 'system' ? (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light') : mode;

  const html = document.documentElement;
  // Dashboard CSS still keys a few light variants off html.light.
  html.classList.toggle('light', resolved === 'light');
  html.classList.toggle('dark', resolved === 'dark');
  html.style.colorScheme = resolved;

  // Altair design tokens resolve from the nearest data-altair-theme ancestor.
  document.querySelectorAll<HTMLElement>(`[data-altair-theme], ${CANVAS}`).forEach((el) => {
    const target = el.matches(DARK_ONLY) ? 'dark' : resolved;
    // Guarded write: the observer watches this attribute, so an unconditional set would loop.
    if (el.dataset.altairTheme !== target) el.dataset.altairTheme = target;
  });
}

const MODES: ThemeMode[] = ['light', 'dark', 'system'];

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
 * @returns A setter that moves the toggle to a mode chosen elsewhere, or undefined if the side nav wasn't ready.
 */
function injectToggle(currentMode: ThemeMode): ((next: ThemeMode) => void) | undefined {
  const footer = document.querySelector('nav.side-nav > .side-nav__footer');
  if (!footer) return;

  const container = document.createElement('div');
  container.id = 'alfred-theme-toggle';
  // side-nav__label fades the toggle out with the labels when the nav collapses.
  container.className = 'side-nav__label';
  container.setAttribute('role', 'radiogroup');
  container.setAttribute('aria-label', 'Theme');

  const buttons = MODES.map((mode) => {
    const label = mode.charAt(0).toUpperCase() + mode.slice(1);
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.innerHTML = ICONS[mode];
    btn.dataset.mode = mode;
    btn.dataset.label = label;
    btn.setAttribute('role', 'radio');
    btn.setAttribute('aria-label', `${label} theme`);
    btn.addEventListener('click', () => {
      setActive(mode);
      setItem(STORAGE_KEY, mode);
      applyTheme(mode);
    });
    return btn;
  });

  // The sliding indicator (::before in style.css) reads its slot from this index.
  function setActive(mode: ThemeMode) {
    container.style.setProperty('--alfred-theme-index', String(MODES.indexOf(mode)));
    buttons.forEach((btn) => btn.setAttribute('aria-checked', String(btn.dataset.mode === mode)));
  }

  container.append(...buttons);
  setActive(currentMode);
  footer.before(container);

  return setActive;
}
