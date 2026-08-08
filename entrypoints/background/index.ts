import { storage } from '#imports';
import { registerShortcuts } from './shortcuts';
import { checkLinkStatus } from './linkStatus';
import { keyFor } from '@/entrypoints/popup/stores/tabState';
import { trackAction } from '@/utils/analytics';
import type { AnalyticsAction } from '@/utils/analytics-actions';
import { saveReturnUrl, isValidReturnUrl } from '@/utils/storefrontPasswordRedirect';
import { refreshThemesCacheIfNeeded } from '@/utils/themesCache';
import { captureOrganizationId } from '@/entrypoints/collaborator-access.content/presets';
import { getItem } from '@/utils/storage';

const UNINSTALL_SURVEY_URL = 'https://tally.so/r/zx79O8';

export default defineBackground(() => {
  // Set uninstall survey URL
  browser.runtime.setUninstallURL(UNINSTALL_SURVEY_URL);

  // Track navigation start URLs to handle redirect chains correctly
  // This is needed because preview_theme_id URLs may redirect multiple times before /password
  const pendingNavigations = new Map<number, string>();

  // When a navigation starts, save the original URL
  browser.webNavigation.onBeforeNavigate.addListener((details) => {
    if (details.frameId === 0) {
      pendingNavigations.set(details.tabId, details.url);
    }
  });

  // Remember the Shopify organization while browsing the dev dashboard so the
  // "Request store access" context menu works from any storefront. The dashboard is
  // an SPA, so capture both full loads and client-side route changes.
  browser.webNavigation.onCommitted.addListener((details) => {
    if (details.frameId === 0) void captureOrganizationId(details.url);
  });
  browser.webNavigation.onHistoryStateUpdated.addListener((details) => {
    if (details.frameId === 0) void captureOrganizationId(details.url);
  });

  // When navigation completes, check if we ended up on /password
  browser.webNavigation.onCommitted.addListener((details) => {
    if (details.frameId !== 0) return;

    const committedUrl = new URL(details.url);
    const originalUrl = pendingNavigations.get(details.tabId);

    pendingNavigations.delete(details.tabId);

    // If we ended up on /password, save the original URL for redirect after password entry
    if (committedUrl.pathname === '/password' || committedUrl.pathname === '/password/') {
      if (originalUrl && isValidReturnUrl(originalUrl)) {
        saveReturnUrl(originalUrl).catch(() => {});
      }
    }
  });

  // Keep service worker alive to prevent it from becoming inactive
  const keepAlive = () => {
    // Send a simple message to keep the service worker active
    browser.runtime.getPlatformInfo().then(() => {
      // This is a no-op, but it keeps the service worker alive
    });
  };

  // Set up periodic keep-alive (every 20 seconds)
  setInterval(keepAlive, 20000);

  // Keep track of current shortcuts (as their serialized form, so each settings
  // write compares against a cached string) to avoid unnecessary re-registration
  // 'null' matches the never-seen sentinel so the first watch event always re-registers
  let currentShortcutsJson: string | undefined = 'null';
  let currentPresetMenuItemHandles: string | undefined;

  registerShortcuts();

  // Re-register shortcuts when they change. The "Request store access" menu is a
  // shortcut flag too, and its preset list/order depends on presetMenuItemHandles, so a
  // change to either rebuilds the menus.
  storage.watch<AlfredSettings>('local:settings', (newValue) => {
    void (async () => {
      const newShortcutsJson = JSON.stringify(newValue?.shortcuts);
      const newPresetMenuItemHandles = newValue?.collaboratorAccess?.presetMenuItemHandles;
      if (newShortcutsJson !== currentShortcutsJson || newPresetMenuItemHandles !== currentPresetMenuItemHandles) {
        currentShortcutsJson = newShortcutsJson;
        currentPresetMenuItemHandles = newPresetMenuItemHandles;
        await registerShortcuts(newValue);
      }
    })();
  });

  // Saved presets appear as items under the "Request store access" menu —
  // rebuild the menus whenever the user's presets change.
  storage.watch('local:alfred:permission-presets', () => {
    void registerShortcuts();
  });

  // Single message dispatcher: tracking events from content scripts, and link
  // HTTP status checks for the popup. Fetching statuses here (not in the popup)
  // keeps checks alive after the popup closes and uses host permissions to read
  // cross-origin status codes. Returning true keeps the channel open for the
  // async sendResponse.
  browser.runtime.onMessage.addListener(
    (message: { type?: string; action?: unknown; url?: unknown; [key: string]: unknown }, sender, sendResponse) => {
      if (message.type === 'track_action') {
        try {
          trackAction(message.action as AnalyticsAction, message.metadata as Record<string, unknown>);
        } catch (error) {
          console.error('Failed to track action:', error);
        }
        return false;
      }

      // Only honor link-status requests from the extension's own contexts (popup/content scripts).
      if (sender.id !== browser.runtime.id) return false;
      if (message.action === 'check_link_status' && typeof message.url === 'string') {
        checkLinkStatus(message.url).then(sendResponse);
        return true;
      }
      return false;
    }
  );

  // The popup persists per-tab view state (open section, link-status scan) keyed
  // by tab id. Drop it the moment the tab closes so the state dies with the tab
  // and session storage doesn't accumulate orphaned records.
  browser.tabs.onRemoved.addListener((tabId) => {
    storage.removeItem(keyFor(tabId)).catch(() => {});
  });

  browser.runtime.onInstalled.addListener(async (details) => {
    // Prefetch themes cache on install and update
    refreshThemesCacheIfNeeded();

    // Open changelog page when extension is updated, unless disabled in settings
    if (!import.meta.env.DEV && details.reason === 'update') {
      const settings = await getItem<AlfredSettings>('settings');
      if (settings?.general?.openChangelogOnUpdate !== false) {
        browser.tabs.create({
          url: browser.runtime.getURL('/options.html?page=changelog')
        });
      }
    }
  });
});
