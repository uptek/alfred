import { beforeEach, describe, expect, it, mock } from 'bun:test';

// settings.ts reaches storage through wxt/utils/storage, which has no runtime
// outside the extension. Swap in an in-memory store so the read/merge/persist
// logic can be exercised directly.
const store = new Map<string, unknown>();
let watcher: ((newValue: unknown) => void) | undefined;
let unwatched = false;
// Set to make the next setItem reject, so the write queue's failure path is
// exercised rather than assumed.
let failNextWrite = false;

mock.module('wxt/utils/storage', () => ({
  storage: {
    getItem: async (key: string) => (store.has(key) ? store.get(key) : null),
    setItem: async (key: string, value: unknown) => {
      if (failNextWrite) {
        failNextWrite = false;
        throw new Error('storage full');
      }
      store.set(key, value);
    },
    removeItem: async (key: string) => {
      store.delete(key);
    },
    watch: (_key: string, callback: (newValue: unknown) => void) => {
      watcher = callback;
      return () => {
        unwatched = true;
      };
    }
  }
}));

const { deepMerge, defaultSettings, getSettings, isEnabled, mergeSettings, updateSettings, watchSettings } =
  await import('../settings');

beforeEach(() => {
  store.clear();
  failNextWrite = false;
});

describe('isEnabled', () => {
  it('only explicit false disables', () => {
    expect([false, true, undefined, null].map(isEnabled)).toEqual([false, true, true, true]);
  });
});

describe('deepMerge', () => {
  it('merges nested objects into a copy, leaving the target untouched', () => {
    const target = { a: { b: 1, c: 2 } };
    expect(deepMerge(target, { a: { b: 9 } })).toEqual({ a: { b: 9, c: 2 } });
    expect(target.a.b).toBe(1);
  });

  it('ignores undefined source values', () => {
    expect(deepMerge({ a: 1 }, { a: undefined })).toEqual({ a: 1 });
  });

  it('replaces arrays rather than merging them', () => {
    expect(deepMerge({ a: [1, 2] }, { a: [3] })).toEqual({ a: [3] });
  });
});

describe('mergeSettings', () => {
  it('resolves null and undefined to a copy of the defaults', () => {
    for (const stored of [null, undefined]) {
      const merged = mergeSettings(stored);
      expect(merged).toEqual(defaultSettings);
      expect(merged).not.toBe(defaultSettings);
    }
  });

  it('merges nested groups instead of replacing them', () => {
    const merged = mergeSettings({ themeCustomizer: { resizers: { primarySidebar: false } } });
    expect(merged.themeCustomizer.resizers?.primarySidebar).toBe(false);
    expect(merged.themeCustomizer.resizers?.previewVertical).toBe(true);
    expect(merged.themeCustomizer.inspector).toBe('default');
  });

  it('keeps keys that have no defaults', () => {
    const merged = mergeSettings({ collaboratorAccess: { organizationId: 'org-1' } });
    expect(merged.collaboratorAccess.organizationId).toBe('org-1');
    expect(merged.collaboratorAccess.presets).toBe(true);
  });
});

describe('getSettings', () => {
  it('reads the stored blob merged over the defaults', async () => {
    expect(await getSettings()).toEqual(defaultSettings);
    store.set('local:settings', { general: { analytics: false } });
    const settings = await getSettings();
    expect(settings.general.analytics).toBe(false);
    expect(settings.general.restoreRightClick).toBe(true);
    expect(settings.admin.themeListUtils).toBe(true);
    expect(settings.shortcuts.openInAdmin).toBe(true);
    expect(settings.appStore.compareApps).toBe(true);
  });
});

describe('updateSettings', () => {
  it('persists and returns the fully merged blob, not just the patch', async () => {
    const result = await updateSettings({ general: { analytics: false } });
    const expected = { ...defaultSettings, general: { ...defaultSettings.general, analytics: false } };
    expect(store.get('local:settings')).toEqual(expected);
    expect(result).toEqual(expected);
  });

  it('serializes concurrent writes so no patch is lost, even within one group', async () => {
    await Promise.all([
      updateSettings({ general: { analytics: false } }),
      updateSettings({ shortcuts: { clearCart: false } }),
      updateSettings({ shortcuts: { cartograph: false } }),
      updateSettings({ shortcuts: { openInAdmin: false } }),
      updateSettings({ admin: { themeListUtils: false } })
    ]);
    expect(await getSettings()).toMatchObject({
      general: { analytics: false },
      shortcuts: { clearCart: false, cartograph: false, openInAdmin: false },
      admin: { themeListUtils: false }
    });
  });

  it('rejects a failed write to its caller and keeps serving later writes', async () => {
    failNextWrite = true;
    const failing = updateSettings({ general: { analytics: false } });
    const following = updateSettings({ admin: { themeListUtils: false } });
    await expect(failing).rejects.toThrow('storage full');
    await following;
    const settings = await getSettings();
    expect(settings.admin.themeListUtils).toBe(false);
    // The failed write left no trace; the queue did not stall on it.
    expect(settings.general.analytics).toBe(true);
  });
});

describe('watchSettings', () => {
  it('delivers the defaults-merged value and returns the unwatch function', () => {
    let received: unknown;
    const unwatch = watchSettings((settings) => (received = settings));
    watcher?.({ general: { analytics: false } });
    expect(received).toEqual({ ...defaultSettings, general: { ...defaultSettings.general, analytics: false } });
    unwatch();
    expect(unwatched).toBe(true);
  });
});
