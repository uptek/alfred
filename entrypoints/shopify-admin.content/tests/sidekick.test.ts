import { afterAll, describe, expect, it, spyOn } from 'bun:test';
import { parseHTML } from 'linkedom';

const g = globalThis as Record<string, unknown>;
const saved = ['document', 'MutationObserver', 'HTMLElement'].map((k) => [k, g[k]] as const);
// A trimmed copy of the admin markup: the nav's sticky bottom section and the
// floating bar in the footer ribbon, docking button included.
const dom = parseHTML(`<!doctype html><html><head></head><body>
  <nav><div data-sticky-bottom-nav="true"><ul>
    <li><div data-navitem="item-wrapper"><a data-navitem="item" href="/settings" class="_Item _Item-selected" aria-current="page">
      <s-internal-icon type="settings"></s-internal-icon><span>Settings</span>
    </a></div></li>
    <li><div>Firecart Staging</div></li>
  </ul></div></nav>
  <div data-polaris-frame-global-ribbon="true"><div data-frame-footer-outlet="center">
    <div data-sidekick-field><button aria-label="Open Sidekick"><s-internal-icon type="layout-sidebar-right"></s-internal-icon></button></div>
  </div></div>
</body></html>`);
Object.assign(g, {
  document: dom.document,
  MutationObserver: dom.MutationObserver,
  HTMLElement: dom.HTMLElement
});

const settings = await import('~/utils/settings');
const analytics = await import('~/utils/analytics');
const { Toast } = await import('~/utils/toast');
const { setupSidekick } = await import('../sidekick');

let watcher: (value: typeof settings.defaultSettings) => void = () => {};
const updateSettings = spyOn(settings, 'updateSettings').mockResolvedValue(settings.defaultSettings);
const watchSettings = spyOn(settings, 'watchSettings').mockImplementation((callback) => {
  watcher = callback;
  return () => {};
});
const track = spyOn(analytics, 'sendTrackEvent').mockImplementation(() => {});
const toast = spyOn(Toast, 'success').mockImplementation(() => {});

afterAll(() => {
  for (const spy of [updateSettings, watchSettings, track, toast]) spy.mockRestore();
  for (const [k, v] of saved) g[k] = v;
});

const $ = (selector: string) => dom.document.querySelector<HTMLElement>(selector);
const click = (selector: string) => $(selector)!.click();
const mode = () => dom.document.documentElement.getAttribute('data-alfred-sidekick');

describe('Sidekick', () => {
  it('moves between the floating bar, the nav and hidden, and keeps the setting in step', () => {
    let invalidate = () => {};
    setupSidekick({ onInvalidated: (cb: () => void) => (invalidate = cb) } as never, 'default');
    expect(mode()).toBeNull();
    expect($('#alfred-sidekick-nav')).toBeNull();

    // Pointing at the bar reveals its controls; leaving the page hides them.
    const pointerOut = (relatedTarget: Element | null) =>
      dom.document.dispatchEvent(Object.assign(new dom.Event('pointerout'), { relatedTarget }));
    pointerOut($('[data-sidekick-field] button'));
    expect($('#alfred-sidekick-hide')!.hasAttribute('data-bar-hover')).toBe(true);
    pointerOut(null);
    expect($('#alfred-sidekick-hide')!.hasAttribute('data-bar-hover')).toBe(false);

    // The bar's caret moves Sidekick into the nav, just above Settings.
    click('#alfred-sidekick-to-nav');
    expect(mode()).toBe('sidebar');
    expect(updateSettings).toHaveBeenLastCalledWith({ admin: { sidekick: 'sidebar' } });
    expect(track).toHaveBeenLastCalledWith('admin.sidekick.placement_switch', { placement: 'sidebar' });
    const item = $('#alfred-sidekick-nav [data-navitem="item"]')!;
    expect(item.textContent!.trim()).toBe('Sidekick');
    expect(item.hasAttribute('href')).toBe(false);
    expect(item.querySelector('s-internal-icon')!.getAttribute('type')).toBe('sidekick');
    expect(item.hasAttribute('aria-current')).toBe(false);
    expect(item.className).toBe('_Item');
    expect($('#alfred-sidekick-nav')!.nextElementSibling!.textContent).toContain('Settings');

    // The nav item docks Sidekick through the bar's own button.
    let docked = 0;
    $('[aria-label="Open Sidekick"]')!.addEventListener('click', () => docked++);
    click('#alfred-sidekick-nav [data-navitem="item"]');
    expect(docked).toBe(1);
    expect(track).toHaveBeenLastCalledWith('admin.sidekick.open');

    // Its restore button puts the floating bar back and drops the item.
    click('.alfred-sidekick-restore');
    expect(mode()).toBeNull();
    expect($('#alfred-sidekick-nav')).toBeNull();

    // Hidden leaves no Alfred UI on the page, so a toast says where to undo it.
    click('#alfred-sidekick-hide');
    expect(mode()).toBe('hidden');
    expect(updateSettings).toHaveBeenLastCalledWith({ admin: { sidekick: 'hidden' } });
    expect(toast).toHaveBeenCalledWith(expect.stringContaining('Alfred settings'), expect.any(Number));

    // Switched in Options or another tab.
    watcher({ ...settings.defaultSettings, admin: { sidekick: 'default' } });
    expect(mode()).toBeNull();
    watcher({ ...settings.defaultSettings, admin: { sidekick: 'sidebar' } });
    expect(mode()).toBe('sidebar');
    expect($('#alfred-sidekick-nav')).not.toBeNull();

    // An old build's script must not leave dead controls behind after an update.
    invalidate();
    expect(mode()).toBeNull();
    expect($('#alfred-sidekick-nav')).toBeNull();
    expect($('.alfred-sidekick-control')).toBeNull();
  });

  it('reports the saved mode on each load only when Sidekick is moved or hidden', () => {
    const ctx = { onInvalidated: () => {} } as never;
    track.mockClear();
    setupSidekick(ctx, 'default');
    expect(track).not.toHaveBeenCalled();
    setupSidekick(ctx, 'hidden');
    expect(track).toHaveBeenCalledWith('admin.sidekick.placement_apply', { placement: 'hidden' });
  });
});
