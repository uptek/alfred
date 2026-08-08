import { createIntegratedUi } from '#imports';
import { mount, unmount } from 'svelte';
import { getItem } from '~/utils/storage';
import { waitForElement } from '@/utils/helpers';
import App from './App.svelte';
import type { ContentScriptContext } from '#imports';

const ALFRED_SENTINEL_ID = 'alfred-collaborator-access';

export default defineContentScript({
  matches: ['*://dev.shopify.com/dashboard/*'],
  async main(ctx) {
    const settings = await getItem<AlfredSettings>('settings');
    const isPresetsEnabled = settings?.collaboratorAccess?.presets !== false;

    if (!isPresetsEnabled) {
      return;
    }

    await tryInject(ctx);

    let debounceTimer: ReturnType<typeof setTimeout>;
    const observer = new MutationObserver(() => {
      if (!isCollaborationNewPage()) return;
      if (document.getElementById(ALFRED_SENTINEL_ID)) return;
      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => tryInject(ctx), 200);
    });
    observer.observe(document.documentElement, { childList: true, subtree: true });
  }
});

function isCollaborationNewPage(): boolean {
  return window.location.pathname.includes('/stores/collaborations/new');
}

async function tryInject(ctx: ContentScriptContext) {
  if (!isCollaborationNewPage()) return;
  if (document.getElementById(ALFRED_SENTINEL_ID)) return;

  let app: Record<string, unknown> | undefined;

  const ui = createIntegratedUi(ctx, {
    position: 'inline',
    anchor: '#collaboration-request-form',
    append: 'before' as const,
    onMount: async (container) => {
      container.id = ALFRED_SENTINEL_ID;
      app = mount(App, { target: container });
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
    bottomSaveBtn.className = 'button button-variant-secondary button-size-medium';
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
