import type { StoreInfo } from './types';

export const getTheme = async (): Promise<StoreInfo | null> => {
  try {
    // Get the current active tab
    const [tab] = await browser.tabs.query({
      active: true,
      currentWindow: true,
    });

    if (tab?.id && tab?.url) {
      // Send message to content script
      const response = await browser.tabs.sendMessage(tab.id, {
        action: 'get_theme',
      });

      // Transform response to StoreInfo format
      return {
        isShopify: response?.isShopify || false,
        domain: new URL(tab.url).hostname,
        shopDomain: response?.shop || null,
        page_url: tab.url,
        theme: response?.theme || null,
      };
    }
    return null;
  } catch (error) {
    console.error('Error getting theme:', error);
    return null;
  }
};
