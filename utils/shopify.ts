/**
 * Reads whether a tab is a Shopify storefront and its myshopify domain, in a single
 * MAIN-world script (the `window.Shopify` / `window.__st` page globals are only visible there).
 * The predicate inlines utils/shopifyDetection.ts isShopifyStorefront — the injected
 * function body is stringified into the page, so it cannot close over imports.
 *
 * Background-only: relies on `browser.scripting`. Returns `{ isShopify: false, shop: null }`
 * when the page is not a Shopify store or scripting fails (e.g. a restricted page).
 * @param tabId - The tab to inspect.
 * @returns Whether it's a Shopify store, plus the myshopify domain (e.g. `acme.myshopify.com`).
 */
export async function getShopifyStore(tabId: number): Promise<{ isShopify: boolean; shop: string | null }> {
  try {
    const results = await browser.scripting.executeScript({
      target: { tabId },
      func: () => {
        const win = window as unknown as { Shopify?: { shop?: unknown }; __st?: unknown };
        const shop = win.Shopify?.shop;
        return {
          isShopify: !!win.Shopify && (!!win.__st || typeof shop === 'string'),
          shop: typeof shop === 'string' && shop ? shop : null
        };
      },
      world: 'MAIN'
    });
    return results?.[0]?.result ?? { isShopify: false, shop: null };
  } catch {
    return { isShopify: false, shop: null };
  }
}
