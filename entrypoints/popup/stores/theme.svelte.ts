import { getItem, setItem } from '~/utils/storage';
import { sanitizeTheme, THEME_KEY, type ThemePreference } from './theme';

let preference = $state<ThemePreference>('system');

/** Mirrors the preference onto <html data-theme>; CSS resolves system live. */
function apply(pref: ThemePreference) {
  document.documentElement.dataset.theme = pref;
}

async function load() {
  const stored = sanitizeTheme(await getItem<ThemePreference>(THEME_KEY));
  preference = stored;
  apply(stored);
}

async function setPreference(next: ThemePreference) {
  preference = next;
  apply(next);
  await setItem(THEME_KEY, next);
}

// Self-initialize on import so the theme applies as soon as the popup mounts,
// regardless of which section is open.
void load().catch(() => apply('system'));

export function getThemeStore() {
  return {
    get preference() {
      return preference;
    },
    setPreference
  };
}
