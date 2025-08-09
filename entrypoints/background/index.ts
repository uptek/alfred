import { registerShortcuts } from './shortcuts';
import { trackAction, type AnalyticsAction } from '@/utils/analytics';

export default defineBackground(() => {
  registerShortcuts();

  // Listen for tracking messages from content scripts
  browser.runtime.onMessage.addListener(async (message) => {
    if (message.type === 'track_action') {
      try {
        await trackAction(message.action as AnalyticsAction, message.metadata);
      } catch (error) {
        console.error('Failed to track action:', error);
      }
    }
  });

  // Open options page when extension icon is clicked
  browser.action.onClicked.addListener(() => {
    browser.runtime.openOptionsPage();
  });

  // Open changelog page when extension is updated
  browser.runtime.onInstalled.addListener((details) => {
    if (details.reason === 'update') {
      browser.tabs.create({ url: browser.runtime.getURL('/options.html?page=changelog') });
    }
  });
});
