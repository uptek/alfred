import { describe, expect, test } from 'bun:test';
import { isShopifyStorefront, sniffShopifyDom } from '../shopifyDetection';

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

describe('sniffShopifyDom', () => {
  test('true on a page that loads a Shopify-hosted script', () => {
    expect(sniffShopifyDom(docWith('script[src*="cdn.shopify.com"]'), 'unrelated.example')).toBe(true);
  });
});
