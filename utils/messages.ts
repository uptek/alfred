import type { AnalyticsAction } from './analytics-actions';

/**
 * The extension's message contract. Every cross-context message — popup or
 * background to a content script (`TabMessage`) and any context to the
 * background service worker (`RuntimeMessage`) — is declared here, so adding
 * a field or an action is a type error everywhere it isn't handled.
 * Wire shapes are unchanged: `{ action, ...payload }` objects.
 */

/** Payload carried by each tab-directed message, keyed by action. */
export interface TabMessagePayloads {
  alfred_toast: { message: string; toastType: 'success' | 'error' };
  open_cartograph: Record<string, never>;
  get_theme: Record<string, never>;
  get_shopify_context: Record<string, never>;
  get_headings: Record<string, never>;
  get_schema: Record<string, never>;
  get_hreflangs: Record<string, never>;
  get_links: Record<string, never>;
  get_assets: Record<string, never>;
  get_images: Record<string, never>;
  get_robots: Record<string, never>;
  get_overview: Record<string, never>;
  get_social: Record<string, never>;
  get_overview_network: Record<string, never>;
  get_llms_txt: Record<string, never>;
  get_sitemaps: Record<string, never>;
  get_sitemap_urls: { url: string };
  search_sitemap_urls: { urls: string[]; query: string };
  highlight_links: { enabled: boolean };
  scroll_to_link: { index: number };
  scroll_to_heading: { index: number };
  highlight_images: { enabled: boolean };
  scroll_to_image: { index: number };
}

export type TabAction = keyof TabMessagePayloads;

/** Discriminated union of every message a content script can receive. */
export type TabMessage = {
  [A in TabAction]: { action: A } & TabMessagePayloads[A];
}[TabAction];

/** Payload args tuple: actions with an empty payload take no payload argument. */
export type TabPayloadArgs<A extends TabAction> = A extends TabAction
  ? TabMessagePayloads[A] extends Record<string, never>
    ? []
    : [payload: TabMessagePayloads[A]]
  : never;

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

/** Messages addressed to the background service worker. */
export type RuntimeMessage =
  | {
      type: 'track_action';
      action: AnalyticsAction;
      metadata?: Record<string, unknown> | undefined;
    }
  | { action: 'check_link_status'; url: string };

/**
 * Sends a typed message to the background service worker.
 * @param message - The runtime message.
 */
export function sendRuntimeMessage(message: RuntimeMessage): Promise<unknown> {
  return browser.runtime.sendMessage(message);
}
