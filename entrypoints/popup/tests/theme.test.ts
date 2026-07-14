import { describe, expect, it } from 'bun:test';
import { sanitizeTheme, THEME_KEY, THEME_OPTIONS } from '../stores/theme';

describe('sanitizeTheme', () => {
  it('passes through the three valid preferences', () => {
    expect(sanitizeTheme('system')).toBe('system');
    expect(sanitizeTheme('light')).toBe('light');
    expect(sanitizeTheme('dark')).toBe('dark');
  });

  it('falls back to system for unknown, null, or wrong-typed values', () => {
    expect(sanitizeTheme('nope')).toBe('system');
    expect(sanitizeTheme(null)).toBe('system');
    expect(sanitizeTheme(undefined)).toBe('system');
    expect(sanitizeTheme(3)).toBe('system');
    expect(sanitizeTheme({})).toBe('system');
  });
});

describe('THEME_KEY', () => {
  it('is the bare local-storage key for the preference', () => {
    expect(THEME_KEY).toBe('theme');
  });
});

describe('THEME_OPTIONS', () => {
  it('lists system, light, dark in that order', () => {
    expect(THEME_OPTIONS.map((o) => o.value)).toEqual(['system', 'light', 'dark']);
  });
});
