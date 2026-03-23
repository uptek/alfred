import { createShadowRootUi } from '#imports';
import type { ContentScriptContext } from '#imports';
import { mount, unmount } from 'svelte';
import App from './App.svelte';

export async function mountCartograph(ctx: ContentScriptContext, onClose: () => void) {
  // Inject cart API world script into the main world before mounting UI
  const script = document.createElement('script');
  script.src = browser.runtime.getURL('/cartograph-world.js');
  document.documentElement.appendChild(script);
  await new Promise<void>((resolve, reject) => {
    script.addEventListener('load', () => resolve());
    script.addEventListener('error', () => reject(new Error('Failed to load cart API script')));
    setTimeout(() => reject(new Error('Cart API script load timed out')), 5000);
  });

  let app: Record<string, unknown> | undefined;

  const ui = await createShadowRootUi(ctx, {
    name: 'alfred-cartograph',
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
