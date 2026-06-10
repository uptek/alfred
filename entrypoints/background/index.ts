import { storage } from '#imports';
import { registerShortcuts } from './shortcuts';
import { checkLinkStatus } from './linkStatus';
import { keyFor } from '@/entrypoints/popup/stores/tabState';
import { trackAction, type AnalyticsAction } from '@/utils/analytics';
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

  // Keep track of current shortcuts in memory to avoid unnecessary re-registration
  let currentShortcuts: unknown = null;
  let currentPresetMenuItemHandles: string | undefined;

  registerShortcuts();

  // Re-register shortcuts when they change. The "Request store access" menu is a
  // shortcut flag too, and its preset list/order depends on presetMenuItemHandles, so a
  // change to either rebuilds the menus.
  storage.watch<AlfredSettings>('local:settings', (newValue) => {
    void (async () => {
      const newShortcuts = newValue?.shortcuts;
      const newPresetMenuItemHandles = newValue?.collaboratorAccess?.presetMenuItemHandles;
      if (
        JSON.stringify(newShortcuts) !== JSON.stringify(currentShortcuts) ||
        newPresetMenuItemHandles !== currentPresetMenuItemHandles
      ) {
        currentShortcuts = newShortcuts;
        currentPresetMenuItemHandles = newPresetMenuItemHandles;
        await registerShortcuts();
      }
    })();
  });

  // Saved presets appear as items under the "Request store access" menu —
  // rebuild the menus whenever the user's presets change.
  storage.watch('local:alfred:permission-presets', () => {
    void registerShortcuts();
  });

  // Listen for tracking messages from content scripts
  browser.runtime.onMessage.addListener((message: { type?: string; [key: string]: unknown }) => {
    if (message.type === 'track_action') {
      try {
        trackAction(message.action as AnalyticsAction, message.metadata as Record<string, unknown>);
      } catch (error) {
        console.error('Failed to track action:', error);
      }
    }
  });

  // Resolve link HTTP statuses for the popup. Fetching here (not in the popup)
  // keeps checks alive after the popup closes and uses host permissions to read
  // cross-origin status codes. Returning true keeps the channel open for the
  // async sendResponse.
  browser.runtime.onMessage.addListener((message: { action?: string; url?: string }, sender, sendResponse) => {
    // Only honor requests from the extension's own contexts (popup/content scripts).
    if (sender.id !== browser.runtime.id) return false;
    if (message.action === 'check_link_status' && typeof message.url === 'string') {
      checkLinkStatus(message.url).then(sendResponse);
      return true;
    }
    return false;
  });

  // The popup persists per-tab view state (open section, link-status scan) keyed
  // by tab id. Drop it the moment the tab closes so the state dies with the tab
  // and session storage doesn't accumulate orphaned records.
  browser.tabs.onRemoved.addListener((tabId) => {
    storage.removeItem(keyFor(tabId)).catch(() => {});
  });

  // Fetch robots.txt for the popup. Runs here (not in the content script)
  // because extension fetches with host_permissions are not CORS-bound, so
  // cross-origin redirects (apex → www, CDN offload) still resolve — a
  // content-script fetch follows the page's CORS rules and would fail.
  const MAX_ROBOTS_BYTES = 600 * 1024; // Google stops processing at 500 KiB
  const ROBOTS_FETCH_TIMEOUT_MS = 8000; // a hung fetch must not stall the popup
  browser.runtime.onMessage.addListener(
    (message: { type?: string; url?: string }, _sender, sendResponse: (response: unknown) => void) => {
      // Validate the scheme here too — this listener is the trust boundary,
      // not the popup, and the extension has <all_urls> host permissions.
      if (message.type !== 'fetch_robots' || typeof message.url !== 'string' || !/^https?:/i.test(message.url)) {
        return;
      }
      (async () => {
        // Resolve against the full URL (location.origin is the string "null"
        // on sandboxed pages). no-cache revalidates so a just-edited
        // robots.txt shows fresh.
        const res = await fetch(new URL('/robots.txt', message.url), {
          cache: 'no-cache',
          signal: AbortSignal.timeout(ROBOTS_FETCH_TIMEOUT_MS)
        });
        // Stream-read with a byte cap — res.text() would buffer a hostile
        // multi-GB body (and chunked bodies have no Content-Length to check).
        let content = '';
        let bytes = 0;
        let truncated = false;
        if (res.ok && res.body) {
          const reader = res.body.getReader();
          const decoder = new TextDecoder();
          for (;;) {
            const { done, value } = await reader.read();
            if (done) break;
            bytes += value.byteLength;
            if (bytes > MAX_ROBOTS_BYTES) {
              const keep = value.byteLength - (bytes - MAX_ROBOTS_BYTES);
              content += decoder.decode(value.subarray(0, keep), { stream: true });
              truncated = true;
              await reader.cancel();
              break;
            }
            content += decoder.decode(value, { stream: true });
          }
          content += decoder.decode();
        }
        sendResponse({ ok: true, status: res.status, content, finalUrl: res.url, size: bytes, truncated });
      })().catch(() => {
        sendResponse({ ok: false, status: 0, content: '', finalUrl: '', size: 0, truncated: false });
      });
      return true;
    }
  );

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
