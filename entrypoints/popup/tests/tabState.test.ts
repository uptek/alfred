import { describe, expect, it } from 'bun:test';
import { isFreshFor, SCHEMA_VERSION, keyFor } from '../stores/tabState';

const blob = (over: Record<string, unknown> = {}) => ({
  v: SCHEMA_VERSION,
  url: 'https://example.com/page',
  activeSection: 'links',
  sections: { links: {} },
  ...over
});

describe('isFreshFor', () => {
  it('accepts a current-version blob for the same URL', () => {
    expect(isFreshFor(blob(), 'https://example.com/page')).toBe(true);
  });

  it('rejects a blob whose URL differs (tab navigated away)', () => {
    expect(isFreshFor(blob(), 'https://example.com/other')).toBe(false);
  });

  it('rejects a blob from an older schema version', () => {
    expect(isFreshFor(blob({ v: SCHEMA_VERSION - 1 }), 'https://example.com/page')).toBe(false);
  });

  it('rejects a blob missing its sections object', () => {
    expect(isFreshFor(blob({ sections: undefined }), 'https://example.com/page')).toBe(false);
    expect(isFreshFor(blob({ sections: null }), 'https://example.com/page')).toBe(false);
  });

  it('rejects null, undefined, and non-objects', () => {
    expect(isFreshFor(null, 'https://example.com/page')).toBe(false);
    expect(isFreshFor(undefined, 'https://example.com/page')).toBe(false);
    expect(isFreshFor('nope', 'https://example.com/page')).toBe(false);
  });
});

describe('keyFor', () => {
  it('namespaces the record per tab id under the session area', () => {
    expect(keyFor(42)).toBe('session:popupTabState:42');
  });
});
