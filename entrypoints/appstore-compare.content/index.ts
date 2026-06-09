import { createIntegratedUi } from '#imports';
import { mount, unmount } from 'svelte';
import { getItem } from '~/utils/storage';
import { COMPARE_TRAY_LIMIT } from '~/utils/compareTray';
import App from './App.svelte';

const HANDLE_PATTERN = /^[a-z0-9][a-z0-9_-]*$/;

export default defineContentScript({
  matches: ['*://apps.shopify.com/compare/*'],
  async main(ctx) {
    // Check if compare apps is enabled
    const settings = await getItem<AlfredSettings>('settings');
    const isCompareAppsEnabled = settings?.appStore?.compareApps !== false;

    if (!isCompareAppsEnabled) {
      return; // Exit early if compare apps is disabled
    }

    const handles = [
      ...new Set(
        window.location.pathname
          .replace(/^\/compare\//, '')
          .split(',')
          .map((handle) => decodeURIComponent(handle).trim().toLowerCase())
          .filter((handle) => HANDLE_PATTERN.test(handle))
      )
    ].slice(0, COMPARE_TRAY_LIMIT);

    if (handles.length === 0) {
      return; // Leave the native 404 page untouched
    }

    // Take over the 404 page: keep the App Store header/footer, replace <main>
    const main = document.querySelector('main');

    if (!main) {
      return;
    }

    document.title = 'Compare apps · Shopify App Store';

    let app: Record<string, unknown> | undefined;

    const ui = createIntegratedUi(ctx, {
      position: 'inline',
      anchor: 'main',
      append: 'first',
      onMount: (container) => {
        app = mount(App, { target: container, props: { handles } });

        // Mount succeeded — now clear the native 404 content around us
        for (const child of Array.from(main.children)) {
          if (child !== container) {
            child.remove();
          }
        }

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
  }
});
