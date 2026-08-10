/**
 * Shipping rates are calculated asynchronously, so the main-world script polls
 * for them while the content script waits on the bridge. The poll budget stays
 * under the bridge timeout so a slow calculation reports as a shipping timeout,
 * which names the cause, rather than as a generic bridge timeout.
 */
export const SHIPPING_POLL_INTERVAL_MS = 500;
export const SHIPPING_POLL_BUDGET_MS = 25_000;
export const SHIPPING_TIMEOUT_MS = 30_000;

/**
 * Upper bound for the quantity steppers. Shopify caps line items by inventory
 * rather than a fixed number, so this only exists to keep a typo out of the
 * cart; call sites raise it to fit a line that already holds more.
 */
export const MAX_QUANTITY = 9999;

/**
 * A product handle reachable from a storefront URL. Themes link to the same
 * product through a locale prefix (`/en/products/x`) and from collection
 * context (`/collections/sale/products/x`), so both are accepted and the handle
 * is pulled out of whichever shape arrives.
 */
const PRODUCT_PATH = /^(\/[a-z]{2}(?:-[a-z]{2})?)?(?:\/collections\/[^/]+)?\/products\/([^/?#]+?)(?:\.js)?\/?$/i;

/**
 * Resolves a product URL, path, or bare handle to the `.js` path serving its
 * JSON. Returning null for everything that is not a product path is what keeps
 * the main-world fetch scoped to product endpoints. Any locale prefix carries
 * through, so the fetch returns the translation the input URL was showing.
 * @param input - A full URL, a path, or a bare product handle.
 * @param origin - Origin used to resolve a relative input.
 */
export function resolveProductPath(input: string, origin: string): string | null {
  let pathname: string;
  // Anything with a separator or a dot is a URL or path; the rest is a handle.
  if (input.includes('/') || input.includes('.')) {
    try {
      pathname = new URL(input, origin).pathname;
    } catch {
      return null;
    }
  } else {
    pathname = `/products/${input}`;
  }

  const match = PRODUCT_PATH.exec(pathname);
  if (!match) return null;
  return `${match[1] ?? ''}/products/${match[2]}.js`;
}

/**
 * Formats Shopify's integer cents in the cart's own currency.
 * @param cents - Amount in the currency's minor unit, as Shopify returns it.
 * @param currency - ISO 4217 code from `cart.currency`.
 */
export function formatMoney(cents: number, currency: string): string {
  const amount = cents / 100;
  try {
    return new Intl.NumberFormat(undefined, { style: 'currency', currency }).format(amount);
  } catch {
    // Intl throws RangeError on a malformed code; show the number over nothing.
    return `${amount.toFixed(2)} ${currency}`;
  }
}

/**
 * Convert an array of key-value entries to a Record, trimming keys.
 * Entries with empty keys are omitted.
 *
 * @param entries - Array of `{ key, value }` pairs from KeyValueEditor
 * @returns Record with trimmed keys mapped to their values
 */
export function entriesToRecord(entries: Array<{ key: string; value: string }>): Record<string, string> {
  const result: Record<string, string> = {};
  for (const { key, value } of entries) {
    if (key.trim()) result[key.trim()] = value;
  }
  return result;
}

/**
 * Convert a Record to an array of key-value entries.
 *
 * @param record - A string Record (e.g. line item properties, cart attributes), or null
 * @returns Array of `{ key, value }` pairs for use with KeyValueEditor
 */
export function recordToEntries(record: Record<string, string> | null): Array<{ key: string; value: string }> {
  if (!record) return [];
  return Object.entries(record).map(([key, value]) => ({ key, value }));
}
