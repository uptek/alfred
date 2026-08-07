import { defineConfig } from 'wxt';
import tailwindcss from '@tailwindcss/vite';

// See https://wxt.dev/api/config.html
export default defineConfig({
  modules: ['@wxt-dev/auto-icons', '@wxt-dev/module-svelte'],
  svelte: {
    vite: {
      onwarn(warning, handler) {
        // Polaris web components (<s-button> etc.) are interactive custom
        // elements; Svelte's a11y checks can't know that and flag every
        // click handler.
        if (warning.code.startsWith('a11y_') && /<s-[a-z-]+>/.test(warning.message)) return;
        // Theme.svelte keeps styles for sections that stay commented out
        // until their data sources exist (reviews, versions, perf, features).
        if (warning.code === 'css_unused_selector' && warning.filename?.endsWith('popup/Theme.svelte')) return;
        handler?.(warning);
      }
    }
  },
  manifest: {
    name: 'Alfred - Shopify Theme Detector',
    description:
      'Instantly detect themes on any Shopify store. Streamline your workflow with smart shortcuts and Shopify productivity tools.',
    version: '2026.08.08',
    action: {
      default_title: 'Alfred'
    },
    permissions: ['contextMenus', 'scripting', 'tabs', 'activeTab', 'storage', 'webNavigation'],
    host_permissions: ['<all_urls>'],
    web_accessible_resources: [
      {
        resources: ['alfred-main-world.js'],
        matches: ['<all_urls>']
      },
      {
        resources: ['alfred-toast.js'],
        matches: ['<all_urls>']
      },
      {
        resources: ['libs/shopify-polaris.js'],
        matches: ['<all_urls>']
      },
      {
        resources: ['cartograph-world.js'],
        matches: ['<all_urls>']
      },
      {
        resources: ['content-scripts/cartograph.css'],
        matches: ['<all_urls>']
      }
    ]
  },
  vite: () => ({
    plugins: [tailwindcss()]
  }),
  webExt: {
    chromiumArgs: [
      '--user-data-dir=./.wxt/chrome-data',
      '--disable-infobars',
      '--disable-features=BlockThirdPartyCookies', // Allows third-party cookies
      'https://theme-dawn-demo.myshopify.com/'
    ]
  }
});
