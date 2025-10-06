import { createIntegratedUi } from '#imports';
import { render } from 'preact';
import { getItem } from '~/utils/storage';
import { waitForElement } from '@/utils/helpers';
import App from './App.tsx';

export default defineContentScript({
  matches: ['*://apps.shopify.com/partners/*'],
  async main(ctx) {
    // Check if enhanced partner pages are enabled
    const settings = await getItem<AlfredSettings>('settings');
    const isEnhancedPartnerPagesEnabled =
      settings?.appStore?.enhancedPartnerPages !== false;

    if (!isEnhancedPartnerPagesEnabled) {
      return; // Exit early if enhanced partner pages are disabled
    }
    const ui = createIntegratedUi(ctx, {
      position: 'inline',
      anchor: 'body',
      append: 'first',
      onMount: async (container) => {
        const target = await waitForElement(
          '#PartnersShow > main > div > section > div:nth-child(1)'
        );

        if (!target) {
          return;
        }

        if (target.nextSibling) {
          target.parentNode?.insertBefore(container, target.nextSibling);
        } else {
          target.parentNode?.appendChild(container);
        }

        render(<App />, container);
        return { container };
      },
      onRemove: (elements) => {
        void (async () => {
          const resolved = await elements;
          if (resolved?.container) {
            render(null, resolved.container);
            resolved.container.remove();
          }
        })();
      },
    });

    // Explicitly mount the UI
    ui.mount();

    browser.runtime.onMessage.addListener(
      (event: { type?: string; [key: string]: unknown }) => {
        if (event.type === 'MOUNT_UI') {
          // dynamic mount by user action via messaging.
          ui.mount();
        }
      }
    );
  },
});
