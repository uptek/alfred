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
  // Firefox defaults to MV2, where WXT inlines injected scripts and page CSP blocks them
  manifestVersion: 3,
  hooks: {
    'build:manifestGenerated': (wxt, manifest) => {
      // Firefox rejects version parts with a leading zero (2026.11.05)
      if (wxt.config.browser === 'firefox') manifest.version = manifest.version.split('.').map(Number).join('.');
    }
  },
  zip: {
    // The sources zip goes to Mozilla's reviewers: keep untracked local files out of it
    excludeSources: ['temp/**', '*.tsbuildinfo']
  },
  manifest: ({ browser }) => ({
    name: 'Alfred - Shopify Theme Detector',
    description:
      'Instantly detect themes on any Shopify store. Streamline your workflow with smart shortcuts and Shopify productivity tools.',
    version: '2026.11.24',
    action: {
      default_title: 'Alfred'
    },
    permissions: [
      'alarms',
      'contextMenus',
      'scripting',
      'tabs',
      'activeTab',
      'storage',
      'webNavigation',
      // Firefox expires a page's user activation while the context menu is open, so the
      // "Copy ..." shortcuts write through the content script, which needs this to do so
      ...(browser === 'firefox' ? ['clipboardWrite'] : [])
    ],
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
    ],
    ...(browser === 'firefox' && {
      browser_specific_settings: {
        gecko: {
          id: 'alfred@alfredext.com',
          // CSS anchor positioning (tooltips in the Dev Dashboard and admin) landed in 147
          strict_min_version: '147.0',
          // Analytics events are sent only once the user grants technicalAndInteraction
          data_collection_permissions: { required: ['none'], optional: ['technicalAndInteraction'] }
        }
      }
    })
  }),
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
