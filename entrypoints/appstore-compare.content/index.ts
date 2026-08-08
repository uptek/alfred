import { createIntegratedUi } from '#imports';
import { mount, unmount } from 'svelte';
import { getItem } from '~/utils/storage';
import { COMPARE_TRAY_LIMIT, isAppHandle } from '~/utils/compareTray';
import App from './App.svelte';
import './style.css';

/** Lift the pre-paint curtain from style.css (shows whatever main holds). */
function revealMain() {
  document.documentElement.classList.add('alfred-compare-ready');
}

export default defineContentScript({
  matches: ['*://apps.shopify.com/compare/*'],
  async main(ctx) {
    // Check if compare apps is enabled
    const settings = await getItem<AlfredSettings>('settings');
    const isCompareAppsEnabled = settings?.appStore?.compareApps !== false;

    if (!isCompareAppsEnabled) {
      revealMain();
      return; // Exit early if compare apps is disabled
    }

    const handles = [
      ...new Set(
        window.location.pathname
          .replace(/^\/compare\//, '')
          .split(',')
          .map((handle) => decodeURIComponent(handle).trim().toLowerCase())
          .filter(isAppHandle)
      )
    ].slice(0, COMPARE_TRAY_LIMIT);

    if (handles.length === 0) {
      revealMain();
      return; // Leave the native 404 page untouched
    }

    // Take over the 404 page: keep the App Store header/footer, replace <main>
    const main = document.querySelector('main');

    if (!main) {
      revealMain();
      return;
    }

    // Load Shopify's Polaris web components (vendored, already used by the
    // options page) so the comparison UI can use s-* elements. Extension
    // resource URLs are exempt from the page CSP.
    if (!document.getElementById('alfred-polaris-web-components')) {
      const polaris = document.createElement('script');
      polaris.id = 'alfred-polaris-web-components';
      polaris.src = browser.runtime.getURL('/libs/shopify-polaris.js');
      document.head.appendChild(polaris);
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

        revealMain();
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
