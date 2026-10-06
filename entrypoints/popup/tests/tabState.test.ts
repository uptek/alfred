import { describe, expect, test } from 'bun:test';
import { isFreshFor, SCHEMA_VERSION, keyFor } from '../stores/tabState';

const PAGE = 'https://example.com/page';
const blob = (over: Record<string, unknown> = {}) => ({ v: SCHEMA_VERSION, url: PAGE, sections: {}, ...over });

describe('isFreshFor', () => {
  test('accepts a current-version blob for the same URL', () => {
    expect(isFreshFor(blob(), PAGE)).toBe(true);
  });

  test.each([
    ['for another URL (tab navigated away)', blob({ url: 'https://example.com/other' })],
    ['from an older schema version', blob({ v: SCHEMA_VERSION - 1 })],
    ['missing its sections object', blob({ sections: undefined })],
    ['with null sections', blob({ sections: null })],
    ['that is null', null],
    ['that is undefined', undefined],
    ['that is not an object', 'nope']
  ])('rejects a blob %s', (_, value) => {
    expect(isFreshFor(value, PAGE)).toBe(false);
  });
});

describe('keyFor', () => {
  test('namespaces the record per tab id under the session area', () => {
    expect(keyFor(42)).toBe('session:popupTabState:42');
  });
});
