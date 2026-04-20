import { defineConfig } from 'wxt';
import tailwindcss from '@tailwindcss/vite';

// See https://wxt.dev/api/config.html
export default defineConfig({
  modules: ['@wxt-dev/auto-icons', '@wxt-dev/module-svelte'],
  manifest: {
    name: 'Alfred - Shopify Theme Detector',
    description:
      'Instantly detect themes on any Shopify store. Streamline your workflow with smart shortcuts and Shopify productivity tools.',
    version: '2026.04.18',
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
