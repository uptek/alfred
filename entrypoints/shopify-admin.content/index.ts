import { setupToggleSidebar } from './ToggleSidebar';
import { setupTimeline } from './timeline.util';
import { getSettings, isEnabled } from '~/utils/settings';

export default defineContentScript({
  matches: ['https://admin.shopify.com/*', 'https://*.myshopify.com/admin/*'],
  runAt: 'document_end',
  async main() {
    const settings = await getSettings();

    void setupToggleSidebar(settings);
    setupTimeline(settings);

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
  }
});
