import { afterAll, describe, expect, it, mock, spyOn } from 'bun:test';
import { parseHTML } from 'linkedom';

// The dashboard script reads the page, media queries and the platform at
// module load, so every global is in place before the import. index.ts pulls
// in ./sidebar, which makes this one file cover both: they share the module
// instance and the document. Storage is spied, not module-mocked, so the real
// utils/storage stays intact for other test files; '#imports' only resolves
// inside WXT, so it gets an in-memory stand-in.

type Listener = (e?: unknown) => void;
type FakeMediaQuery = { matches: boolean; listeners: Listener[]; addEventListener(type: string, fn: Listener): void };

const queries = new Map<string, FakeMediaQuery>();
const media = (query: string) => {
  if (!queries.has(query)) {
    const mq: FakeMediaQuery = {
      matches: false,
      listeners: [],
      addEventListener: (_type, fn) => mq.listeners.push(fn)
    };
    queries.set(query, mq);
  }
  return queries.get(query)!;
};
const WIDE = media('(min-width: 48rem)');
const PREFERS_DARK = media('(prefers-color-scheme: dark)');
const REDUCED_MOTION = media('(prefers-reduced-motion: reduce)');
WIDE.matches = true;
const setWide = (wide: boolean) => {
  WIDE.matches = wide;
  WIDE.listeners.forEach((fn) => fn());
};

const FIXTURE = `
  <div class="altair-app-frame" data-altair-theme="dark">
    <nav class="side-nav" data-altair--side-nav-state-value="expanded">
      <a class="side-nav__brand" href="/dashboard">Shopify</a>
      <ul class="side-nav__list">
        <li><a class="side-nav-link"><span class="side-nav__icon" data-icon-name="home"><span class="altair-icon">home</span></span><span class="side-nav__label">Home</span></a></li>
      </ul>
      <ul class="side-nav__list side-nav__list--secondary">
        <li><a class="side-nav-link" id="l-overview"><span class="side-nav__label">Overview</span></a></li>
        <li><a class="side-nav-link" id="l-logs"><span class="side-nav__label"> Logs </span></a></li>
        <li><a class="side-nav-link" id="l-versions"><span class="side-nav__label">Versions</span></a></li>
        <li><a class="side-nav-link" id="l-monitoring"><span class="side-nav__label">monitoring</span></a></li>
      </ul>
      <div class="side-nav__footer"></div>
    </nav>
    <main class="altair-app-frame__main"></main>
  </div>`;

const dom = parseHTML(`<!doctype html><html><body data-altair-theme="dark">${FIXTURE}</body></html>`);
const { document } = dom;

// Keydown handlers are captured so tests can hand them precise modifier
// combinations; linkedom has no KeyboardEvent.
const keyHandlers: Listener[] = [];
const addListener = document.addEventListener.bind(document);
document.addEventListener = ((type: string, fn: Listener, opts?: unknown) => {
  if (type === 'keydown') keyHandlers.push(fn);
  else addListener(type, fn as never, opts as never);
}) as typeof document.addEventListener;

// One queued callback per animation frame, flushed by hand.
const frames: (() => void)[] = [];
const flushFrame = () => frames.shift()?.();

const g = globalThis as Record<string, unknown>;
const GLOBALS = [
  'document',
  'window',
  'navigator',
  'MutationObserver',
  'Element',
  'requestAnimationFrame',
  'getComputedStyle',
  'defineContentScript'
];
const saved = GLOBALS.map((k) => [k, Object.getOwnPropertyDescriptor(g, k)] as const);
const setGlobal = (key: string, value: unknown) =>
  Object.defineProperty(g, key, { value, configurable: true, writable: true, enumerable: true });

setGlobal('document', document);
setGlobal('window', { matchMedia: media });
setGlobal('navigator', { platform: 'Win32' });
setGlobal('MutationObserver', dom.MutationObserver);
setGlobal('Element', dom.Element);
setGlobal('requestAnimationFrame', (cb: () => void) => frames.push(cb));
// The theme pill sits 40px further along per slot.
setGlobal('getComputedStyle', (el: HTMLElement) => ({
  left: `${Number(el.style.getPropertyValue('--alfred-theme-index') || 0) * 40}px`,
  marginTop: '0px'
}));
setGlobal('defineContentScript', (definition: unknown) => definition);

const watchers = new Map<string, Listener[]>();
// Every test file that mocks '#imports' exports the same names: once one file
// has mocked it, bun can't add export names for a later file's mock.
mock.module('#imports', () => ({
  storage: {
    watch: (key: string, cb: Listener) => {
      watchers.set(key, [...(watchers.get(key) ?? []), cb]);
      return () => {};
    }
  },
  createIntegratedUi: () => ({ mount() {} })
}));
const otherTab = (key: string, value: unknown) => watchers.get(`local:${key}`)![0]!(value);

const storage = await import('~/utils/storage');
const store = new Map<string, unknown>([
  ['devDashboardTheme', 'light'],
  ['devDashboardNavCollapsed', true]
]);
const getItem = spyOn(storage, 'getItem').mockImplementation(async (key: string) => (store.get(key) ?? null) as never);
// Like chrome.storage.onChanged, a write notifies watchers in this tab too.
const setItem = spyOn(storage, 'setItem').mockImplementation(async (key: string, value: unknown) => {
  if (store.get(key) === value) return;
  store.set(key, value);
  watchers.get(`local:${key}`)?.forEach((cb) => cb(value));
});

const { default: script } = await import('../index');
const { syncSidebar } = await import('../sidebar');
await script.main();
// linkedom has no Web Animations; the pill slide is asserted through this.
const pillAnimate = mock();
Object.assign(document.querySelector('#alfred-theme-toggle')!, { animate: pillAnimate });

afterAll(async () => {
  // Lets queued observer callbacks finish while the DOM globals exist.
  await Bun.sleep(0);
  getItem.mockRestore();
  setItem.mockRestore();
  for (const [key, descriptor] of saved) {
    if (descriptor) Object.defineProperty(g, key, descriptor);
    else delete g[key];
  }
});

const $ = <T extends HTMLElement = HTMLElement>(selector: string) => document.querySelector<T>(selector)!;
const nav = () => $('nav.side-nav');
const navState = () => nav().getAttribute('data-altair--side-nav-state-value');
const themeOf = (selector: string) => $(selector).dataset.altairTheme;
const checkedMode = () => $('#alfred-theme-toggle [aria-checked="true"]').dataset.mode;
const themeButton = (mode: string) => $<HTMLButtonElement>(`#alfred-theme-toggle [data-mode="${mode}"]`);
const navButton = () => $<HTMLButtonElement>('#alfred-nav-toggle button');
const resetDom = () => {
  document.body.innerHTML = FIXTURE;
  syncSidebar();
};
const key = (init: Partial<KeyboardEvent> & { target?: unknown }) => {
  const event = {
    key: 'b',
    metaKey: false,
    ctrlKey: false,
    shiftKey: false,
    altKey: false,
    target: document.body,
    preventDefault: mock(),
    ...init
  };
  keyHandlers[0]!(event);
  return event;
};

describe('theme toggle', () => {
  it('applies the saved light theme while keeping the frame and nav dark', () => {
    const html = document.documentElement;
    expect(html.classList.contains('light')).toBe(true);
    expect(html.classList.contains('dark')).toBe(false);
    expect(html.style.colorScheme).toBe('light');
    expect(themeOf('body')).toBe('light');
    expect(themeOf('.altair-app-frame__main')).toBe('light');
    expect(themeOf('.altair-app-frame')).toBe('dark');
  });

  it('injects a radiogroup above the nav footer and applies a clicked mode once', async () => {
    const toggle = $('#alfred-theme-toggle');
    expect(toggle.getAttribute('role')).toBe('radiogroup');
    expect(toggle.nextElementSibling).toBe($('.side-nav__footer'));
    expect([...toggle.querySelectorAll('button')].map((b) => b.dataset.mode)).toEqual(['light', 'dark', 'system']);
    expect(checkedMode()).toBe('light');

    // The script's own observer watches data-altair-theme, so an unguarded
    // write would keep re-triggering it. One change must settle in one record.
    const records: MutationRecord[] = [];
    const watcher = new dom.MutationObserver((batch: MutationRecord[]) => records.push(...batch));
    watcher.observe(document.body, { attributeFilter: ['data-altair-theme'] });
    themeButton('dark').click();
    await Bun.sleep(20);
    watcher.disconnect();

    expect(setItem).toHaveBeenCalledWith('devDashboardTheme', 'dark');
    expect(document.documentElement.classList.contains('dark')).toBe(true);
    expect(themeOf('body')).toBe('dark');
    expect(checkedMode()).toBe('dark');
    expect(records.filter((r) => r.target === document.body).length).toBeLessThanOrEqual(2);
  });

  it('keeps a clicked mode through the observer when no storage echo arrives', async () => {
    // A script orphaned by an extension update gets no onChanged echo, so the
    // click alone has to outlast the observer's own theme pass.
    setItem.mockImplementationOnce(async () => {});
    themeButton('light').click();
    await Bun.sleep(0);
    expect(themeOf('body')).toBe('light');
    expect(checkedMode()).toBe('light');
    store.set('devDashboardTheme', 'light');
  });

  it('follows another tab and the OS scheme only while in system mode', () => {
    PREFERS_DARK.matches = false;
    otherTab('devDashboardTheme', null);
    expect(checkedMode()).toBe('system');
    expect(themeOf('body')).toBe('light');

    PREFERS_DARK.matches = true;
    PREFERS_DARK.listeners.forEach((fn) => fn());
    expect(themeOf('body')).toBe('dark');
    expect(document.documentElement.style.colorScheme).toBe('dark');

    otherTab('devDashboardTheme', 'light');
    PREFERS_DARK.matches = false;
    PREFERS_DARK.listeners.forEach((fn) => fn());
    expect(checkedMode()).toBe('light');
    expect(themeOf('body')).toBe('light');
  });

  it('slides the pill from its old slot, unless motion is reduced', () => {
    const animate = pillAnimate;
    animate.mockClear();

    themeButton('system').click();
    expect(animate).toHaveBeenCalledTimes(1);
    const [keyframes, options] = animate.mock.calls[0]!;
    expect(keyframes).toEqual({ translate: ['-80px 0px', '0 0'] });
    expect(options).toMatchObject({ pseudoElement: '::before', duration: 250 });

    themeButton('system').click();
    expect(animate).toHaveBeenCalledTimes(1);

    REDUCED_MOTION.matches = true;
    themeButton('light').click();
    REDUCED_MOTION.matches = false;
    expect(animate).toHaveBeenCalledTimes(1);
    expect(checkedMode()).toBe('light');
  });

  it('re-applies theme and nav state to a Turbo-swapped body and re-injects both toggles', async () => {
    const fresh = document.createElement('body');
    fresh.setAttribute('data-altair-theme', 'dark');
    fresh.innerHTML = FIXTURE;
    document.documentElement.replaceChild(fresh, document.body);

    await Bun.sleep(0);
    expect(themeOf('body')).toBe('light');
    expect(themeOf('.altair-app-frame')).toBe('dark');
    expect(navState()).toBe('collapsed');
    expect(document.querySelectorAll('#alfred-nav-toggle').length).toBe(1);

    // The theme toggle is back in the same observer pass
    expect(document.querySelectorAll('#alfred-theme-toggle').length).toBe(1);
    expect(checkedMode()).toBe('light');
  });
});

describe('nav collapse toggle', () => {
  it('restores the saved collapsed state with an expand label opening to the side', () => {
    resetDom();
    expect(navState()).toBe('collapsed');
    expect(navButton().getAttribute('aria-label')).toBe('Expand navigation');
    expect(navButton().getAttribute('aria-expanded')).toBe('false');
    expect($('#alfred-nav-toggle').dataset.placement).toBe('side');
    expect($('.alfred-nav-toggle__label').textContent).toBe('Expand navigation');

    // Runs on every mutation, so an unchanged state must not write again.
    const navSet = spyOn(nav(), 'setAttribute');
    const buttonSet = spyOn(navButton(), 'setAttribute');
    syncSidebar();
    expect(navSet).not.toHaveBeenCalled();
    expect(buttonSet).not.toHaveBeenCalled();
  });

  it('shows the expanded nav below 48rem and follows other tabs', () => {
    resetDom();
    setWide(false);
    expect(navState()).toBe('expanded');
    expect(navButton().getAttribute('aria-label')).toBe('Collapse navigation');
    expect($('#alfred-nav-toggle').dataset.placement).toBe('bottom');

    setWide(true);
    expect(navState()).toBe('collapsed');

    otherTab('devDashboardNavCollapsed', null);
    expect(navState()).toBe('expanded');
    otherTab('devDashboardNavCollapsed', true);
    expect(navState()).toBe('collapsed');
  });

  it('injects one toggle right after the logo, and skips pages without a nav or logo', () => {
    resetDom();
    syncSidebar();
    const toggle = $('#alfred-nav-toggle');
    expect(document.querySelectorAll('#alfred-nav-toggle').length).toBe(1);
    expect(toggle.previousElementSibling).toBe($('.side-nav__brand'));
    expect(navButton().getAttribute('aria-keyshortcuts')).toBe('Control+B');
    expect([...toggle.querySelectorAll('kbd')].map((k) => k.textContent)).toEqual(['Ctrl', 'B']);

    toggle.remove();
    $('.side-nav__brand').remove();
    expect(() => syncSidebar()).not.toThrow();
    expect(document.querySelector('#alfred-nav-toggle')).toBeNull();

    document.body.innerHTML = '<main></main>';
    expect(() => syncSidebar()).not.toThrow();
  });

  it('toggles and persists on click, hiding the tooltip until the pointer or focus returns', () => {
    resetDom();
    setItem.mockClear();
    navButton().click();
    expect(navState()).toBe('expanded');
    expect(setItem).toHaveBeenCalledWith('devDashboardNavCollapsed', false);
    expect(navButton().getAttribute('aria-label')).toBe('Collapse navigation');

    const toggle = $('#alfred-nav-toggle');
    expect(toggle.hasAttribute('data-disabled')).toBe(true);
    toggle.dispatchEvent(new dom.Event('pointerenter'));
    expect(toggle.hasAttribute('data-disabled')).toBe(false);

    navButton().click();
    expect(toggle.hasAttribute('data-disabled')).toBe(true);
    toggle.dispatchEvent(new dom.Event('focusin'));
    expect(toggle.hasAttribute('data-disabled')).toBe(false);
    expect(navState()).toBe('collapsed');
  });

  it('gives second-level links rail icons once: cloned, inline, or a monogram', () => {
    resetDom();
    const iconOf = (id: string) => $(`#${id}`).querySelectorAll('.alfred-rail-icon');

    expect(iconOf('l-overview')[0]!.querySelector('.altair-icon')!.textContent).toBe('home');
    expect(iconOf('l-logs')[0]!.querySelector('svg')).not.toBeNull();
    expect(iconOf('l-versions')[0]!.querySelector('svg')).not.toBeNull();
    expect(iconOf('l-monitoring')[0]!.querySelector('.alfred-rail-monogram')!.textContent).toBe('M');
    expect(iconOf('l-logs')[0]!.getAttribute('aria-hidden')).toBe('true');
    // The first-level link keeps its own icon.
    expect(document.querySelectorAll('.alfred-rail-icon').length).toBe(4);

    syncSidebar();
    for (const id of ['l-overview', 'l-logs', 'l-versions', 'l-monitoring']) expect(iconOf(id).length).toBe(1);
  });

  it('waits for a label and for the page icon it clones before adding a rail icon', () => {
    resetDom();
    const list = $('.side-nav__list--secondary');
    list.insertAdjacentHTML(
      'beforeend',
      '<li><a class="side-nav-link" id="l-empty"><span class="side-nav__label"> </span></a></li>' +
        '<li><a class="side-nav-link" id="l-settings"><span class="side-nav__label">Settings</span></a></li>'
    );
    syncSidebar();
    expect($('#l-empty').querySelector('.side-nav__icon')).toBeNull();
    expect($('#l-settings').querySelector('.side-nav__icon')).toBeNull();

    $('.side-nav__list').insertAdjacentHTML(
      'beforeend',
      '<li><span class="side-nav__icon" data-icon-name="settings"><span class="altair-icon">cog</span></span></li>'
    );
    syncSidebar();
    expect($('#l-settings .alfred-rail-icon .altair-icon').textContent).toBe('cog');
  });

  it('toggles on Ctrl+B off Mac, leaving other combos, rich text and the drawer alone', () => {
    resetDom();
    expect(navState()).toBe('collapsed');

    for (const init of [
      { metaKey: true },
      { ctrlKey: true, shiftKey: true },
      { ctrlKey: true, altKey: true },
      { ctrlKey: true, key: 'i' },
      { ctrlKey: true, repeat: true },
      { ctrlKey: true, defaultPrevented: true },
      { ctrlKey: true, target: { isContentEditable: true } }
    ]) {
      expect(key(init).preventDefault).not.toHaveBeenCalled();
    }
    setWide(false);
    expect(key({ ctrlKey: true }).preventDefault).not.toHaveBeenCalled();
    setWide(true);
    expect(navState()).toBe('collapsed');

    expect(key({ ctrlKey: true, key: 'B' }).preventDefault).toHaveBeenCalled();
    expect(navState()).toBe('expanded');
    key({ ctrlKey: true });
    expect(navState()).toBe('collapsed');
  });

  it('uses Cmd+B and a ⌘ hint on Mac', async () => {
    setGlobal('navigator', { platform: 'MacIntel' });
    const mac = await import('../sidebar.ts?mac');
    setGlobal('navigator', { platform: 'Win32' });
    const handlerCount = keyHandlers.length;
    await mac.initSidebar();
    const macKey = keyHandlers[handlerCount]!;

    resetDom();
    $('#alfred-nav-toggle').remove();
    mac.syncSidebar();
    expect(navButton().getAttribute('aria-keyshortcuts')).toBe('Meta+B');
    expect([...$('#alfred-nav-toggle').querySelectorAll('kbd')].map((k) => k.textContent)).toEqual(['⌘', 'B']);

    const press = (init: Partial<KeyboardEvent>) => {
      const event = {
        key: 'b',
        shiftKey: false,
        altKey: false,
        target: document.body,
        preventDefault: mock(),
        ...init
      };
      macKey(event);
      return event.preventDefault;
    };
    expect(press({ ctrlKey: true, metaKey: false })).not.toHaveBeenCalled();
    expect(press({ metaKey: true, ctrlKey: false })).toHaveBeenCalled();
  });

  it('pins chart canvases through the nav transition and releases one per frame', async () => {
    resetDom();
    $('main').innerHTML =
      '<div class="chart"><div data-altair--chart-target="canvas legend"></div></div>' +
      '<div class="chart"><div data-altair--chart-target="canvas"></div></div>';
    const canvases = [...document.querySelectorAll<HTMLElement>('[data-altair--chart-target~="canvas"]')];
    canvases.forEach((c, i) => Object.assign(c, { getBoundingClientRect: () => ({ width: 300 + i }) }));
    const pinned = () => canvases.map((c) => [c.style.width, c.parentElement!.style.overflow]);

    navButton().click();
    expect(pinned()).toEqual([
      ['300px', 'clip'],
      ['301px', 'clip']
    ]);

    const transitionEnd = (target: EventTarget, propertyName: string) =>
      target.dispatchEvent(Object.assign(new dom.Event('transitionend'), { propertyName }));
    transitionEnd(nav(), 'opacity');
    transitionEnd(navButton(), 'width');
    expect(pinned()[0]).toEqual(['300px', 'clip']);

    transitionEnd(nav(), 'width');
    expect(pinned()).toEqual([
      ['', ''],
      ['301px', 'clip']
    ]);
    flushFrame();
    expect(pinned()[1]).toEqual(['', '']);
    flushFrame();

    // A Turbo snapshot mid-transition releases every pin at once.
    navButton().click();
    expect(pinned()[1]).toEqual(['301px', 'clip']);
    document.dispatchEvent(new dom.Event('turbo:before-cache'));
    expect(pinned()).toEqual([
      ['', ''],
      ['', '']
    ]);
    transitionEnd(nav(), 'width');
    flushFrame();

    // Without a transition (reduced motion), the fallback timer releases them.
    navButton().click();
    expect(pinned()[0]).toEqual(['300px', 'clip']);
    await Bun.sleep(650);
    flushFrame();
    flushFrame();
    expect(pinned()).toEqual([
      ['', ''],
      ['', '']
    ]);

    // Nothing to pin in the drawer layout.
    setWide(false);
    navButton().click();
    setWide(true);
    expect(pinned()[0]).toEqual(['', '']);
    $('main').innerHTML = '';
  });

  it('releases every chart even when the page detaches one before release', () => {
    resetDom();
    $('main').innerHTML =
      '<div class="chart"><div data-altair--chart-target="canvas"></div></div>' +
      '<div class="chart"><div data-altair--chart-target="canvas"></div></div>';
    const [first, second] = [...document.querySelectorAll<HTMLElement>('[data-altair--chart-target~="canvas"]')];
    for (const c of [first!, second!]) Object.assign(c, { getBoundingClientRect: () => ({ width: 300 }) });
    const firstBox = first!.parentElement!;

    navButton().click();
    first!.remove();
    nav().dispatchEvent(Object.assign(new dom.Event('transitionend'), { propertyName: 'width' }));
    flushFrame();
    flushFrame();
    expect(firstBox.style.overflow).toBe('');
    expect([second!.style.width, second!.parentElement!.style.overflow]).toEqual(['', '']);

    navButton().click();
    document.dispatchEvent(new dom.Event('turbo:before-cache'));
  });
});

describe('theme toggle keyboard', () => {
  // Lets the observer re-inject the toggle and stubs Web Animations on
  // the new toggle, which linkedom lacks. linkedom also reads a tabIndex of 0
  // back as -1, so each radio reads its tabindex attribute instead.
  const freshToggle = async () => {
    resetDom();
    await Bun.sleep(0);
    const toggle = Object.assign($('#alfred-theme-toggle'), { animate: mock() });
    for (const btn of toggle.querySelectorAll('button')) {
      Object.defineProperty(btn, 'tabIndex', {
        get: () => Number(btn.getAttribute('tabindex')),
        set: (value: number) => btn.setAttribute('tabindex', String(value))
      });
    }
    return toggle;
  };
  const arrow = (key: string, init: object = {}) => {
    const event = Object.assign(new dom.Event('keydown'), { key, preventDefault: mock(), ...init });
    $('#alfred-theme-toggle').dispatchEvent(event);
    return event;
  };
  const tabStops = () => [...$('#alfred-theme-toggle').querySelectorAll('button')].map((b) => b.tabIndex);

  it('moves the checked radio with the arrow keys, focusing it and wrapping at both ends', async () => {
    const toggle = await freshToggle();
    themeButton('light').click();
    const focused: string[] = [];
    for (const btn of toggle.querySelectorAll('button'))
      btn.addEventListener('focus', () => focused.push(btn.dataset.mode!));
    setItem.mockClear();

    const visited = ['ArrowRight', 'ArrowDown', 'ArrowRight', 'ArrowLeft', 'ArrowUp'].map((k) => {
      expect(arrow(k).preventDefault).toHaveBeenCalled();
      return checkedMode();
    });
    expect(visited).toEqual(['dark', 'system', 'light', 'system', 'dark']);
    expect(focused).toEqual(visited);
    expect(setItem).toHaveBeenLastCalledWith('devDashboardTheme', 'dark');
    expect(themeOf('body')).toBe('dark');
  });

  it('keeps the checked radio as the only tab stop after clicks, arrows and other tabs', async () => {
    await freshToggle();
    themeButton('system').click();
    expect(tabStops()).toEqual([-1, -1, 0]);
    arrow('ArrowLeft');
    expect(tabStops()).toEqual([-1, 0, -1]);
    otherTab('devDashboardTheme', 'light');
    expect(tabStops()).toEqual([0, -1, -1]);
  });

  it('ignores keys other than the arrows, and modified arrows the browser uses', async () => {
    await freshToggle();
    themeButton('dark').click();
    setItem.mockClear();
    for (const k of ['Enter', ' ', 'Tab', 'Home', 'a']) expect(arrow(k).preventDefault).not.toHaveBeenCalled();
    // Alt+Left and Cmd+Left go back
    for (const mod of ['altKey', 'ctrlKey', 'metaKey', 'shiftKey']) {
      expect(arrow('ArrowLeft', { [mod]: true }).preventDefault).not.toHaveBeenCalled();
    }
    // A held arrow moves once, not through every theme
    arrow('ArrowRight', { repeat: true });
    expect(checkedMode()).toBe('dark');
    expect(tabStops()).toEqual([-1, 0, -1]);
    expect(setItem).not.toHaveBeenCalled();
  });

  it('steps from the focused radio, which another tab can leave unchecked', async () => {
    await freshToggle();
    themeButton('light').click();
    otherTab('devDashboardTheme', 'system');
    const event = Object.assign(new dom.Event('keydown', { bubbles: true }), {
      key: 'ArrowRight',
      preventDefault: mock()
    });
    themeButton('light').dispatchEvent(event);
    expect(checkedMode()).toBe('dark');
  });
});

describe('theme observer', () => {
  // applyTheme also sets the html classes, which the observer does not watch,
  // so a hand-removed class shows whether the theme pass ran.
  const html = () => document.documentElement;
  const settleLight = async () => {
    resetDom();
    otherTab('devDashboardTheme', 'light');
    await Bun.sleep(0);
    html().classList.remove('light');
  };

  it('skips the theme pass for mutations that bring no themed element', async () => {
    await settleLight();
    $('main').insertAdjacentHTML('beforeend', '<svg><path d="M0 0"/></svg><div class="chart"><span>tip</span></div>');
    await Bun.sleep(0);
    expect(html().classList.contains('light')).toBe(false);
  });

  it('re-applies the theme when a themed element arrives, on its own or nested', async () => {
    await settleLight();
    $('main').insertAdjacentHTML('beforeend', '<div id="popover" data-altair-theme="dark"></div>');
    await Bun.sleep(0);
    expect(html().classList.contains('light')).toBe(true);
    expect(themeOf('#popover')).toBe('light');

    html().classList.remove('light');
    $('main').insertAdjacentHTML(
      'beforeend',
      '<section><div class="altair-app-frame__main" id="canvas"></div></section>'
    );
    await Bun.sleep(0);
    expect(html().classList.contains('light')).toBe(true);
    expect(themeOf('#canvas')).toBe('light');
  });

  it('re-applies the theme when a data-altair-theme attribute changes', async () => {
    await settleLight();
    $('.altair-app-frame__main').dataset.altairTheme = 'dark';
    await Bun.sleep(0);
    expect(html().classList.contains('light')).toBe(true);
    expect(themeOf('.altair-app-frame__main')).toBe('light');
  });

  it('waits for the nav footer before injecting the theme toggle', async () => {
    resetDom();
    $('.side-nav__footer').remove();
    await Bun.sleep(0);
    expect(document.querySelector('#alfred-theme-toggle')).toBeNull();

    nav().insertAdjacentHTML('beforeend', '<div class="side-nav__footer"></div>');
    await Bun.sleep(0);
    expect($('#alfred-theme-toggle').nextElementSibling).toBe($('.side-nav__footer'));
  });
});

describe('nav collapse edge cases', () => {
  it('rebuilds toggles rendered from the Turbo page cache, which have no listeners', async () => {
    resetDom();
    await Bun.sleep(0);
    document.documentElement.replaceChild(document.body.cloneNode(true), document.body);
    await Bun.sleep(0);
    document.dispatchEvent(new dom.Event('turbo:render'));

    expect(document.querySelectorAll('#alfred-nav-toggle').length).toBe(1);
    const before = navState();
    navButton().click();
    expect(navState()).not.toBe(before);
    navButton().click();

    expect(document.querySelectorAll('#alfred-theme-toggle').length).toBe(1);
    Object.assign($('#alfred-theme-toggle'), { animate: mock() });
    themeButton('dark').click();
    expect(checkedMode()).toBe('dark');
    themeButton('light').click();
  });

  it('ignores keydown events without a key, which Chrome autofill sends', () => {
    resetDom();
    const before = navState();
    let event: ReturnType<typeof key> | undefined;
    expect(() => (event = key({ key: undefined, ctrlKey: true }))).not.toThrow();
    expect(event!.preventDefault).not.toHaveBeenCalled();
    expect(navState()).toBe(before);
  });

  it('matches rail icons on whole words, so Conversions and Changelog get monograms', () => {
    resetDom();
    $('.side-nav__list--secondary').insertAdjacentHTML(
      'beforeend',
      '<li><a class="side-nav-link" id="l-conversions"><span class="side-nav__label">Conversions</span></a></li>' +
        '<li><a class="side-nav-link" id="l-changelog"><span class="side-nav__label">Changelog</span></a></li>' +
        '<li><a class="side-nav-link" id="l-app-versions"><span class="side-nav__label">App versions</span></a></li>'
    );
    syncSidebar();
    const monogram = (id: string) => $(`#${id} .alfred-rail-icon`).querySelector('.alfred-rail-monogram')?.textContent;
    const iconPath = (id: string) => $(`#${id} .alfred-rail-icon svg path`).getAttribute('d')!;

    expect(monogram('l-conversions')).toBe('C');
    expect(monogram('l-changelog')).toBe('C');
    // Logs and versions keep their own inline icons.
    expect(iconPath('l-logs')).toStartWith('M4 6a1');
    expect(iconPath('l-app-versions')).toStartWith('M10.75 6a');
  });

  it('defers injection to DOMContentLoaded when the script runs while the page is loading', async () => {
    // A second script instance joins the first, from the same stored mode.
    // Its observer is a no-op: two live observers would outlast this test.
    otherTab('devDashboardTheme', 'light');
    store.set('devDashboardTheme', 'light');
    resetDom();
    // The first instance's observer injects on its own, so its toggle is
    // removed right before the dispatch, which the second instance answers
    // synchronously, before any observer microtask.
    const listen = spyOn(document, 'addEventListener');
    setGlobal(
      'MutationObserver',
      class {
        observe() {}
      }
    );
    Object.defineProperty(document, 'readyState', { value: 'loading', configurable: true });
    const { default: early } = await import('../index.ts?loading');
    await early.main();
    delete (document as { readyState?: string }).readyState;
    setGlobal('MutationObserver', dom.MutationObserver);
    const ready = listen.mock.calls.find(([type]) => type === 'DOMContentLoaded');
    listen.mockRestore();
    expect(ready?.[2]).toEqual({ once: true });

    document.getElementById('alfred-theme-toggle')!.remove();
    document.dispatchEvent(new dom.Event('DOMContentLoaded'));
    expect(document.querySelectorAll('#alfred-theme-toggle').length).toBe(1);
  });
});
