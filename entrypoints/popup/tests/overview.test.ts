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
  socialProfiles,
  analyzeOverview
} from '../utils/overview';
import type {
  CanonicalInfo,
  OverviewFinding,
  RawOverview,
  OverviewNetwork,
  RobotsDirective,
  RobotsResponse,
  ShopifyContext,
  RawLink
} from '../utils/types';

const SHOP = 'https://shop.example.com';
const PAGE = `${SHOP}/products/widget`;

/** Canonical tag whose href resolves against the product page. */
const canon = (raw: string, inHead = true) => ({ raw, resolved: new URL(raw, PAGE).href, inHead });

export const baseRaw = (over: Partial<RawOverview> = {}): RawOverview => ({
  url: PAGE,
  titles: ['Widget — Example Shop, purveyor of fine widgets'],
  descriptions: ['A'.repeat(120)],
  robotsMeta: [],
  googlebotMeta: [],
  canonicals: [canon(PAGE)],
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
  rawCanonical: PAGE,
  rawRobotsMeta: null,
  ...over
});

// Only the fields the analyzer reads.
const baseShopify = (over: Partial<ShopifyContext> = {}) =>
  ({
    isShopify: true,
    pageType: 'product',
    locale: 'en',
    themeRole: 'main',
    designMode: false,
    ...over
  }) as ShopifyContext;

const robots = (content: string, over: Partial<RobotsResponse> = {}) =>
  ({ ok: true, status: 200, content, ...over }) as RobotsResponse;

const d = (name: string, source = 'meta', value: string | null = null) => ({ name, value, source }) as RobotsDirective;
const h = (name: string) => d(name, 'header');
const DISALLOW_PRIVATE = robots('User-agent: *\nDisallow: /private/');

const codes = (findings: OverviewFinding[]) => findings.map((f) => f.code);
const sev = (findings: OverviewFinding[], code: string) => findings.find((f) => f.code === code)?.severity;

describe('parseDirectives', () => {
  test.each([
    ['splits comma-separated meta robots', { robotsMeta: ['noindex, nofollow'] }, null, [d('noindex'), d('nofollow')]],
    [
      'captures values, including colons inside unavailable_after dates',
      { robotsMeta: ['max-snippet:20, unavailable_after: 2026-12-01T00:00:00Z'] },
      null,
      [d('max-snippet', 'meta', '20'), d('unavailable_after', 'meta', '2026-12-01T00:00:00Z')]
    ],
    ['reads googlebot meta', { googlebotMeta: ['noindex'] }, 'noarchive', [d('noindex', 'googlebot'), h('noarchive')]],
    ['unwraps a googlebot-scoped header', {}, 'googlebot: noindex, nofollow', [h('noindex'), h('nofollow')]],
    ['drops the whole list scoped to another bot', {}, 'otherbot: index, noindex', []],
    [
      'a new bot scope resets the prior one',
      {},
      'otherbot: noindex, googlebot: nofollow, noarchive',
      [h('nofollow'), h('noarchive')]
    ]
  ])('%s', (_, over, xRobotsTag, expected) => {
    expect(pd(baseRaw(over), baseNetwork({ xRobotsTag }))).toEqual(expected);
  });

  test('returns empty for null inputs', () => {
    expect(pd(null, null)).toEqual([]);
  });
});

describe('directive helpers', () => {
  const helpers = { hasNoindex, hasNofollow, hasNosnippet };
  test.each([
    ['hasNoindex', 'none', null, true],
    ['hasNoindex', 'noindex', null, true],
    ['hasNoindex', 'nofollow', null, false],
    ['hasNofollow', 'none', null, true],
    ['hasNofollow', 'nofollow', null, true],
    ['hasNofollow', 'noindex', null, false],
    ['hasNosnippet', 'nosnippet', null, true],
    ['hasNosnippet', 'max-snippet', '0', true],
    ['hasNosnippet', 'max-snippet', '20', false]
  ] as const)('%s(%s:%p) is %p', (fn, name, value, expected) => {
    expect(helpers[fn]([d(name, 'meta', value)])).toBe(expected);
  });
});

describe('normalizeUrl', () => {
  test('normalizes parseable URLs and returns anything else as-is', () => {
    expect(normalizeUrl('https://a.com/path/#frag')).toBe('https://a.com/path');
    expect(normalizeUrl('not a url')).toBe('not a url');
  });
});

describe('canonicalInfo', () => {
  test('self when the canonical matches the page URL', () => {
    expect(canonicalInfo(baseRaw())).toEqual({ kind: 'self', href: PAGE });
  });

  test.each([
    ['elsewhere for the same host and a different URL', { url: `${PAGE}?variant=123` }, 'elsewhere'],
    ['cross-domain when the host differs', { canonicals: [canon('https://other.com/x')] }, 'cross-domain'],
    ['missing with no canonical', { canonicals: [] }, 'missing'],
    ['missing when the only canonical is in the body', { canonicals: [canon('/other', false)] }, 'missing'],
    ['multiple for conflicting targets', { canonicals: [canon('/a'), canon('/b')] }, 'multiple'],
    [
      'multiple for an unparseable URL',
      { canonicals: [{ raw: 'x', resolved: 'not a url', inHead: true }] },
      'multiple'
    ],
    ['self for duplicates pointing at one URL', { canonicals: [canon('/products/widget'), canon(PAGE)] }, 'self'],
    ['self when a head canonical conflicts with a body one', { canonicals: [canon(PAGE), canon('/x', false)] }, 'self']
  ])('%s', (_, over, kind) => {
    expect(canonicalInfo(baseRaw(over)).kind).toBe(kind);
  });
});

describe('coreFindings', () => {
  const core = (over: Partial<RawOverview>) => {
    const raw = baseRaw(over);
    return coreFindings(raw, canonicalInfo(raw));
  };

  test('clean page, even with an empty extra title tag, produces no core findings', () => {
    expect(core({})).toEqual([]);
    expect(core({ titles: ['One title that is long enough here', ''] })).toEqual([]);
  });

  test.each([
    ['no title', { titles: [] }, 'title-missing', 'error'],
    ['a whitespace-only title', { titles: ['   '] }, 'title-missing', 'error'],
    ['a short title', { titles: ['Short'] }, 'title-short', 'warning'],
    ['a long title', { titles: ['X'.repeat(75)] }, 'title-long', 'warning'],
    ['two title tags', { titles: ['One title that is long enough here', 'Second'] }, 'title-multiple', 'error'],
    ['no description', { descriptions: [] }, 'description-missing', 'error'],
    ['a short description', { descriptions: ['too short'] }, 'description-short', 'warning'],
    ['a long description', { descriptions: ['D'.repeat(200)] }, 'description-long', 'warning'],
    ['no canonical', { canonicals: [] }, 'canonical-missing', 'info'],
    ['a canonical to another URL', { url: `${PAGE}?variant=1` }, 'canonical-elsewhere', 'info'],
    ['conflicting canonicals', { canonicals: [canon('/a'), canon('/b')] }, 'canonical-multiple', 'error'],
    ['a relative canonical', { canonicals: [canon('/products/widget')] }, 'canonical-relative', 'warning'],
    ['a canonical in the body', { canonicals: [canon(PAGE, false)] }, 'canonical-in-body', 'warning'],
    ['an http canonical', { canonicals: [canon('http://shop.example.com/x')] }, 'canonical-http-downgrade', 'warning']
  ])('flags %s as %s (%s)', (_, over, code, severity) => {
    expect(sev(core(over), code)).toBe(severity);
  });
});

describe('directiveFindings', () => {
  const df = (robotsMeta: string[], xRobotsTag: string | null = null) =>
    directiveFindings(pd(baseRaw({ robotsMeta }), baseNetwork({ xRobotsTag })));

  test('noindex is error; nofollow and nosnippet are warnings', () => {
    const f = df(['noindex, nofollow, nosnippet']);
    expect(sev(f, 'noindex')).toBe('error');
    expect(sev(f, 'nofollow')).toBe('warning');
    expect(sev(f, 'nosnippet')).toBe('warning');
    expect(f.find((x) => x.code === 'nosnippet')?.message).toContain('AI Overviews');
  });

  test('unavailable_after warns with the date; noai is info', () => {
    const f = df(['unavailable_after: 2026-12-01, noai']);
    expect(f.find((x) => x.code === 'unavailable-after')?.message).toContain('2026-12-01');
    expect(sev(f, 'noai')).toBe('info');
  });

  test('flags meta and header disagreeing on noindex, but not a header-only noindex', () => {
    expect(codes(df(['index, follow'], 'noindex'))).toContain('robots-conflict');
    expect(codes(df([], 'noindex'))).toEqual(['noindex']);
  });

  test('clean directives produce nothing', () => {
    expect(df([])).toEqual([]);
  });
});

describe('technicalFindings', () => {
  test('clean page produces nothing', () => {
    expect(technicalFindings(baseRaw(), false, baseShopify())).toEqual([]);
  });

  test('llms.txt presence is info', () => {
    expect(sev(technicalFindings(baseRaw(), true, null), 'llms-txt')).toBe('info');
  });

  // The store locale is 'en' in every row.
  test.each([
    ['viewport-missing', 'error', { viewport: null }],
    ['viewport-no-zoom', 'warning', { viewport: 'width=device-width, user-scalable=no' }],
    ['viewport-no-zoom', 'warning', { viewport: 'width=device-width, maximum-scale=1' }],
    ['lang-missing', 'warning', { lang: '' }],
    ['lang-locale-mismatch', 'warning', { lang: 'de' }],
    ['lang-locale-mismatch', undefined, { lang: 'en-GB' }],
    ['charset', 'warning', { charset: 'ISO-8859-1' }],
    ['charset', undefined, { charset: '' }],
    ['favicon-missing', 'warning', { faviconHref: null }],
    ['thin-content', 'warning', { wordCount: 42 }],
    ['thin-content', 'info', { wordCount: 200 }],
    ['thin-content', undefined, { wordCount: 500 }],
    ['dates-inverted', 'info', { publishedTime: '2026-05-01T00:00:00Z', modifiedTime: '2026-01-01T00:00:00Z' }]
  ])('%s is %p for %p', (code, severity, over) => {
    expect(sev(technicalFindings(baseRaw(over), null, baseShopify()), code)).toBe(severity);
  });
});

describe('rawVsRenderedFindings', () => {
  test('identical raw and rendered produce nothing', () => {
    expect(rawVsRenderedFindings(baseRaw(), baseNetwork())).toEqual([]);
  });

  test('JS-modified title/description are info; canonical/robots are warnings', () => {
    const f = rawVsRenderedFindings(
      baseRaw({ robotsMeta: ['noindex'] }),
      baseNetwork({ rawTitle: 'Server title', rawDescription: 'B'.repeat(120), rawCanonical: `${SHOP}/products/other` })
    );
    expect(sev(f, 'title-js-modified')).toBe('info');
    expect(sev(f, 'description-js-modified')).toBe('info');
    expect(sev(f, 'canonical-js-modified')).toBe('warning');
    expect(sev(f, 'robots-js-modified')).toBe('warning');
  });

  test('skips comparison when the refetch failed or was non-200', () => {
    expect(rawVsRenderedFindings(baseRaw(), baseNetwork({ ok: false, status: 0, rawTitle: 'Failed' }))).toEqual([]);
    expect(rawVsRenderedFindings(baseRaw(), baseNetwork({ status: 403, rawTitle: 'Blocked' }))).toEqual([]);
  });
});

describe('robotsTxtAllows', () => {
  test('null when robots.txt missing, non-2xx, or HTML', () => {
    expect(robotsTxtAllows(null, 'https://a.com/x')).toBe(null);
    expect(robotsTxtAllows({ ...DISALLOW_PRIVATE, status: 404 }, 'https://a.com/private/x')).toBe(null);
    expect(robotsTxtAllows(robots('<!doctype html><html></html>'), 'https://a.com/x')).toBe(null);
  });

  test('applies Googlebot matching to the page path', () => {
    expect(robotsTxtAllows(DISALLOW_PRIVATE, 'https://a.com/private/page')).toBe(false);
    expect(robotsTxtAllows(DISALLOW_PRIVATE, 'https://a.com/public')).toBe(true);
  });
});

describe('computeIndexability', () => {
  const missing: CanonicalInfo = { kind: 'missing', href: null };
  const elsewhere: CanonicalInfo = { kind: 'elsewhere', href: 'x' };
  const multiple: CanonicalInfo = { kind: 'multiple', href: 'https://a.com/x' };
  const verdict = ({
    raw = baseRaw() as RawOverview | null,
    network = baseNetwork() as OverviewNetwork | null,
    ds = pd(baseRaw(), null),
    canonical = canonicalInfo(baseRaw()),
    allowed = true as boolean | null,
    error = undefined as 'server' | undefined
  }) => computeIndexability(raw, network, ds, canonical, allowed, error);

  // The optional last column is a phrase the reason must not contain.
  test.each([
    ['a clean 200 page', {}, 'indexable', 'canonical OK'],
    ['a missing canonical', { canonical: missing }, 'indexable', 'no canonical', 'canonical OK'],
    ['conflicting canonicals', { canonical: multiple }, 'indexable', 'conflicting canonicals', 'canonical OK'],
    [
      'an unavailable HTTP status',
      { raw: baseRaw({ navStatus: 0 }), network: baseNetwork({ ok: false, status: 0 }) },
      'indexable',
      'status unavailable',
      'HTTP 200'
    ],
    ['a robots.txt server error', { allowed: null, error: 'server' }, 'unknown', 'server error'],
    ['a non-HTTP page', { raw: baseRaw({ url: 'file:///Users/x/page.html' }) }, 'unknown', 'Not an HTTP(S)'],
    ['missing raw data', { raw: null }, 'unknown', 'Page data unavailable'],
    ['a non-2xx status', { raw: baseRaw({ navStatus: 404 }), network: null }, 'not-indexable', '404'],
    ['noindex over a canonical elsewhere', { ds: [d('noindex')], canonical: elsewhere }, 'not-indexable', 'noindex'],
    ['a robots.txt block', { allowed: false }, 'not-indexable', 'robots.txt'],
    ['a canonical elsewhere', { canonical: elsewhere }, 'canonicalized', 'Canonical points to x']
  ] as const)('%s yields %p', (_, args, status, reason, unclaimed: string | null = null) => {
    const v = verdict(args);
    expect(v.status).toBe(status);
    expect(v.reasons[0]).toContain(reason);
    if (unclaimed) expect(v.reasons[0]).not.toContain(unclaimed);
  });
});

describe('detectPageType', () => {
  test('prefers the ShopifyAnalytics page type', () => {
    expect(detectPageType('https://a.com/whatever', 'collection')).toBe('collection');
  });

  test.each([
    ['https://a.com/', 'home'],
    ['https://a.com/en-ca/', 'home'],
    ['https://a.com/products/x', 'product'],
    ['https://a.com/fr/products/x', 'product'],
    ['https://a.com/collections/all/products/x', 'product'],
    ['https://a.com/collections/sale', 'collection'],
    ['https://a.com/blogs/news/hello-world', 'article'],
    ['https://a.com/pages/about', 'page'],
    ['https://a.com/cart', 'cart'],
    ['https://a.com/search', 'searchresults'],
    ['https://a.com/password', 'password'],
    ['not a url', null]
  ])('falls back to the URL: %p is %p', (url, type) => {
    expect(detectPageType(url, null)).toBe(type);
  });
});

describe('shopifyFindings', () => {
  const FILTERED = '/collections/sale?filter.v.price.gte=10';
  const NESTED = '/collections/sale/products/widget';
  const COLLECTION = { pageType: 'collection' };

  test('empty for non-Shopify pages', () => {
    expect(shopifyFindings(baseRaw(), null, canonicalInfo(baseRaw()))).toEqual([]);
    expect(shopifyFindings(baseRaw(), baseShopify({ isShopify: false }), canonicalInfo(baseRaw()))).toEqual([]);
  });

  // A null canonical keeps the default one, which points at the bare product URL.
  test.each([
    ['/password', null, { pageType: 'password' }, 'password-page', 'error'],
    ['/?preview_theme_id=99', null, {}, 'preview-mode', 'warning'],
    ['/products/widget', null, { themeRole: 'unpublished' }, 'preview-mode', 'warning'],
    ['/products/widget', null, { designMode: true }, 'preview-mode', 'warning'],
    ['https://example.myshopify.com/products/widget', null, {}, 'myshopify-domain', 'warning'],
    [NESTED, null, {}, 'nested-product-path', 'info'],
    [NESTED, NESTED, {}, 'nested-product-canonical', 'warning'],
    ['/products/widget?variant=42', '/products/widget?variant=42', {}, 'variant-canonical', 'warning'],
    ['/collections/sale?page=3', '/collections/sale', COLLECTION, 'pagination-canonical', 'warning'],
    ['/collections/sale?page=3', '/collections/sale?page=3', COLLECTION, 'pagination-canonical', undefined],
    [FILTERED, null, COLLECTION, 'filtered-collection', 'info'],
    [FILTERED, FILTERED, COLLECTION, 'filtered-collection-canonical', 'warning'],
    [FILTERED, FILTERED, COLLECTION, 'filtered-collection', undefined],
    ['/collections/sale/red', '/collections/sale/red', COLLECTION, 'filtered-collection-canonical', 'warning'],
    ['/collections/sale/red', '/collections/sale', COLLECTION, 'filtered-collection', 'info']
  ])('%s with canonical %p and context %p: %s is %p', (path, canonical, ctx, code, severity) => {
    const raw = baseRaw({ url: new URL(path, SHOP).href, ...(canonical ? { canonicals: [canon(canonical)] } : {}) });
    expect(sev(shopifyFindings(raw, baseShopify(ctx), canonicalInfo(raw)), code)).toBe(severity);
  });
});

describe('socialProfiles', () => {
  const links = (...hrefs: string[]) => hrefs.map((href) => ({ href }) as RawLink);

  test('detects profile links and dedupes per network', () => {
    const networks = socialProfiles(
      links(
        'https://www.facebook.com/example',
        'https://facebook.com/example-two',
        'https://www.instagram.com/example/',
        'https://x.com/example',
        'https://www.youtube.com/@example',
        'https://www.tiktok.com/@example',
        'https://www.pinterest.co.uk/example/'
      )
    ).map((p) => p.network);
    expect(networks).toEqual(['Facebook', 'Instagram', 'X (Twitter)', 'YouTube', 'TikTok', 'Pinterest']);
  });

  test.each([
    // Bare domains and share/intent links
    'https://www.facebook.com/',
    'https://www.facebook.com/sharer/sharer.php?u=x',
    'https://x.com/intent/tweet?text=hi',
    // Lookalike hosts that merely start with a social host name
    'https://pinterest.evil.example/account',
    'https://facebook.com.evil.example/somepage',
    // Content and media routes on social hosts
    'https://www.youtube.com/watch?v=abc123',
    'https://www.youtube.com/shorts/abc123',
    'https://www.facebook.com/somepage/posts/12345',
    'https://www.linkedin.com/pulse/some-article',
    'https://x.com/someuser/status/12345',
    'https://www.instagram.com/p/abc123/',
    'https://www.tiktok.com/@someuser/video/12345',
    'https://www.pinterest.com/pin/12345/'
  ])('ignores %p', (href) => {
    expect(socialProfiles(links(href))).toEqual([]);
  });
});

describe('analyzeOverview', () => {
  test('assembles a clean analysis with zero errors', () => {
    const analysis = analyzeOverview(baseRaw(), baseNetwork(), baseShopify(), robots('User-agent: *\nAllow: /'));
    expect(analysis.indexability.status).toBe('indexable');
    expect(analysis.errorCount).toBe(0);
    expect(analysis.pageType).toBe('product');
    expect(analysis.title.length).toBeGreaterThan(0);
  });

  test.each([
    ['a 503', {}, { status: 503 }, 'unknown', 'server error'],
    ['a 503 on a canonicalized page', { url: `${PAGE}?variant=123` }, { status: 503 }, 'unknown', 'server error'],
    ['a 429', {}, { status: 429 }, 'unknown', 'server error'],
    ['a network failure', {}, { ok: false, status: 0 }, 'unknown', 'could not be fetched'],
    ['a 404', {}, { status: 404 }, 'indexable', 'crawlable']
  ])('robots.txt %s yields %p', (_, over, response, status, reason) => {
    const { indexability } = analyzeOverview(baseRaw(over), baseNetwork(), null, robots('', response));
    expect(indexability.status).toBe(status);
    expect(indexability.reasons[0]).toContain(reason);
  });

  test('counts error findings and sorts findings by severity', () => {
    const raw = baseRaw({ titles: [], descriptions: [], robotsMeta: ['noindex'], canonicals: [] });
    const analysis = analyzeOverview(raw, null, null, null);
    expect(analysis.errorCount).toBe(3); // title-missing, description-missing, noindex
    const severities = analysis.findings.map((f) => f.severity);
    expect(severities.indexOf('info')).toBeGreaterThan(severities.lastIndexOf('error'));
  });

  test('errors with no visible UI representation are excluded from errorCount', () => {
    const analysis = analyzeOverview(baseRaw({ titles: ['One', 'Two'], viewport: null }), null, null, null);
    expect(sev(analysis.findings, 'title-multiple')).toBe('error');
    expect(sev(analysis.findings, 'viewport-missing')).toBe('error');
    expect(analysis.errorCount).toBe(0);
  });

  test('flags the noindex + robots-block and noindex + canonical conflicts', () => {
    const blocked = baseRaw({ url: `${SHOP}/private/x`, robotsMeta: ['noindex'], canonicals: [] });
    expect(codes(analyzeOverview(blocked, null, null, DISALLOW_PRIVATE).findings)).toContain('robots-noindex-conflict');
    const canonicalized = baseRaw({ url: `${PAGE}?variant=1`, robotsMeta: ['noindex'] });
    expect(codes(analyzeOverview(canonicalized, null, null, null).findings)).toContain('noindex-canonical-conflict');
  });

  test('password-protected store overrides an otherwise indexable verdict', () => {
    const raw = baseRaw({ url: `${SHOP}/password`, canonicals: [] });
    const analysis = analyzeOverview(raw, baseNetwork(), baseShopify({ pageType: 'password' }), null);
    expect(analysis.indexability.status).toBe('not-indexable');
    expect(codes(analysis.findings)).toContain('password-page');
  });
});
