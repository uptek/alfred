import { describe, expect, test } from 'bun:test';
import { entriesToRecord, formatMoney, recordToEntries, resolveProductPath } from '../utils';

const ORIGIN = 'https://shop.example.com';
const resolve = (input: string) => resolveProductPath(input, ORIGIN);

describe('resolveProductPath', () => {
  test('accepts a bare handle, a path, and a full URL', () => {
    expect(resolve('classic-tee')).toBe('/products/classic-tee.js');
    expect(resolve('/products/classic-tee')).toBe('/products/classic-tee.js');
    expect(resolve(`${ORIGIN}/products/classic-tee`)).toBe('/products/classic-tee.js');
  });

  test('keeps the locale prefix so the fetch returns the same translation', () => {
    expect(resolve('/en/products/classic-tee')).toBe('/en/products/classic-tee.js');
    expect(resolve('/pt-br/products/classic-tee')).toBe('/pt-br/products/classic-tee.js');
  });

  test('strips collection context, which points at the same product', () => {
    expect(resolve('/collections/sale/products/classic-tee')).toBe('/products/classic-tee.js');
    expect(resolve('/fr/collections/soldes/products/classic-tee')).toBe('/fr/products/classic-tee.js');
  });

  test('tolerates a trailing slash, an existing .js, and a query string', () => {
    expect(resolve('/products/classic-tee/')).toBe('/products/classic-tee.js');
    expect(resolve('/products/classic-tee.js')).toBe('/products/classic-tee.js');
    expect(resolve(`${ORIGIN}/products/classic-tee?variant=123`)).toBe('/products/classic-tee.js');
  });

  test('rejects every non-product path, which is what scopes the fetch', () => {
    for (const input of [
      '/pages/about',
      '/cart',
      '/cart.js',
      '/collections/sale',
      '/admin/products/secret',
      '/products/',
      '/products/a/b',
      '/'
    ]) {
      expect(resolve(input)).toBeNull();
    }
  });

  test('rejects a cross-origin URL by its path, not its host', () => {
    // The path is what gets fetched, and it is fetched same-origin either way.
    expect(resolve('https://evil.example/cart.js')).toBeNull();
    expect(resolve('https://evil.example/products/classic-tee')).toBe('/products/classic-tee.js');
  });
});

describe('formatMoney', () => {
  test('formats cents in the given currency', () => {
    expect(formatMoney(4750, 'USD')).toBe('$47.50');
    expect(formatMoney(0, 'USD')).toBe('$0.00');
  });

  test('uses the cart currency rather than assuming dollars', () => {
    expect(formatMoney(4750, 'EUR')).toContain('47.50');
    expect(formatMoney(4750, 'EUR')).not.toContain('$');
    expect(formatMoney(4750, 'JPY')).not.toContain('$');
  });

  test('falls back to a bare amount when the currency code is malformed', () => {
    expect(formatMoney(4750, 'NOT-A-CODE')).toBe('47.50 NOT-A-CODE');
  });
});

describe('entriesToRecord / recordToEntries', () => {
  test('round-trips a record', () => {
    const record = { Size: 'L', Color: 'Blue' };
    expect(entriesToRecord(recordToEntries(record))).toEqual(record);
  });

  test('drops blank keys and trims the rest', () => {
    expect(
      entriesToRecord([
        { key: '  Size  ', value: 'L' },
        { key: '   ', value: 'ignored' }
      ])
    ).toEqual({ Size: 'L' });
  });

  test('treats a null record as empty', () => {
    expect(recordToEntries(null)).toEqual([]);
  });
});
