import { describe, expect, test } from 'bun:test';
import { defaultSettings, deepMerge, isEnabled, mergeSettings } from '../settings';

describe('isEnabled', () => {
  test('only explicit false disables', () => {
    expect(isEnabled(false)).toBe(false);
    expect(isEnabled(true)).toBe(true);
    expect(isEnabled(undefined)).toBe(true);
    expect(isEnabled(null)).toBe(true);
  });
});

describe('mergeSettings', () => {
  test('null and undefined resolve to defaults', () => {
    expect(mergeSettings(null)).toEqual(defaultSettings);
    expect(mergeSettings(undefined)).toEqual(defaultSettings);
  });

  test('returns a copy, not the defaults object itself', () => {
    expect(mergeSettings(null)).not.toBe(defaultSettings);
  });

  test('stored values override defaults', () => {
    const merged = mergeSettings({ general: { analytics: false } });
    expect(merged.general.analytics).toBe(false);
    expect(merged.general.restoreRightClick).toBe(true);
  });

  test('groups missing from an old blob pick up their defaults', () => {
    const merged = mergeSettings({ shortcuts: { clearCart: false } });
    expect(merged.appStore.compareApps).toBe(true);
    expect(merged.admin.timeline).toBe(true);
    expect(merged.shortcuts.clearCart).toBe(false);
    expect(merged.shortcuts.openInAdmin).toBe(true);
  });

  test('nested groups merge instead of replace', () => {
    const merged = mergeSettings({ themeCustomizer: { resizers: { primarySidebar: false } } });
    expect(merged.themeCustomizer.resizers?.primarySidebar).toBe(false);
    expect(merged.themeCustomizer.resizers?.previewVertical).toBe(true);
    expect(merged.themeCustomizer.inspector).toBe('default');
  });

  test('keys without defaults survive the merge', () => {
    const merged = mergeSettings({ collaboratorAccess: { organizationId: 'org-1' } });
    expect(merged.collaboratorAccess.organizationId).toBe('org-1');
    expect(merged.collaboratorAccess.presets).toBe(true);
  });
});

describe('deepMerge', () => {
  test('does not mutate the target', () => {
    const target = { a: { b: 1, c: 2 } };
    deepMerge(target, { a: { b: 9 } });
    expect(target.a.b).toBe(1);
  });

  test('undefined source values are ignored', () => {
    expect(deepMerge({ a: 1 }, { a: undefined })).toEqual({ a: 1 });
  });

  test('arrays replace rather than merge', () => {
    expect(deepMerge({ a: [1, 2] }, { a: [3] })).toEqual({ a: [3] });
  });
});
