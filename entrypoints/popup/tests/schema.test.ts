import { describe, expect, it } from 'bun:test';
import { analyzeSchema, schemaTypeName, summarizeSchema } from '../utils/schema';
import type { RawSchemaBlock, SchemaAnalysis, SchemaEntity, SummaryItem } from '../utils/types';

function block(value: unknown, index = 0): RawSchemaBlock {
  return { index, raw: JSON.stringify(value), parseError: null, placement: 'head' };
}

const ctx = 'https://schema.org';
const org = { '@type': 'Organization', name: 'Acme' };
const site = { '@type': 'WebSite', name: 'Acme' };

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

describe('analyzeSchema', () => {
  it('returns nothing for no blocks', () => {
    expect(analyzeSchema([])).toEqual({ entities: [], invalidBlocks: [] });
  });

  // Each entity as [type, blockIndex, @context].
  it.each<[string, RawSchemaBlock[], [string, number, unknown][]]>([
    [
      'lifts each top-level block into its own entity',
      [block(org, 0), block(site, 1)],
      [
        ['Organization', 0, undefined],
        ['WebSite', 1, undefined]
      ]
    ],
    [
      'flattens @graph members under the block index, copying the wrapper @context only where one is missing',
      [block({ '@context': ctx, '@graph': [org, { ...site, '@context': 'http://schema.org' }] }, 3)],
      [
        ['Organization', 3, ctx],
        ['WebSite', 3, 'http://schema.org']
      ]
    ],
    [
      'flattens a top-level JSON array',
      [block([org, product])],
      [
        ['Organization', 0, undefined],
        ['Product', 0, 'https://schema.org/']
      ]
    ],
    [
      'expands a @graph whose value is a single node object',
      [block({ '@context': ctx, '@graph': org })],
      [['Organization', 0, ctx]]
    ],
    [
      'expands a @graph wrapper nested inside a top-level array',
      [block([{ '@context': ctx, '@graph': [org, site] }])],
      [
        ['Organization', 0, ctx],
        ['WebSite', 0, ctx]
      ]
    ]
  ])('%s', (_, blocks, expected) => {
    expect(analyzeSchema(blocks).entities.map((e) => [e.type, e.blockIndex, e.data['@context']])).toEqual(expected);
  });

  it('keeps the parsed node available for the code-block view', () => {
    expect(analyzeSchema([block(product)]).entities[0]!.data).toEqual(product);
  });

  it('records malformed blocks instead of throwing, preferring a preset parseError', () => {
    const preset: RawSchemaBlock = {
      index: 2,
      raw: '{ "@type": "Product", }',
      parseError: 'Unexpected token }',
      placement: 'body'
    };
    const unset: RawSchemaBlock = { index: 0, raw: 'not json at all', parseError: null, placement: 'head' };
    expect(analyzeSchema([preset, unset])).toEqual({
      entities: [],
      invalidBlocks: [
        { blockIndex: 2, error: 'Unexpected token }' },
        { blockIndex: 0, error: expect.any(String) }
      ]
    });
  });
});

describe('schemaTypeName', () => {
  it.each<[string, Record<string, unknown>, string]>([
    ['a plain string type', { '@type': 'Product' }, 'Product'],
    ['the local name of a full schema.org URL', { '@type': 'http://schema.org/Product' }, 'Product'],
    ['the first member of a @type array', { '@type': ['WebPage', 'FAQPage'] }, 'WebPage'],
    ['Unknown when @type is absent', { name: 'x' }, 'Unknown']
  ])('returns %s', (_, node, expected) => {
    expect(schemaTypeName(node)).toBe(expected);
  });
});

describe('summarizeSchema', () => {
  const entity = (type: string): SchemaEntity => ({ type, blockIndex: 0, data: {} });

  it.each<[string, SchemaAnalysis, SummaryItem[]]>([
    [
      'a singular type count for one entity',
      { entities: [entity('Product')], invalidBlocks: [] },
      [{ text: '1 type' }]
    ],
    [
      'a plural type count for two entities',
      { entities: [entity('Product'), entity('FAQPage')], invalidBlocks: [] },
      [{ text: '2 types' }]
    ],
    ['the plural noun when nothing parsed', { entities: [], invalidBlocks: [] }, [{ text: '0 types' }]],
    [
      'an error item for blocks that failed to parse',
      { entities: [], invalidBlocks: [{ blockIndex: 0, error: 'Unexpected token' }] },
      [{ text: '0 types' }, { text: '1 invalid', tone: 'err', title: 'Blocks that failed to parse as JSON' }]
    ]
  ])('returns %s', (_, analysis, expected) => {
    expect(summarizeSchema(analysis)).toEqual(expected);
  });
});
