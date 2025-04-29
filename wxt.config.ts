import { defineConfig } from 'wxt';
import preact from '@preact/preset-vite';

// See https://wxt.dev/api/config.html
export default defineConfig({
  vite: () => ({
    plugins: [preact()],
  }),
  webExt: {
    chromiumArgs: ['--user-data-dir=./.wxt/chrome-data'],
  }
});
