import { getSettings, isEnabled } from '~/utils/settings';
import { trackAction } from '@/utils/analytics';
import type { TabMessage } from '@/utils/messages';

export default defineContentScript({
  matches: ['<all_urls>'],
  runAt: 'document_idle',
  cssInjectionMode: 'ui',
  async main(ctx) {
    const settings = await getSettings();
    if (!isEnabled(settings.shortcuts.cartograph)) return;

    let mounted = false;

    const open = async () => {
      if (mounted) return;
      mounted = true;
      trackAction('cartograph_open');
      try {
        const { mountCartograph } = await import('./mount');
        mountCartograph(ctx, () => {
          mounted = false;
        });
      } catch (err) {
        // The flag is claimed before the await to keep two triggers from racing
        // into a double mount, so a failed import has to release it or the
        // overlay can never be opened again on this page.
        mounted = false;
        throw err;
      }
    };

    // URL parameter trigger
    if (new URLSearchParams(window.location.search).get('alfred') === 'cart') {
      await open();
    }

    // Context menu trigger (via background script message)
    browser.runtime.onMessage.addListener((msg: TabMessage) => {
      if (msg.action === 'open_cartograph') {
        open().catch(console.error);
      }
      return false;
    });
  }
});
