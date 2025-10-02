import { trackAction } from '@/utils/analytics';
import { ThemeInfo } from './types';

export const getTheme = async (): Promise<ThemeInfo | null> => {
  try {
    // Get the current active tab
    const [tab] = await browser.tabs.query({ active: true, currentWindow: true });

    if (tab?.id && tab?.url) {
      // Send message to content script
      const response = await browser.tabs.sendMessage(tab.id, { action: 'get_theme' });
      return {
        ...response,
        page_url: tab.url,
      };
    }
    return null;
  } catch (error) {
    console.error('Error getting theme:', error);
    return null;
  }
};

export const getThemePreviewUrl = (
  themeInfo: ThemeInfo | null,
  disablePreviewBar: boolean
): string => {
  if (!themeInfo?.theme?.id || !themeInfo?.page_url) return '';

  const url = new URL(themeInfo.page_url);
  url.searchParams.set('preview_theme_id', themeInfo.theme.id.toString());

  // Add pb=0 to disable preview bar if requested
  if (disablePreviewBar) {
    url.searchParams.set('pb', '0');
  }

  return url.toString();
};

export const copyThemePreviewUrl = async (
  themeInfo: ThemeInfo | null,
  disablePreviewBar: boolean
): Promise<boolean> => {
  const previewUrl = getThemePreviewUrl(themeInfo, disablePreviewBar);
  if (!previewUrl) return false;

  try {
    await navigator.clipboard.writeText(previewUrl);
    return true;
  } catch (error) {
    console.error('Failed to copy preview URL:', error);
    return false;
  }
};
