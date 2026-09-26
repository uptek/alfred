import { createIntegratedUi } from '#imports';
import { mount, unmount } from 'svelte';
import { getSettings, isEnabled } from '~/utils/settings';
import { waitForElement } from '@/utils/helpers';
import App from './App.svelte';
import type { ContentScriptContext } from '#imports';

const ALFRED_SENTINEL_ID = 'alfred-collaborator-access';

export default defineContentScript({
  matches: ['*://dev.shopify.com/dashboard/*'],
  async main(ctx) {
    const settings = await getSettings();
    const isPresetsEnabled = isEnabled(settings.collaboratorAccess.presets);

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
  const form = document.getElementById('collaboration-request-form');
  if (form && submitBtn) {
    // After the form, not inside it: the form's fieldset disables every control
    // in it while identity verification is pending, which would lock Save preset.
    const bottomBar = document.createElement('div');
    bottomBar.style.cssText = 'display:flex;justify-content:flex-end;gap:var(--ui-size-200);';

    const bottomSaveBtn = altairButton('Save preset', 'secondary');
    bottomSaveBtn.type = 'button';
    bottomSaveBtn.addEventListener('click', (e) => {
      e.preventDefault();
      document.dispatchEvent(new CustomEvent('alfred:save-preset'));
    });

    const bottomSubmitBtn = altairButton('Request access', 'primary');
    bottomSubmitBtn.type = 'submit';
    bottomSubmitBtn.setAttribute('form', 'collaboration-request-form');
    bottomSubmitBtn.disabled = submitBtn.disabled;

    const syncDisabled = () => {
      bottomSubmitBtn.disabled = submitBtn.disabled;
    };
    new MutationObserver(syncDisabled).observe(submitBtn, { attributes: true, attributeFilter: ['disabled'] });

    bottomBar.appendChild(bottomSaveBtn);
    bottomBar.appendChild(bottomSubmitBtn);
    form.insertAdjacentElement('afterend', bottomBar);
  }

  ui.mount();
}

/** Builds a button with the dashboard's Altair markup so it themes with the page. */
function altairButton(label: string, variant: 'primary' | 'secondary'): HTMLButtonElement {
  const button = document.createElement('button');
  button.className = `altair-button altair-button--${variant}`;
  button.dataset.altairComponent = 'Button';
  button.dataset.altairVariant = variant;
  button.dataset.altairSize = 'default';
  const content = document.createElement('span');
  content.className = 'altair-button__content';
  const text = document.createElement('span');
  text.className = 'altair-button__label';
  text.textContent = label;
  content.appendChild(text);
  button.appendChild(content);
  return button;
}
