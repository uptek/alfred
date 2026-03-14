import { getItem } from '~/utils/storage';

const INJECTED_ATTR = 'data-alfred-theme-list';

/**
 * Sends a tracking event to the background script for analytics.
 * @param action - The action name to track.
 * @param metadata - Optional key-value pairs to include with the event.
 */
const trackThemeListAction = (action: string, metadata: Record<string, unknown> = {}) => {
  browser.runtime.sendMessage({
    type: 'track_action',
    action,
    metadata,
  });
};

interface ThemeData {
  themeId: string;
  storeName: string;
  themeName: string;
  previewUrl: string;
}

/**
 * Extracts theme ID, store name, and preview URL from a theme list item's editor link.
 * @param listItem - A ThemeListItem DOM element.
 * @returns The parsed theme data, or `null` if no editor link is found.
 */
const extractThemeData = (listItem: HTMLElement): ThemeData | null => {
  const editLink = listItem.querySelector<HTMLAnchorElement>('a[href*="/themes/"][href*="/editor"]');
  if (!editLink) {
    return null;
  }

  const href = editLink.getAttribute('href') ?? '';
  const themeId = /\/themes\/(\d+)\//.exec(href)?.[1] ?? '';
  const storeName = /\/store\/([^/]+)\//.exec(href)?.[1] ?? '';
  const themeName = listItem.querySelector('h3')?.textContent?.trim() ?? 'Unknown';

  const previewUrl = storeName ? `https://${storeName}.myshopify.com/?preview_theme_id=${themeId}` : '';

  return { themeId, storeName, themeName, previewUrl };
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
 * @param e - The click event from an `s-button` element.
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
    trackThemeListAction(action);
  }
};

/**
 * Scans the theme list and injects copy-ID / copy-preview-URL buttons into each unprocessed item.
 * @returns `true` if at least one item was injected, `false` if none were found or all were already processed.
 */
const injectIntoThemeList = () => {
  const themeListItems = document.querySelectorAll<HTMLElement>('ul[class*="ThemeList"] div[class*="ThemeListItem"]');

  if (!themeListItems.length) {
    return false;
  }

  let injected = false;

  themeListItems.forEach((listItem) => {
    if (listItem.hasAttribute(INJECTED_ATTR)) {
      return;
    }

    const data = extractThemeData(listItem);
    if (!data) {
      return;
    }

    const contextProvider = listItem.querySelector('s-internal-context-provider');
    if (contextProvider) {
      const wrapper = html(`
        <s-stack gap="small-200">
          <s-stack direction="inline" gap="small-500">
            <s-button variant="tertiary" icon="clipboard" data-copy-value="${data.themeId}" data-track-action="theme_list_copy_id">ID</s-button>
            <s-button variant="tertiary" icon="clipboard" data-copy-value="${data.previewUrl}" data-track-action="theme_list_copy_preview_url">Preview URL</s-button>
          </s-stack>
        </s-stack>
      `);
      const buttons = wrapper.querySelectorAll<HTMLElement>('s-button');
      buttons.forEach((btn) => btn.addEventListener('click', handleCopyClick));
      contextProvider.replaceWith(wrapper);
      wrapper.prepend(contextProvider);
    }

    listItem.setAttribute(INJECTED_ATTR, 'true');
    listItem.querySelector<HTMLElement>(':scope > s-stack')?.setAttribute('alignItems', 'end');
    injected = true;
  });

  return injected;
};

/**
 * Initializes the theme list enhancements on /themes pages and re-injects on DOM changes.
 * Sets up a MutationObserver to handle dynamically loaded theme list items.
 */
export const setupThemeList = async () => {
  if (!window.location.pathname.endsWith('/themes')) {
    return;
  }

  const settings = await getItem<AlfredSettings>('settings');
  if (settings?.admin?.themeListUtils === false) {
    return;
  }

  injectIntoThemeList();

  let queued = false;
  const observer = new MutationObserver(() => {
    if (queued) return;
    queued = true;
    requestAnimationFrame(() => {
      injectIntoThemeList();
      queued = false;
    });
  });

  observer.observe(document.body, {
    childList: true,
    subtree: true,
  });
};
