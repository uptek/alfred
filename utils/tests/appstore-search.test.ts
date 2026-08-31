import { describe, expect, it } from 'bun:test';
import { getSearchStartingIndex } from '../appstore-search';

describe('getSearchStartingIndex', () => {
  it('starts at 1 without a page param', () => {
    expect(getSearchStartingIndex('?q=bundles')).toBe(1);
  });

  it('offsets by 24 per page', () => {
    expect(getSearchStartingIndex('?q=bundles&page=2')).toBe(25);
    expect(getSearchStartingIndex('?q=bundles&page=3')).toBe(49);
  });

  it('falls back to page 1 for malformed values', () => {
    expect(getSearchStartingIndex('?page=abc')).toBe(1);
    expect(getSearchStartingIndex('?page=0')).toBe(1);
    expect(getSearchStartingIndex('?page=-2')).toBe(1);
  });

  it('is computed from the destination URL, not the current location', () => {
    const current = new URL('https://apps.shopify.com/search?q=bundles&page=2');
    const destination = new URL('https://apps.shopify.com/search?q=bundles&page=3');
    expect(getSearchStartingIndex(destination.search)).toBe(49);
    expect(getSearchStartingIndex(destination.search)).not.toBe(getSearchStartingIndex(current.search));
  });
});
