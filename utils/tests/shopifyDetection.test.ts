import { describe, expect, test } from 'bun:test';
import { isDefinitelyShopifyStorefront, isShopifyStorefront, sniffShopifyDom } from '../shopifyDetection';

/** Stands in for a Document, matching a selector list against a fixed set of present markers. */
const docWith = (...present: string[]) => ({
  querySelector: (selectors: string) =>
    selectors.split(', ').some((selector) => present.includes(selector.trim())) ? {} : null
});

describe('isShopifyStorefront', () => {
  test.each([
    [{}, false],
    [{ __st: { a: 1 } }, false],
    [{ Shopify: {}, __st: { a: 1 } }, true],
    // Shopify.shop alone counts when consent tooling blocks __st (issue #82)
    [{ Shopify: { shop: 'acme.myshopify.com' } }, true],
    [{ Shopify: {} }, false],
    [{ Shopify: { shop: 42 } }, false]
  ])('%j is %p', (win, expected) => {
    expect(isShopifyStorefront(win)).toBe(expected);
  });
});

describe('isDefinitelyShopifyStorefront', () => {
  test.each([
    [['#shopify-features'], 'shop.example', true],
    [['meta[name="shopify-checkout-api-token"]'], 'shop.example', true],
    [[], 'acme.myshopify.com', true],
    [[], 'docs.google.com', false]
  ])('markers %j on %s is %p', (markers, hostname, expected) => {
    expect(isDefinitelyShopifyStorefront(docWith(...markers), hostname)).toBe(expected);
  });

  test('false on a page that merely loads a Shopify-hosted script', () => {
    // The loose sniff accepts this; the strict one must not, because callers
    // gate irreversible page patches on it.
    const embedder = docWith('script[src*="cdn.shopify.com"]');
    expect(sniffShopifyDom(embedder, 'unrelated.example')).toBe(true);
    expect(isDefinitelyShopifyStorefront(embedder, 'unrelated.example')).toBe(false);
  });
});
