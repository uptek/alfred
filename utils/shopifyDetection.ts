export type ShopifyGlobals = {
  Shopify?: { shop?: unknown };
  __st?: unknown;
};

/**
 * Detects a Shopify storefront from page globals. `window.Shopify` is set by an
 * early inline script, but `window.__st` comes from trekkie analytics, which
 * consent tooling can delay or block entirely — so `Shopify.shop` counts as an
 * equally strong signal (issue #82: stores read as non-Shopify without it).
 */
export function isShopifyStorefront(win: ShopifyGlobals): boolean {
  if (!win.Shopify) return false;
  return !!win.__st || typeof win.Shopify.shop === 'string';
}

/**
 * DOM-footprint Shopify sniff for contexts where page globals aren't
 * reachable (isolated-world content scripts) or set yet (early main-world
 * init). Cheap over exhaustive: callers refine with globals-based detection
 * when it becomes available.
 */
export function sniffShopifyDom(doc: Pick<Document, 'querySelector'>, hostname: string): boolean {
  return (
    hostname.endsWith('.myshopify.com') ||
    doc.querySelector(
      'script[src*="cdn.shopify.com"], link[href*="cdn.shopify.com"], ' +
        'script[src*="/cdn/shop/"], link[href*="/cdn/shop/"], ' +
        'meta[name^="shopify-"], #shopify-features'
    ) !== null
  );
}

/**
 * Strict counterpart to `sniffShopifyDom` for callers whose false-positive cost
 * is destructive and unrecoverable rather than a refreshable label. Matches only
 * markup Shopify itself renders into a storefront document, never a reference to
 * a Shopify-hosted asset, which any third-party page can carry.
 */
export function isDefinitelyShopifyStorefront(doc: Pick<Document, 'querySelector'>, hostname: string): boolean {
  return (
    hostname.endsWith('.myshopify.com') ||
    doc.querySelector(
      '#shopify-features, meta[name="shopify-checkout-api-token"], meta[name="shopify-digital-wallet"], ' +
        'link[href*="cdn.shopify.com"]'
    ) !== null
  );
}
