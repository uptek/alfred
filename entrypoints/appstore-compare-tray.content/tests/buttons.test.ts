import { afterAll, describe, expect, it, mock, spyOn } from 'bun:test';
import { parseHTML } from 'linkedom';

const dom = parseHTML(`<!doctype html><html><head></head><body>
  <section id="adp-hero">
    <div><img src="icon.png"><div><h1>Magic Bundles</h1></div></div>
  </section>
  <div data-controller="app-card" data-app-card-handle-value="judgeme" data-app-card-name-value="Judge.me">
    <figure><img src="judgeme.png"></figure>
    <div></div>
  </div>
</body></html>`);
const { document } = dom;

const g = globalThis as Record<string, unknown>;
const GLOBALS = ['document', 'window', 'HTMLElement', 'MutationObserver', 'Node'];
const saved = GLOBALS.map((k) => [k, Object.getOwnPropertyDescriptor(g, k)] as const);
const setGlobal = (key: string, value: unknown) =>
  Object.defineProperty(g, key, { value, configurable: true, writable: true, enumerable: true });

setGlobal('document', document);
setGlobal('window', { location: { pathname: '/magic-bundles' }, setTimeout, clearTimeout });
// utils/toast defines a custom element class at module load
setGlobal('HTMLElement', dom.HTMLElement);
setGlobal('MutationObserver', dom.MutationObserver);
setGlobal('Node', dom.Node);

// Every test file that mocks '#imports' exports the same names: once one file
// has mocked it, bun can't add export names for a later file's mock.
mock.module('#imports', () => ({
  storage: { watch: () => () => {} },
  createIntegratedUi: () => ({ mount() {} })
}));

// The tray module is spied, not its storage: another test file may have
// imported utils/compareTray against its own '#imports' stand-in first.
const compareTray = await import('~/utils/compareTray');
let pushTray: (items: CompareTrayItem[]) => void = () => {};
const getTray = spyOn(compareTray, 'getTray').mockImplementation(async () => []);
const watchTray = spyOn(compareTray, 'watchTray').mockImplementation((callback) => {
  pushTray = callback;
  return () => {};
});

const { initCompareButtons } = await import('../buttons');
const cleanup = initCompareButtons();
await Bun.sleep(0);

afterAll(() => {
  cleanup();
  getTray.mockRestore();
  watchTray.mockRestore();
  for (const [key, descriptor] of saved) {
    if (descriptor) Object.defineProperty(g, key, descriptor);
    else delete g[key];
  }
});

const listingButton = () => document.querySelector<HTMLButtonElement>('#alfred-listing-actions button')!;
const cardButton = () => document.querySelector<HTMLButtonElement>('[data-controller="app-card"] button')!;
const CHECK = 'M5 13l4 4L19 7';

describe('compare buttons', () => {
  it('puts the listing button in the hero row with the App Store secondary style', () => {
    expect(listingButton().classList.contains('tw-button-secondary')).toBe(true);
    expect(listingButton().classList.contains('tw-button-primary')).toBe(false);
    expect(listingButton().textContent).toBe('Compare');
    expect(listingButton().innerHTML).not.toContain(CHECK);
  });

  it('switches the listing button to primary with a check when its app joins the tray', () => {
    pushTray([{ handle: 'magic-bundles', name: 'Magic Bundles' }]);

    expect(listingButton().classList.contains('tw-button-primary')).toBe(true);
    expect(listingButton().classList.contains('tw-button-secondary')).toBe(false);
    expect(listingButton().innerHTML).toContain(CHECK);
    expect(cardButton().classList.contains('alfred-compare-button--active')).toBe(false);
  });

  it('keeps card buttons on their own active class', () => {
    pushTray([{ handle: 'judgeme', name: 'Judge.me' }]);

    expect(cardButton().classList.contains('alfred-compare-button--active')).toBe(true);
    expect(cardButton().className).not.toContain('tw-button');
    expect(listingButton().classList.contains('tw-button-secondary')).toBe(true);
  });
});
