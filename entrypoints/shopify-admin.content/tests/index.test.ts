import { afterAll, beforeEach, describe, expect, it, spyOn } from 'bun:test';
import { parseHTML } from 'linkedom';

// Storage, settings and Toast are spied on rather than module-mocked: bun's
// mock.module is process-wide and would bleed into their own test files.
// HTMLElement comes from linkedom so a cached toast module stays usable by
// utils/tests/toast.test.ts whichever file loads it first.
const listeners: string[] = [];
const location = { pathname: '/store/demo/products' };
const g = globalThis as Record<string, unknown>;
const saved = ['HTMLElement', 'window', 'defineContentScript'].map((k) => [k, g[k]] as const);
Object.assign(g, {
  HTMLElement: parseHTML('<html><body></body></html>').HTMLElement,
  window: { location, addEventListener: (type: string) => listeners.push(type) },
  defineContentScript: (definition: unknown) => definition
});

const storage = await import('~/utils/storage');
const settings = await import('~/utils/settings');
const { Toast } = await import('~/utils/toast');

const store = new Map<string, unknown>();
const getItem = spyOn(storage, 'getItem').mockImplementation(async (key: string) => (store.get(key) ?? null) as never);
const removeItem = spyOn(storage, 'removeItem').mockImplementation(async (key: string) => {
  store.delete(key);
});
const getSettings = spyOn(settings, 'getSettings').mockResolvedValue({
  ...settings.defaultSettings,
  admin: { ...settings.defaultSettings.admin, timeline: false }
});
const show = spyOn(Toast, 'show').mockImplementation(() => {});
const { default: script } = await import('../index');

const LEGACY_KEY = 'admin-sidebar-state';

afterAll(() => {
  for (const spy of [getItem, removeItem, getSettings, show]) spy.mockRestore();
  for (const [k, v] of saved) g[k] = v;
});

beforeEach(() => {
  store.clear();
  listeners.length = 0;
  location.pathname = '/store/demo/products';
  show.mockClear();
});

describe('sidebar toggle farewell', () => {
  it('shows a persistent announcement once and clears the legacy key', async () => {
    store.set(LEGACY_KEY, 'collapsed');
    await script.main();
    await script.main();

    expect(show).toHaveBeenCalledTimes(1);
    expect(show).toHaveBeenCalledWith(expect.stringContaining('Farewell'), 'success', 0, 'announcement');
    expect(store.has(LEGACY_KEY)).toBe(false);
  });

  it('stays silent for merchants who never used the toggle', async () => {
    await script.main();
    expect(show).not.toHaveBeenCalled();
  });

  it('arms the code editor close warning even when legacy key cleanup fails', async () => {
    location.pathname = '/store/demo/themes/123';
    store.set(LEGACY_KEY, 'collapsed');
    removeItem.mockImplementationOnce(async () => {
      throw new Error('storage unavailable');
    });

    await expect(script.main()).rejects.toThrow('storage unavailable');
    expect(listeners).toContain('beforeunload');
    // The key is cleared before the toast shows, so a failed clear shows nothing.
    expect(show).not.toHaveBeenCalled();
    expect(store.has(LEGACY_KEY)).toBe(true);
  });
});
