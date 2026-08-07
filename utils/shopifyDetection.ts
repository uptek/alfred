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
