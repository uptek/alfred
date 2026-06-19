import { describe, expect, it } from 'bun:test';
import { analyzeSchema, schemaTypeName } from '../utils/schema';
import type { RawSchemaBlock } from '../utils/types';

function block(value: unknown, index = 0, placement: 'head' | 'body' = 'head'): RawSchemaBlock {
  return { index, raw: JSON.stringify(value), parseError: null, placement };
}

// A Product as Shopify themes emit it (single-variant form).
const product = {
  '@context': 'https://schema.org/',
  '@type': 'Product',
  name: 'Classic Tee',
  image: ['https://cdn.example.com/tee.jpg'],
  offers: {
    '@type': 'Offer',
    price: 19.99,
    priceCurrency: 'USD',
    availability: 'https://schema.org/InStock'
  }
};

describe('analyzeSchema — extraction & flattening', () => {
  it('returns nothing for no blocks', () => {
    expect(analyzeSchema([])).toEqual({ entities: [], invalidBlocks: [] });
  });

  it('lifts each top-level block into its own entity', () => {
    const org = { '@context': 'http://schema.org', '@type': 'Organization', name: 'Acme', url: 'https://acme.com' };
    const site = { '@type': 'WebSite', name: 'Acme', url: 'https://acme.com' };
    const { entities } = analyzeSchema([block(org, 0), block(site, 1)]);
    expect(entities.map((e) => e.type)).toEqual(['Organization', 'WebSite']);
    expect(entities.map((e) => e.blockIndex)).toEqual([0, 1]);
  });

  it('flattens a @graph into separate entities sharing the block index', () => {
    const graph = {
      '@context': 'https://schema.org',
      '@graph': [
        { '@type': 'Organization', name: 'Acme', url: 'https://acme.com' },
        { '@type': 'WebSite', name: 'Acme', url: 'https://acme.com' }
      ]
    };
    const { entities } = analyzeSchema([block(graph, 3)]);
    expect(entities.map((e) => e.type)).toEqual(['Organization', 'WebSite']);
    expect(entities.every((e) => e.blockIndex === 3)).toBe(true);
  });

  it('flattens a top-level JSON array into separate entities', () => {
    const arr = [{ '@type': 'Organization', name: 'Acme', url: 'https://acme.com' }, product];
    const { entities } = analyzeSchema([block(arr)]);
    expect(entities.map((e) => e.type)).toEqual(['Organization', 'Product']);
  });

  it('keeps the parsed node available for the code-block view', () => {
    const { entities } = analyzeSchema([block(product)]);
    expect(entities[0]!.data.name).toBe('Classic Tee');
  });

  it('records malformed blocks separately instead of throwing', () => {
    const bad: RawSchemaBlock = {
      index: 2,
      raw: '{ "@type": "Product", }',
      parseError: 'Unexpected token }',
      placement: 'body'
    };
    const { entities, invalidBlocks } = analyzeSchema([bad]);
    expect(entities).toEqual([]);
    expect(invalidBlocks).toEqual([{ blockIndex: 2, error: 'Unexpected token }' }]);
  });

  it('re-parses raw even when parseError was not pre-set, catching the error', () => {
    const bad: RawSchemaBlock = { index: 0, raw: 'not json at all', parseError: null, placement: 'head' };
    const { entities, invalidBlocks } = analyzeSchema([bad]);
    expect(entities).toEqual([]);
    expect(invalidBlocks).toHaveLength(1);
    expect(invalidBlocks[0]!.blockIndex).toBe(0);
  });
});

describe('schemaTypeName — @type normalization', () => {
  it('reads a plain string type', () => {
    expect(schemaTypeName({ '@type': 'Product' })).toBe('Product');
  });
  it('strips a full schema.org URL to its local name', () => {
    expect(schemaTypeName({ '@type': 'http://schema.org/Product' })).toBe('Product');
  });
  it('uses the first member of a @type array', () => {
    expect(schemaTypeName({ '@type': ['WebPage', 'FAQPage'] })).toBe('WebPage');
  });
  it('returns Unknown when @type is absent', () => {
    expect(schemaTypeName({ name: 'x' })).toBe('Unknown');
  });
});
