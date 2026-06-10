import type {
  StoreInfo,
  Theme,
  RawHeading,
  RawLink,
  RawAsset,
  RawImage,
  RawSchemaBlock,
  RobotsResponse,
  LinkStatusResult
} from './types';
import { lookupThemeStoreEntry } from './themeStoreLookup';

/**
 * Asks the background service worker to resolve a link's HTTP status. The check
 * runs there so it survives the popup closing and can read cross-origin codes.
 * @param {string} url - Absolute http(s) URL to check.
 * @returns {Promise<LinkStatusResult>} Status bucket; 'error' if unreachable.
 */
export const checkLinkStatus = async (url: string): Promise<LinkStatusResult> => {
  try {
    const res = await browser.runtime.sendMessage({ action: 'check_link_status', url });
    return res ?? { status: 0, bucket: 'error' };
  } catch {
    return { status: 0, bucket: 'error' };
  }
};

/**
 * Extracts all H1-H6 headings from the active tab via content script.
 * @returns {Promise<RawHeading[]>} Array of headings in DOM order, or empty array on failure.
 */
export const getHeadings = async (): Promise<RawHeading[]> => {
  try {
    const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
    if (tab?.id) {
      const response = await browser.tabs.sendMessage(tab.id, { action: 'get_headings' });
      return Array.isArray(response) ? response : [];
    }
    return [];
  } catch {
    return [];
  }
};

/**
 * Scrolls the active tab to a heading by its DOM index and briefly highlights it.
 * @param {number} index - Zero-based index of the heading in DOM order.
 */
export const scrollToHeading = async (index: number): Promise<void> => {
  try {
    const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
    if (tab?.id) {
      await browser.tabs.sendMessage(tab.id, { action: 'scroll_to_heading', index });
    }
  } catch {
    // silently fail if content script is unreachable
  }
};

/**
 * Toggles colored dashed outlines on all links in the active tab (green=internal, purple=external, red=nofollow).
 * @param {boolean} enabled - Whether to apply or remove highlights.
 */
export const highlightLinks = async (enabled: boolean): Promise<void> => {
  try {
    const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
    if (tab?.id) {
      await browser.tabs.sendMessage(tab.id, { action: 'highlight_links', enabled });
    }
  } catch {
    // silently fail
  }
};

/**
 * Scrolls the active tab to a link by its zero-based DOM index and briefly highlights it.
 * @param {number} index - Zero-based index of the link among all `a[href]` elements.
 */
export const scrollToLink = async (index: number): Promise<void> => {
  try {
    const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
    if (tab?.id) {
      await browser.tabs.sendMessage(tab.id, { action: 'scroll_to_link', index });
    }
  } catch {
    // silently fail
  }
};

/**
 * Extracts all anchor links from the active tab via content script.
 * @returns {Promise<RawLink[]>} Array of links in DOM order, or empty array on failure.
 */
export const getLinks = async (): Promise<RawLink[]> => {
  try {
    const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
    if (tab?.id) {
      const response = await browser.tabs.sendMessage(tab.id, { action: 'get_links' });
      return Array.isArray(response) ? response : [];
    }
    return [];
  } catch {
    return [];
  }
};

/**
 * Extracts all scripts and stylesheets from the active tab via content script.
 * @returns {Promise<RawAsset[]>} Array of assets in DOM order, or empty array on failure.
 */
export const getAssets = async (): Promise<RawAsset[]> => {
  try {
    const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
    if (tab?.id) {
      const response = await browser.tabs.sendMessage(tab.id, { action: 'get_assets' });
      return Array.isArray(response) ? response : [];
    }
    return [];
  } catch {
    return [];
  }
};

/**
 * Extracts all JSON-LD structured-data blocks from the active tab via content script.
 * @returns {Promise<RawSchemaBlock[]>} Blocks in DOM order, or empty array on failure.
 */
export const getSchema = async (): Promise<RawSchemaBlock[]> => {
  try {
    const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
    if (tab?.id) {
      const response = await browser.tabs.sendMessage(tab.id, { action: 'get_schema' });
      return Array.isArray(response) ? response : [];
    }
    return [];
  } catch {
    return [];
  }
};

/**
 * Detects Shopify theme info from the active tab via content script and enriches it with Theme Store metadata.
 * @returns {Promise<StoreInfo | null>} Store and theme data, or null if the tab is inaccessible.
 */
export const getTheme = async (): Promise<StoreInfo | null> => {
  try {
    // Get the current active tab
    const [tab] = await browser.tabs.query({
      active: true,
      currentWindow: true
    });

    if (tab?.id && tab?.url) {
      // Send message to content script
      interface ThemeResponse {
        isShopify?: boolean;
        shop?: string;
        theme?: Theme;
      }

      const response: ThemeResponse = await browser.tabs.sendMessage(tab.id, {
        action: 'get_theme'
      });

      const theme = response?.theme ?? null;

      // Transform response to StoreInfo format
      return {
        isShopify: response?.isShopify ?? false,
        domain: new URL(tab.url).hostname,
        shopDomain: response?.shop ?? null,
        page_url: tab.url,
        theme,
        themeStoreEntry: await lookupThemeStoreEntry(theme)
      };
    }
    return null;
  } catch (error) {
    console.error('Error getting theme:', error);
    return null;
  }
};

/**
 * Extracts all images (img/picture/background) from the active tab via content script.
 * @returns {Promise<RawImage[]>} Array of images in collectImageEls() order, or empty on failure.
 */
export const getImages = async (): Promise<RawImage[]> => {
  try {
    const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
    if (tab?.id) {
      const response = await browser.tabs.sendMessage(tab.id, { action: 'get_images' });
      return Array.isArray(response) ? response : [];
    }
    return [];
  } catch {
    return [];
  }
};

/**
 * Toggles colored dashed outlines on all images in the active tab (green=ok, amber=missing alt, red=broken).
 * @param {boolean} enabled - Whether to apply or remove highlights.
 */
export const highlightImages = async (enabled: boolean): Promise<void> => {
  try {
    const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
    if (tab?.id) {
      await browser.tabs.sendMessage(tab.id, { action: 'highlight_images', enabled });
    }
  } catch {
    // silently fail
  }
};

/**
 * Scrolls the active tab to an image by its collectImageEls() index and briefly highlights it.
 * @param {number} index - Zero-based index in collectImageEls() order.
 */
export const scrollToImage = async (index: number): Promise<void> => {
  try {
    const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
    if (tab?.id) {
      await browser.tabs.sendMessage(tab.id, { action: 'scroll_to_image', index });
    }
  } catch {
    // silently fail
  }
};

/**
 * Fetches the site's robots.txt via the background service worker, whose
 * fetches are not CORS-bound (handles cross-origin redirects) and work even
 * when the content script can't run on the page.
 * @returns {Promise<RobotsResponse | null>} Raw file + HTTP metadata, or null on non-http tabs.
 */
export const getRobots = async (): Promise<RobotsResponse | null> => {
  try {
    const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
    if (!tab?.url || !/^https?:/i.test(tab.url)) return null;
    const response = await browser.runtime.sendMessage({ type: 'fetch_robots', url: tab.url });
    return response && typeof response.status === 'number' ? response : null;
  } catch {
    return null;
  }
};
