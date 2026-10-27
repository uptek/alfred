import { getSettings, isEnabled } from '~/utils/settings';
import { getItem, removeItem } from '~/utils/storage';
import { Toast } from '~/utils/toast';
import { setupSidekick } from './sidekick';
import { setupTimeline } from './timeline.util';
import { setupThemeDelete } from './theme-delete';

// Collapsed/expanded state stored by Alfred's former admin sidebar toggle.
// Its presence marks merchants who used the toggle.
const SIDEBAR_STATE_KEY = 'admin-sidebar-state';

export default defineContentScript({
  matches: ['https://admin.shopify.com/*', 'https://*.myshopify.com/admin/*'],
  runAt: 'document_end',
  async main(ctx) {
    const settings = await getSettings();

    setupSidekick(ctx, settings.admin.sidekick ?? 'default');
    setupTimeline(settings);
    setupThemeDelete();

    /**
     * Warn before closing the theme code editor page.
     * The editor uses VS Code, so users habitually press Cmd+W to close files,
     * which instead closes the browser tab.
     */
    if (/^\/store\/[^/]+\/themes\/\d+\/?$/.test(window.location.pathname)) {
      if (isEnabled(settings.admin.warnBeforeClosingCodeEditor)) {
        window.addEventListener('beforeunload', (e) => {
          e.preventDefault();
          return '';
        });
      }
    }

    // One-time goodbye: Shopify's admin now has its own sidebar toggle.
    // Clearing the key right away means the toast never shows twice.
    if (await getItem(SIDEBAR_STATE_KEY)) {
      await removeItem(SIDEBAR_STATE_KEY);
      Toast.show(
        "👋 Farewell from Alfred's admin sidebar toggle!<br>The new Shopify dashboard now has one built in.<br>We get inspired by the Shopify team all the time. Nice to think we returned the favor this time.<br>Thanks for making it part of your workflow.",
        'success',
        0,
        'announcement'
      );
    }
  }
});
