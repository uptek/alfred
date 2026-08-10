/**
 * Thin RPC layer over the active tab's content script. Every SEO tab fetches
 * its data and drives its on-page interactions through these two helpers, so
 * the `tabs.query` + `sendMessage` + unreachable-tab handling lives in one place.
 */
import { sendTabMessage, type TabAction, type TabPayloadArgs } from '@/utils/messages';

/**
 * Sends a one-off message to the active tab and returns the typed response,
 * or `fallback` when the tab is unreachable or the response fails `accept`.
 * @param action - The message action the content script switches on.
 * @param fallback - Value returned on any failure (no tab, threw, rejected by `accept`).
 * @param accept - Response guard; defaults to `Array.isArray` for list endpoints.
 * @param extra - Extra fields merged into the message (e.g. `{ url }`).
 */
const queryActive = () => browser.tabs.query({ active: true, currentWindow: true }).then(([tab]) => tab);
let activeTabPromise: ReturnType<typeof queryActive> | undefined;

/**
 * The popup's active tab, memoized for the popup's lifetime — the active tab
 * cannot change while the popup is open, and ~14 callers ask for it at startup.
 * A failed query is not cached so a transient error doesn't poison every caller.
 */
export function getActiveTab(): ReturnType<typeof queryActive> {
  if (!activeTabPromise) {
    activeTabPromise = queryActive();
    activeTabPromise.catch(() => {
      activeTabPromise = undefined;
    });
  }
  return activeTabPromise;
}

export async function queryActiveTab<T, A extends TabAction = TabAction>(
  action: A,
  fallback: T,
  accept: (response: unknown) => boolean = Array.isArray,
  ...payload: TabPayloadArgs<A>
): Promise<T> {
  try {
    const tab = await getActiveTab();
    if (tab?.id) {
      const response = await sendTabMessage(tab.id, action, ...payload);
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
 * @param payload - The action's payload, when it has one (e.g. `{ index }`, `{ enabled }`).
 */
export async function sendToActiveTab<A extends TabAction>(action: A, ...payload: TabPayloadArgs<A>): Promise<void> {
  try {
    const tab = await getActiveTab();
    if (tab?.id) {
      await sendTabMessage(tab.id, action, ...payload);
    }
  } catch {
    // silently fail if the content script is unreachable
  }
}
