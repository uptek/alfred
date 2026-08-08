import type { StoreInfo, Theme } from './types';
import { getActiveTab } from './messaging';
import { lookupThemeStoreEntry } from './themeStoreLookup';

/**
 * Detects Shopify theme info from the active tab via content script and enriches it with Theme Store metadata.
 * @returns {Promise<StoreInfo | null>} Store and theme data, or null if the tab is inaccessible.
 */
export const getTheme = async (): Promise<StoreInfo | null> => {
  try {
    const tab = await getActiveTab();

    if (tab?.id && tab?.url) {
      interface ThemeResponse {
        isShopify?: boolean;
        shop?: string;
        theme?: Theme;
      }

      const response: ThemeResponse = await browser.tabs.sendMessage(tab.id, {
        action: 'get_theme'
      });

      const theme = response?.theme ?? null;

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
