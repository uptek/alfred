export type ThemePreference = 'system' | 'light' | 'dark';

/** Bare key for the persisted popup color-theme preference (see utils/storage). */
export const THEME_KEY = 'theme';

export const THEME_OPTIONS: { value: ThemePreference; label: string }[] = [
  { value: 'system', label: 'System' },
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' }
];

/** Coerces a stored/unknown value to a valid preference, defaulting to system. */
export function sanitizeTheme(value: unknown): ThemePreference {
  return value === 'light' || value === 'dark' || value === 'system' ? value : 'system';
}
