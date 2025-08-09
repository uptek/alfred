import { setupResizers } from './resizers.util';
import { setupInspector } from './inspector.util';

export default defineContentScript({
  matches: ['https://online-store-web.shopifyapps.com/*'],
  allFrames: true,
  async main() {
    setupResizers();
    setupInspector();
  },
});
