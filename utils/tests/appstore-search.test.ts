import { describe, expect, it } from 'bun:test';
import { getSearchStartingIndex } from '../appstore-search';

describe('getSearchStartingIndex', () => {
  // 24 results per page; a missing or malformed page counts as page 1.
  it.each([
    ['?q=bundles', 1],
    ['?q=bundles&page=2', 25],
    ['?q=bundles&page=3', 49],
    ['?page=abc', 1],
    ['?page=0', 1],
    ['?page=-2', 1]
  ])('%s starts at %d', (search, index) => {
    expect(getSearchStartingIndex(search)).toBe(index);
  });
});
