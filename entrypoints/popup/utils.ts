import { ThemeInfo } from './types';

export const getTheme = async (): Promise<ThemeInfo | null> => {
  try {
    // Get the current active tab
    const [tab] = await browser.tabs.query({ active: true, currentWindow: true });

    if (tab?.id && tab?.url) {
      // Send message to content script
      const response = await browser.tabs.sendMessage(tab.id, { action: 'get_theme' });
      return response;
    }
    return null;
  } catch (error) {
    console.error('Error getting theme:', error);
    return null;
  }
};