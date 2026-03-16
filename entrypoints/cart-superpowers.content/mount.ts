import { createShadowRootUi } from '#imports';
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

  const ui = await createShadowRootUi(ctx, {
    name: 'alfred-cart-superpowers',
    position: 'inline',
    anchor: 'body',
    isolateEvents: true,
    onMount: (uiContainer) => {
      app = mount(App, {
        target: uiContainer,
        props: {
          onClose: () => {
            ui.remove();
          }
        }
      });
      return app;
    },
    onRemove: () => {
      if (app) {
        unmount(app);
        app = undefined;
      }
      onClose();
    }
  });

  ui.mount();
}
