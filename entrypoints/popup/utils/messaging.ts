/**
 * Thin RPC layer over the active tab's content script. Every SEO tab fetches
 * its data and drives its on-page interactions through these two helpers, so
 * the `tabs.query` + `sendMessage` + unreachable-tab handling lives in one place.
 */

/**
 * Sends a one-off message to the active tab and returns the typed response,
 * or `fallback` when the tab is unreachable or the response fails `accept`.
 * @param action - The message action the content script switches on.
 * @param fallback - Value returned on any failure (no tab, threw, rejected by `accept`).
 * @param accept - Response guard; defaults to `Array.isArray` for list endpoints.
 * @param extra - Extra fields merged into the message (e.g. `{ url }`).
 */
export async function queryActiveTab<T>(
  action: string,
  fallback: T,
  accept: (response: unknown) => boolean = Array.isArray,
  extra?: Record<string, unknown>
): Promise<T> {
  try {
    const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
    if (tab?.id) {
      const response = await browser.tabs.sendMessage(tab.id, { action, ...extra });
      return accept(response) ? (response as T) : fallback;
    }
    return fallback;
  } catch {
    return fallback;
  }
}

/**
 * Fires a message at the active tab for its side effect (scroll, highlight),
 * silently no-opping when the content script is unreachable.
 * @param action - The message action the content script switches on.
 * @param extra - Extra fields merged into the message (e.g. `{ index }`, `{ enabled }`).
 */
export async function sendToActiveTab(action: string, extra?: Record<string, unknown>): Promise<void> {
  try {
    const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
    if (tab?.id) {
      await browser.tabs.sendMessage(tab.id, { action, ...extra });
    }
  } catch {
    // silently fail if the content script is unreachable
  }
}
