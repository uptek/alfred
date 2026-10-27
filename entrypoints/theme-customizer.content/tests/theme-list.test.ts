import { afterAll, beforeEach, describe, expect, it } from 'bun:test';
import { parseHTML } from 'linkedom';
import type { RuntimeMessage, ThemeDeleteResponse } from '~/utils/messages';

// Trimmed from the redesigned themes page (online-store-web.shopifyapps.com/themes).
const themeItem = (id: string, name: string, editPath: string) => `
  <li><div><div class="Polaris-Box"><div class="Polaris-InlineGrid">
    <div class="Polaris-Box"><div class="_LinkContainer_t079h_1">
      <a href="https://admin.shopify.com/store/demo-store/themes/${id}/${editPath}" aria-label="Edit ${name}">
        <div class="_ThemeListThumbnail_hvi45_1"><s-image alt="Theme preview thumbnail for ${name}"></s-image></div>
      </a>
    </div></div>
    <div class="Polaris-Box"><div class="_ThemeContent_dwfss_31">
      <div class="Polaris-BlockStack">
        <div class="Polaris-InlineStack"><h3 class="Polaris-Text--root">${name}</h3></div>
        <span class="Polaris-Text--root"><span class="_ThemeStatus_1v1vk_1">Last saved: 3:16 pm</span></span>
      </div>
      <div class="Polaris-InlineStack">
        <s-internal-button-group><div slot="secondary-actions"><s-internal-button>Publish</s-internal-button></div></s-internal-button-group>
        <span data-component-name="theme-index-customize-button">
          <a href="https://admin.shopify.com/store/demo-store/themes/${id}/${editPath}" class="_ThemeActionButton_xaf5q_1 _primary_xaf5q_36">Edit theme</a>
        </span>
        <button class="_ThemeActionButton_xaf5q_1 _tertiary_xaf5q_66 _small_xaf5q_75" type="button" commandfor=":r8:" command="--toggle"><s-internal-icon type="menu-horizontal"></s-internal-icon></button>
      </div>
    </div></div>
  </div></div></div></li>`;

// Trimmed from the live theme card at the top of the same page.
const publishedTheme = (id: string, name: string) => `
  <div class="_PublishedTheme_1nfrl_1">
    <a href="https://admin.shopify.com/store/demo-store/themes/${id}/editor" class="Polaris-Link" aria-label="Edit theme">
      <span class="_ThemePreview_1nfrl_8"><img alt="Theme preview screenshot"></span>
    </a>
    <div class="Polaris-Box"><div class="_ThemeInformationContainer_1nfrl_109"><div class="_ThemeInformation_1nfrl_109">
      <div class="_ThemeContent_1nfrl_134"><div class="Polaris-BlockStack">
        <div class="_PublishedThemeDomain_7wbza_31"><div class="Polaris-InlineStack">
          <s-internal-heading-display level="2" size="small"><button type="button">demo-store.myshopify.com</button></s-internal-heading-display>
          <a href="https://admin.shopify.com/store/demo-store/settings/domains" aria-label="Domain settings"></a>
        </div></div>
        <s-internal-text size="base">${name} · Last saved: Wednesday at 1:43 pm</s-internal-text>
      </div></div>
      <div class="_ThemeActions_1nfrl_144"><div class="Polaris-InlineStack">
        <span data-component-name="theme-index-customize-button">
          <a href="https://admin.shopify.com/store/demo-store/themes/${id}/editor" class="_ThemeActionButton_xaf5q_1 _primary_xaf5q_36" aria-label="Edit ${name}">Edit theme</a>
        </span>
        <button class="_ThemeActionButton_xaf5q_1 _tertiary_xaf5q_66 _small_xaf5q_75 _PublishedThemeAction_1x4mc_5" type="button" commandfor=":r3:" command="--toggle"><s-internal-icon type="menu-horizontal"></s-internal-icon></button>
        <s-popover id=":r3:"><ul class="Polaris-Box"><li class="Polaris-Box">
          <a class="Polaris-ActionList__Item" href="https://admin.shopify.com/store/demo-store/themes/${id}">Edit code</a>
        </li></ul></s-popover>
      </div></div>
    </div></div></div>
  </div>`;

const dom = parseHTML(`<html><body>
  <div class="Polaris-BlockStack">
    ${publishedTheme('158745460950', 'Prod')}
    <s-internal-section padding="none">
      <div class="Polaris-InlineStack">
        <s-internal-heading level="2">Theme library</s-internal-heading>
        <div class="Polaris-InlineStack">
          <div class="Polaris-InlineStack" role="group" aria-label="Theme actions">
            <div class="_PopoverRegion_w8ime_1"><s-internal-button variant="secondary" accessibilitylabel="Import themes">Import</s-internal-button></div>
            <div class="_PopoverRegion_1ivd1_1"><s-internal-button variant="secondary" icon="plus">New</s-internal-button></div>
          </div>
        </div>
      </div>
      <ul class="_ThemeList_11pt9_1 _NewThemeList_11pt9_19">
        ${themeItem('188431433942', 'Copy of Horizon', 'canvas?editorEntry=themeIndex')}
        ${themeItem('159845974230', 'Horizon', 'editor')}
      </ul>
    </s-internal-section>
  </div>
</body></html>`);
const { document } = dom;

// Toast.show (reached via confirmAndDeleteSelected) defines a custom element extending
// HTMLElement at module load, so these globals must exist before theme-list.util is imported.
// confirm is stubbed too: the real one blocks on stdin in this test runner.
const g = globalThis as Record<string, unknown>;
// window only needs a location: deletes check they're still on the themes page.
const saved = [
  'document',
  'window',
  'HTMLElement',
  'customElements',
  'requestAnimationFrame',
  'confirm',
  'browser'
].map((k) => [k, g[k]] as const);
let confirmResult = true;
let confirmMessage = '';
// Stands in for the background relaying `delete_theme` to the admin page, which calls the API.
const deleteRequests: string[] = [];
let respondToDelete: (themeId: string) => Promise<ThemeDeleteResponse> = () => Promise.resolve({ ok: true });
Object.assign(g, {
  document,
  window: { location: { pathname: '/store/demo-store/themes' } },
  HTMLElement: dom.HTMLElement,
  customElements: dom.customElements,
  requestAnimationFrame: (cb: () => void) => setTimeout(cb, 0),
  confirm: (message: string) => {
    confirmMessage = message;
    return confirmResult;
  },
  browser: {
    runtime: {
      sendMessage: (message: RuntimeMessage) => {
        if (message.type !== 'delete_theme') return Promise.resolve();
        deleteRequests.push(message.themeId);
        return respondToDelete(message.themeId);
      }
    }
  }
});

// Mirrors the real s-checkbox just enough for tests: a real <input type="checkbox"> inside an
// open shadow root, attached on connect like the page's own custom element does. Like the real
// one, the checkmark it draws is its own state: `checked` set from code moves it only until the
// user clicks it (like a native input's dirty checkedness), a click toggles it, and writes to
// the inner input from code don't show at all.
class FakeCheckbox extends dom.HTMLElement {
  #shown = false;
  #touched = false;
  #input: HTMLInputElement | null = null;
  get checked() {
    return this.#shown;
  }
  set checked(value: boolean) {
    if (this.#touched) return;
    this.#shown = value;
    if (this.#input) this.#input.checked = value;
  }
  connectedCallback() {
    if (this.shadowRoot) return;
    const input = dom.document.createElement('input') as HTMLInputElement;
    input.type = 'checkbox';
    input.checked = this.#shown;
    // linkedom has no click activation behavior; this is what a browser's does for a checkbox,
    // plus the component's own handling: take the new state and re-dispatch change on the host.
    input.click = () => {
      if (this.hasAttribute('disabled')) return;
      input.checked = !input.checked;
      this.#touched = true;
      this.#shown = input.checked;
      this.dispatchEvent(new dom.Event('change', { bubbles: true }));
    };
    this.#input = input;
    this.attachShadow({ mode: 'open' }).append(input);
  }
}
dom.customElements.define('s-checkbox', FakeCheckbox);

const { injectIntoThemeList } = await import('../theme-list.util');
const { removeBulkDelete } = await import('../theme-list-bulk-delete.util');
const ALL_FEATURES = { copyRows: true, bulkDelete: true };

afterAll(async () => {
  // Toast.show waits 100ms to add a toast while another is still showing; let any pending one
  // land while `document` is still linkedom's, or it throws during the next test file.
  await new Promise((resolve) => setTimeout(resolve, 200));
  for (const [k, v] of saved) g[k] = v;
});

const ALFRED_SELECTOR =
  '[data-alfred-theme-list], [data-alfred-theme-checkbox], [data-alfred-bulk-toolbar], [data-alfred-select-all]';
const injected = () => [...document.querySelectorAll('[data-alfred-theme-list]')];
const checkboxes = () => [...document.querySelectorAll<HTMLElement>('[data-alfred-theme-checkbox]')];
// The real toggle state lives on the <input> inside the checkbox's shadow root, same as production.
const checkboxInput = (checkbox: HTMLElement) =>
  checkbox.shadowRoot!.querySelector<HTMLInputElement>('input[type="checkbox"]')!;
// What the user sees: the checkmark the component draws from its own state.
const shownChecked = (checkbox: HTMLElement) => (checkbox as HTMLElement & { checked: boolean }).checked;
// A user's click, if the checkbox isn't already showing `value`.
const toggleCheckbox = (checkbox: HTMLElement, value: boolean) => {
  if (shownChecked(checkbox) !== value) checkboxInput(checkbox).click();
};
const toolbar = () => document.querySelector<HTMLElement>('[data-alfred-bulk-toolbar]');
const selectAll = () => document.querySelector<HTMLElement>('[data-alfred-select-all]');
// Select all follows the theme library heading, and the toolbar follows Select all.
const expectBesideHeading = () => {
  expect(selectAll()?.previousElementSibling?.tagName).toBe('S-INTERNAL-HEADING');
  expect(selectAll()?.nextElementSibling).toBe(toolbar());
};
const toolbarVisible = () => toolbar()?.classList.contains('alfred-bulk-toolbar--show') ?? false;
const copyValues = (row: Element) =>
  [...row.querySelectorAll('s-internal-button')].map((b) => b.getAttribute('data-copy-value'));

describe('injectIntoThemeList', () => {
  beforeEach(() => document.querySelectorAll(ALFRED_SELECTOR).forEach((el) => el.remove()));

  it('adds ID and preview URL buttons below the live theme and each library theme, including Canvas themes', () => {
    expect(injectIntoThemeList(ALL_FEATURES)).toBe(true);

    const wrappers = injected();
    expect(wrappers.map(copyValues)).toEqual([
      ['158745460950', 'https://demo-store.myshopify.com/?preview_theme_id=158745460950'],
      ['188431433942', 'https://demo-store.myshopify.com/?preview_theme_id=188431433942'],
      ['159845974230', 'https://demo-store.myshopify.com/?preview_theme_id=159845974230']
    ]);
    for (const wrapper of wrappers) {
      expect(wrapper.parentElement?.lastElementChild).toBe(wrapper);
      expect(wrapper.parentElement?.querySelector('a[class*="ThemeActionButton"]')?.textContent).toBe('Edit theme');
    }
  });

  it('renders tertiary Polaris buttons with clipboard icons, then an inert copy of the more-actions button', () => {
    injectIntoThemeList(ALL_FEATURES);

    const row = injected()[0];
    const buttons = [...row.querySelectorAll('s-internal-button')];
    expect(buttons.map((b) => [b.textContent, b.getAttribute('variant'), b.getAttribute('icon')])).toEqual([
      ['ID', 'tertiary', 'clipboard'],
      ['Preview URL', 'tertiary', 'clipboard']
    ]);
    const spacer = row.lastElementChild as HTMLElement;
    expect(spacer.tagName).toBe('BUTTON');
    expect(spacer.hasAttribute('inert')).toBe(true);
    expect(spacer.hasAttribute('commandfor')).toBe(false);
  });

  it('skips injected items and restores buttons React re-rendered away', () => {
    injectIntoThemeList(ALL_FEATURES);
    expect(injectIntoThemeList(ALL_FEATURES)).toBe(false);

    injected()[0].remove();
    expect(injectIntoThemeList(ALL_FEATURES)).toBe(true);
    expect(injected()).toHaveLength(3);
  });

  it('adds a selection checkbox for each library theme, but not the live theme', () => {
    injectIntoThemeList(ALL_FEATURES);

    expect(checkboxes()).toHaveLength(2);
    expect(checkboxes().every((checkbox) => checkbox.tagName === 'S-CHECKBOX')).toBe(true);
    expect(checkboxes().every((checkbox) => checkbox.hasAttribute('accessibilitylabel'))).toBe(true);
  });

  it("keeps a theme name with quotes and HTML as the checkbox's label text", () => {
    const name = 'Summer "Sale"><img src=x onerror=alert(1)>';
    const escaped = name
      .replaceAll('&', '&amp;')
      .replaceAll('"', '&quot;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;');
    const list = document.querySelector('ul[class*="ThemeList"]')!;
    list.insertAdjacentHTML('beforeend', themeItem('177000000001', escaped, 'editor'));
    const item = list.lastElementChild!;

    injectIntoThemeList(ALL_FEATURES);

    const checkbox = item.querySelector('[data-alfred-theme-checkbox]')!;
    expect(checkbox.getAttribute('accessibilitylabel')).toBe(`Select ${name} for bulk delete`);
    expect(item.querySelector('img')).toBeNull();
    item.remove();
  });

  it("puts each checkbox before the theme's thumbnail, outside its grid", () => {
    injectIntoThemeList(ALL_FEATURES);

    for (const checkbox of checkboxes()) {
      const grid = checkbox.nextElementSibling!;
      expect(grid.classList.contains('Polaris-InlineGrid')).toBe(true);
      expect(grid.querySelector('[class*="ThemeListThumbnail"]')).not.toBeNull();
    }
  });

  it('puts the toolbar right after Select all: Delete, then an icon-only button that clears the selection', () => {
    injectIntoThemeList(ALL_FEATURES);

    expectBesideHeading();
    const buttons = [...toolbar()!.querySelectorAll('s-internal-button')];
    expect(buttons.map((b) => [b.dataset.action, b.getAttribute('variant'), b.getAttribute('icon')])).toEqual([
      ['delete', 'primary', null],
      ['clear', 'tertiary', 'x']
    ]);
    expect(buttons[1].getAttribute('accessibilitylabel')).toBe('Clear selection');
    // Shopify's own buttons are left as they were.
    const group = document.querySelector('[role="group"][aria-label="Theme actions"]')!;
    expect([...group.querySelectorAll('s-internal-button')].map((b) => b.textContent)).toEqual(['Import', 'New']);
  });

  it('puts Select all right after the theme library heading, shown with nothing selected', () => {
    injectIntoThemeList(ALL_FEATURES);

    expect(selectAll()?.previousElementSibling?.tagName).toBe('S-INTERNAL-HEADING');
    expect(selectAll()?.textContent).toBe('Select all');
    expect(selectAll()?.hasAttribute('disabled')).toBe(false);
  });

  it('adds only the copy buttons when bulk delete is off', () => {
    injectIntoThemeList({ copyRows: true, bulkDelete: false });

    expect(injected()).toHaveLength(3);
    expect(checkboxes()).toHaveLength(0);
    expect(selectAll()).toBeNull();
    expect(toolbar()).toBeNull();
  });

  it('adds only the bulk delete controls when the copy buttons are off', () => {
    injectIntoThemeList({ copyRows: false, bulkDelete: true });

    expect(injected()).toHaveLength(0);
    expect(checkboxes()).toHaveLength(2);
    expectBesideHeading();
  });

  it('finds the header by its New button when the group label is translated', () => {
    const group = document.querySelector('[role="group"]')!;
    group.setAttribute('aria-label', 'Acciones de tema');
    try {
      injectIntoThemeList(ALL_FEATURES);
      expectBesideHeading();
    } finally {
      group.setAttribute('aria-label', 'Theme actions');
    }
  });

  it('finds the header by its Import button on stores without New, which have no group', () => {
    // Trimmed from a store whose header has only Import, straight in the button row.
    const row = document.querySelector('[role="group"]')!.parentElement!;
    const original = row.innerHTML;
    row.innerHTML = `
      <div class="_PopoverRegion_w8ime_1"><div class="_ButtonHeight_w8ime_9">
        <s-internal-button commandfor=":r4:" variant="secondary" accessibilitylabel="Import themes">
          <span class="_ButtonMargin_w8ime_5"><div class="Polaris-InlineStack">Import</div></span>
        </s-internal-button>
      </div></div>`;
    try {
      injectIntoThemeList(ALL_FEATURES);
      expectBesideHeading();
    } finally {
      row.innerHTML = original;
    }
  });
});

describe('bulk delete', () => {
  const NAMES = ['Alpha', 'Beta', 'Gamma'];
  const list = () => document.querySelector('ul[class*="ThemeList"]')!;
  const card = (name: string) =>
    [...document.querySelectorAll('li')].find((li) => li.querySelector('h3')?.textContent === name);
  // Deleted cards are hidden inline.
  const shown = (name: string) => !!card(name) && card(name)!.style.display !== 'none';
  const checkboxOf = (name: string) => card(name)!.querySelector<HTMLElement>('[data-alfred-theme-checkbox]')!;
  const checkedNames = () => NAMES.filter((name) => shown(name) && shownChecked(checkboxOf(name)));
  const remaining = () => NAMES.filter(shown);
  // "Select all" sits by the heading; the other buttons are in the toolbar.
  const button = (action: string) =>
    document.querySelector<HTMLElement>(
      `[data-alfred-select-all][data-action="${action}"], [data-alfred-bulk-toolbar] [data-action="${action}"]`
    )!;
  const click = (el: Element) => el.dispatchEvent(new dom.Event('click', { bubbles: true }));
  // The delete button carries the count, and progress while a delete runs.
  const countText = () => toolbar()?.querySelector('[data-action="delete"]')?.textContent;
  const tick = (ms = 20) => new Promise((resolve) => setTimeout(resolve, ms));
  const waitUntil = async (check: () => boolean) => {
    for (let i = 0; i < 300 && !check(); i++) await tick();
  };
  const select = (...names: string[]) => names.forEach((name) => toggleCheckbox(checkboxOf(name), true));
  const toastTexts = () =>
    [...document.querySelectorAll('alfred-toast')].map(
      (toast) => toast.shadowRoot!.querySelector('.alfred-toast__text')!.textContent
    );
  const expectIdle = (selected: number) => {
    expect(button('clear').hasAttribute('disabled')).toBe(false);
    expect(button('delete').hasAttribute('disabled')).toBe(false);
    expect(button('select-all').textContent).toBe(
      selected > 0 && selected === remaining().length ? 'Deselect all' : 'Select all'
    );
    // Disabled only when there's nothing left to select.
    expect(button('select-all').hasAttribute('disabled')).toBe(remaining().length === 0);
    expect(toolbarVisible()).toBe(selected > 0);
    if (selected > 0) {
      expect(countText()).toBe(`Delete ${selected} theme${selected === 1 ? '' : 's'}`);
    }
  };
  // Each test gets fresh theme IDs: Alfred remembers the ones it deleted for the whole page.
  let round = 0;
  const idOf = (name: string) => `${round}0${NAMES.indexOf(name) + 1}`;
  // Names of the themes the API was asked to delete, in order.
  const requestedNames = () => deleteRequests.map((id) => NAMES.find((name) => idOf(name) === id));

  beforeEach(() => {
    if (toolbar()) click(button('clear')); // clears whatever selection the last test left
    round++;
    list().innerHTML = NAMES.map((name) => themeItem(idOf(name), name, 'editor')).join('');
    confirmResult = true;
    confirmMessage = '';
    deleteRequests.length = 0;
    respondToDelete = () => Promise.resolve({ ok: true });
    injectIntoThemeList(ALL_FEATURES);
  });

  it('shows the toolbar only while themes are checked, with an accurate count', () => {
    expectIdle(0);

    select('Alpha');
    expectIdle(1);
    select('Beta');
    expectIdle(2);

    toggleCheckbox(checkboxOf('Alpha'), false);
    toggleCheckbox(checkboxOf('Beta'), false);
    expectIdle(0);
  });

  it('The clear button deselects every theme and hides the toolbar without deleting anything', () => {
    select('Alpha', 'Beta', 'Gamma');
    expectIdle(3);

    click(button('clear'));

    expect(checkedNames()).toEqual([]);
    expectIdle(0);
    expect(remaining()).toEqual(NAMES);
    expect(deleteRequests).toEqual([]);
  });

  it('Select all checks every library theme (never the live one), and toggles to Deselect all', () => {
    select('Alpha');

    click(button('select-all'));
    expect(checkedNames()).toEqual(NAMES);
    expectIdle(3);

    click(button('select-all'));
    expect(checkedNames()).toEqual([]);
    expectIdle(0);
  });

  it("Select all leaves out themes behind Shopify's Show all, and adds them once they're shown", () => {
    const gamma = card('Gamma')!;
    gamma.remove(); // the list starts collapsed, without its later themes

    click(button('select-all'));
    expect(checkedNames()).toEqual(['Alpha', 'Beta']);
    expectIdle(2);

    list().append(gamma); // "Show all"
    injectIntoThemeList(ALL_FEATURES);
    expectIdle(2);

    click(button('select-all'));
    expect(checkedNames()).toEqual(NAMES);
    expectIdle(3);
  });

  it('Select all, Deselect all and the clear button also move checkboxes the user clicked by hand', () => {
    // Regression: once clicked, s-checkbox stops following `checked` set from code, so boxes
    // the user had clicked kept their checkmark through Select all / Deselect all.
    select('Alpha');
    toggleCheckbox(checkboxOf('Beta'), true);
    toggleCheckbox(checkboxOf('Beta'), false);

    click(button('select-all'));
    expect(checkedNames()).toEqual(NAMES);
    expectIdle(3);

    click(button('select-all'));
    expect(checkedNames()).toEqual([]);
    expectIdle(0);

    select('Alpha', 'Gamma');
    click(button('select-all'));
    click(button('clear'));
    expect(checkedNames()).toEqual([]);
    expectIdle(0);
  });

  it('keeps a checkbox checked when React re-renders it away and Alfred adds it back', () => {
    select('Beta');
    checkboxOf('Beta').remove();

    injectIntoThemeList(ALL_FEATURES);

    expect(checkedNames()).toEqual(['Beta']);
    expectIdle(1);
  });

  it("drops a selected theme from the count once it's gone from the page", () => {
    select('Alpha', 'Beta');
    card('Alpha')!.remove(); // e.g. deleted from Shopify's own menu

    injectIntoThemeList(ALL_FEATURES);

    expectIdle(1);
  });

  it("doesn't touch the DOM on a pass where nothing changed, so the observer can't feed itself", async () => {
    // Regression: rewriting the buttons' text on every pass was itself a mutation, which
    // re-triggered the observer every frame and rebuilt the toolbar buttons' contents under the
    // pointer, so its clicks never landed.
    select('Alpha', 'Beta');
    const records: unknown[] = [];
    const observer = new dom.MutationObserver((batch: unknown[]) => records.push(...batch));
    observer.observe(document.body, { childList: true, subtree: true, attributes: true, characterData: true });

    injectIntoThemeList(ALL_FEATURES);
    injectIntoThemeList(ALL_FEATURES);
    await tick();

    observer.disconnect();
    // Compared by count: printing a failing diff of DOM-holding records never finishes.
    expect(records.length).toBe(0);
  });

  it('names every selected theme in the confirmation, and deletes nothing if it is cancelled', async () => {
    confirmResult = false;
    select('Alpha');
    click(button('delete'));
    await tick(100);
    expect(confirmMessage).toBe('Once deleted, Alpha cannot be recovered. Do you still want to continue?');

    select('Gamma');
    click(button('delete'));
    await tick(100);
    expect(confirmMessage).toBe(
      'Once deleted, these 2 themes cannot be recovered:\n\n• Alpha\n• Gamma\n\nDo you still want to continue?'
    );
    expect(deleteRequests).toEqual([]);
    expect(remaining()).toEqual(NAMES);
    expect(checkedNames()).toEqual(['Alpha', 'Gamma']);
    expectIdle(2);
  });

  it('deletes each selected theme through the API and hides it from the list', async () => {
    select('Alpha', 'Beta', 'Gamma');

    click(button('delete'));
    await waitUntil(() => !toolbarVisible());

    expect(requestedNames()).toEqual(NAMES);
    expect(remaining()).toEqual([]);
    expectIdle(0);
    await waitUntil(() => toastTexts().at(-1) === 'Deleted 3 themes.');
    expect(toastTexts().at(-1)).toBe('Deleted 3 themes.');
  });

  it('carries on past a theme Shopify refuses, keeping it selected with the reason in the summary', async () => {
    select('Alpha', 'Beta', 'Gamma');
    respondToDelete = (themeId) =>
      Promise.resolve(themeId === idOf('Alpha') ? { ok: false, error: 'Theme is processing' } : { ok: true });

    click(button('delete'));
    await waitUntil(() => countText() === 'Delete 1 theme');

    expect(requestedNames()).toEqual(NAMES);
    expect(remaining()).toEqual(['Alpha']);
    expect(checkedNames()).toEqual(['Alpha']);
    expectIdle(1);
    await waitUntil(() => toastTexts().at(-1)?.startsWith('Deleted 2') ?? false);
    expect(toastTexts().at(-1)).toBe("Deleted 2 themes, couldn't delete Alpha (Theme is processing).");
  });

  it("counts a theme as failed when the admin page can't be reached", async () => {
    select('Beta');
    respondToDelete = () => Promise.reject(new Error('Could not establish connection'));

    click(button('delete'));
    await waitUntil(() => toastTexts().at(-1)?.startsWith('Deleted 0') ?? false);

    expect(remaining()).toEqual(NAMES);
    expectIdle(1);
    expect(toastTexts().at(-1)).toBe("Deleted 0 themes, couldn't delete Beta (Could not establish connection).");
  });

  it('names each failure reason once, after the themes it applies to', async () => {
    select('Alpha', 'Beta', 'Gamma');
    respondToDelete = (themeId) =>
      themeId === idOf('Beta')
        ? Promise.reject(new Error('Could not establish connection'))
        : Promise.resolve({ ok: false, error: 'Theme is processing' });

    click(button('delete'));
    await waitUntil(() => toastTexts().at(-1)?.includes('Gamma') ?? false);

    expect(toastTexts().at(-1)).toBe(
      "Deleted 0 themes, couldn't delete Alpha and Gamma (Theme is processing); Beta (Could not establish connection)."
    );
  });

  it('names at most three themes per failure reason, counting the rest', async () => {
    // A 9 where idOf has a 0 keeps these IDs clear of the NAMES themes'.
    const extra = ['Delta', 'Epsilon'].map((name, i) => themeItem(`${round}9${i}`, name, 'editor'));
    list().insertAdjacentHTML('beforeend', extra.join(''));
    injectIntoThemeList(ALL_FEATURES);
    click(button('select-all'));
    respondToDelete = () => Promise.reject(new Error('Could not establish connection'));

    click(button('delete'));
    await waitUntil(() => /Epsilon|more/.test(toastTexts().at(-1) ?? ''));

    expect(toastTexts().at(-1)).toBe(
      "Deleted 0 themes, couldn't delete Alpha, Beta, Gamma and 2 more (Could not establish connection)."
    );
  });

  it('shows progress and ignores checkbox changes and clearing while a delete is running', async () => {
    select('Alpha', 'Beta');
    let finish = () => {};
    respondToDelete = () => new Promise((resolve) => (finish = () => resolve({ ok: true })));

    click(button('delete'));
    await waitUntil(() => deleteRequests.length === 1);
    expect(countText()).toBe('Deleting 1 of 2…');
    expect(button('delete').hasAttribute('disabled')).toBe(true);
    expect(button('clear').hasAttribute('disabled')).toBe(true);
    expect(checkboxOf('Gamma').hasAttribute('disabled')).toBe(true);

    toggleCheckbox(checkboxOf('Beta'), false);
    toggleCheckbox(checkboxOf('Gamma'), true);
    click(button('clear'));
    expect(checkedNames()).toEqual(['Alpha', 'Beta']);
    expect(countText()).toBe('Deleting 1 of 2…');

    finish();
    await waitUntil(() => deleteRequests.length === 2);
    finish();
    await waitUntil(() => !toolbarVisible());

    expect(remaining()).toEqual(['Gamma']);
    expectIdle(0);
  });

  it('keeps a deleted theme hidden and unselectable when React renders its card again', async () => {
    select('Alpha');
    click(button('delete'));
    await waitUntil(() => !toolbarVisible());

    // Shopify's list still has the theme until it reloads its data, so a re-render brings it back.
    card('Alpha')!.outerHTML = themeItem(idOf('Alpha'), 'Alpha', 'editor');
    injectIntoThemeList(ALL_FEATURES);

    expect(remaining()).toEqual(['Beta', 'Gamma']);
    click(button('select-all'));
    expect(countText()).toBe('Delete 2 themes');
  });

  it('works again after a completed delete without a reload: select, clear, delete', async () => {
    select('Alpha');
    click(button('delete'));
    await waitUntil(() => !toolbarVisible());
    expect(remaining()).toEqual(['Beta', 'Gamma']);

    select('Beta', 'Gamma');
    expectIdle(2);
    click(button('clear'));
    expect(checkedNames()).toEqual([]);
    expectIdle(0);

    select('Gamma');
    click(button('delete'));
    await waitUntil(() => !toolbarVisible());
    expect(remaining()).toEqual(['Beta']);
    expect(requestedNames()).toEqual(['Alpha', 'Gamma']);
    expectIdle(0);
  });

  it('removes its checkboxes, Select all and the toolbar when invalidated, keeping deleted themes hidden', async () => {
    select('Alpha');
    click(button('delete'));
    await waitUntil(() => !toolbarVisible());

    removeBulkDelete();

    const leftovers = '[data-alfred-theme-checkbox], [data-alfred-select-all], [data-alfred-bulk-toolbar]';
    expect(document.querySelectorAll(leftovers)).toHaveLength(0);
    expect(remaining()).toEqual(['Beta', 'Gamma']);
  });
});
