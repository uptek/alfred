import { afterAll, beforeEach, describe, expect, it, mock, spyOn } from 'bun:test';
import { parseHTML } from 'linkedom';

const HERO = (installAttrs: string) => `
  <section id="adp-hero">
    <div>
      <div><h1>Magic Bundles</h1></div>
      <div class="tw-shrink-0">
        <div id="analytics-viewItem">
          <a ${installAttrs} href="#">Install</a>
          <div id="demo" style="margin-bottom: 16px"><a href="https://demo.example">View demo store</a></div>
        </div>
      </div>
    </div>
  </section>`;

const dom = parseHTML('<!doctype html><html><body></body></html>');
const { document } = dom;
const location = { pathname: '/magic-bundles' };
const writeText = mock(async (_text: string) => {});

const g = globalThis as Record<string, unknown>;
const GLOBALS = ['document', 'window', 'navigator', 'defineContentScript'];
const saved = GLOBALS.map((k) => [k, Object.getOwnPropertyDescriptor(g, k)] as const);
const setGlobal = (key: string, value: unknown) =>
  Object.defineProperty(g, key, { value, configurable: true, writable: true, enumerable: true });

setGlobal('document', document);
setGlobal('window', { location, setTimeout, clearTimeout });
setGlobal('navigator', { clipboard: { writeText } });
setGlobal('defineContentScript', (definition: unknown) => definition);

// Every test file that mocks '#imports' exports the same names: once one file
// has mocked it, bun can't add export names for a later file's mock.
mock.module('#imports', () => ({
  storage: { watch: () => () => {} },
  createIntegratedUi: () => ({ mount() {} })
}));

const storage = await import('~/utils/storage');
const getItem = spyOn(storage, 'getItem').mockImplementation(async () => null as never);
const analytics = await import('~/utils/analytics');
const track = spyOn(analytics, 'sendTrackEvent').mockImplementation(() => {});

const { default: script } = await import('../index');
const ctx = {
  addEventListener: (target: EventTarget, type: string, handler: EventListener) =>
    target.addEventListener(type, handler)
};
const run = () => script.main(ctx as never);

afterAll(() => {
  getItem.mockRestore();
  track.mockRestore();
  for (const [key, descriptor] of saved) {
    if (descriptor) Object.defineProperty(g, key, descriptor);
    else delete g[key];
  }
});

beforeEach(() => {
  location.pathname = '/magic-bundles';
  document.body.innerHTML = HERO('data-api-key="e03c762e"');
  writeText.mockClear();
  track.mockClear();
});

const buttons = () => [...document.querySelectorAll<HTMLButtonElement>('#adp-hero #alfred-listing-actions button')];

describe('listing copy buttons', () => {
  it('adds review link and client ID buttons to the hero row', async () => {
    await run();

    expect(buttons().map((b) => [b.textContent, b.title])).toEqual([
      ['Review link', 'https://apps.shopify.com/magic-bundles#modal-show=WriteReviewModal'],
      ['Client ID', 'e03c762e']
    ]);
    expect(buttons()[1]!.getAttribute('aria-label')).toBe('Copy client ID');
    // The demo link's own margin goes so the divider sits 16px below it
    expect(document.getElementById('demo')!.style.marginBottom).toBe('0');
  });

  it('copies the value, swaps the icon to a check and tracks the copy', async () => {
    await run();
    const button = buttons()[0]!;
    button.dispatchEvent(new dom.Event('click'));
    await Bun.sleep(0);

    expect(writeText).toHaveBeenCalledWith('https://apps.shopify.com/magic-bundles#modal-show=WriteReviewModal');
    expect(button.querySelector('path')!.getAttribute('d')).toBe('M5 13l4 4L19 7');
    expect(track).toHaveBeenCalledWith('apps.listing_actions.review_link_copy', { handle: 'magic-bundles' });
  });

  it('keeps the copy icon and skips tracking when the clipboard write fails', async () => {
    await run();
    writeText.mockImplementationOnce(async () => {
      throw new Error('denied');
    });
    const button = buttons()[1]!;
    const before = button.querySelector('path')!.getAttribute('d');
    button.dispatchEvent(new dom.Event('click'));
    await Bun.sleep(0);

    expect(button.querySelector('path')!.getAttribute('d')).toBe(before);
    expect(track).not.toHaveBeenCalled();
  });

  it('does not duplicate buttons when Turbo fires turbo:load on the same page', async () => {
    await run();
    document.dispatchEvent(new dom.Event('turbo:load'));

    expect(buttons()).toHaveLength(2);
  });

  it('leaves out the client ID when the Install button has no API key', async () => {
    document.body.innerHTML = HERO('');
    await run();

    expect(buttons().map((b) => b.textContent)).toEqual(['Review link']);
  });

  it('adds nothing off single-app listing paths', async () => {
    location.pathname = '/magic-bundles/reviews';
    await run();

    expect(document.getElementById('alfred-listing-actions')).toBeNull();
  });
});
