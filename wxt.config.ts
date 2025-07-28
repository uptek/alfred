import { defineConfig } from 'wxt';
import preact from '@preact/preset-vite';

// See https://wxt.dev/api/config.html
export default defineConfig({
  modules: ['@wxt-dev/auto-icons'],
  manifest: {
    name: 'Alfred for Shopify',
    description: 'Make Shopify great again!',
    version: '2025.07.22.0',
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
    chromiumArgs: ['--user-data-dir=./.wxt/chrome-data', '--disable-infobars', 'https://admin.shopify.com/store/junaid-workspace/themes/151634247894/editor'],
  },
});
