import { createIntegratedUi } from '#imports';
import { render } from 'preact';
import { getItem } from '~/utils/storage';
import { waitForElement } from '@/utils/helpers';
import App from './App.tsx';

export default defineContentScript({
  matches: ['*://partners.shopify.com/*/stores/new*'],
  async main(ctx) {
    // Only run on managed store type pages
    if (!window.location.search.includes('store_type=managed_store')) {
      return;
    }

    // Check if collaborator access presets are enabled
    const settings = await getItem<AlfredSettings>('settings');
    const isPresetsEnabled = settings?.collaboratorAccess?.presets !== false;

    if (!isPresetsEnabled) {
      return; // Exit early if presets are disabled
    }

    // Inject Shopify Polaris
    await injectScript('/libs/shopify-polaris.js', {
      keepInDom: true
    });

    const ui = createIntegratedUi(ctx, {
      position: 'inline',
      anchor: 'body',
      append: 'first',
      onMount: async (container) => {
        const target = await waitForElement(
          '#AppFrameMain form .Polaris-FormLayout__Item:nth-child(2) > .Polaris-Card > .Polaris-Card__Section:nth-child(2)'
        );

        if (!target) {
          return;
        }

        target.insertAdjacentElement('afterend', container);

        render(<App />, container);
        return { container };
      },
      onRemove: (elements) => {
        void (async () => {
          const resolvedElements = await elements;
          if (resolvedElements?.container) {
            render(null, resolvedElements.container);
            resolvedElements.container.remove();
          }
        })();
      }
    });

    // Explicitly mount the UI
    ui.mount();

    browser.runtime.onMessage.addListener((event: { type: string }) => {
      if (event.type === 'MOUNT_UI') {
        // dynamic mount by user action via messaging.
        ui.mount();
      }
    });
  }
});
