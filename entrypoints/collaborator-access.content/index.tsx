import { createIntegratedUi } from "#imports";
import { render } from 'preact';
import { waitForElement } from '@/utils/helpers';
import App from './App.tsx';

export default defineContentScript({
  matches: ['*://partners.shopify.com/*/stores/new*'],
  async main(ctx) {
    // Only run on managed store type pages
    if (!window.location.search.includes('store_type=managed_store')) {
      return;
    }

    // Inject Shopify Polaris
    await injectScript('/libs/shopify-polaris-web-components.js', {
      keepInDom: true,
    });

    const ui = await createIntegratedUi(ctx, {
      position: "inline",
      anchor: "body",
      append: "first",
      onMount: async (container) => {
        const target = await waitForElement(
          "#AppFrameMain form .Polaris-FormLayout__Item:nth-child(2) > .Polaris-Card > .Polaris-Card__Section:nth-child(2)"
        );

        if (!target) {
          return;
        }

        target.insertAdjacentElement("afterend", container);

        render(<App />, container);
        return { container };
      },
      onRemove: async (elements) => {
        const resolvedElements = await elements;
        if (resolvedElements?.container) {
          render(null, resolvedElements.container);
          resolvedElements.container.remove();
        }
      },
    });

    // Explicitly mount the UI
    ui.mount();

    browser.runtime.onMessage.addListener((event) => {
      if (event.type === "MOUNT_UI") {
        // dynamic mount by user action via messaging.
        ui.mount();
      }
    });
  },
});
