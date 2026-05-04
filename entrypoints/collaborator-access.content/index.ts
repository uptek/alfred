import { createIntegratedUi } from '#imports';
import { mount, unmount } from 'svelte';
import { getItem } from '~/utils/storage';
import { waitForElement } from '@/utils/helpers';
import App from './App.svelte';
import DevApp from './DevApp.svelte';
import { createPartnerAdapter, createDevDashboardAdapter } from './adapters';
import type { ContentScriptContext } from '#imports';

const ALFRED_SENTINEL_ID = 'alfred-collaborator-access';

export default defineContentScript({
  matches: ['*://partners.shopify.com/*/stores/new*', '*://dev.shopify.com/dashboard/*/stores/collaborations/*'],
  async main(ctx) {
    const isPartnerDashboard = window.location.hostname === 'partners.shopify.com';
    const isDevDashboard = window.location.hostname === 'dev.shopify.com';

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

    if (isPartnerDashboard) {
      await setupPartnerDashboard(ctx);
    } else {
      await tryInjectDevDashboard(ctx);

      let debounceTimer: ReturnType<typeof setTimeout>;
      const observer = new MutationObserver(() => {
        if (!isCollaborationNewPage()) return;
        if (document.getElementById(ALFRED_SENTINEL_ID)) return;
        clearTimeout(debounceTimer);
        debounceTimer = setTimeout(() => tryInjectDevDashboard(ctx), 200);
      });
      observer.observe(document.documentElement, { childList: true, subtree: true });
    }

    browser.runtime.onMessage.addListener((event: { type: string }) => {
      if (event.type === 'MOUNT_UI') {
        if (isPartnerDashboard) setupPartnerDashboard(ctx);
        else tryInjectDevDashboard(ctx);
      }
    });
  }
});

function isCollaborationNewPage(): boolean {
  return window.location.pathname.includes('/stores/collaborations/new');
}

async function setupPartnerDashboard(ctx: ContentScriptContext) {
  await injectScript('/libs/shopify-polaris.js', { keepInDom: true });

  const adapter = createPartnerAdapter();
  let app: Record<string, unknown> | undefined;

  const ui = createIntegratedUi(ctx, {
    position: 'inline',
    anchor: 'body',
    append: 'first' as const,
    onMount: async (container) => {
      const target = await waitForElement(
        '#AppFrameMain form .Polaris-FormLayout__Item:nth-child(2) > .Polaris-Card > .Polaris-Card__Section:nth-child(2)'
      );
      if (!target) return;
      target.insertAdjacentElement('afterend', container);
      app = mount(App, { target: container, props: { adapter } });
      return { container };
    },
    onRemove: () => {
      if (app) {
        unmount(app);
        app = undefined;
      }
    }
  });

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

  ui.mount();
}

async function tryInjectDevDashboard(ctx: ContentScriptContext) {
  if (!isCollaborationNewPage()) return;
  if (document.getElementById(ALFRED_SENTINEL_ID)) return;

  const adapter = createDevDashboardAdapter();
  let app: Record<string, unknown> | undefined;

  const ui = createIntegratedUi(ctx, {
    position: 'inline',
    anchor: '#collaboration-request-form',
    append: 'before' as const,
    onMount: async (container) => {
      container.id = ALFRED_SENTINEL_ID;
      app = mount(DevApp, { target: container, props: { adapter } });
      return { container };
    },
    onRemove: () => {
      if (app) {
        unmount(app);
        app = undefined;
      }
    }
  });

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
    new MutationObserver(syncDisabled).observe(submitBtn, { attributes: true, attributeFilter: ['disabled'] });

    bottomBar.appendChild(bottomSaveBtn);
    bottomBar.appendChild(bottomSubmitBtn);
    formCard.insertAdjacentElement('afterend', bottomBar);
  }

  ui.mount();
}
