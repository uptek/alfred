import type { StoreInfo, Theme } from './types';
import { getActiveTab, queryActiveTab } from './messaging';
import { lookupThemeStoreEntry } from './themeStoreLookup';
import { sendTabMessage } from '@/utils/messages';

/**
 * Detects Shopify theme info from the active tab via content script and enriches it with Theme Store metadata.
 * @returns {Promise<StoreInfo | null>} Store and theme data, or null if the tab is inaccessible.
 */
/**
 * Fast DOM-only Shopify check from the isolated world — no main-world relay,
 * so it answers in one message round trip. Used for the popup's initial tab
 * pick and the popup_open event; getTheme() refines the answer when it lands.
 */
export const sniffShopify = (): Promise<boolean> =>
  queryActiveTab('sniff_shopify', false, (response) => typeof response === 'boolean');

export const getTheme = async (): Promise<StoreInfo | null> => {
  try {
    const tab = await getActiveTab();

    if (tab?.id && tab?.url) {
      interface ThemeResponse {
        isShopify?: boolean;
        shop?: string;
        theme?: Theme;
      }

      const response = (await sendTabMessage(tab.id, 'get_theme')) as ThemeResponse;

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
