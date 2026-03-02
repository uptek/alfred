import { getItem } from '~/utils/storage';
import { trackAction } from '@/utils/analytics';

export default defineContentScript({
  matches: ['<all_urls>'],
  runAt: 'document_idle',
  async main(ctx) {
    const settings = await getItem<AlfredSettings>('settings');
    if (settings?.shortcuts?.cartSuperpowers === false) return;

    let mounted = false;

    const open = async () => {
      if (mounted) return;
      mounted = true;
      trackAction('cart_superpowers_open');
      const { mountCartSuperpowers } = await import('./mount');
      mountCartSuperpowers(ctx, () => {
        mounted = false;
      });
    };

    // URL parameter trigger
    if (new URLSearchParams(window.location.search).get('alfred') === 'cart') {
      await open();
    }

    // Context menu trigger (via background script message)
    browser.runtime.onMessage.addListener((msg) => {
      if (msg.action === 'open_cart_superpowers') {
        open();
      }
      return false;
    });
  },
});
