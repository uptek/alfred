import { setupToggleSidebar } from './ToggleSidebar';
import { getItem } from '~/utils/storage';

export default defineContentScript({
  matches: ['https://admin.shopify.com/*', 'https://*.myshopify.com/admin/*'],
  runAt: 'document_end',
  async main() {
    setupToggleSidebar();

    /**
     * Warn before closing the theme code editor page.
     * The editor uses VS Code, so users habitually press Cmd+W to close files,
     * which instead closes the browser tab.
     */
    if (/^\/store\/[^/]+\/themes\/\d+\/?$/.test(window.location.pathname)) {
      const settings = await getItem<AlfredSettings>('settings');
      if (settings?.admin?.warnBeforeClosingCodeEditor !== false) {
        window.addEventListener('beforeunload', (e) => {
          e.preventDefault();
          return '';
        });
      }
    }
  },
});
