/**
 * Format a timestamp to a human readable time ago.
 *
 * @param timestamp - The timestamp to format
 * @returns The formatted time ago
 */
export const formatTimeAgo = (timestamp: number): string => {
  // If the timestamp is not a number, return "Just now"
  if (isNaN(timestamp)) {
    return 'Just now';
  }

  // If the timestamp is in the future, return "Just now"
  if (timestamp > Date.now()) {
    return 'Just now';
  }

  const now = Date.now();
  const diff = now - timestamp;

  const seconds = Math.floor(diff / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);
  const weeks = Math.floor(days / 7);
  const months = Math.floor(days / 30);
  const years = Math.floor(days / 365);

  if (years > 0) {
    return `${years} year${years > 1 ? 's' : ''} ago`;
  } else if (months > 0) {
    return `${months} month${months > 1 ? 's' : ''} ago`;
  } else if (weeks > 0) {
    return `${weeks} week${weeks > 1 ? 's' : ''} ago`;
  } else if (days > 0) {
    return `${days} day${days > 1 ? 's' : ''} ago`;
  } else if (hours > 0) {
    return `${hours} hour${hours > 1 ? 's' : ''} ago`;
  } else if (minutes > 0) {
    return `${minutes} minute${minutes > 1 ? 's' : ''} ago`;
  } else {
    return 'Just now';
  }
};

/**
 * Wait for an element to appear in the DOM with retry logic.
 *
 * @param selector - The CSS selector to wait for
 * @param options - Options for waiting
 * @param options.timeout - Maximum time to wait in milliseconds (default: 10000)
 * @param options.maxTries - Maximum number of tries (default: 50)
 * @param options.interval - Interval between tries in milliseconds (default: 200)
 * @returns Promise that resolves to the element or null if not found
 */
export const waitForElement = (
  selector: string,
  options: {
    timeout?: number;
    maxTries?: number;
    interval?: number;
  } = {}
): Promise<Element | null> => {
  const { timeout = 10000, maxTries = 50, interval = 200 } = options;

  return new Promise((resolve) => {
    const startTime = Date.now();
    let tries = 0;

    const checkElement = () => {
      tries++;
      const element = document.querySelector(selector);

      if (element) {
        resolve(element);
        return;
      }

      const elapsed = Date.now() - startTime;

      if (tries >= maxTries) {
        console.warn(`Element ${selector} not found after ${maxTries} tries`);
        resolve(null);
        return;
      }

      if (elapsed >= timeout) {
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

/**
 * Generate or retrieve a persistent anonymous user ID
 * @returns Promise that resolves to the user ID
 */
export async function getUserId(): Promise<string> {
  try {
    const userId = await storage.getItem<string>('local:user_id');
    if (userId) {
      return userId;
    }

    // Generate new UUID
    const newUserId = crypto.randomUUID();
    await storage.setItem('local:user_id', newUserId);
    return newUserId;
  } catch (error) {
    console.error('Failed to get user ID:', error);
    // Fallback to session-based ID
    return crypto.randomUUID();
  }
}

/**
 * Get extension version
 * @returns Promise that resolves to the version or null
 */
export async function getVersion(): Promise<string | null> {
  try {
    const manifest = browser.runtime.getManifest();
    return manifest.version || null;
  } catch {
    return null;
  }
}
