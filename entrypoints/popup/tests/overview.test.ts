import { describe, expect, test } from 'bun:test';
import {
  parseDirectives as pd,
  hasNoindex,
  hasNofollow,
  hasNosnippet,
  normalizeUrl,
  canonicalInfo,
  coreFindings,
  directiveFindings,
  technicalFindings,
  rawVsRenderedFindings,
  robotsTxtAllows,
  computeIndexability,
  detectPageType,
  shopifyFindings,
  schemaDates,
  socialProfiles,
  analyzeOverview
} from '../utils/overview';
import type {
  RawOverview,
  OverviewNetwork,
  RobotsResponse,
  ShopifyContext,
  RawLink,
  RawSchemaBlock
} from '../utils/types';

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
  ...over
});

const codes = (findings: { code: string }[]) => findings.map((f) => f.code);

describe('parseDirectives', () => {
  test('splits comma-separated meta robots into named directives', () => {
    const ds = pd(baseRaw({ robotsMeta: ['noindex, nofollow'] }), null);
    expect(ds).toEqual([
      { name: 'noindex', value: null, source: 'meta' },
      { name: 'nofollow', value: null, source: 'meta' }
    ]);
  });

  test('captures values, including colons inside unavailable_after dates', () => {
    const ds = pd(baseRaw({ robotsMeta: ['max-snippet:20, unavailable_after: 2026-12-01T00:00:00Z'] }), null);
    expect(ds).toEqual([
      { name: 'max-snippet', value: '20', source: 'meta' },
      { name: 'unavailable_after', value: '2026-12-01T00:00:00Z', source: 'meta' }
    ]);
  });

  test('reads googlebot meta and X-Robots-Tag header sources', () => {
    const ds = pd(baseRaw({ googlebotMeta: ['noindex'] }), baseNetwork({ xRobotsTag: 'noarchive' }));
    expect(ds).toContainEqual({ name: 'noindex', value: null, source: 'googlebot' });
    expect(ds).toContainEqual({ name: 'noarchive', value: null, source: 'header' });
  });

  test('unwraps bot-scoped X-Robots-Tag form "googlebot: noindex"', () => {
    const ds = pd(baseRaw(), baseNetwork({ xRobotsTag: 'googlebot: noindex, nofollow' }));
    expect(ds).toContainEqual({ name: 'noindex', value: null, source: 'header' });
    expect(ds).toContainEqual({ name: 'nofollow', value: null, source: 'header' });
  });

  test('drops the whole comma-separated list scoped to another bot', () => {
    const ds = pd(baseRaw(), baseNetwork({ xRobotsTag: 'otherbot: index, noindex' }));
    expect(ds).toEqual([]);
  });

  test('a new bot scope resets a prior scope mid-header', () => {
    const ds = pd(baseRaw(), baseNetwork({ xRobotsTag: 'otherbot: noindex, googlebot: nofollow, noarchive' }));
    expect(ds).toContainEqual({ name: 'nofollow', value: null, source: 'header' });
    expect(ds).toContainEqual({ name: 'noarchive', value: null, source: 'header' });
    expect(ds).not.toContainEqual({ name: 'noindex', value: null, source: 'header' });
  });

  test('returns empty for null inputs', () => {
    expect(pd(null, null)).toEqual([]);
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

  test('body canonicals never drive the canonical state', () => {
    const bodyOnly = baseRaw({
      canonicals: [{ raw: '/other', resolved: 'https://shop.example.com/other', inHead: false }]
    });
    expect(canonicalInfo(bodyOnly).kind).toBe('missing');

    const headWinsOverConflictingBody = baseRaw({
      canonicals: [
        { raw: '/products/widget', resolved: 'https://shop.example.com/products/widget', inHead: true },
        { raw: '/other', resolved: 'https://shop.example.com/other', inHead: false }
      ]
    });
    expect(canonicalInfo(headWinsOverConflictingBody).kind).toBe('self');
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

  test('ignores an empty title tag alongside a real one', () => {
    const raw = baseRaw({ titles: ['One title that is long enough here', ''] });
    const found = codes(coreFindings(raw, canonicalInfo(raw)));
    expect(found).not.toContain('title-multiple');
    expect(found).not.toContain('title-missing');
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

const baseShopify = (over: Partial<ShopifyContext> = {}): ShopifyContext => ({
  isShopify: true,
  pageType: 'product',
  resourceId: '123',
  shop: 'example.myshopify.com',
  locale: 'en',
  currency: 'USD',
  country: 'US',
  marketRoot: '/',
  themeRole: 'main',
  designMode: false,
  ...over
});

const robotsResponse = (content: string): RobotsResponse => ({
  ok: true,
  status: 200,
  content,
  finalUrl: 'https://shop.example.com/robots.txt',
  size: content.length,
  truncated: false
});

describe('directiveFindings', () => {
  test('noindex is error; nofollow and nosnippet are warnings', () => {
    const f = directiveFindings(pd(baseRaw({ robotsMeta: ['noindex, nofollow, nosnippet'] }), null));
    expect(f.find((x) => x.code === 'noindex')?.severity).toBe('error');
    expect(f.find((x) => x.code === 'nofollow')?.severity).toBe('warning');
    expect(f.find((x) => x.code === 'nosnippet')?.severity).toBe('warning');
    expect(f.find((x) => x.code === 'nosnippet')?.message).toContain('AI Overviews');
  });

  test('unavailable_after warns with the date; noai is info', () => {
    const f = directiveFindings(pd(baseRaw({ robotsMeta: ['unavailable_after: 2026-12-01, noai'] }), null));
    expect(f.find((x) => x.code === 'unavailable-after')?.message).toContain('2026-12-01');
    expect(f.find((x) => x.code === 'noai')?.severity).toBe('info');
  });

  test('meta and header disagreement on noindex is flagged', () => {
    const f = directiveFindings(pd(baseRaw({ robotsMeta: ['index, follow'] }), baseNetwork({ xRobotsTag: 'noindex' })));
    expect(f.map((x) => x.code)).toContain('robots-conflict');
  });

  test('header-only noindex is not a conflict', () => {
    const f = directiveFindings(pd(baseRaw(), baseNetwork({ xRobotsTag: 'noindex' })));
    expect(f.map((x) => x.code)).not.toContain('robots-conflict');
    expect(f.map((x) => x.code)).toContain('noindex');
  });

  test('clean directives produce nothing', () => {
    expect(directiveFindings(pd(baseRaw(), baseNetwork()))).toEqual([]);
  });
});

describe('technicalFindings', () => {
  test('clean page produces nothing', () => {
    expect(technicalFindings(baseRaw(), false, baseShopify())).toEqual([]);
  });

  test('missing viewport is error; user-scalable=no is warning', () => {
    expect(codes(technicalFindings(baseRaw({ viewport: null }), null, null))).toContain('viewport-missing');
    expect(
      codes(technicalFindings(baseRaw({ viewport: 'width=device-width, user-scalable=no' }), null, null))
    ).toContain('viewport-no-zoom');
  });

  test('missing lang and locale mismatch warn', () => {
    expect(codes(technicalFindings(baseRaw({ lang: '' }), null, null))).toContain('lang-missing');
    expect(codes(technicalFindings(baseRaw({ lang: 'de' }), null, baseShopify({ locale: 'en' })))).toContain(
      'lang-locale-mismatch'
    );
    expect(codes(technicalFindings(baseRaw({ lang: 'en-GB' }), null, baseShopify({ locale: 'en' })))).not.toContain(
      'lang-locale-mismatch'
    );
  });

  test('non-UTF8 charset and missing favicon warn', () => {
    expect(codes(technicalFindings(baseRaw({ charset: 'ISO-8859-1' }), null, null))).toContain('charset');
    expect(codes(technicalFindings(baseRaw({ faviconHref: null }), null, null))).toContain('favicon-missing');
  });

  test('word count bands: <100 warning, <300 info, 300+ nothing', () => {
    const thin = technicalFindings(baseRaw({ wordCount: 42 }), null, null);
    expect(thin.find((f) => f.code === 'thin-content')?.severity).toBe('warning');
    const light = technicalFindings(baseRaw({ wordCount: 200 }), null, null);
    expect(light.find((f) => f.code === 'thin-content')?.severity).toBe('info');
    expect(codes(technicalFindings(baseRaw({ wordCount: 500 }), null, null))).not.toContain('thin-content');
  });

  test('llms.txt presence is info; inverted dates are info', () => {
    expect(codes(technicalFindings(baseRaw(), true, null))).toContain('llms-txt');
    expect(
      codes(
        technicalFindings(
          baseRaw({ publishedTime: '2026-05-01T00:00:00Z', modifiedTime: '2026-01-01T00:00:00Z' }),
          null,
          null
        )
      )
    ).toContain('dates-inverted');
  });
});

describe('rawVsRenderedFindings', () => {
  test('identical raw and rendered produce nothing', () => {
    expect(rawVsRenderedFindings(baseRaw(), baseNetwork())).toEqual([]);
  });

  test('JS-modified title/description are info; canonical/robots are warnings', () => {
    const f = rawVsRenderedFindings(
      baseRaw({ robotsMeta: ['noindex'] }),
      baseNetwork({
        rawTitle: 'Original server title for the widget page',
        rawDescription: 'B'.repeat(120),
        rawCanonical: 'https://shop.example.com/products/other',
        rawRobotsMeta: null
      })
    );
    expect(f.find((x) => x.code === 'title-js-modified')?.severity).toBe('info');
    expect(f.find((x) => x.code === 'description-js-modified')?.severity).toBe('info');
    expect(f.find((x) => x.code === 'canonical-js-modified')?.severity).toBe('warning');
    expect(f.find((x) => x.code === 'robots-js-modified')?.severity).toBe('warning');
  });

  test('skips comparison when the refetch failed or was non-200', () => {
    expect(rawVsRenderedFindings(baseRaw(), baseNetwork({ ok: false, status: 0 }))).toEqual([]);
    expect(rawVsRenderedFindings(baseRaw(), baseNetwork({ status: 403, rawTitle: 'Blocked' }))).toEqual([]);
  });
});

describe('robotsTxtAllows', () => {
  test('null when robots.txt missing, non-2xx, or HTML', () => {
    expect(robotsTxtAllows(null, 'https://a.com/x')).toBe(null);
    expect(robotsTxtAllows({ ...robotsResponse(''), status: 404 }, 'https://a.com/x')).toBe(null);
    expect(robotsTxtAllows(robotsResponse('<!doctype html><html></html>'), 'https://a.com/x')).toBe(null);
  });

  test('applies Googlebot matching to the page path', () => {
    const robots = robotsResponse('User-agent: *\nDisallow: /private/');
    expect(robotsTxtAllows(robots, 'https://a.com/private/page')).toBe(false);
    expect(robotsTxtAllows(robots, 'https://a.com/public')).toBe(true);
  });
});

describe('computeIndexability', () => {
  const cleanDs = pd(baseRaw(), null);

  test('indexable for a clean 200 page', () => {
    const v = computeIndexability(baseRaw(), baseNetwork(), cleanDs, canonicalInfo(baseRaw()), true);
    expect(v.status).toBe('indexable');
  });

  test('robots.txt server error yields unknown, not crawlable', () => {
    const v = computeIndexability(baseRaw(), baseNetwork(), cleanDs, canonicalInfo(baseRaw()), null, 'server');
    expect(v.status).toBe('unknown');
    expect(v.reasons[0]).toContain('server error');
  });

  test('missing canonical is not called OK in the reason', () => {
    const v = computeIndexability(baseRaw(), baseNetwork(), cleanDs, { kind: 'missing', href: null }, true);
    expect(v.status).toBe('indexable');
    expect(v.reasons[0]).not.toContain('canonical OK');
    expect(v.reasons[0]).toContain('no canonical');
  });

  test('non-HTTP pages are unknown, not indexable', () => {
    const v = computeIndexability(
      baseRaw({ url: 'file:///Users/x/page.html', navStatus: 0 }),
      null,
      cleanDs,
      { kind: 'missing', href: null },
      null
    );
    expect(v.status).toBe('unknown');
    expect(v.reasons[0]).toContain('Not an HTTP(S) page');
  });

  test('conflicting canonicals stay indexable but are not called OK', () => {
    const v = computeIndexability(
      baseRaw(),
      baseNetwork(),
      cleanDs,
      { kind: 'multiple', href: 'https://a.com/x' },
      true
    );
    expect(v.status).toBe('indexable');
    expect(v.reasons[0]).not.toContain('canonical OK');
    expect(v.reasons[0]).toContain('conflicting canonicals');
  });

  test('unknown status stays indexable but does not claim HTTP 200', () => {
    const v = computeIndexability(
      baseRaw({ navStatus: 0 }),
      baseNetwork({ ok: false, status: 0 }),
      cleanDs,
      canonicalInfo(baseRaw()),
      true
    );
    expect(v.status).toBe('indexable');
    expect(v.reasons[0]).not.toContain('HTTP 200');
    expect(v.reasons[0]).toContain('status unavailable');
  });

  test('non-2xx status wins', () => {
    const v = computeIndexability(baseRaw({ navStatus: 404 }), null, cleanDs, canonicalInfo(baseRaw()), true);
    expect(v.status).toBe('not-indexable');
    expect(v.reasons[0]).toContain('404');
  });

  test('noindex wins over canonical', () => {
    const ds = pd(baseRaw({ robotsMeta: ['noindex'] }), null);
    const v = computeIndexability(baseRaw(), baseNetwork(), ds, { kind: 'elsewhere', href: 'x' }, true);
    expect(v.status).toBe('not-indexable');
    expect(v.reasons[0]).toContain('noindex');
  });

  test('robots.txt block reports not-indexable with URL-only caveat', () => {
    const v = computeIndexability(baseRaw(), baseNetwork(), cleanDs, canonicalInfo(baseRaw()), false);
    expect(v.status).toBe('not-indexable');
    expect(v.reasons[0]).toContain('robots.txt');
  });

  test('canonical elsewhere yields canonicalized', () => {
    const v = computeIndexability(baseRaw(), baseNetwork(), cleanDs, { kind: 'elsewhere', href: 'x' }, true);
    expect(v.status).toBe('canonicalized');
  });

  test('unknown when raw data missing', () => {
    expect(computeIndexability(null, null, [], { kind: 'missing', href: null }, null).status).toBe('unknown');
  });
});

const mkLink = (href: string): RawLink => ({
  index: 0,
  href,
  text: '',
  rel: '',
  kind: 'external',
  isNofollow: false,
  isSponsored: false,
  isUgc: false,
  isImage: false,
  isHidden: false,
  isInsecure: false,
  isBrokenAnchor: false
});

const mkSchema = (raw: string): RawSchemaBlock => ({ index: 0, raw, parseError: null, placement: 'head' });

describe('detectPageType', () => {
  test('prefers the ShopifyAnalytics page type', () => {
    expect(detectPageType('https://a.com/whatever', 'collection')).toBe('collection');
  });

  test('falls back to URL patterns, including Markets locale prefixes', () => {
    expect(detectPageType('https://a.com/', null)).toBe('home');
    expect(detectPageType('https://a.com/products/x', null)).toBe('product');
    expect(detectPageType('https://a.com/collections/all/products/x', null)).toBe('product');
    expect(detectPageType('https://a.com/collections/sale', null)).toBe('collection');
    expect(detectPageType('https://a.com/blogs/news/hello-world', null)).toBe('article');
    expect(detectPageType('https://a.com/pages/about', null)).toBe('page');
    expect(detectPageType('https://a.com/cart', null)).toBe('cart');
    expect(detectPageType('https://a.com/password', null)).toBe('password');
    expect(detectPageType('https://a.com/fr/products/x', null)).toBe('product');
    expect(detectPageType('https://a.com/en-ca/', null)).toBe('home');
  });
});

describe('shopifyFindings', () => {
  test('empty for non-Shopify pages', () => {
    expect(shopifyFindings(baseRaw(), null, canonicalInfo(baseRaw()))).toEqual([]);
    expect(shopifyFindings(baseRaw(), baseShopify({ isShopify: false }), canonicalInfo(baseRaw()))).toEqual([]);
  });

  test('password page is an error', () => {
    const raw = baseRaw({ url: 'https://shop.example.com/password' });
    const f = shopifyFindings(raw, baseShopify({ pageType: 'password' }), canonicalInfo(raw));
    expect(f.find((x) => x.code === 'password-page')?.severity).toBe('error');
  });

  test('preview mode warns for preview_theme_id, non-main role, and design mode', () => {
    const previewUrl = baseRaw({ url: 'https://shop.example.com/?preview_theme_id=99' });
    expect(codes(shopifyFindings(previewUrl, baseShopify(), canonicalInfo(previewUrl)))).toContain('preview-mode');
    expect(
      codes(shopifyFindings(baseRaw(), baseShopify({ themeRole: 'unpublished' }), canonicalInfo(baseRaw())))
    ).toContain('preview-mode');
    expect(codes(shopifyFindings(baseRaw(), baseShopify({ designMode: true }), canonicalInfo(baseRaw())))).toContain(
      'preview-mode'
    );
  });

  test('warns when browsing on the myshopify.com domain', () => {
    const raw = baseRaw({
      url: 'https://example.myshopify.com/products/widget',
      canonicals: [{ raw: '/products/widget', resolved: 'https://example.myshopify.com/products/widget', inHead: true }]
    });
    expect(codes(shopifyFindings(raw, baseShopify(), canonicalInfo(raw)))).toContain('myshopify-domain');
  });

  test('collection-scoped product URL: info when canonical is bare, warning otherwise', () => {
    const good = baseRaw({
      url: 'https://shop.example.com/collections/sale/products/widget',
      canonicals: [{ raw: '/products/widget', resolved: 'https://shop.example.com/products/widget', inHead: true }]
    });
    expect(
      shopifyFindings(good, baseShopify(), canonicalInfo(good)).find((f) => f.code === 'nested-product-path')?.severity
    ).toBe('info');
    const bad = baseRaw({
      url: 'https://shop.example.com/collections/sale/products/widget',
      canonicals: [
        {
          raw: '/collections/sale/products/widget',
          resolved: 'https://shop.example.com/collections/sale/products/widget',
          inHead: true
        }
      ]
    });
    expect(codes(shopifyFindings(bad, baseShopify(), canonicalInfo(bad)))).toContain('nested-product-canonical');
  });

  test('warns when canonical keeps the variant parameter', () => {
    const raw = baseRaw({
      url: 'https://shop.example.com/products/widget?variant=42',
      canonicals: [
        {
          raw: '/products/widget?variant=42',
          resolved: 'https://shop.example.com/products/widget?variant=42',
          inHead: true
        }
      ]
    });
    expect(codes(shopifyFindings(raw, baseShopify(), canonicalInfo(raw)))).toContain('variant-canonical');
  });

  test('warns when page 2+ canonicalizes back to page 1', () => {
    const raw = baseRaw({
      url: 'https://shop.example.com/collections/sale?page=3',
      canonicals: [{ raw: '/collections/sale', resolved: 'https://shop.example.com/collections/sale', inHead: true }]
    });
    expect(codes(shopifyFindings(raw, baseShopify({ pageType: 'collection' }), canonicalInfo(raw)))).toContain(
      'pagination-canonical'
    );
    const selfCanonical = baseRaw({
      url: 'https://shop.example.com/collections/sale?page=3',
      canonicals: [
        { raw: '/collections/sale?page=3', resolved: 'https://shop.example.com/collections/sale?page=3', inHead: true }
      ]
    });
    expect(
      codes(shopifyFindings(selfCanonical, baseShopify({ pageType: 'collection' }), canonicalInfo(selfCanonical)))
    ).not.toContain('pagination-canonical');
  });

  test('filtered collection views are info', () => {
    const raw = baseRaw({ url: 'https://shop.example.com/collections/sale?filter.v.price.gte=10' });
    expect(codes(shopifyFindings(raw, baseShopify({ pageType: 'collection' }), canonicalInfo(raw)))).toContain(
      'filtered-collection'
    );
  });

  test('filtered collection canonical preserving filter state is a warning', () => {
    const raw = baseRaw({
      url: 'https://shop.example.com/collections/sale?filter.v.price.gte=10',
      canonicals: [
        {
          raw: '/collections/sale?filter.v.price.gte=10',
          resolved: 'https://shop.example.com/collections/sale?filter.v.price.gte=10',
          inHead: true
        }
      ]
    });
    const found = codes(shopifyFindings(raw, baseShopify({ pageType: 'collection' }), canonicalInfo(raw)));
    expect(found).toContain('filtered-collection-canonical');
    expect(found).not.toContain('filtered-collection');
  });

  test('tag path canonicalizing to itself is a warning, to the base collection is info', () => {
    const tagSelf = baseRaw({
      url: 'https://shop.example.com/collections/sale/red',
      canonicals: [
        { raw: '/collections/sale/red', resolved: 'https://shop.example.com/collections/sale/red', inHead: true }
      ]
    });
    expect(codes(shopifyFindings(tagSelf, baseShopify({ pageType: 'collection' }), canonicalInfo(tagSelf)))).toContain(
      'filtered-collection-canonical'
    );
    const tagBase = baseRaw({
      url: 'https://shop.example.com/collections/sale/red',
      canonicals: [{ raw: '/collections/sale', resolved: 'https://shop.example.com/collections/sale', inHead: true }]
    });
    expect(codes(shopifyFindings(tagBase, baseShopify({ pageType: 'collection' }), canonicalInfo(tagBase)))).toContain(
      'filtered-collection'
    );
  });
});

describe('schemaDates', () => {
  test('finds dates nested inside @graph', () => {
    const block = mkSchema(
      JSON.stringify({
        '@graph': [{ '@type': 'Article', datePublished: '2026-01-01', dateModified: '2026-02-01' }]
      })
    );
    expect(schemaDates([block])).toEqual({ published: '2026-01-01', modified: '2026-02-01' });
  });

  test('returns nulls when absent and skips malformed blocks', () => {
    expect(schemaDates([])).toEqual({ published: null, modified: null });
    expect(schemaDates([{ index: 0, raw: '{bad', parseError: 'x', placement: 'head' }])).toEqual({
      published: null,
      modified: null
    });
  });
});

describe('socialProfiles', () => {
  test('detects profile links and dedupes per network', () => {
    const profiles = socialProfiles([
      mkLink('https://www.facebook.com/example'),
      mkLink('https://facebook.com/example-two'),
      mkLink('https://www.instagram.com/example/'),
      mkLink('https://x.com/example'),
      mkLink('https://www.youtube.com/@example'),
      mkLink('https://www.tiktok.com/@example')
    ]);
    expect(profiles.map((p) => p.network)).toEqual(['Facebook', 'Instagram', 'X (Twitter)', 'YouTube', 'TikTok']);
  });

  test('ignores bare domains and share/intent links', () => {
    expect(
      socialProfiles([
        mkLink('https://www.facebook.com/'),
        mkLink('https://www.facebook.com/sharer/sharer.php?u=x'),
        mkLink('https://x.com/intent/tweet?text=hi')
      ])
    ).toEqual([]);
  });

  test('rejects lookalike domains that merely start with a social host name', () => {
    expect(
      socialProfiles([
        mkLink('https://pinterest.evil.example/account'),
        mkLink('https://facebook.com.evil.example/somepage')
      ])
    ).toEqual([]);
    expect(socialProfiles([mkLink('https://www.pinterest.co.uk/example/')]).map((p) => p.network)).toEqual([
      'Pinterest'
    ]);
  });

  test('ignores content and media routes on social hosts', () => {
    expect(
      socialProfiles([
        mkLink('https://www.youtube.com/watch?v=abc123'),
        mkLink('https://www.youtube.com/shorts/abc123'),
        mkLink('https://www.facebook.com/somepage/posts/12345'),
        mkLink('https://www.linkedin.com/pulse/some-article'),
        mkLink('https://x.com/someuser/status/12345'),
        mkLink('https://www.instagram.com/p/abc123/'),
        mkLink('https://www.tiktok.com/@someuser/video/12345'),
        mkLink('https://www.pinterest.com/pin/12345/')
      ])
    ).toEqual([]);
  });
});

describe('coverage: edge cases', () => {
  test('X-Robots-Tag scoped to other bots does not affect the verdict', () => {
    const ds = pd(baseRaw(), baseNetwork({ xRobotsTag: 'otherbot: noindex' }));
    expect(ds).toEqual([]);
    const scoped = pd(baseRaw(), baseNetwork({ xRobotsTag: 'googlebot: noindex' }));
    expect(scoped).toContainEqual({ name: 'noindex', value: null, source: 'header' });
  });

  test('whitespace-only title is treated as missing, matching description handling', () => {
    const raw = baseRaw({ titles: ['   '] });
    expect(codes(coreFindings(raw, canonicalInfo(raw)))).toContain('title-missing');
  });

  test('hasNofollow matches nofollow and none', () => {
    expect(hasNofollow([{ name: 'none', value: null, source: 'meta' }])).toBe(true);
    expect(hasNofollow([{ name: 'nofollow', value: null, source: 'header' }])).toBe(true);
    expect(hasNofollow([{ name: 'noindex', value: null, source: 'meta' }])).toBe(false);
  });

  test('normalizeUrl falls back to the raw input when it cannot be parsed', () => {
    expect(normalizeUrl('not a url')).toBe('not a url');
  });

  test('canonicalInfo treats an unparseable canonical target as multiple', () => {
    const raw = baseRaw({
      canonicals: [{ raw: 'not a url', resolved: 'not a url', inHead: true }]
    });
    expect(canonicalInfo(raw).kind).toBe('multiple');
  });

  test('technicalFindings: empty-string charset is not flagged, maximum-scale=1 blocks zoom', () => {
    expect(codes(technicalFindings(baseRaw({ charset: '' }), null, null))).not.toContain('charset');
    expect(
      codes(technicalFindings(baseRaw({ viewport: 'width=device-width, maximum-scale=1' }), null, null))
    ).toContain('viewport-no-zoom');
  });

  test('detectPageType: /search maps to searchresults, an unparseable URL yields null', () => {
    expect(detectPageType('https://a.com/search', null)).toBe('searchresults');
    expect(detectPageType('not a url', null)).toBe(null);
  });

  test('schemaDates finds a dateModified with no datePublished present', () => {
    const block = mkSchema(JSON.stringify({ '@type': 'Article', dateModified: '2026-04-01' }));
    expect(schemaDates([block])).toEqual({ published: null, modified: '2026-04-01' });
  });
});

describe('analyzeOverview', () => {
  test('assembles a clean analysis with zero errors', () => {
    const analysis = analyzeOverview(
      baseRaw(),
      baseNetwork(),
      baseShopify(),
      robotsResponse('User-agent: *\nAllow: /'),
      []
    );
    expect(analysis.indexability.status).toBe('indexable');
    expect(analysis.errorCount).toBe(0);
    expect(analysis.pageType).toBe('product');
    expect(analysis.title.length).toBeGreaterThan(0);
  });

  test('robots.txt 5xx makes the verdict unknown; 404 stays indexable', () => {
    const err = analyzeOverview(baseRaw(), baseNetwork(), null, { ...robotsResponse(''), status: 503 }, []);
    expect(err.indexability.status).toBe('unknown');
    const notFound = analyzeOverview(baseRaw(), baseNetwork(), null, { ...robotsResponse(''), status: 404 }, []);
    expect(notFound.indexability.status).toBe('indexable');
  });

  test('robots.txt 429 is treated as a server error', () => {
    const analysis = analyzeOverview(baseRaw(), baseNetwork(), null, { ...robotsResponse(''), status: 429 }, []);
    expect(analysis.indexability.status).toBe('unknown');
    expect(analysis.indexability.reasons[0]).toContain('server error');
  });

  test('robots.txt network failure reads as unfetchable, not a server error', () => {
    const analysis = analyzeOverview(
      baseRaw(),
      baseNetwork(),
      null,
      { ...robotsResponse(''), ok: false, status: 0 },
      []
    );
    expect(analysis.indexability.status).toBe('unknown');
    expect(analysis.indexability.reasons[0]).toContain('could not be fetched');
  });

  test('counts error findings and sorts findings by severity', () => {
    const raw = baseRaw({ titles: [], descriptions: [], robotsMeta: ['noindex'], canonicals: [] });
    const analysis = analyzeOverview(raw, null, null, null, []);
    expect(analysis.errorCount).toBe(3); // title-missing, description-missing, noindex
    const severities = analysis.findings.map((f) => f.severity);
    expect(severities.indexOf('info')).toBeGreaterThan(severities.lastIndexOf('error'));
  });

  test('errors with no visible UI representation are excluded from errorCount', () => {
    const raw = baseRaw({ titles: ['One', 'Two'], viewport: null });
    const analysis = analyzeOverview(raw, null, null, null, []);
    const errorCodes = analysis.findings.filter((f) => f.severity === 'error').map((f) => f.code);
    expect(errorCodes).toContain('title-multiple');
    expect(errorCodes).toContain('viewport-missing');
    expect(analysis.errorCount).toBe(0);
  });

  test('flags the noindex + robots-block and noindex + canonical conflicts', () => {
    const blockedNoindex = analyzeOverview(
      baseRaw({ url: 'https://shop.example.com/private/x', robotsMeta: ['noindex'], canonicals: [] }),
      null,
      null,
      robotsResponse('User-agent: *\nDisallow: /private/'),
      []
    );
    expect(codes(blockedNoindex.findings)).toContain('robots-noindex-conflict');

    const noindexCanonical = analyzeOverview(
      baseRaw({ url: 'https://shop.example.com/products/widget?variant=1', robotsMeta: ['noindex'] }),
      null,
      null,
      null,
      []
    );
    expect(codes(noindexCanonical.findings)).toContain('noindex-canonical-conflict');
  });

  test('password-protected store overrides an otherwise indexable verdict', () => {
    const raw = baseRaw({ url: 'https://shop.example.com/password', canonicals: [] });
    const analysis = analyzeOverview(raw, baseNetwork(), baseShopify({ pageType: 'password' }), null, []);
    expect(analysis.indexability.status).toBe('not-indexable');
    expect(codes(analysis.findings)).toContain('password-page');
  });

  test('falls back to schema dates when article meta is absent', () => {
    const analysis = analyzeOverview(baseRaw(), null, null, null, [
      mkSchema(JSON.stringify({ '@type': 'Article', datePublished: '2026-03-01' }))
    ]);
    expect(analysis.dates.published).toBe('2026-03-01');
  });
});
