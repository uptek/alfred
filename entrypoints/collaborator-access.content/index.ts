import { createIntegratedUi } from '#imports';
import { mount, unmount } from 'svelte';
import { getItem } from '~/utils/storage';
import { waitForElement } from '@/utils/helpers';
import App from './App.svelte';
import DevApp from './DevApp.svelte';
import { createPartnerAdapter, createDevDashboardAdapter } from './adapters';
import type { DashboardType } from './types';

export default defineContentScript({
  matches: ['*://partners.shopify.com/*/stores/new*', '*://dev.shopify.com/dashboard/*/stores/collaborations/*'],
  async main(ctx) {
    const isPartnerDashboard = window.location.hostname === 'partners.shopify.com';
    const isDevDashboard =
      window.location.hostname === 'dev.shopify.com' && window.location.pathname.includes('/stores/collaborations/new');

    if (isPartnerDashboard && !window.location.search.includes('store_type=managed_store')) {
      return;
    }

    if (!isPartnerDashboard && !isDevDashboard) {
      return;
    }

    const settings = await getItem<AlfredSettings>('settings');
    const isPresetsEnabled = settings?.collaboratorAccess?.presets !== false;

    if (!isPresetsEnabled) {
      return;
    }

    const dashboardType: DashboardType = isPartnerDashboard ? 'partner' : 'dev';

    if (dashboardType === 'partner') {
      await injectScript('/libs/shopify-polaris.js', {
        keepInDom: true
      });
    }

    const adapter = dashboardType === 'partner' ? createPartnerAdapter() : createDevDashboardAdapter();
    let app: Record<string, unknown> | undefined;
    const anchor = dashboardType === 'partner' ? 'body' : '#collaboration-request-form';
    const append = dashboardType === 'partner' ? ('first' as const) : ('before' as const);

    const ui = createIntegratedUi(ctx, {
      position: 'inline',
      anchor,
      append,
      onMount: async (container) => {
        if (dashboardType === 'partner') {
          const target = await waitForElement(
            '#AppFrameMain form .Polaris-FormLayout__Item:nth-child(2) > .Polaris-Card > .Polaris-Card__Section:nth-child(2)'
          );
          if (!target) return;
          target.insertAdjacentElement('afterend', container);
        }

        const Component = dashboardType === 'partner' ? App : DevApp;
        app = mount(Component, { target: container, props: { adapter } });
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

    // Insert proxy buttons
    if (dashboardType === 'partner') {
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
    } else {
      const submitBtn = (await waitForElement('#collaboration-request-submit-button')) as HTMLButtonElement | null;

      const messageCard = await waitForElement('#collaboration-request-message');
      const formCard = messageCard?.closest('.card');
      if (formCard && submitBtn) {
        const bottomBar = document.createElement('div');
        bottomBar.className = 'flex justify-end gap-2 mt-4 max-w-[768px]';

        const bottomSaveBtn = document.createElement('button');
        bottomSaveBtn.type = 'button';
        bottomSaveBtn.textContent = 'Save preset';
        bottomSaveBtn.className = 'button button-variant-primary button-size-medium';
        bottomSaveBtn.addEventListener('click', (e) => {
          e.preventDefault();
          document.dispatchEvent(new CustomEvent('alfred:save-preset'));
        });

        const bottomSubmitBtn = document.createElement('button');
        bottomSubmitBtn.type = 'submit';
        bottomSubmitBtn.textContent = 'Request access';
        bottomSubmitBtn.setAttribute('form', 'collaboration-request-form');
        bottomSubmitBtn.className = 'button button-variant-primary button-size-medium';
        bottomSubmitBtn.disabled = submitBtn.disabled;

        const syncDisabled = () => {
          bottomSubmitBtn.disabled = submitBtn.disabled;
        };
        new MutationObserver(syncDisabled).observe(submitBtn, {
          attributes: true,
          attributeFilter: ['disabled']
        });

        bottomBar.appendChild(bottomSaveBtn);
        bottomBar.appendChild(bottomSubmitBtn);
        formCard.insertAdjacentElement('afterend', bottomBar);
      }
    }

    ui.mount();

    browser.runtime.onMessage.addListener((event: { type: string }) => {
      if (event.type === 'MOUNT_UI') {
        ui.mount();
      }
    });
  }
});
