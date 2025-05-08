import { defineConfig } from 'wxt';
import preact from '@preact/preset-vite';

// See https://wxt.dev/api/config.html
export default defineConfig({
  modules: ['@wxt-dev/auto-icons'],
  manifest: {
    name: 'Shopkeeper',
    description: 'Make Shopify great again!',
    version: '1.0.0',
    action: {
      default_title: 'Shopkeeper',
    },
  },
  vite: () => ({
    plugins: [preact()],
  }),
  webExt: {
    chromiumArgs: ['--user-data-dir=./.wxt/chrome-data'],
  }
});
