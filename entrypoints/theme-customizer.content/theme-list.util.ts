import type { ContentScriptContext } from '#imports';
import { getSettings, isEnabled } from '~/utils/settings';
import { sendTrackEvent } from '~/utils/analytics';
import type { AnalyticsAction } from '~/utils/analytics-actions';

const INJECTED_ATTR = 'data-alfred-theme-list';
const THEMES_PATH = /\/themes\/?$/;

/**
 * Layout for the injected copy row. On wide screens the actions row wraps, so the full-width
 * copy row drops below it; `contain: inline-size` keeps it out of the actions row's natural
 * width so the existing buttons stay flush right, and a hidden copy of the "more actions"
 * button lines the copy buttons up under "Edit theme". Shopify moves the actions under the
 * theme and aligns them left at 831px and below for library themes, and at 30.6225em and below
 * for the live theme, so the copy row follows and drops the spacer. The live theme card is
 * dark, so its copy buttons take the card's light text and hover colors.
 */
const ROW_STYLES = `
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

interface ThemeData {
  themeId: string;
  previewUrl: string;
}

/**
 * Extracts theme ID and preview URL from a theme's "Edit theme" link.
 * The link points at `/themes/:id/editor`, or `/themes/:id/canvas` for Canvas themes.
 * @param editLink - The theme's "Edit theme" `<a>` element.
 * @returns The parsed theme data, or `null` if the link has no theme ID.
 */
const extractThemeData = (editLink: HTMLAnchorElement): ThemeData | null => {
  const href = editLink.getAttribute('href') ?? '';
  const themeId = /\/themes\/(\d+)/.exec(href)?.[1];
  if (!themeId) {
    return null;
  }

  const storeName = /\/store\/([^/]+)\//.exec(href)?.[1] ?? '';
  const previewUrl = storeName ? `https://${storeName}.myshopify.com/?preview_theme_id=${themeId}` : '';

  return { themeId, previewUrl };
};

/**
 * Parses an HTML string and returns the first element.
 * @param template - The HTML string to parse.
 * @returns The first child element of the parsed HTML.
 */
const html = (template: string): HTMLElement => {
  const container = document.createElement('div');
  container.innerHTML = template.trim();
  return container.firstElementChild as HTMLElement;
};

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
 * the live theme and each theme in the library, laid out by `ROW_STYLES`.
 * Both cards share the "Edit theme" link and its `.Polaris-InlineStack` actions row.
 * The buttons use the page's own `s-internal-button` Polaris element.
 * Themes whose buttons React has re-rendered away get them back on the next scan.
 * @returns `true` if at least one theme was injected, `false` if none were found or all were already processed.
 */
export const injectIntoThemeList = () => {
  const editLinks = document.querySelectorAll<HTMLAnchorElement>('a[class*="ThemeActionButton"][href*="/themes/"]');

  let injected = false;

  editLinks.forEach((editLink) => {
    const actions = editLink.closest('.Polaris-InlineStack');
    if (!actions || actions.querySelector(`[${INJECTED_ATTR}]`)) {
      return;
    }

    const data = extractThemeData(editLink);
    if (!data) {
      return;
    }

    const row = html(`
      <div ${INJECTED_ATTR}>
        <s-internal-button variant="tertiary" icon="clipboard" data-copy-value="${data.themeId}" data-track-action="${'admin.theme_list.id_copy' satisfies AnalyticsAction}">ID</s-internal-button>
        <s-internal-button variant="tertiary" icon="clipboard" data-copy-value="${data.previewUrl}" data-track-action="${'admin.theme_list.preview_url_copy' satisfies AnalyticsAction}">Preview URL</s-internal-button>
      </div>
    `);
    row.querySelectorAll('s-internal-button').forEach((btn) => btn.addEventListener('click', handleCopyClick));

    // The inert copy of the "more actions" button is the spacer `ROW_STYLES` hides.
    const more = actions.querySelector(':scope > button[command]');
    if (more) {
      const spacer = more.cloneNode(true) as HTMLElement;
      spacer.removeAttribute('commandfor');
      spacer.setAttribute('inert', '');
      row.append(spacer);
    }

    actions.append(row);
    injected = true;
  });

  return injected;
};

/**
 * Adds the theme list buttons while the frame is on /themes, on first load and after
 * client-side navigation. A MutationObserver covers the list rendering after the URL changes.
 * @param ctx - The content script context, used to watch URL changes and clean up.
 */
export const setupThemeList = async (ctx: ContentScriptContext) => {
  const settings = await getSettings();
  if (!isEnabled(settings.admin.themeListUtils)) {
    return;
  }

  const style = document.createElement('style');
  style.textContent = ROW_STYLES;
  document.head.append(style);

  let observer: MutationObserver | undefined;

  const sync = (pathname: string) => {
    if (!THEMES_PATH.test(pathname)) {
      observer?.disconnect();
      observer = undefined;
      return;
    }
    if (observer) {
      return;
    }

    injectIntoThemeList();

    let queued = false;
    observer = new MutationObserver(() => {
      if (queued) return;
      queued = true;
      requestAnimationFrame(() => {
        injectIntoThemeList();
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
  });
};
