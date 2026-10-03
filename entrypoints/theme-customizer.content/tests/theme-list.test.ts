import { afterAll, beforeEach, describe, expect, it } from 'bun:test';
import { parseHTML } from 'linkedom';

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

const { document } = parseHTML(`<html><body>
  <ul class="_ThemeList_11pt9_1 _NewThemeList_11pt9_19">
    ${themeItem('188431433942', 'Copy of Horizon', 'canvas?editorEntry=themeIndex')}
    ${themeItem('159845974230', 'Horizon', 'editor')}
  </ul>
</body></html>`);

const g = globalThis as Record<string, unknown>;
const savedDocument = g.document;
g.document = document;

const { injectIntoThemeList } = await import('../theme-list.util');

afterAll(() => {
  g.document = savedDocument;
});

const injected = () => [...document.querySelectorAll('[data-alfred-theme-list]')];
const copyValues = (row: Element) =>
  [...row.querySelectorAll('s-internal-button')].map((b) => b.getAttribute('data-copy-value'));

describe('injectIntoThemeList', () => {
  beforeEach(() => injected().forEach((el) => el.remove()));

  it('adds ID and preview URL buttons below each theme actions row, including Canvas themes', () => {
    expect(injectIntoThemeList()).toBe(true);

    const wrappers = injected();
    expect(wrappers).toHaveLength(2);
    expect(copyValues(wrappers[0])).toEqual([
      '188431433942',
      'https://demo-store.myshopify.com/?preview_theme_id=188431433942'
    ]);
    expect(copyValues(wrappers[1])).toEqual([
      '159845974230',
      'https://demo-store.myshopify.com/?preview_theme_id=159845974230'
    ]);
    expect(wrappers[0].parentElement?.lastElementChild).toBe(wrappers[0]);
    expect(wrappers[0].parentElement?.querySelector('a')?.textContent).toBe('Edit theme');
  });

  it('renders tertiary Polaris buttons with clipboard icons', () => {
    injectIntoThemeList();

    const buttons = [...injected()[0].querySelectorAll('s-internal-button')];
    expect(buttons.map((b) => b.textContent)).toEqual(['ID', 'Preview URL']);
    expect(
      buttons.every((b) => b.getAttribute('variant') === 'tertiary' && b.getAttribute('icon') === 'clipboard')
    ).toBe(true);
  });

  it('ends the row with an inert copy of the more-actions button', () => {
    injectIntoThemeList();

    const spacer = injected()[0].lastElementChild as HTMLElement;
    expect(spacer.tagName).toBe('BUTTON');
    expect(spacer.hasAttribute('inert')).toBe(true);
    expect(spacer.hasAttribute('commandfor')).toBe(false);
  });

  it('skips injected items and restores buttons React re-rendered away', () => {
    injectIntoThemeList();
    expect(injectIntoThemeList()).toBe(false);

    injected()[0].remove();
    expect(injectIntoThemeList()).toBe(true);
    expect(injected()).toHaveLength(2);
  });
});
