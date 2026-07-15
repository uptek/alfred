import { describe, expect, test } from 'bun:test';
import {
  parseDirectives,
  hasNoindex,
  hasNosnippet,
  normalizeUrl,
  canonicalInfo,
  coreFindings
} from '../utils/overview';
import type { RawOverview, OverviewNetwork } from '../utils/types';

export const baseRaw = (over: Partial<RawOverview> = {}): RawOverview => ({
  url: 'https://shop.example.com/products/widget',
  titles: ['Widget — Example Shop, purveyor of fine widgets'],
  descriptions: ['A'.repeat(120)],
  robotsMeta: [],
  googlebotMeta: [],
  canonicals: [
    {
      raw: 'https://shop.example.com/products/widget',
      resolved: 'https://shop.example.com/products/widget',
      inHead: true
    }
  ],
  viewport: 'width=device-width, initial-scale=1',
  charset: 'UTF-8',
  lang: 'en',
  faviconHref: 'https://shop.example.com/favicon.ico',
  ogSiteName: 'Example Shop',
  publishedTime: null,
  modifiedTime: null,
  wordCount: 800,
  navStatus: 200,
  ...over
});

export const baseNetwork = (over: Partial<OverviewNetwork> = {}): OverviewNetwork => ({
  ok: true,
  status: 200,
  xRobotsTag: null,
  rawTitle: 'Widget — Example Shop, purveyor of fine widgets',
  rawDescription: 'A'.repeat(120),
  rawCanonical: 'https://shop.example.com/products/widget',
  rawRobotsMeta: null,
  llmsTxt: false,
  ...over
});

const codes = (findings: { code: string }[]) => findings.map((f) => f.code);

describe('parseDirectives', () => {
  test('splits comma-separated meta robots into named directives', () => {
    const ds = parseDirectives(baseRaw({ robotsMeta: ['noindex, nofollow'] }), null);
    expect(ds).toEqual([
      { name: 'noindex', value: null, source: 'meta' },
      { name: 'nofollow', value: null, source: 'meta' }
    ]);
  });

  test('captures values, including colons inside unavailable_after dates', () => {
    const ds = parseDirectives(
      baseRaw({ robotsMeta: ['max-snippet:20, unavailable_after: 2026-12-01T00:00:00Z'] }),
      null
    );
    expect(ds).toEqual([
      { name: 'max-snippet', value: '20', source: 'meta' },
      { name: 'unavailable_after', value: '2026-12-01T00:00:00Z', source: 'meta' }
    ]);
  });

  test('reads googlebot meta and X-Robots-Tag header sources', () => {
    const ds = parseDirectives(baseRaw({ googlebotMeta: ['noindex'] }), baseNetwork({ xRobotsTag: 'noarchive' }));
    expect(ds).toContainEqual({ name: 'noindex', value: null, source: 'googlebot' });
    expect(ds).toContainEqual({ name: 'noarchive', value: null, source: 'header' });
  });

  test('unwraps bot-scoped X-Robots-Tag form "googlebot: noindex"', () => {
    const ds = parseDirectives(baseRaw(), baseNetwork({ xRobotsTag: 'googlebot: noindex, nofollow' }));
    expect(ds).toContainEqual({ name: 'noindex', value: null, source: 'header' });
    expect(ds).toContainEqual({ name: 'nofollow', value: null, source: 'header' });
  });

  test('returns empty for null inputs', () => {
    expect(parseDirectives(null, null)).toEqual([]);
  });
});

describe('directive helpers', () => {
  test('hasNoindex matches noindex and none', () => {
    expect(hasNoindex([{ name: 'none', value: null, source: 'meta' }])).toBe(true);
    expect(hasNoindex([{ name: 'noindex', value: null, source: 'header' }])).toBe(true);
    expect(hasNoindex([{ name: 'nofollow', value: null, source: 'meta' }])).toBe(false);
  });

  test('hasNosnippet matches nosnippet and max-snippet:0', () => {
    expect(hasNosnippet([{ name: 'max-snippet', value: '0', source: 'meta' }])).toBe(true);
    expect(hasNosnippet([{ name: 'max-snippet', value: '20', source: 'meta' }])).toBe(false);
    expect(hasNosnippet([{ name: 'nosnippet', value: null, source: 'meta' }])).toBe(true);
  });
});

describe('normalizeUrl', () => {
  test('drops hash, collapses trailing slash, keeps query', () => {
    expect(normalizeUrl('https://a.com/path/#frag')).toBe('https://a.com/path');
    expect(normalizeUrl('https://a.com/')).toBe('https://a.com/');
    expect(normalizeUrl('https://a.com/p?page=2')).toBe('https://a.com/p?page=2');
  });
});

describe('canonicalInfo', () => {
  test('self when canonical matches the page URL', () => {
    expect(canonicalInfo(baseRaw())).toEqual({
      kind: 'self',
      href: 'https://shop.example.com/products/widget'
    });
  });

  test('elsewhere when same host, different path or query', () => {
    const raw = baseRaw({ url: 'https://shop.example.com/products/widget?variant=123' });
    expect(canonicalInfo(raw).kind).toBe('elsewhere');
  });

  test('cross-domain when host differs', () => {
    const raw = baseRaw({
      canonicals: [{ raw: 'https://other.com/x', resolved: 'https://other.com/x', inHead: true }]
    });
    expect(canonicalInfo(raw).kind).toBe('cross-domain');
  });

  test('missing when no canonical, multiple when conflicting targets', () => {
    expect(canonicalInfo(baseRaw({ canonicals: [] })).kind).toBe('missing');
    const raw = baseRaw({
      canonicals: [
        { raw: '/a', resolved: 'https://shop.example.com/a', inHead: true },
        { raw: '/b', resolved: 'https://shop.example.com/b', inHead: true }
      ]
    });
    expect(canonicalInfo(raw).kind).toBe('multiple');
  });

  test('duplicate canonicals pointing at the same URL are not "multiple"', () => {
    const raw = baseRaw({
      canonicals: [
        { raw: '/products/widget', resolved: 'https://shop.example.com/products/widget', inHead: true },
        { raw: '/products/widget', resolved: 'https://shop.example.com/products/widget', inHead: true }
      ]
    });
    expect(canonicalInfo(raw).kind).toBe('self');
  });
});

describe('coreFindings', () => {
  test('clean page produces no core findings', () => {
    const raw = baseRaw();
    expect(coreFindings(raw, canonicalInfo(raw))).toEqual([]);
  });

  test('flags missing title as error and short/long titles as warnings', () => {
    let raw = baseRaw({ titles: [] });
    expect(codes(coreFindings(raw, canonicalInfo(raw)))).toContain('title-missing');
    raw = baseRaw({ titles: ['Short'] });
    expect(codes(coreFindings(raw, canonicalInfo(raw)))).toContain('title-short');
    raw = baseRaw({ titles: ['X'.repeat(75)] });
    expect(codes(coreFindings(raw, canonicalInfo(raw)))).toContain('title-long');
  });

  test('flags multiple title tags as error', () => {
    const raw = baseRaw({ titles: ['One title that is long enough here', 'Second'] });
    expect(codes(coreFindings(raw, canonicalInfo(raw)))).toContain('title-multiple');
  });

  test('flags missing/short/long description', () => {
    expect(codes(coreFindings(baseRaw({ descriptions: [] }), canonicalInfo(baseRaw())))).toContain(
      'description-missing'
    );
    expect(codes(coreFindings(baseRaw({ descriptions: ['too short'] }), canonicalInfo(baseRaw())))).toContain(
      'description-short'
    );
    expect(codes(coreFindings(baseRaw({ descriptions: ['D'.repeat(200)] }), canonicalInfo(baseRaw())))).toContain(
      'description-long'
    );
  });

  test('flags canonical problems: relative, in body, http downgrade, multiple', () => {
    const relative = baseRaw({
      canonicals: [{ raw: '/products/widget', resolved: 'https://shop.example.com/products/widget', inHead: true }]
    });
    expect(codes(coreFindings(relative, canonicalInfo(relative)))).toContain('canonical-relative');

    const inBody = baseRaw({
      canonicals: [
        {
          raw: 'https://shop.example.com/products/widget',
          resolved: 'https://shop.example.com/products/widget',
          inHead: false
        }
      ]
    });
    expect(codes(coreFindings(inBody, canonicalInfo(inBody)))).toContain('canonical-in-body');

    const downgrade = baseRaw({
      canonicals: [
        {
          raw: 'http://shop.example.com/products/widget',
          resolved: 'http://shop.example.com/products/widget',
          inHead: true
        }
      ]
    });
    expect(codes(coreFindings(downgrade, canonicalInfo(downgrade)))).toContain('canonical-http-downgrade');

    const multi = baseRaw({
      canonicals: [
        { raw: '/a', resolved: 'https://shop.example.com/a', inHead: true },
        { raw: '/b', resolved: 'https://shop.example.com/b', inHead: true }
      ]
    });
    expect(codes(coreFindings(multi, canonicalInfo(multi)))).toContain('canonical-multiple');
  });

  test('canonical missing is info, elsewhere is info', () => {
    const missing = coreFindings(baseRaw({ canonicals: [] }), canonicalInfo(baseRaw({ canonicals: [] })));
    expect(missing.find((f) => f.code === 'canonical-missing')?.severity).toBe('info');
    const elsewhereRaw = baseRaw({ url: 'https://shop.example.com/products/widget?variant=1' });
    const elsewhere = coreFindings(elsewhereRaw, canonicalInfo(elsewhereRaw));
    expect(elsewhere.find((f) => f.code === 'canonical-elsewhere')?.severity).toBe('info');
  });
});
