import { getSettings, isEnabled } from '~/utils/settings';
import { trackAction } from '@/utils/analytics';

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
      const { mountCartograph } = await import('./mount');
      mountCartograph(ctx, () => {
        mounted = false;
      });
    };

    // URL parameter trigger
    if (new URLSearchParams(window.location.search).get('alfred') === 'cart') {
      await open();
    }

    // Context menu trigger (via background script message)
    browser.runtime.onMessage.addListener((msg) => {
      if (msg.action === 'open_cartograph') {
        open().catch(console.error);
      }
      return false;
    });
  }
});
