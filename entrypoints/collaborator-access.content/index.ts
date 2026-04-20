import { createIntegratedUi } from '#imports';
import { mount, unmount } from 'svelte';
import { getItem } from '~/utils/storage';
import { waitForElement } from '@/utils/helpers';
import App from './App.svelte';

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

    let app: Record<string, unknown> | undefined;

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

        app = mount(App, { target: container });
        return { container };
      },
      onRemove: (elements) => {
        void (async () => {
          if (app) {
            unmount(app);
            app = undefined;
          }
          const resolvedElements = await elements;
          if (resolvedElements?.container) {
            resolvedElements.container.remove();
          }
        })();
      }
    });

    // Insert a "Save preset" proxy button before the create-new-store button
    const createStoreBtn = await waitForElement('#create-new-store-button');
    if (createStoreBtn) {
      const proxyBtn = document.createElement('button');
      proxyBtn.type = 'button';
      proxyBtn.textContent = 'Save preset';
      proxyBtn.className = 'Polaris-Button';
      proxyBtn.style.cssText = 'margin-right: 8px;';
      proxyBtn.addEventListener('click', (e) => {
        e.preventDefault();
        document.dispatchEvent(new CustomEvent('alfred:save-preset'));
      });
      createStoreBtn.parentElement?.insertBefore(proxyBtn, createStoreBtn);
    }

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
