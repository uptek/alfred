import { describe, expect, test } from 'bun:test';
import { sanitizeTheme, THEME_KEY, THEME_OPTIONS } from '../stores/theme';

describe('sanitizeTheme', () => {
  test.each(['system', 'light', 'dark'])('passes %p through', (value) => {
    expect(sanitizeTheme(value)).toBe(value);
  });

  test.each(['nope', null, undefined, 3, {}])('falls back to system for %p', (value) => {
    expect(sanitizeTheme(value)).toBe('system');
  });
});

describe('theme constants', () => {
  test('THEME_KEY is the bare local-storage key for the preference', () => {
    expect(THEME_KEY).toBe('theme');
  });

  test('THEME_OPTIONS lists system, light, dark in that order', () => {
    expect(THEME_OPTIONS.map((o) => o.value)).toEqual(['system', 'light', 'dark']);
  });
});
