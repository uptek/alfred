import type { AnalyticsAction } from './analytics-actions';

/**
 * The extension's message contract. Every cross-context message — popup or
 * background to a content script (`TabMessage`) and any context to the
 * background service worker (`RuntimeMessage`) — is declared here, so adding
 * a field or an action is a type error everywhere it isn't handled.
 * Wire shapes are unchanged: `{ action, ...payload }` objects.
 */

/** Tab-directed actions that carry no payload. */
type PayloadlessTabAction =
  | 'open_cartograph'
  | 'get_theme'
  | 'get_shopify_context'
  | 'sniff_shopify'
  | 'get_headings'
  | 'get_schema'
  | 'get_hreflangs'
  | 'get_links'
  | 'get_assets'
  | 'get_images'
  | 'get_robots'
  | 'get_overview'
  | 'get_social'
  | 'get_overview_network'
  | 'get_llms_txt'
  | 'get_sitemaps';

/** Payload carried by each tab-directed message that has one, keyed by action. */
export interface TabActionPayloads {
  alfred_toast: { message: string; toastType: 'success' | 'error' };
  get_sitemap_urls: { url: string };
  search_sitemap_urls: { urls: string[]; query: string };
  highlight_links: { enabled: boolean };
  scroll_to_link: { index: number };
  scroll_to_heading: { index: number };
  highlight_images: { enabled: boolean };
  scroll_to_image: { index: number };
}

export type TabAction = PayloadlessTabAction | keyof TabActionPayloads;

/** Discriminated union of every message a content script can receive. */
export type TabMessage =
  | { [A in PayloadlessTabAction]: { action: A } }[PayloadlessTabAction]
  | { [A in keyof TabActionPayloads]: { action: A } & TabActionPayloads[A] }[keyof TabActionPayloads];

/** Payload args tuple: actions with no payload take no payload argument. */
export type TabPayloadArgs<A extends TabAction> = A extends keyof TabActionPayloads
  ? [payload: TabActionPayloads[A]]
  : [];

/**
 * Sends a typed message to a tab's content script and returns the raw response.
 * @param tabId - The target tab.
 * @param action - The message action the content script switches on.
 * @param payload - The action's payload, when it has one.
 */
export function sendTabMessage<A extends TabAction>(
  tabId: number,
  action: A,
  ...payload: TabPayloadArgs<A>
): Promise<unknown> {
  return browser.tabs.sendMessage(tabId, { action, ...payload[0] });
}

/** Messages addressed to the background service worker, discriminated on `type`. */
export type RuntimeMessage =
  | {
      type: 'track_action';
      action: AnalyticsAction;
      metadata?: Record<string, unknown> | undefined;
    }
  | { type: 'check_link_status'; url: string };

/**
 * Sends a typed message to the background service worker.
 * @param message - The runtime message.
 */
export function sendRuntimeMessage(message: RuntimeMessage): Promise<unknown> {
  return browser.runtime.sendMessage(message);
}
