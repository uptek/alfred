/**
 * Resolve after the given number of milliseconds.
 * @param ms - Delay in milliseconds
 */
export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Wait for an element to appear in the DOM with retry logic.
 *
 * @param selector - The CSS selector to wait for
 * @param options - Options for waiting
 * @param options.timeout - Maximum time to wait in milliseconds (default: 10000)
 * @param options.interval - Interval between tries in milliseconds (default: 200)
 * @returns Promise that resolves to the element or null if not found
 */
export const waitForElement = (
  selector: string,
  options: {
    timeout?: number;
    interval?: number;
  } = {}
): Promise<Element | null> => {
  const { timeout = 10000, interval = 200 } = options;

  return new Promise((resolve) => {
    const startTime = Date.now();

    const checkElement = () => {
      const element = document.querySelector(selector);

      if (element) {
        resolve(element);
        return;
      }

      if (Date.now() - startTime >= timeout) {
        console.warn(`Element ${selector} not found after ${timeout}ms timeout`);
        resolve(null);
        return;
      }

      // Use setTimeout instead of requestAnimationFrame for consistent intervals
      setTimeout(checkElement, interval);
    };

    checkElement();
  });
};

let cachedUserId: string | null = null;

/**
 * Generate or retrieve a persistent anonymous user ID.
 * Caches in memory so a storage failure never fragments one user into many.
 */
export async function getUserId(): Promise<string> {
  if (cachedUserId) return cachedUserId;

  try {
    const userId = await storage.getItem<string>('local:user_id');
    if (userId) {
      cachedUserId = userId;
      return userId;
    }

    const newUserId = crypto.randomUUID();
    await storage.setItem('local:user_id', newUserId);
    cachedUserId = newUserId;
    return newUserId;
  } catch {
    cachedUserId = cachedUserId ?? crypto.randomUUID();
    return cachedUserId;
  }
}

/**
 * Get extension version
 * @returns Promise that resolves to the version or null
 */
export function getVersion(): string | null {
  try {
    const manifest = browser.runtime.getManifest();
    return manifest.version || null;
  } catch {
    return null;
  }
}
