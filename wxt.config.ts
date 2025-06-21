import { defineConfig } from 'wxt';
import preact from '@preact/preset-vite';

// See https://wxt.dev/api/config.html
export default defineConfig({
  modules: ['@wxt-dev/auto-icons'],
  manifest: {
    name: 'Alfred for Shopify',
    description: 'Make Shopify great again!',
    version: '1.1.0',
    action: {
      default_title: 'Alfred',
    },
    permissions: ['contextMenus', 'scripting', 'tabs', 'activeTab', 'storage'],
    host_permissions: ['<all_urls>'],
    web_accessible_resources: [
      {
        resources: ['alfred-main-world.js'],
        matches: ['<all_urls>'],
      },
      {
        resources: ['libs/shopify-polaris-web-components.js'],
        matches: ['<all_urls>'],
      },
    ],
  },
  vite: () => ({
    plugins: [preact()],
  }),
  webExt: {
    chromiumArgs: ['--user-data-dir=./.wxt/chrome-data', '--disable-infobars', 'https://partners.shopify.com/1750954/stores/new?store_type=managed_store'],
  },
});
