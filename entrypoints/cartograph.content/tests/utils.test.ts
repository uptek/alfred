import { describe, expect, test } from 'bun:test';
import { entriesToRecord, formatMoney, recordToEntries, resolveProductPath } from '../utils';

const ORIGIN = 'https://shop.example.com';
const TEE = '/products/classic-tee.js';

describe('resolveProductPath', () => {
  test.each([
    ['classic-tee', TEE],
    ['/products/classic-tee', TEE],
    [`${ORIGIN}/products/classic-tee`, TEE],
    // The locale prefix stays so the fetch returns the same translation.
    ['/en/products/classic-tee', '/en/products/classic-tee.js'],
    ['/pt-br/products/classic-tee', '/pt-br/products/classic-tee.js'],
    // Collection context points at the same product.
    ['/collections/sale/products/classic-tee', TEE],
    ['/fr/collections/soldes/products/classic-tee', '/fr/products/classic-tee.js'],
    ['/products/classic-tee/', TEE],
    ['/products/classic-tee.js', TEE],
    [`${ORIGIN}/products/classic-tee?variant=123`, TEE],
    // Every non-product path is rejected, which is what scopes the fetch.
    ['/pages/about', null],
    ['/cart', null],
    ['/cart.js', null],
    ['/collections/sale', null],
    ['/admin/products/secret', null],
    ['/products/', null],
    ['/products/a/b', null],
    ['/', null],
    // A cross-origin URL is judged by its path, which is fetched same-origin either way.
    ['https://evil.example/cart.js', null],
    ['https://evil.example/products/classic-tee', TEE]
  ])('%s resolves to %p', (input, path) => {
    expect(resolveProductPath(input, ORIGIN)).toBe(path);
  });
});

describe('formatMoney', () => {
  test('formats cents in the cart currency rather than assuming dollars', () => {
    expect(formatMoney(4750, 'USD')).toBe('$47.50');
    expect(formatMoney(0, 'USD')).toBe('$0.00');
    expect(formatMoney(4750, 'EUR')).toContain('47.50');
    expect(formatMoney(4750, 'EUR')).not.toContain('$');
    expect(formatMoney(4750, 'JPY')).not.toContain('$');
  });

  test('falls back to a bare amount when the currency code is malformed', () => {
    expect(formatMoney(4750, 'NOT-A-CODE')).toBe('47.50 NOT-A-CODE');
  });
});

describe('entriesToRecord / recordToEntries', () => {
  test('round-trips a record and treats a null record as empty', () => {
    const record = { Size: 'L', Color: 'Blue' };
    expect(entriesToRecord(recordToEntries(record))).toEqual(record);
    expect(recordToEntries(null)).toEqual([]);
  });

  test('drops blank keys and trims the rest', () => {
    expect(
      entriesToRecord([
        { key: '  Size  ', value: 'L' },
        { key: '   ', value: 'ignored' }
      ])
    ).toEqual({ Size: 'L' });
  });
});
