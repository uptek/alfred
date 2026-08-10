import { createIntegratedUi } from '#imports';
import { mount, unmount } from 'svelte';
import { getCornerStack } from '~/utils/cornerStack';
import { getSettings, isEnabled } from '~/utils/settings';
import { initCompareButtons } from './buttons';
import Tray from './Tray.svelte';

export default defineContentScript({
  matches: ['*://apps.shopify.com/*'],
  async main(ctx) {
    // Check if compare apps is enabled
    const settings = await getSettings();
    const isCompareAppsEnabled = isEnabled(settings.appStore.compareApps);

    if (!isCompareAppsEnabled) {
      return; // Exit early if compare apps is disabled
    }

    let app: Record<string, unknown> | undefined;

    const ui = createIntegratedUi(ctx, {
      position: 'inline',
      anchor: 'body',
      append: 'last',
      onMount: (container) => {
        app = mount(Tray, { target: getCornerStack() });
        return container;
      },
      onRemove: (elements) => {
        void (async () => {
          if (app) {
            unmount(app);
            app = undefined;
          }
          const resolved = await elements;
          if (resolved) {
            (resolved as HTMLElement).remove();
          }
        })();
      }
    });

    ui.mount();

    const cleanupButtons = initCompareButtons();

    ctx.onInvalidated(() => {
      cleanupButtons();
    });
  }
});
