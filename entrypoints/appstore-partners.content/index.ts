import { createIntegratedUi } from '#imports';
import { mount, unmount } from 'svelte';
import { getSettings, isEnabled } from '~/utils/settings';
import { waitForElement } from '@/utils/helpers';
import App from './App.svelte';

export default defineContentScript({
  matches: ['*://apps.shopify.com/partners/*'],
  async main(ctx) {
    // Check if enhanced partner pages are enabled
    const settings = await getSettings();
    const isEnhancedPartnerPagesEnabled = isEnabled(settings.appStore.enhancedPartnerPages);

    if (!isEnhancedPartnerPagesEnabled) {
      return; // Exit early if enhanced partner pages are disabled
    }

    let app: Record<string, unknown> | undefined;

    const ui = createIntegratedUi(ctx, {
      position: 'inline',
      anchor: 'body',
      append: 'first',
      onMount: async (container) => {
        const target = await waitForElement('#PartnersShow > main > div > section > div:nth-child(1)');

        if (!target) {
          return;
        }

        if (target.nextSibling) {
          target.parentNode?.insertBefore(container, target.nextSibling);
        } else {
          target.parentNode?.appendChild(container);
        }

        app = mount(App, { target: container });
        return { container };
      },
      onRemove: (elements) => {
        void (async () => {
          if (app) {
            unmount(app);
            app = undefined;
          }
          const resolved = await elements;
          if (resolved?.container) {
            resolved.container.remove();
          }
        })();
      }
    });

    ui.mount();
  }
});
