import { storage } from '#imports';
import { registerShortcuts } from './shortcuts';
import { trackAction, type AnalyticsAction } from '@/utils/analytics';

export default defineBackground(() => {
  // Keep track of current shortcuts in memory to avoid unnecessary re-registration
  let currentShortcuts: any = null;

  registerShortcuts();

  // Re-register shortcuts when settings change
  storage.watch<any>('local:settings', async (newValue, oldValue) => {
    const newShortcuts = newValue?.shortcuts;

    // Only re-register if shortcuts actually changed
    if (JSON.stringify(newShortcuts) !== JSON.stringify(currentShortcuts)) {
      currentShortcuts = newShortcuts;
      await registerShortcuts();
    }
  });

  // Listen for tracking messages from content scripts
  browser.runtime.onMessage.addListener((message) => {
    if (message.type === 'track_action') {
      try {
        trackAction(message.action as AnalyticsAction, message.metadata);
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
