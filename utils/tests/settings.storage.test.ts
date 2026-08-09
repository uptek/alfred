import { beforeEach, describe, expect, it, mock } from 'bun:test';

// settings.ts reaches storage through wxt/utils/storage, which has no runtime
// outside the extension. Swap in an in-memory store so the read/merge/persist
// logic can be exercised directly.
const store = new Map<string, unknown>();
let watcher: ((newValue: unknown) => void) | undefined;
let unwatched = false;

mock.module('wxt/utils/storage', () => ({
  storage: {
    getItem: async (key: string) => (store.has(key) ? store.get(key) : null),
    setItem: async (key: string, value: unknown) => void store.set(key, value),
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
