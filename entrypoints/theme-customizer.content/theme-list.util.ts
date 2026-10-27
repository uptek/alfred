import type { ContentScriptContext } from '#imports';
import { getSettings, isEnabled } from '~/utils/settings';
import { sendTrackEvent } from '~/utils/analytics';
import type { AnalyticsAction } from '~/utils/analytics-actions';
import { collectThemeElements, html, THEMES_PATH, type ThemeElements } from './theme-list-scan.util';
import { BULK_DELETE_STYLES, clearSelection, injectBulkDelete, removeBulkDelete } from './theme-list-bulk-delete.util';

const INJECTED_ATTR = 'data-alfred-theme-list';

/**
 * Layout for the injected copy row. The actions row is forced to wrap, since rollout cards set
 * it to nowrap, so the full-width copy row drops below it; `contain: inline-size` keeps it out
 * of the actions row's natural width so the existing buttons stay flush right, and a hidden copy
 * of the "more actions" button lines the copy buttons up under "Edit theme". Shopify moves the
 * actions under the theme and aligns them left at 831px and below for library themes, and at
 * 30.6225em and below for the live theme, so the copy row follows and drops the spacer. The live
 * theme card is dark, so its copy buttons take the card's light text and hover colors.
 */
const COPY_ROW_STYLES = `
  .Polaris-InlineStack:has(> [${INJECTED_ATTR}]) {
    flex-wrap: wrap;
  }
  [${INJECTED_ATTR}] {
    display: flex;
    flex-basis: 100%;
    contain: inline-size;
    justify-content: flex-end;
    gap: var(--p-space-100);
  }
  [${INJECTED_ATTR}] > [inert] {
    visibility: hidden;
    margin-inline-start: var(--p-space-100);
  }
  [class*="PublishedTheme"] [${INJECTED_ATTR}] {
    --p-color-text: var(--p-color-text-brand-on-accent);
    --p-color-icon: var(--p-color-text-brand-on-accent);
    --p-color-bg-fill-transparent-hover: rgba(255, 255, 255, 0.15);
  }
  @media (max-width: 831px) {
    ul[class*="ThemeList"] [${INJECTED_ATTR}] {
      justify-content: flex-start;
    }
    ul[class*="ThemeList"] [${INJECTED_ATTR}] > [inert] {
      display: none;
    }
  }
  @media (max-width: 30.6225em) {
    [class*="PublishedTheme"] [${INJECTED_ATTR}] {
      justify-content: flex-start;
    }
    [class*="PublishedTheme"] [${INJECTED_ATTR}] > [inert] {
      display: none;
    }
  }
`;

/**
 * Copies the button's `data-copy-value` to clipboard and briefly swaps the icon to a checkmark.
 * @param e - The click event from an `s-internal-button` element.
 */
const handleCopyClick = (e: Event) => {
  e.stopPropagation();
  const btn = e.currentTarget as HTMLElement;
  const value = btn.getAttribute('data-copy-value') ?? '';
  const action = btn.getAttribute('data-track-action');
  navigator.clipboard.writeText(value);
  btn.setAttribute('icon', 'check');
  setTimeout(() => btn.setAttribute('icon', 'clipboard'), 1200);
  if (action) {
    sendTrackEvent(action as AnalyticsAction);
  }
};

/**
 * Adds copy-ID / copy-preview-URL buttons on their own row below the action buttons of
 * the live theme and each theme in the library, laid out by `COPY_ROW_STYLES`.
 * Both cards share the "Edit theme" link and its `.Polaris-InlineStack` actions row.
 * The buttons use the page's own `s-internal-button` Polaris element.
 * @param themes - Themes found on the current render pass.
 * @returns `true` if at least one theme got a new copy row.
 */
const injectCopyRows = (themes: ThemeElements[]): boolean => {
  let injected = false;

  for (const theme of themes) {
    if (theme.actions.querySelector(`[${INJECTED_ATTR}]`)) {
      continue;
    }

    const row = html(`
      <div ${INJECTED_ATTR}>
        <s-internal-button variant="tertiary" icon="clipboard" data-copy-value="${theme.themeId}" data-track-action="${'admin.theme_list.id_copy' satisfies AnalyticsAction}">ID</s-internal-button>
        <s-internal-button variant="tertiary" icon="clipboard" data-copy-value="${theme.previewUrl}" data-track-action="${'admin.theme_list.preview_url_copy' satisfies AnalyticsAction}">Preview URL</s-internal-button>
      </div>
    `);
    row.querySelectorAll('s-internal-button').forEach((btn) => btn.addEventListener('click', handleCopyClick));

    // The inert copy of the "more actions" button is the spacer `COPY_ROW_STYLES` hides.
    if (theme.more) {
      const spacer = theme.more.cloneNode(true) as HTMLElement;
      spacer.removeAttribute('commandfor');
      spacer.setAttribute('inert', '');
      row.append(spacer);
    }

    theme.actions.append(row);
    injected = true;
  }

  return injected;
};

/** The theme list features the user has turned on in Options. */
interface ThemeListFeatures {
  copyRows: boolean;
  bulkDelete: boolean;
}

/**
 * Adds the copy buttons for the live theme and each theme in the library, and the bulk-delete
 * controls (see {@link injectBulkDelete}), each only when turned on. Themes whose injections React
 * has re-rendered away get them back on the next scan.
 * @param features - Which features to add.
 * @returns `true` if at least one theme was newly injected into.
 */
export const injectIntoThemeList = ({ copyRows, bulkDelete }: ThemeListFeatures) => {
  const themes = collectThemeElements();

  const copyRowsInjected = copyRows && injectCopyRows(themes);
  const checkboxesInjected = bulkDelete && injectBulkDelete(themes);

  return copyRowsInjected || checkboxesInjected;
};

/**
 * Adds the theme list features turned on in Options while the frame is on /themes, on first load
 * and after client-side navigation. A MutationObserver covers the list rendering after the URL
 * changes.
 * @param ctx - The content script context, used to watch URL changes and clean up.
 */
export const setupThemeList = async (ctx: ContentScriptContext) => {
  const settings = await getSettings();
  const features: ThemeListFeatures = {
    copyRows: isEnabled(settings.admin.themeListUtils),
    bulkDelete: isEnabled(settings.admin.themeListBulkDelete)
  };
  if (!features.copyRows && !features.bulkDelete) {
    return;
  }

  const style = document.createElement('style');
  style.textContent = COPY_ROW_STYLES + BULK_DELETE_STYLES;
  document.head.append(style);

  let observer: MutationObserver | undefined;

  const sync = (pathname: string) => {
    if (!THEMES_PATH.test(pathname)) {
      observer?.disconnect();
      observer = undefined;
      // A selection made on this page shouldn't still be there on returning to it. A running
      // delete clears what's left of it once it ends.
      clearSelection();
      return;
    }
    if (observer) {
      return;
    }

    injectIntoThemeList(features);

    let queued = false;
    observer = new MutationObserver(() => {
      if (queued) return;
      queued = true;
      requestAnimationFrame(() => {
        injectIntoThemeList(features);
        queued = false;
      });
    });
    observer.observe(document.body, { childList: true, subtree: true });
  };

  sync(window.location.pathname);
  ctx.addEventListener(window, 'wxt:locationchange', ({ newUrl }) => sync(newUrl.pathname));
  ctx.onInvalidated(() => {
    observer?.disconnect();
    style.remove();
    removeBulkDelete();
  });
};
