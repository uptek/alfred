import { defineConfig } from 'wxt';
import preact from '@preact/preset-vite';

// See https://wxt.dev/api/config.html
export default defineConfig({
  modules: ['@wxt-dev/auto-icons'],
  manifest: {
    name: 'Shopkeeper for Shopify',
    description: 'Make Shopify great again!',
    version: '1.0.2',
    action: {
      default_title: 'Shopkeeper',
    },
    permissions: [
      'contextMenus',
      'scripting',
      'tabs'
    ],
    host_permissions: [
      "<all_urls>"
    ]
  },
  vite: () => ({
    plugins: [preact()],
  }),
  webExt: {
    chromiumArgs: ['--user-data-dir=./.wxt/chrome-data'],
  }
});
