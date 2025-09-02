import { setupToggleSidebar } from './ToggleSidebar';

export default defineContentScript({
  matches: ['https://admin.shopify.com/*', 'https://*.myshopify.com/admin/*'],
  runAt: 'document_end',
  async main() {
    setupToggleSidebar();
  },
});
