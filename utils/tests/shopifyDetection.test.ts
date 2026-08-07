import { describe, expect, test } from 'bun:test';
import { isShopifyStorefront } from '../shopifyDetection';

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
