import { afterAll, describe, expect, it, mock, spyOn } from 'bun:test';
import { parseHTML } from 'linkedom';

// The content script mounts the presets app through WXT and Svelte, neither of
// which runs under bun, so '#imports', 'svelte' and the App component get
// stand-ins. Settings and waitForElement are spied, not module-mocked, so their
// own tests keep the real modules.

const FORM = `
  <form id="collaboration-request-form">
    <fieldset id="fields">
      <input id="store-url-input" value="demo.myshopify.com">
      <button type="submit" id="collaboration-request-submit-button" disabled>Request access</button>
    </fieldset>
  </form>`;
const FORM_PAGE = '/dashboard/1/stores/collaborations/new';
const OTHER_PAGE = '/dashboard/1/apps';

const dom = parseHTML('<!doctype html><html><head></head><body></body></html>');
const { document } = dom;
const location = { pathname: OTHER_PAGE };

const g = globalThis as Record<string, unknown>;
const GLOBALS = ['document', 'window', 'MutationObserver', 'CustomEvent', 'defineContentScript'];
const saved = GLOBALS.map((k) => [k, Object.getOwnPropertyDescriptor(g, k)] as const);
const setGlobal = (key: string, value: unknown) =>
  Object.defineProperty(g, key, { value, configurable: true, writable: true, enumerable: true });
setGlobal('document', document);
setGlobal('window', { location });
// linkedom only reports descendant attribute changes to observers that also
// watch childList, so subtree attribute observers get it added, as a browser
// would report them without it.
class SubtreeMutationObserver extends dom.MutationObserver {
  observe(target: Node, options: MutationObserverInit = {}) {
    super.observe(target, options.subtree && options.attributes ? { ...options, childList: true } : options);
  }
}
setGlobal('MutationObserver', SubtreeMutationObserver);
setGlobal('CustomEvent', dom.CustomEvent);
setGlobal('defineContentScript', (definition: unknown) => definition);

type UiOptions = {
  position: string;
  anchor: string;
  append: string;
  onMount(container: HTMLElement): unknown;
  onRemove(): void;
};
const uis: UiOptions[] = [];
// Every test file that mocks '#imports' exports the same names: once one file
// has mocked it, bun can't add export names for a later file's mock.
mock.module('#imports', () => ({
  storage: { watch: () => () => {} },
  // Like WXT's integrated UI: mount() adds a container at the anchor and hands it to onMount.
  createIntegratedUi: (_ctx: unknown, options: UiOptions) => {
    uis.push(options);
    return {
      mount() {
        const container = document.createElement('div');
        document.querySelector(options.anchor)!.before(container);
        options.onMount(container);
      }
    };
  }
}));
const App = { name: 'App' };
const app = { name: 'mounted app' };
const mount = mock(() => app);
const unmount = mock();
// mock.module is process-wide, so the rest of svelte stays real for other files
const svelte = await import('svelte');
mock.module('svelte', () => ({ ...svelte, mount, unmount }));
mock.module('../App.svelte', () => ({ default: App }));

const settings = await import('~/utils/settings');
const helpers = await import('~/utils/helpers');
let presetsEnabled = true;
const getSettings = spyOn(settings, 'getSettings').mockImplementation(async () => ({
  ...settings.defaultSettings,
  collaboratorAccess: { ...settings.defaultSettings.collaboratorAccess, presets: presetsEnabled }
}));
const waitForElement = spyOn(helpers, 'waitForElement').mockImplementation(async (selector: string) =>
  document.querySelector(selector)
);

const { default: script } = await import('../index');

afterAll(async () => {
  // Pending debounced injects run off the form page, while the globals still exist.
  location.pathname = OTHER_PAGE;
  await Bun.sleep(250);
  getSettings.mockRestore();
  waitForElement.mockRestore();
  for (const [key, descriptor] of saved) {
    if (descriptor) Object.defineProperty(g, key, descriptor);
    else delete g[key];
  }
});

const $ = <T extends HTMLElement = HTMLElement>(selector: string) => document.querySelector<T>(selector)!;
const form = () => $('#collaboration-request-form');
const bottomButtons = () => [...(form().nextElementSibling?.querySelectorAll('button') ?? [])] as HTMLButtonElement[];
// A Turbo visit to the request form: the path changes and the body is swapped,
// then the script's observer injects after its debounce.
const visitForm = async (html = FORM) => {
  location.pathname = FORM_PAGE;
  document.body.innerHTML = html;
  await Bun.sleep(250);
};

describe('collaborator access content script', () => {
  it('does nothing while presets are turned off', async () => {
    presetsEnabled = false;
    location.pathname = FORM_PAGE;
    document.body.innerHTML = FORM;
    await script.main({} as never);
    presetsEnabled = true;

    expect(uis.length).toBe(0);
    expect(document.querySelector('#alfred-collaborator-access')).toBeNull();
    expect(form().nextElementSibling).toBeNull();
  });

  it('injects the presets UI and bottom bar once the dashboard navigates to the request form', async () => {
    location.pathname = OTHER_PAGE;
    document.body.innerHTML = '<main></main>';
    await script.main({} as never);
    expect(uis.length).toBe(0);

    await visitForm();
    expect(uis.length).toBe(1);
    expect(uis[0]).toMatchObject({ position: 'inline', anchor: '#collaboration-request-form', append: 'before' });
    const sentinel = $('#alfred-collaborator-access');
    expect(sentinel.nextElementSibling).toBe(form());
    expect(mount).toHaveBeenCalledWith(App, { target: sentinel });
    expect(bottomButtons().map((b) => b.textContent)).toEqual(['Save preset', 'Request access']);

    // The sentinel stops later mutations from injecting again.
    document.body.append(document.createElement('div'));
    await Bun.sleep(250);
    expect(uis.length).toBe(1);

    uis[0]!.onRemove();
    uis[0]!.onRemove();
    expect(unmount).toHaveBeenCalledTimes(1);
    expect(unmount).toHaveBeenCalledWith(app);
  });

  it('builds Altair buttons: Save preset asks the app to save, Request access submits the form', async () => {
    await visitForm();
    const [save, submit] = bottomButtons();
    for (const [button, variant, label] of [
      [save!, 'secondary', 'Save preset'],
      [submit!, 'primary', 'Request access']
    ] as const) {
      expect(button.className).toBe(`altair-button altair-button--${variant}`);
      expect(button.getAttribute('data-altair-component')).toBe('Button');
      expect(button.getAttribute('data-altair-variant')).toBe(variant);
      expect(button.getAttribute('data-altair-size')).toBe('default');
      expect(button.querySelector('.altair-button__content > .altair-button__label')!.textContent).toBe(label);
    }
    expect(save!.type).toBe('button');
    expect(submit!.type).toBe('submit');
    expect(submit!.getAttribute('form')).toBe('collaboration-request-form');

    const onSave = mock();
    document.addEventListener('alfred:save-preset', onSave);
    save!.click();
    document.removeEventListener('alfred:save-preset', onSave);
    expect(onSave).toHaveBeenCalledTimes(1);
  });

  it("mirrors the page's Request access disabled state, including a disabled fieldset", async () => {
    await visitForm();
    const pageSubmit = $<HTMLButtonElement>('#collaboration-request-submit-button');
    const bottomSubmit = bottomButtons()[1]!;
    expect(bottomSubmit.disabled).toBe(true);

    pageSubmit.removeAttribute('disabled');
    await Bun.sleep(0);
    expect(bottomSubmit.disabled).toBe(false);

    // linkedom's :disabled skips fieldset descendants, so the button gets the browser's rule.
    const matches = pageSubmit.matches.bind(pageSubmit);
    pageSubmit.matches = (selector: string) =>
      selector === ':disabled' ? pageSubmit.closest('[disabled]') !== null : matches(selector);
    $('#fields').setAttribute('disabled', '');
    await Bun.sleep(0);
    expect(bottomSubmit.disabled).toBe(true);

    $('#fields').removeAttribute('disabled');
    await Bun.sleep(0);
    expect(bottomSubmit.disabled).toBe(false);
  });

  it('mounts the UI without a bottom bar when the form has no submit button', async () => {
    const before = uis.length;
    await visitForm('<form id="collaboration-request-form"></form>');
    expect(uis.length).toBe(before + 1);
    expect($('#alfred-collaborator-access').nextElementSibling).toBe(form());
    expect(form().nextElementSibling).toBeNull();
  });

  it('injects once while it waits for the submit button, however many mutations arrive', async () => {
    const before = uis.length;
    let release!: () => void;
    const gate = new Promise<void>((resolve) => (release = resolve));
    waitForElement.mockImplementationOnce(async (selector: string) => {
      await gate;
      return document.querySelector(selector);
    });
    await visitForm();
    // A later mutation schedules another inject while the first still waits
    document.body.append(document.createElement('div'));
    await Bun.sleep(250);
    release();
    await Bun.sleep(0);
    expect(uis.length).toBe(before + 1);
    expect(document.querySelectorAll('#alfred-collaborator-access').length).toBe(1);
  });
});
