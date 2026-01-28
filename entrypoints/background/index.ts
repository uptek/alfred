import { storage } from '#imports';
import { registerShortcuts } from './shortcuts';
import { trackAction, type AnalyticsAction } from '@/utils/analytics';

const UNINSTALL_SURVEY_URL = 'https://tally.so/r/zx79O8';

export default defineBackground(() => {
  // Set uninstall survey URL
  browser.runtime.setUninstallURL(UNINSTALL_SURVEY_URL);

  // Keep service worker alive to prevent it from becoming inactive
  const keepAlive = () => {
    // Send a simple message to keep the service worker active
    browser.runtime.getPlatformInfo().then(() => {
      // This is a no-op, but it keeps the service worker alive
    });
  };

  // Set up periodic keep-alive (every 20 seconds)
  setInterval(keepAlive, 20000);

  // Keep track of current shortcuts in memory to avoid unnecessary re-registration
  let currentShortcuts: unknown = null;

  registerShortcuts();

  // Re-register shortcuts when settings change
  storage.watch<AlfredSettings>('local:settings', (newValue) => {
    void (async () => {
      const newShortcuts = newValue?.shortcuts;

      // Only re-register if shortcuts actually changed
      if (JSON.stringify(newShortcuts) !== JSON.stringify(currentShortcuts)) {
        currentShortcuts = newShortcuts;
        await registerShortcuts();
      }
    })();
  });

  // Listen for tracking messages from content scripts
  browser.runtime.onMessage.addListener(
    (message: { type?: string; [key: string]: unknown }) => {
      if (message.type === 'track_action') {
        try {
          trackAction(
            message.action as AnalyticsAction,
            message.metadata as Record<string, unknown>
          );
        } catch (error) {
          console.error('Failed to track action:', error);
        }
      }
    }
  );

  // Open changelog page when extension is updated
  if (!import.meta.env.DEV) {
    browser.runtime.onInstalled.addListener((details) => {
      if (details.reason === 'update') {
        browser.tabs.create({
          url: browser.runtime.getURL('/options.html?page=changelog'),
        });
      }
    });
  }
});
