import { defineWebExtConfig } from 'wxt';
import { existsSync } from 'fs';

const chromeBinary = process.env.CHROME_TESTING_BINARY;

export default defineWebExtConfig({
  binaries: {
    ...(chromeBinary && existsSync(chromeBinary) && { chrome: chromeBinary })
  }
});
