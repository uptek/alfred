import { sendTrackEvent } from '~/utils/analytics';
import { Toast } from '~/utils/toast';
import { sendRuntimeMessage, type ThemeDeleteResponse } from '~/utils/messages';
import { collectThemeElements, html, THEMES_PATH, type ThemeElements } from './theme-list-scan.util';

const CHECKBOX_ATTR = 'data-alfred-theme-checkbox';
const TOOLBAR_ATTR = 'data-alfred-bulk-toolbar';
const SELECT_ALL_ATTR = 'data-alfred-select-all';
/** The theme library header's Import/New button group, on stores that have New. See `findThemeActions`. */
const THEME_ACTIONS_SELECTOR = '[role="group"][aria-label="Theme actions"]';

/** Layout for the selection checkboxes, "Select all" and the toolbar. */
export const BULK_DELETE_STYLES = `
  /* The checkbox sits before the card's thumbnail/details grid, which takes the remaining width. */
  :has(> [${CHECKBOX_ATTR}]) {
    display: flex;
    align-items: center;
    gap: var(--p-space-300);
  }
  :has(> [${CHECKBOX_ATTR}]) > .Polaris-InlineGrid {
    flex: 1;
    min-width: 0;
  }
  [${TOOLBAR_ATTR}] {
    display: none;
  }
  /* Its buttons join the heading's row, so every button there gets the same gap. */
  [${TOOLBAR_ATTR}].alfred-bulk-toolbar--show {
    display: contents;
  }
  /* Sized for their longest text, so the buttons after them don't shift as it changes: Delete's
     count and progress, and "Select all" / "Deselect all". */
  [${TOOLBAR_ATTR}] > [data-action="delete"],
  [${SELECT_ALL_ATTR}] {
    display: inline-flex;
    justify-content: center;
  }
  [${TOOLBAR_ATTR}] > [data-action="delete"] {
    width: 124px;
  }
  /* "Select all" and the toolbar sit in line after the theme library heading, wrapping on
     narrow screens. The buttons are spaced like Shopify's Import and New, and the heading
     a little further off. */
  :has(> [${SELECT_ALL_ATTR}]) {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--p-space-200);
  }
  [${SELECT_ALL_ATTR}] {
    min-width: 100px;
    margin-inline-start: var(--p-space-100);
  }
`;

/** An `s-checkbox` host. Its `checked` property is the component's own state, which it renders. */
type CheckboxElement = HTMLElement & { checked?: boolean };

/**
 * `s-checkbox`'s real `<input type="checkbox">` lives inside its own open shadow root (under
 * `.root > label > .control`). The shadow root only attaches once the element is connected to
 * the live document, so this returns `null` for one still detached.
 * @param checkbox - An `s-checkbox` host element.
 */
const checkboxInput = (checkbox: Element): HTMLInputElement | null =>
  checkbox.shadowRoot?.querySelector<HTMLInputElement>('input[type="checkbox"]') ?? null;

/**
 * Whether an `s-checkbox` is checked, read from the inner input a user's click toggles.
 * @param checkbox - An `s-checkbox` host element.
 */
const isCheckboxChecked = (checkbox: CheckboxElement) => checkboxInput(checkbox)?.checked ?? !!checkbox.checked;

/**
 * Checks or unchecks an `s-checkbox` from code. The checkmark is drawn from the component's own
 * state, not the inner input, so writing only the input changes nothing visible. The `checked`
 * property and attribute set it on a checkbox the user hasn't touched, but like a native input
 * it stops following them once clicked, so one still showing the wrong state is clicked, the
 * same way a user would, which goes through the component's own handling. Everything is
 * written only when it differs, so a sync pass with nothing to change mutates nothing.
 * @param checkbox - An `s-checkbox` host element.
 * @param checked - Its new state.
 */
const setCheckboxChecked = (checkbox: CheckboxElement, checked: boolean) => {
  if (checkbox.checked !== checked) {
    checkbox.checked = checked;
  }
  checkbox.toggleAttribute('checked', checked);
  const input = checkboxInput(checkbox);
  if (input && input.checked !== checked) {
    input.click();
  }
};

/** Theme IDs currently checked for bulk delete. The live theme is never eligible. */
const selectedThemeIds = new Set<string>();

/** Set while a bulk delete is running: which theme it's on, out of how many. */
let progress: { current: number; total: number } | null = null;

/**
 * Themes Alfred deleted through the API. Shopify's list doesn't know they're gone until it next
 * loads its data, so their cards are hidden in the meantime.
 */
const deletedThemeIds = new Set<string>();

/**
 * Hides the cards of themes Alfred deleted, including ones React has rendered again. Hidden
 * inline, so they stay hidden once the content script is invalidated and Alfred's stylesheet is
 * removed.
 * @param themes - Themes found on the current render pass; omit to scan the page.
 */
const hideDeletedThemes = (themes = collectThemeElements()) => {
  for (const theme of themes) {
    if (deletedThemeIds.has(theme.themeId) && theme.card.style.display !== 'none') {
      theme.card.style.setProperty('display', 'none', 'important');
    }
  }
};

const themeCount = (n: number) => `${n} theme${n === 1 ? '' : 's'}`;

/**
 * Sets an element's text only when it differs. `updateToolbar` runs on every MutationObserver
 * pass, and an unconditional write is itself a mutation: that fed the observer back into itself,
 * rebuilding the button's contents every frame, so a click's mousedown and mouseup never landed
 * on the same node and the button never fired.
 * @param el - The element to update.
 * @param text - Its new text.
 */
const setText = (el: Element | null, text: string) => {
  if (el && el.textContent !== text) {
    el.textContent = text;
  }
};

/**
 * Library themes on the page that can be selected: every theme but the live one and deleted ones.
 * @param themes - Themes found on the current render pass; omit to scan the page.
 */
const eligibleThemeIds = (themes = collectThemeElements()) =>
  themes.filter((theme) => !theme.isPublished && !deletedThemeIds.has(theme.themeId)).map((theme) => theme.themeId);

/**
 * Brings every checkbox in line with `selectedThemeIds`, and disables them while a bulk delete
 * runs so the selection can't change under it.
 */
const syncCheckboxes = () => {
  document.querySelectorAll<CheckboxElement>(`[${CHECKBOX_ATTR}]`).forEach((checkbox) => {
    // Enabled first: setCheckboxChecked may click it, and a disabled input ignores clicks.
    checkbox.toggleAttribute('disabled', !!progress);
    setCheckboxChecked(checkbox, selectedThemeIds.has(checkbox.dataset.themeId ?? ''));
  });
};

/** Shared by every fixed-width button's shadow root; created on first use. */
let fillButtonSheet: CSSStyleSheet | null = null;

/**
 * Stretches the real `<button>` inside Delete and "Select all" to their full width, so the width
 * `BULK_DELETE_STYLES` gives them is filled and clickable. It lives in `s-internal-button`'s
 * shadow root, which page CSS can't reach, so the rule is adopted into that root; `!important`
 * beats the component's own sizing of `.button`. Runs on every toolbar update, since a shadow
 * root can attach after the button is inserted, and skips roots that already have the rule.
 * Adopting a sheet isn't a DOM mutation, so it can't retrigger the observer.
 */
const fillFixedWidthButtons = () => {
  for (const button of document.querySelectorAll(`[${TOOLBAR_ATTR}] > [data-action="delete"], [${SELECT_ALL_ATTR}]`)) {
    const root = button.shadowRoot;
    if (!root || (fillButtonSheet && root.adoptedStyleSheets.includes(fillButtonSheet))) {
      continue;
    }
    if (!fillButtonSheet) {
      fillButtonSheet = new CSSStyleSheet();
      fillButtonSheet.replaceSync('button.button { width: 100% !important; inline-size: 100% !important; }');
    }
    root.adoptedStyleSheets = [...root.adoptedStyleSheets, fillButtonSheet];
  }
};

/**
 * Refreshes the "Select all" button beside the theme library heading. Always shown, so a
 * selection can start from it; it reads "Deselect all" once every theme is selected, and is
 * disabled while a delete runs or when there are no themes to select.
 * @param themes - Themes found on the current render pass; omit to scan the page.
 */
const updateSelectAll = (themes?: ThemeElements[]) => {
  const button = document.querySelector(`[${SELECT_ALL_ATTR}]`);
  if (!button) {
    return;
  }
  const eligible = eligibleThemeIds(themes);
  const allSelected = eligible.length > 0 && eligible.every((id) => selectedThemeIds.has(id));
  setText(button, allSelected ? 'Deselect all' : 'Select all');
  button.toggleAttribute('disabled', !!progress || eligible.length === 0);
};

/**
 * Shows or hides the bulk-delete toolbar, refreshes its buttons and "Select all", and syncs the
 * checkboxes. The delete button carries the count ("Delete 3 themes"), and progress while a
 * delete runs ("Deleting 2 of 3…"), when both toolbar buttons are disabled.
 * @param themes - Themes found on the current render pass; omit to scan the page.
 */
const updateToolbar = (themes?: ThemeElements[]) => {
  syncCheckboxes();
  updateSelectAll(themes);

  const toolbar = document.querySelector<HTMLElement>(`[${TOOLBAR_ATTR}]`);
  if (!toolbar) {
    return;
  }

  const count = selectedThemeIds.size;
  toolbar.classList.toggle('alfred-bulk-toolbar--show', count > 0 || !!progress);
  fillFixedWidthButtons();

  setText(
    toolbar.querySelector('[data-action="delete"]'),
    progress ? `Deleting ${progress.current} of ${progress.total}…` : `Delete ${themeCount(count)}`
  );
  for (const button of toolbar.querySelectorAll('[data-action]')) {
    button.toggleAttribute('disabled', !!progress);
  }
};

/**
 * Toggles a theme's selection and refreshes the toolbar.
 * @param themeId - The theme being checked or unchecked.
 * @param checked - The checkbox's new state.
 */
const handleCheckboxChange = (themeId: string, checked: boolean) => {
  if (checked === selectedThemeIds.has(themeId)) {
    return; // already matches, as after Alfred's own sync click
  }
  if (progress) {
    updateToolbar(); // puts the checkbox back; the selection is fixed while a delete runs
    return;
  }
  if (checked) {
    selectedThemeIds.add(themeId);
  } else {
    selectedThemeIds.delete(themeId);
  }
  updateToolbar();
};

/**
 * Adds a selection checkbox before each library theme's thumbnail, skipping the live theme (Shopify
 * doesn't allow deleting the published theme). Checked state comes from `selectedThemeIds` via
 * {@link syncCheckboxes}, so it survives React re-rendering the row away and Alfred re-adding it.
 * Uses the page's own Polaris `s-checkbox`, so it matches Shopify's design; `accessibilitylabel`
 * (not `label`) keeps its label screen-reader-only, since the theme's name is already in the row.
 * @param themes - Themes found on the current render pass.
 * @returns `true` if at least one theme got a new checkbox.
 */
const injectCheckboxes = (themes: ThemeElements[]): boolean => {
  let injected = false;

  for (const theme of themes) {
    if (theme.isPublished) {
      continue;
    }

    // The card's grid holds the thumbnail and the details as columns; the checkbox goes in the
    // grid's parent, ahead of it, so it doesn't take a column (laid out by `BULK_DELETE_STYLES`).
    const row = theme.card.querySelector('.Polaris-InlineGrid')?.parentElement;
    if (!row || row.querySelector(`:scope > [${CHECKBOX_ATTR}]`)) {
      continue;
    }

    const checkbox = html(`<s-checkbox ${CHECKBOX_ATTR} data-theme-id="${theme.themeId}"></s-checkbox>`);
    // Set as an attribute, not in the markup: theme names can hold quotes and HTML.
    checkbox.setAttribute('accessibilitylabel', `Select ${theme.name} for bulk delete`);
    checkbox.addEventListener('click', (e) => e.stopPropagation());
    checkbox.addEventListener('change', () => {
      handleCheckboxChange(theme.themeId, isCheckboxChecked(checkbox));
    });

    row.prepend(checkbox);
    injected = true;
  }

  return injected;
};

/**
 * Drops selected themes that are no longer on the page (deleted from Shopify's own menu, say),
 * so the count never includes themes that can't be acted on. Skipped while a bulk delete runs,
 * which settles its own themes, and while the list isn't rendered at all.
 * @param themes - Themes found on the current render pass.
 */
const pruneSelection = (themes: ThemeElements[]) => {
  if (progress || selectedThemeIds.size === 0 || !document.querySelector('ul[class*="ThemeList"]')) {
    return;
  }
  const eligible = new Set(eligibleThemeIds(themes));
  for (const id of selectedThemeIds) {
    if (!eligible.has(id)) {
      selectedThemeIds.delete(id);
    }
  }
};

/**
 * Unchecks every theme, clears the selection and hides the toolbar. Deletes nothing, and does
 * nothing while a delete runs, since its selection is fixed until it ends.
 */
export const clearSelection = () => {
  if (progress) {
    return;
  }
  selectedThemeIds.clear();
  updateToolbar();
};

/**
 * Selects every library theme on the page, or clears the selection if they all already are.
 * Themes behind Shopify's "Show all" button aren't rendered until it's clicked, so they're left
 * out: a delete only ever takes themes the user can see, and once they're shown the button reads
 * "Select all" again to add them.
 */
const handleSelectAllClick = () => {
  if (progress) {
    return;
  }
  const eligible = eligibleThemeIds();
  if (eligible.every((id) => selectedThemeIds.has(id))) {
    clearSelection();
    return;
  }
  eligible.forEach((id) => selectedThemeIds.add(id));
  updateToolbar();
};

/**
 * The theme library header's button row holding Import (and New, where the store has it), which
 * leads to the header's heading. Stores with New wrap both in a "Theme actions" group; stores
 * without it have no group, and Import sits straight in the header's button row. Either way the
 * row is the nearest `InlineStack` around Import, or around New (the only button with a plus
 * icon) if Import's label is translated.
 */
const findThemeActions = () => {
  const group = document.querySelector(THEME_ACTIONS_SELECTOR);
  if (group) {
    return group;
  }
  const button =
    document.querySelector('s-internal-button[accessibilitylabel="Import themes"]') ??
    document.querySelector('s-internal-button[icon="plus"]');
  return button?.closest('.Polaris-InlineStack') ?? null;
};

/**
 * Adds the bulk-delete toolbar right after "Select all", if it isn't already there (React
 * re-renders can remove it, same as the per-theme injections), keeping Alfred's buttons on the
 * left of the header and Shopify's on the right. Delete comes first, then an icon-only button
 * that clears the selection. Its state lives in module variables, so a re-added toolbar picks
 * up where the old one left off, even mid-delete.
 */
const injectBulkToolbar = () => {
  const selectAll = document.querySelector(`[${SELECT_ALL_ATTR}]`);
  if (document.querySelector(`[${TOOLBAR_ATTR}]`) || !selectAll) {
    return;
  }

  const toolbar = html(`
    <div ${TOOLBAR_ATTR}>
      <s-internal-button variant="primary" tone="critical" data-action="delete">Delete</s-internal-button>
      <s-internal-button variant="tertiary" icon="x" accessibilitylabel="Clear selection" title="Clear selection" data-action="clear"></s-internal-button>
    </div>
  `);
  toolbar.querySelector('[data-action="delete"]')?.addEventListener('click', () => void confirmAndDeleteSelected());
  toolbar.querySelector('[data-action="clear"]')?.addEventListener('click', clearSelection);

  selectAll.after(toolbar);
};

/**
 * Adds "Select all" right after the theme library's heading ("Draft themes"), if it isn't there
 * already. The heading is the one in the same header as Import, found by walking up from its
 * button row.
 */
const injectSelectAll = () => {
  if (document.querySelector(`[${SELECT_ALL_ATTR}]`)) {
    return;
  }

  const heading = findThemeActions()
    ?.parentElement?.closest(':has(s-internal-heading)')
    ?.querySelector('s-internal-heading');
  if (!heading || !document.querySelector('ul[class*="ThemeList"]')) {
    return;
  }

  const button = html(
    `<s-internal-button ${SELECT_ALL_ATTR} variant="secondary" data-action="select-all">Select all</s-internal-button>`
  );
  button.addEventListener('click', handleSelectAllClick);
  heading.after(button);
};

/**
 * Deletes one theme through Shopify's own admin API. The request needs the admin's session and
 * CSRF token, which this iframe doesn't have, so the background relays it to the admin page in
 * the same tab (shopify-admin.content/theme-delete.ts), which sends it.
 * @param themeId - The theme to delete.
 * @returns Whether Shopify deleted it, and why not if it didn't.
 */
const deleteOneTheme = async (themeId: string): Promise<ThemeDeleteResponse> => {
  try {
    const response = (await sendRuntimeMessage({ type: 'delete_theme', themeId })) as ThemeDeleteResponse | undefined;
    return response ?? { ok: false, error: 'The admin page gave no answer. Reload it and try again' };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
};

interface BulkDeleteResult {
  deleted: number;
  failed: { name: string; reason: string }[];
}

/**
 * Deletes each theme in turn, so progress stays accurate. Each theme is independent: a failure
 * on one moves on to the next. Deleted themes leave the selection and are hidden from the list;
 * failed ones stay selected to retry.
 * @param ids - Theme IDs to delete.
 * @param names - Theme names by ID, for the summary.
 */
const deleteThemes = async (ids: string[], names: Map<string, string>): Promise<BulkDeleteResult> => {
  const result: BulkDeleteResult = { deleted: 0, failed: [] };

  for (const [index, id] of ids.entries()) {
    progress = { current: index + 1, total: ids.length };
    updateToolbar();

    const response = await deleteOneTheme(id);
    if (response.ok) {
      result.deleted++;
      selectedThemeIds.delete(id);
      deletedThemeIds.add(id);
      hideDeletedThemes();
    } else {
      const name = names.get(id) ?? id;
      console.warn(`Alfred: couldn't bulk-delete theme "${name}" (${id}): ${response.error}`);
      result.failed.push({ name, reason: response.error });
    }
  }

  return result;
};

/** Joins names as "A, B and C", without a serial comma. */
const listFormat = new Intl.ListFormat('en-GB');

/** The most theme names the summary gives per failure reason before counting the rest. */
const SUMMARY_NAME_LIMIT = 3;

/**
 * Sums up a bulk delete for the toast, e.g. "Deleted 3 themes, couldn't delete Horizon and Dawn
 * (reason)." Each reason is named once, after the themes it applies to, and only the first few
 * of those are named, so a failure that hits every theme stays one short line.
 * @param result - What {@link deleteThemes} returned.
 */
const summarizeBulkDelete = ({ deleted, failed }: BulkDeleteResult) => {
  const parts = [`Deleted ${themeCount(deleted)}`];
  if (failed.length > 0) {
    const groups = [...Map.groupBy(failed, (f) => f.reason)].map(([reason, group]) => {
      const listed = group.slice(0, SUMMARY_NAME_LIMIT).map((f) => f.name);
      if (group.length > SUMMARY_NAME_LIMIT) {
        listed.push(`${group.length - SUMMARY_NAME_LIMIT} more`);
      }
      return `${listFormat.format(listed)} (${reason})`;
    });
    parts.push(`couldn't delete ${groups.join('; ')}`);
  }
  return `${parts.join(', ')}.`;
};

/** The most theme names the confirmation lists before summing up the rest. */
const CONFIRM_NAME_LIMIT = 10;

/**
 * Confirms, then deletes every checked theme, reporting the outcome via a toast and tracking
 * how many were actually removed. Shopify asks nothing further when deleting through its API,
 * so the confirmation names every theme. The toolbar always leaves its "Deleting" state, however
 * the run ends.
 */
const confirmAndDeleteSelected = async () => {
  const ids = [...selectedThemeIds];
  if (ids.length === 0 || progress) {
    return;
  }

  const names = new Map(collectThemeElements().map((theme) => [theme.themeId, theme.name]));
  const labels = ids.map((id) => names.get(id) ?? id);
  const listed = labels.slice(0, CONFIRM_NAME_LIMIT).map((label) => `• ${label}`);
  if (ids.length > CONFIRM_NAME_LIMIT) {
    listed.push(`…and ${ids.length - CONFIRM_NAME_LIMIT} more`);
  }
  // Worded like Shopify's own confirmation for deleting one theme.
  const question = 'Do you still want to continue?';
  const message =
    ids.length === 1
      ? `Once deleted, ${labels[0]} cannot be recovered. ${question}`
      : `Once deleted, these ${themeCount(ids.length)} cannot be recovered:\n\n${listed.join('\n')}\n\n${question}`;
  if (!confirm(message)) {
    return;
  }

  let result: BulkDeleteResult;
  try {
    result = await deleteThemes(ids, names);
  } finally {
    progress = null;
    // A run carries on if the frame navigates away; what's left of the selection goes with the page.
    if (THEMES_PATH.test(window.location.pathname)) {
      updateToolbar();
    } else {
      clearSelection();
    }
  }

  if (result.deleted > 0) {
    sendTrackEvent('admin.theme_list.theme_remove', { count: result.deleted });
  }

  Toast.show(summarizeBulkDelete(result), result.failed.length > 0 ? 'error' : 'success', 6000);
};

/**
 * Adds the selection checkboxes, "Select all" and the bulk-delete toolbar, and keeps the page in
 * step with the selection: hides the cards of themes Alfred deleted and drops selected themes
 * that have left the page. Runs on every scan, so injections React re-rendered away come back.
 * @param themes - Themes found on the current render pass.
 * @returns `true` if at least one theme got a new checkbox.
 */
export const injectBulkDelete = (themes: ThemeElements[]): boolean => {
  const injected = injectCheckboxes(themes);
  hideDeletedThemes(themes);
  pruneSelection(themes);
  injectSelectAll();
  injectBulkToolbar();
  updateToolbar(themes);
  return injected;
};

/**
 * Removes the checkboxes, "Select all" and the toolbar, for when the content script is
 * invalidated. Deleted themes' cards stay hidden until React renders them again.
 */
export const removeBulkDelete = () => {
  document.querySelectorAll(`[${CHECKBOX_ATTR}], [${TOOLBAR_ATTR}], [${SELECT_ALL_ATTR}]`).forEach((el) => el.remove());
};
