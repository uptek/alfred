/**
 * Reads the active store's myshopify domain from a tab's `window.Shopify.shop`
 * (set by Shopify storefronts), running in the MAIN world so the page global is visible.
 *
 * Background-only: relies on `browser.scripting`. Returns null when the page is not a
 * Shopify store, the global is absent, or scripting fails (e.g. a restricted page).
 * @param tabId - The tab to read the store domain from.
 * @returns The myshopify domain (e.g. `acme.myshopify.com`), or null.
 */
export async function getStoreDomain(tabId: number): Promise<string | null> {
  try {
    const results = await browser.scripting.executeScript({
      target: { tabId },
      func: () => {
        const win = window as unknown as { Shopify?: { shop?: string } };
        return win.Shopify?.shop ?? null;
      },
      world: 'MAIN'
    });
    const shop = results?.[0]?.result;
    return typeof shop === 'string' && shop ? shop : null;
  } catch {
    return null;
  }
}
