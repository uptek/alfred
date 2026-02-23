import { defineWebExtConfig } from 'wxt';
import { existsSync } from 'fs';

const CHROME_TESTING_BINARY =
  '/Users/junaid/Workspace/binaries/chrome/mac_arm-145.0.7632.77/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing';

export default defineWebExtConfig({
  binaries: {
    ...(existsSync(CHROME_TESTING_BINARY) && { chrome: CHROME_TESTING_BINARY })
  }
});
