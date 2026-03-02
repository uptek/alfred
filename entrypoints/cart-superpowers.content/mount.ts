import { createIntegratedUi } from '#imports';
import type { ContentScriptContext } from '#imports';
import { mount, unmount } from 'svelte';
import App from './App.svelte';

export async function mountCartSuperpowers(ctx: ContentScriptContext, onClose: () => void) {
  // Inject cart API world script into the main world before mounting UI
  const script = document.createElement('script');
  script.src = browser.runtime.getURL('/cart-superpowers-world.js');
  document.documentElement.appendChild(script);
  await new Promise((resolve) => script.addEventListener('load', resolve));
  let app: Record<string, unknown> | undefined;

  const ui = createIntegratedUi(ctx, {
    position: 'inline',
    anchor: 'body',
    onMount: (container) => {
      app = mount(App, {
        target: container,
        props: {
          onClose: () => {
            ui.remove();
            onClose();
          },
        },
      });
    },
    onRemove: () => {
      if (app) {
        unmount(app);
        app = undefined;
      }
      onClose();
    },
  });

  ui.mount();
}
