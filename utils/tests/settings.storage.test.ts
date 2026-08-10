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
    watch: (_key: string, callback: (newValue: unknown) => void) => {
      watcher = callback;
      return () => {
        unwatched = true;
      };
    }
  }
}));

const { defaultSettings, getSettings, updateSettings, watchSettings } = await import('../settings');

beforeEach(() => {
  store.clear();
  watcher = undefined;
  unwatched = false;
  failNextWrite = false;
});

describe('getSettings', () => {
  it('returns defaults when nothing is stored', async () => {
    expect(await getSettings()).toEqual(defaultSettings);
  });

  it('merges a partial stored blob over the defaults', async () => {
    store.set('local:settings', { general: { analytics: false } });
    const settings = await getSettings();
    expect(settings.general.analytics).toBe(false);
    expect(settings.admin.timeline).toBe(true);
  });
});

describe('updateSettings', () => {
  it('persists the fully merged blob, not just the patch', async () => {
    await updateSettings({ general: { analytics: false } });
    const persisted = store.get('local:settings') as Record<string, unknown>;
    expect(persisted).toEqual({ ...defaultSettings, general: { ...defaultSettings.general, analytics: false } });
  });

  it('returns the merged result', async () => {
    const result = await updateSettings({ shortcuts: { clearCart: false } });
    expect(result.shortcuts.clearCart).toBe(false);
    expect(result.shortcuts.openInAdmin).toBe(true);
  });

  it('does not strip groups a partial writer omitted', async () => {
    await updateSettings({ appStore: { compareApps: false } });
    await updateSettings({ general: { analytics: false } });
    const settings = await getSettings();
    expect(settings.appStore.compareApps).toBe(false);
    expect(settings.general.analytics).toBe(false);
  });

  it('serializes concurrent writes so neither patch is lost', async () => {
    await Promise.all([
      updateSettings({ general: { analytics: false } }),
      updateSettings({ admin: { timeline: false } })
    ]);
    const settings = await getSettings();
    expect(settings.general.analytics).toBe(false);
    expect(settings.admin.timeline).toBe(false);
  });

  it('applies a burst of writes to the same group in order', async () => {
    await Promise.all([
      updateSettings({ shortcuts: { clearCart: false } }),
      updateSettings({ shortcuts: { cartograph: false } }),
      updateSettings({ shortcuts: { openInAdmin: false } })
    ]);
    const settings = await getSettings();
    expect(settings.shortcuts.clearCart).toBe(false);
    expect(settings.shortcuts.cartograph).toBe(false);
    expect(settings.shortcuts.openInAdmin).toBe(false);
  });

  it('surfaces a failed write to its own caller', async () => {
    failNextWrite = true;
    expect(updateSettings({ general: { analytics: false } })).rejects.toThrow('storage full');
  });

  it('keeps serving later writes after one rejects', async () => {
    failNextWrite = true;
    const failing = updateSettings({ general: { analytics: false } });
    const following = updateSettings({ admin: { timeline: false } });
    await failing.catch(() => {});
    await following;
    const settings = await getSettings();
    expect(settings.admin.timeline).toBe(false);
    // The failed write left no trace; the queue did not stall on it.
    expect(settings.general.analytics).toBe(true);
  });

  it('merges nested groups instead of replacing them', async () => {
    await updateSettings({ themeCustomizer: { resizers: { primarySidebar: false } } });
    const settings = await getSettings();
    expect(settings.themeCustomizer.resizers?.primarySidebar).toBe(false);
    expect(settings.themeCustomizer.resizers?.previewVertical).toBe(true);
  });
});

describe('watchSettings', () => {
  it('delivers the defaults-merged value to the callback', () => {
    let received: unknown;
    watchSettings((settings) => (received = settings));
    watcher?.({ general: { analytics: false } });
    expect(received).toEqual({ ...defaultSettings, general: { ...defaultSettings.general, analytics: false } });
  });

  it('delivers defaults when the blob is cleared', () => {
    let received: unknown;
    watchSettings((settings) => (received = settings));
    watcher?.(null);
    expect(received).toEqual(defaultSettings);
  });

  it('returns the unwatch function', () => {
    const unwatch = watchSettings(() => {});
    unwatch();
    expect(unwatched).toBe(true);
  });
});
