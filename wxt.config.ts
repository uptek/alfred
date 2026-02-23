import { defineConfig } from 'wxt';
import preact from '@preact/preset-vite';
import tailwindcss from '@tailwindcss/vite';

// See https://wxt.dev/api/config.html
export default defineConfig({
  modules: ['@wxt-dev/auto-icons'],
  manifest: {
    name: 'Alfred - Shopify Theme Detector',
    description:
      'Instantly detect themes on any Shopify store. Streamline your workflow with smart shortcuts and Shopify productivity tools.',
    version: '2026.02.23',
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
      }
    ]
  },
  vite: () => ({
    plugins: [preact(), tailwindcss()]
  }),
  webExt: {
    chromiumArgs: [
      '--user-data-dir=./.wxt/chrome-data',
      '--disable-infobars',
      '--disable-features=BlockThirdPartyCookies', // Allows third-party cookies
      // 'chrome-extension://lepphhjodhfojboecomikglfppimdkmj/options.html',
      // 'https://uptek.com',
      // 'https://junaid-workspace.myshopify.com/?pb=1&preview_theme_id=153167626454',
      // 'https://partners.shopify.com/1750954/stores/new?store_type=managed_store',
      'https://admin.shopify.com/store/junaid-workspace/themes'
    ]
  }
});
