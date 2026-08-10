import { describe, expect, test } from 'bun:test';
import { isDefinitelyShopifyStorefront, isShopifyStorefront, sniffShopifyDom } from '../shopifyDetection';

/** Stands in for a Document, matching a selector list against a fixed set of present markers. */
const docWith = (...present: string[]) => ({
  querySelector: (selectors: string) =>
    selectors.split(', ').some((selector) => present.includes(selector.trim())) ? {} : null
});

describe('isShopifyStorefront', () => {
  test('false when window.Shopify is absent', () => {
    expect(isShopifyStorefront({})).toBe(false);
    expect(isShopifyStorefront({ __st: { a: 1 } })).toBe(false);
  });

  test('true with Shopify and __st', () => {
    expect(isShopifyStorefront({ Shopify: {}, __st: { a: 1 } })).toBe(true);
  });

  test('true with Shopify.shop when __st is blocked (issue #82)', () => {
    expect(isShopifyStorefront({ Shopify: { shop: 'acme.myshopify.com' } })).toBe(true);
  });

  test('false with bare Shopify global and no other signal', () => {
    expect(isShopifyStorefront({ Shopify: {} })).toBe(false);
    expect(isShopifyStorefront({ Shopify: { shop: 42 } })).toBe(false);
  });
});

describe('isDefinitelyShopifyStorefront', () => {
  test('true on markup only a storefront renders', () => {
    expect(isDefinitelyShopifyStorefront(docWith('#shopify-features'), 'shop.example')).toBe(true);
    expect(isDefinitelyShopifyStorefront(docWith('meta[name="shopify-checkout-api-token"]'), 'shop.example')).toBe(
      true
    );
    expect(isDefinitelyShopifyStorefront(docWith(), 'acme.myshopify.com')).toBe(true);
  });

  test('false on a page that merely loads a Shopify-hosted script', () => {
    // The loose sniff accepts this; the strict one must not, because callers
    // gate irreversible page patches on it.
    const embedder = docWith('script[src*="cdn.shopify.com"]');
    expect(sniffShopifyDom(embedder, 'unrelated.example')).toBe(true);
    expect(isDefinitelyShopifyStorefront(embedder, 'unrelated.example')).toBe(false);
  });

  test('false on an unrelated page with no Shopify markers', () => {
    expect(isDefinitelyShopifyStorefront(docWith(), 'docs.google.com')).toBe(false);
  });
});
