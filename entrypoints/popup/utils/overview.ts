// Overview tab: DOM/meta extraction wrappers plus a pure analyzer. All
// analysis functions are browser-API-free so `bun test` covers them; the
// three getters at the bottom are the only content-script wrappers.
import type {
  RawOverview,
  OverviewNetwork,
  RobotsDirective,
  CanonicalInfo,
  OverviewFinding,
  IndexabilityVerdict,
  RobotsResponse,
  ShopifyContext,
  RawSchemaBlock,
  RawLink,
  SocialProfile,
  OverviewAnalysis
} from './types';
import { parseRobots, isAllowed, looksLikeHtml } from './robots';
import { queryActiveTab } from './messaging';

export const TITLE_MIN = 30;
export const TITLE_MAX = 60;
export const DESC_MIN = 70;
export const DESC_MAX = 160;

const KNOWN_DIRECTIVES = new Set([
  'all',
  'index',
  'follow',
  'noindex',
  'nofollow',
  'none',
  'noarchive',
  'nocache',
  'nosnippet',
  'notranslate',
  'noimageindex',
  'indexifembedded',
  'max-snippet',
  'max-image-preview',
  'max-video-preview',
  'unavailable_after',
  'noai',
  'noimageai'
]);

/**
 * Flattens meta robots, googlebot meta, and the X-Robots-Tag header into one
 * directive list. Handles the bot-scoped header form ("googlebot: noindex").
 */
export function parseDirectives(raw: RawOverview | null, network: OverviewNetwork | null): RobotsDirective[] {
  const out: RobotsDirective[] = [];
  const push = (content: string, source: RobotsDirective['source']) => {
    // X-Robots-Tag may scope a whole comma-separated directive list to one
    // bot ("otherbot: index, noindex") — the scope persists across commas.
    // Only global and Googlebot-scoped directives affect the Google verdict.
    let scopedToOtherBot = false;
    for (const part of content.split(',')) {
      let token = part.trim();
      if (!token) continue;
      let colon = token.indexOf(':');
      let name = (colon === -1 ? token : token.slice(0, colon)).trim().toLowerCase();
      if (source === 'header' && colon !== -1 && !KNOWN_DIRECTIVES.has(name)) {
        scopedToOtherBot = name !== 'googlebot';
        token = token.slice(colon + 1).trim();
        if (!token) continue;
        colon = token.indexOf(':');
        name = (colon === -1 ? token : token.slice(0, colon)).trim().toLowerCase();
      }
      if (!name || scopedToOtherBot) continue;
      const value = colon === -1 ? null : token.slice(colon + 1).trim();
      out.push({ name, value, source });
    }
  };
  for (const content of raw?.robotsMeta ?? []) push(content, 'meta');
  for (const content of raw?.googlebotMeta ?? []) push(content, 'googlebot');
  if (network?.xRobotsTag) push(network.xRobotsTag, 'header');
  return out;
}

export const hasNoindex = (ds: RobotsDirective[]): boolean => ds.some((d) => d.name === 'noindex' || d.name === 'none');

export const hasNofollow = (ds: RobotsDirective[]): boolean =>
  ds.some((d) => d.name === 'nofollow' || d.name === 'none');

export const hasNosnippet = (ds: RobotsDirective[]): boolean =>
  ds.some((d) => d.name === 'nosnippet' || (d.name === 'max-snippet' && d.value === '0'));

/** Comparable URL form: no hash, no trailing slash (except root), query kept. */
export function normalizeUrl(input: string): string {
  try {
    const u = new URL(input);
    let path = u.pathname.replace(/\/+$/, '');
    if (path === '') path = '/';
    return `${u.origin.toLowerCase()}${path}${u.search}`;
  } catch {
    return input;
  }
}

export function canonicalInfo(raw: RawOverview | null): CanonicalInfo {
  // Google only honors canonicals in <head>; body canonicals still get a
  // canonical-in-body warning but must not drive the canonical state.
  const canonicals = (raw?.canonicals ?? []).filter((c) => c.inHead);
  if (!raw || canonicals.length === 0) return { kind: 'missing', href: null };
  const distinct = new Set(canonicals.map((c) => normalizeUrl(c.resolved)));
  const first = canonicals[0]!;
  if (distinct.size > 1) return { kind: 'multiple', href: first.resolved };
  let targetHost: string;
  try {
    targetHost = new URL(first.resolved).hostname;
  } catch {
    return { kind: 'multiple', href: first.resolved };
  }
  // A malformed page URL means host comparison is impossible; fall through to
  // the string comparison below, which normalizeUrl already handles safely.
  let pageHost: string | null = null;
  try {
    pageHost = new URL(raw.url).hostname;
  } catch {
    pageHost = null;
  }
  if (pageHost !== null && targetHost !== pageHost) return { kind: 'cross-domain', href: first.resolved };
  return normalizeUrl(first.resolved) === normalizeUrl(raw.url)
    ? { kind: 'self', href: first.resolved }
    : { kind: 'elsewhere', href: first.resolved };
}

/** Title, description, and canonical findings. */
export function coreFindings(raw: RawOverview | null, canonical: CanonicalInfo): OverviewFinding[] {
  if (!raw) return [];
  const findings: OverviewFinding[] = [];
  const titles = raw.titles.filter((t) => t.trim().length > 0);
  if (titles.length === 0) {
    findings.push({ severity: 'error', code: 'title-missing', message: 'Page has no <title> tag' });
  } else {
    if (titles.length > 1) {
      findings.push({
        severity: 'error',
        code: 'title-multiple',
        message: `${titles.length} <title> tags found; search engines may pick either one`
      });
    }
    const len = titles[0]!.length;
    if (len < TITLE_MIN) {
      findings.push({
        severity: 'warning',
        code: 'title-short',
        message: `Title is ${len} characters (under ${TITLE_MIN} is likely underoptimized)`
      });
    } else if (len > TITLE_MAX) {
      findings.push({
        severity: 'warning',
        code: 'title-long',
        message: `Title is ${len} characters (over ${TITLE_MAX} risks truncation or rewriting by Google)`
      });
    }
  }

  const descriptions = raw.descriptions.filter((d) => d.trim().length > 0);
  if (descriptions.length === 0) {
    findings.push({
      severity: 'error',
      code: 'description-missing',
      message: 'No meta description; Google will compose its own snippet'
    });
  } else {
    if (raw.descriptions.length > 1) {
      findings.push({
        severity: 'warning',
        code: 'description-multiple',
        message: `${raw.descriptions.length} meta description tags found`
      });
    }
    const len = descriptions[0]!.length;
    if (len < DESC_MIN) {
      findings.push({
        severity: 'warning',
        code: 'description-short',
        message: `Description is ${len} characters (under ${DESC_MIN} wastes snippet space)`
      });
    } else if (len > DESC_MAX) {
      findings.push({
        severity: 'warning',
        code: 'description-long',
        message: `Description is ${len} characters (over ${DESC_MAX} will be truncated)`
      });
    }
  }

  switch (canonical.kind) {
    case 'missing':
      findings.push({ severity: 'info', code: 'canonical-missing', message: 'No canonical URL declared' });
      break;
    case 'multiple':
      findings.push({
        severity: 'error',
        code: 'canonical-multiple',
        message: 'Multiple conflicting canonical tags; Google ignores all of them'
      });
      break;
    case 'cross-domain':
      findings.push({
        severity: 'warning',
        code: 'canonical-cross-domain',
        message: `Canonical points to another domain: ${canonical.href}`
      });
      break;
    case 'elsewhere':
      findings.push({
        severity: 'info',
        code: 'canonical-elsewhere',
        message: `Canonical points to a different URL: ${canonical.href}`
      });
      break;
  }

  const first = raw.canonicals[0];
  if (first) {
    if (!first.inHead) {
      findings.push({
        severity: 'warning',
        code: 'canonical-in-body',
        message: 'Canonical tag sits outside <head>; search engines ignore it there'
      });
    }
    if (first.raw && !/^https?:\/\//i.test(first.raw)) {
      findings.push({
        severity: 'warning',
        code: 'canonical-relative',
        message: 'Canonical href is relative; absolute URLs avoid resolution mistakes'
      });
    }
    if (raw.url.startsWith('https://') && first.resolved.startsWith('http://')) {
      findings.push({
        severity: 'warning',
        code: 'canonical-http-downgrade',
        message: 'Canonical points to http:// from an https:// page'
      });
    }
  }

  return findings;
}

/** Findings for individual robots directives, plus meta-vs-header conflicts. */
export function directiveFindings(ds: RobotsDirective[]): OverviewFinding[] {
  const findings: OverviewFinding[] = [];
  if (hasNoindex(ds)) {
    const src = ds.find((d) => d.name === 'noindex' || d.name === 'none')!;
    findings.push({
      severity: 'error',
      code: 'noindex',
      message: `noindex ${src.source === 'header' ? 'in X-Robots-Tag header' : 'in meta robots'}: page is excluded from search`
    });
  }
  if (hasNofollow(ds)) {
    findings.push({
      severity: 'warning',
      code: 'nofollow',
      message: 'nofollow: links on this page pass no signals'
    });
  }
  if (hasNosnippet(ds)) {
    findings.push({
      severity: 'warning',
      code: 'nosnippet',
      message: 'nosnippet: no text snippet in results, and content is excluded from Google AI Overviews'
    });
  }
  const unavailable = ds.find((d) => d.name === 'unavailable_after');
  if (unavailable?.value) {
    findings.push({
      severity: 'warning',
      code: 'unavailable-after',
      message: `unavailable_after: ${unavailable.value}; Google drops this page from results after that date`
    });
  }
  const infoDirectives: [string, string][] = [
    ['noarchive', 'noarchive: no cached copy is stored'],
    ['noimageindex', 'noimageindex: images on this page are not indexed'],
    ['notranslate', 'notranslate: no translation offered in results'],
    ['noai', 'noai: AI-training opt-out signal present (non-standard, inconsistently honored)'],
    ['noimageai', 'noimageai: image AI-training opt-out signal present (non-standard)']
  ];
  for (const [name, message] of infoDirectives) {
    if (ds.some((d) => d.name === name)) findings.push({ severity: 'info', code: name, message });
  }
  if (ds.some((d) => d.name === 'max-image-preview' && d.value === 'none')) {
    findings.push({
      severity: 'info',
      code: 'max-image-preview-none',
      message: 'max-image-preview:none: no image previews in results or Discover'
    });
  }
  const metaSide = ds.filter((d) => d.source !== 'header');
  const headerSide = ds.filter((d) => d.source === 'header');
  const metaHasNoindex = hasNoindex(metaSide);
  const headerHasNoindex = hasNoindex(headerSide);
  // Only a genuine conflict when both channels carry directives and disagree on noindex;
  // header-only or meta-only noindex is not a conflict (the noindex finding above already
  // attributes the source).
  if (metaSide.length > 0 && headerSide.length > 0 && metaHasNoindex !== headerHasNoindex) {
    findings.push({
      severity: 'warning',
      code: 'robots-conflict',
      message: 'Meta robots and X-Robots-Tag disagree on noindex: Google applies the most restrictive'
    });
  }
  return findings;
}

/** Viewport, lang, charset, favicon, word count, llms.txt, and date findings. */
export function technicalFindings(
  raw: RawOverview | null,
  llmsTxt: boolean | null,
  shopify: ShopifyContext | null
): OverviewFinding[] {
  if (!raw) return [];
  const findings: OverviewFinding[] = [];
  if (!raw.viewport) {
    findings.push({
      severity: 'error',
      code: 'viewport-missing',
      message: 'No viewport meta tag: page fails mobile usability'
    });
  } else if (/user-scalable\s*=\s*(no|0)/i.test(raw.viewport) || /maximum-scale\s*=\s*1(\.0*)?\b/i.test(raw.viewport)) {
    findings.push({
      severity: 'warning',
      code: 'viewport-no-zoom',
      message: 'Viewport blocks pinch-zoom: an accessibility failure'
    });
  }
  if (!raw.lang) {
    findings.push({
      severity: 'warning',
      code: 'lang-missing',
      message: 'No lang attribute on <html>: hurts accessibility and language targeting'
    });
  } else if (shopify?.locale) {
    const pageLang = raw.lang.toLowerCase().split('-')[0];
    const shopLang = shopify.locale.toLowerCase().split('-')[0];
    if (pageLang !== shopLang) {
      findings.push({
        severity: 'warning',
        code: 'lang-locale-mismatch',
        message: `<html lang="${raw.lang}"> does not match the store locale "${shopify.locale}"`
      });
    }
  }
  if (raw.charset && raw.charset.toUpperCase() !== 'UTF-8') {
    findings.push({
      severity: 'warning',
      code: 'charset',
      message: `Document charset is ${raw.charset}; UTF-8 is the modern default`
    });
  }
  if (!raw.faviconHref) {
    findings.push({
      severity: 'warning',
      code: 'favicon-missing',
      message: 'No favicon link: Google shows favicons on every result'
    });
  }
  if (raw.wordCount < 100) {
    findings.push({
      severity: 'warning',
      code: 'thin-content',
      message: `Only ${raw.wordCount} visible words: very thin content`
    });
  } else if (raw.wordCount < 300) {
    findings.push({
      severity: 'info',
      code: 'thin-content',
      message: `${raw.wordCount} visible words: on the thin side for a standard page`
    });
  }
  if (llmsTxt) {
    findings.push({
      severity: 'info',
      code: 'llms-txt',
      message: 'Site publishes /llms.txt: an AI-crawler content guide'
    });
  }
  if (raw.publishedTime && raw.modifiedTime) {
    const published = Date.parse(raw.publishedTime);
    const modified = Date.parse(raw.modifiedTime);
    if (!Number.isNaN(published) && !Number.isNaN(modified) && modified < published) {
      findings.push({
        severity: 'info',
        code: 'dates-inverted',
        message: 'article:modified_time is earlier than article:published_time'
      });
    }
  }
  return findings;
}

const normalizeSpace = (s: string): string => s.replace(/\s+/g, ' ').trim();

/** Directive list in a comparable form: sorted "name" / "name:value" tokens. */
const directiveKey = (content: string | null): string =>
  (content ?? '')
    .split(',')
    .map((t) =>
      t
        .trim()
        .toLowerCase()
        .replace(/\s*:\s*/, ':')
    )
    .filter(Boolean)
    .sort()
    .join(',');

/**
 * Compares the server-rendered (raw HTML) head tags against the live DOM.
 * JS-swapped canonicals and robots directives are real SEO hazards because
 * Google's first-pass indexing reads the raw HTML.
 */
export function rawVsRenderedFindings(raw: RawOverview | null, network: OverviewNetwork | null): OverviewFinding[] {
  if (!raw || !network?.ok || network.status !== 200) return [];
  const findings: OverviewFinding[] = [];
  const renderedTitle = raw.titles[0] ?? null;
  if (
    network.rawTitle !== null &&
    renderedTitle !== null &&
    normalizeSpace(network.rawTitle) !== normalizeSpace(renderedTitle)
  ) {
    findings.push({
      severity: 'info',
      code: 'title-js-modified',
      message: 'Title differs between raw HTML and the rendered page (JavaScript rewrites it)'
    });
  }
  const renderedDescription = raw.descriptions[0] ?? null;
  if (
    network.rawDescription !== null &&
    renderedDescription !== null &&
    normalizeSpace(network.rawDescription) !== normalizeSpace(renderedDescription)
  ) {
    findings.push({
      severity: 'info',
      code: 'description-js-modified',
      message: 'Meta description differs between raw HTML and the rendered page'
    });
  }
  const renderedCanonical = raw.canonicals[0] ?? null;
  if (network.rawCanonical !== null && renderedCanonical !== null) {
    let rawResolved: string;
    try {
      rawResolved = new URL(network.rawCanonical, raw.url).href;
    } catch {
      rawResolved = network.rawCanonical;
    }
    if (normalizeUrl(rawResolved) !== normalizeUrl(renderedCanonical.resolved)) {
      findings.push({
        severity: 'warning',
        code: 'canonical-js-modified',
        message: 'Canonical differs between raw HTML and the rendered page; crawlers may read either'
      });
    }
  }
  if (directiveKey(network.rawRobotsMeta) !== directiveKey(raw.robotsMeta[0] ?? null)) {
    findings.push({
      severity: 'warning',
      code: 'robots-js-modified',
      message: 'Meta robots differs between raw HTML and the rendered page'
    });
  }
  return findings;
}

/**
 * Whether robots.txt lets Googlebot crawl the page. Null when there is no
 * usable robots.txt (missing, non-2xx, or an HTML error page): treated as
 * fully allowed but not reported as a positive signal.
 */
export function robotsTxtAllows(robots: RobotsResponse | null, url: string): boolean | null {
  if (!robots?.ok || robots.status < 200 || robots.status >= 300 || !robots.content) return null;
  if (looksLikeHtml(robots.content)) return null;
  let path: string;
  try {
    const u = new URL(url);
    path = u.pathname + u.search;
  } catch {
    return null;
  }
  return isAllowed(parseRobots(robots.content), path, 'Googlebot').allowed;
}

/**
 * The verdict at the top of the tab. Precedence: HTTP status, then noindex,
 * then robots.txt crawl block, then canonical target.
 */
export function computeIndexability(
  raw: RawOverview | null,
  network: OverviewNetwork | null,
  directives: RobotsDirective[],
  canonical: CanonicalInfo,
  robotsAllowed: boolean | null,
  robotsError: 'server' | 'unreachable' | false = false
): IndexabilityVerdict {
  if (!raw) return { status: 'unknown', reasons: ['Page data unavailable'] };
  if (!/^https?:$/.test(urlProtocol(raw.url))) {
    return { status: 'unknown', reasons: ['Not an HTTP(S) page; search engines cannot crawl it'] };
  }
  const status = raw.navStatus || (network?.ok ? network.status : 0);
  if (status && (status < 200 || status >= 300)) {
    return { status: 'not-indexable', reasons: [`Page returned HTTP ${status}`] };
  }
  if (hasNoindex(directives)) {
    const src = directives.find((d) => d.name === 'noindex' || d.name === 'none')!;
    return {
      status: 'not-indexable',
      reasons: [src.source === 'header' ? 'noindex in the X-Robots-Tag header' : 'noindex in meta robots']
    };
  }
  if (robotsAllowed === false) {
    return {
      status: 'not-indexable',
      reasons: ['Blocked by robots.txt; Google cannot crawl this page (the bare URL may still be indexed)']
    };
  }
  if (canonical.kind === 'elsewhere' || canonical.kind === 'cross-domain') {
    return { status: 'canonicalized', reasons: [`Canonical points to ${canonical.href}`] };
  }
  // A robots.txt that errors server-side makes Google pause crawling; the
  // page may stay indexed from cache, but claiming "crawlable" would be wrong.
  if (robotsError) {
    return {
      status: 'unknown',
      reasons: [
        robotsError === 'server'
          ? 'robots.txt returned a server error; Google may pause crawling this site'
          : 'robots.txt could not be fetched; Google may pause crawling this site'
      ]
    };
  }
  // 'multiple' still indexes (Google ignores conflicting canonicals) and
  // 'missing' is fine too, but the reason must not claim a canonical is OK.
  const canonicalNote =
    canonical.kind === 'multiple'
      ? 'conflicting canonicals ignored'
      : canonical.kind === 'missing'
        ? 'no canonical'
        : 'canonical OK';
  return {
    status: 'indexable',
    reasons: [
      status
        ? `HTTP ${status}, crawlable, no noindex, ${canonicalNote}`
        : `Crawlable, no noindex, ${canonicalNote} (HTTP status unavailable)`
    ]
  };
}

function urlProtocol(input: string): string {
  try {
    return new URL(input).protocol;
  } catch {
    return '';
  }
}

/**
 * Shopify page type: ShopifyAnalytics value when present, else URL patterns
 * (with Markets locale prefixes like /fr or /en-ca stripped first).
 */
export function detectPageType(url: string, shopifyPageType: string | null): string | null {
  if (shopifyPageType) return shopifyPageType;
  let path: string;
  try {
    path = new URL(url).pathname;
  } catch {
    return null;
  }
  path = path.replace(/^\/[a-z]{2}(-[a-zA-Z]{2})?(?=\/|$)/, '') || '/';
  if (path === '/') return 'home';
  if (/^\/collections\/[^/]+\/products\//.test(path) || path.startsWith('/products/')) return 'product';
  if (path === '/collections' || path === '/collections/') return 'list-collections';
  if (path.startsWith('/collections/')) return 'collection';
  if (/^\/blogs\/[^/]+\/./.test(path)) return 'article';
  if (path.startsWith('/blogs/')) return 'blog';
  if (path.startsWith('/pages/')) return 'page';
  if (path === '/cart') return 'cart';
  if (path === '/search') return 'searchresults';
  if (path === '/password') return 'password';
  return null;
}

/** Shopify-storefront-specific checks; empty on non-Shopify pages. */
export function shopifyFindings(
  raw: RawOverview | null,
  shopify: ShopifyContext | null,
  canonical: CanonicalInfo
): OverviewFinding[] {
  if (!raw || !shopify?.isShopify) return [];
  const findings: OverviewFinding[] = [];
  let url: URL;
  try {
    url = new URL(raw.url);
  } catch {
    return [];
  }
  const params = url.searchParams;

  if (shopify.pageType === 'password' || url.pathname === '/password') {
    findings.push({
      severity: 'error',
      code: 'password-page',
      message: 'Store is password-protected; nothing on it can be crawled or indexed'
    });
  }

  const isPreview =
    params.has('preview_theme_id') ||
    shopify.designMode ||
    url.hostname.endsWith('.shopifypreview.com') ||
    (shopify.themeRole !== null && shopify.themeRole !== 'main');
  if (isPreview) {
    findings.push({
      severity: 'warning',
      code: 'preview-mode',
      message: 'Viewing a theme preview, not the live theme; SEO data may not match production'
    });
  }

  if (url.hostname.endsWith('.myshopify.com')) {
    findings.push({
      severity: 'warning',
      code: 'myshopify-domain',
      message: 'Browsing the permanent .myshopify.com domain; a primary custom domain should 301 away from here'
    });
  }

  if (/^\/([a-z]{2}(-[a-zA-Z]{2})?\/)?collections\/[^/]+\/products\//.test(url.pathname)) {
    let canonicalIsBareProduct = false;
    if (canonical.href) {
      try {
        const canonicalPath = new URL(canonical.href).pathname;
        canonicalIsBareProduct = /\/products\/[^/]+/.test(canonicalPath) && !canonicalPath.includes('/collections/');
      } catch {
        canonicalIsBareProduct = false;
      }
    }
    if (canonicalIsBareProduct) {
      findings.push({
        severity: 'info',
        code: 'nested-product-path',
        message: 'Collection-scoped product URL; canonical correctly points to the bare /products/ URL'
      });
    } else {
      findings.push({
        severity: 'warning',
        code: 'nested-product-canonical',
        message: 'Collection-scoped product URL without a canonical to the bare /products/ URL; duplicate-content risk'
      });
    }
  }

  if (params.has('variant') && canonical.href?.includes('variant=')) {
    findings.push({
      severity: 'warning',
      code: 'variant-canonical',
      message: 'Canonical keeps the ?variant= parameter; variant URLs should canonicalize to the base product'
    });
  }

  const pageNumber = parseInt(params.get('page') ?? '', 10);
  if (pageNumber > 1 && canonical.href) {
    let canonicalPage: string | null = null;
    try {
      canonicalPage = new URL(canonical.href).searchParams.get('page');
    } catch {
      canonicalPage = null;
    }
    if (canonicalPage !== String(pageNumber)) {
      findings.push({
        severity: 'warning',
        code: 'pagination-canonical',
        message: `Page ${pageNumber} canonicalizes to ${canonicalPage === null ? 'page 1' : `page ${canonicalPage}`}; Google recommends paginated pages self-canonicalize`
      });
    }
  }

  const hasFilterParams = [...params.keys()].some(
    (k) => k.startsWith('filter.') || k === 'sort_by' || k.startsWith('pf_')
  );
  const isTagPath = /^\/collections\/[^/]+\/[^/]+$/.test(url.pathname) && !url.pathname.includes('/products/');
  if ((hasFilterParams || isTagPath) && detectPageType(raw.url, shopify.pageType) === 'collection') {
    // Stock themes canonicalize to the base collection, but a customized theme
    // can self-canonicalize the filtered URL; check before reassuring.
    let canonicalKeepsState = false;
    if (canonical.href) {
      try {
        const c = new URL(canonical.href, raw.url);
        canonicalKeepsState =
          [...c.searchParams.keys()].some((k) => k.startsWith('filter.') || k === 'sort_by' || k.startsWith('pf_')) ||
          (isTagPath && c.pathname === url.pathname);
      } catch {
        // Unparseable canonical is reported by canonicalInfo
      }
    }
    if (canonicalKeepsState) {
      findings.push({
        severity: 'warning',
        code: 'filtered-collection-canonical',
        message:
          'Filtered/sorted collection view canonicalizes to itself instead of the base collection; risks duplicate content in the index'
      });
    } else {
      findings.push({
        severity: 'info',
        code: 'filtered-collection',
        message: 'Filtered/sorted collection view; Shopify canonicalizes these to the base collection'
      });
    }
  }

  return findings;
}

/** First datePublished/dateModified found anywhere in the JSON-LD blocks. */
export function schemaDates(schema: RawSchemaBlock[]): { published: string | null; modified: string | null } {
  let published: string | null = null;
  let modified: string | null = null;
  const visit = (node: unknown): void => {
    if (published && modified) return;
    if (Array.isArray(node)) {
      for (const item of node) visit(item);
      return;
    }
    if (!node || typeof node !== 'object') return;
    const obj = node as Record<string, unknown>;
    if (!published && typeof obj.datePublished === 'string') published = obj.datePublished;
    if (!modified && typeof obj.dateModified === 'string') modified = obj.dateModified;
    for (const value of Object.values(obj)) visit(value);
  };
  for (const block of schema) {
    if (block.parseError) continue;
    try {
      visit(JSON.parse(block.raw));
    } catch {
      // parseError should have caught this; skip defensively
    }
  }
  return { published, modified };
}

const SOCIAL_HOSTS: [RegExp, string][] = [
  [/(^|\.)facebook\.com$/, 'Facebook'],
  [/(^|\.)instagram\.com$/, 'Instagram'],
  [/(^|\.)(twitter|x)\.com$/, 'X (Twitter)'],
  [/(^|\.)youtube\.com$/, 'YouTube'],
  [/(^|\.)tiktok\.com$/, 'TikTok'],
  [/(^|\.)pinterest\.(com|ca|fr|de|es|it|pt|ie|at|ch|se|dk|nz|jp|kr|com\.au|com\.mx|co\.uk|co\.kr)$/, 'Pinterest'],
  [/(^|\.)linkedin\.com$/, 'LinkedIn'],
  [/(^|\.)threads\.(net|com)$/, 'Threads']
];

// Share/intent endpoints are outbound actions, not profiles.
const SHARE_PATH = /^\/(sharer|share|intent|shareArticle|pin\/create)/i;

// Content/media routes on social hosts (a video, post, or article) — linking
// to one doesn't make it the site's profile.
const CONTENT_PATH =
  /^\/(watch|shorts|embed|playlist|live|hashtag|results|feed|events?|groups|marketplace|reels?|stories|explore|discover|search|pulse|learning|jobs|business|help|legal|p|pin|ideas)([/?]|$)|\/(status|posts|videos?|photos?|reels?|stories|story)\//i;

/** Social profile links found on the page, first hit per network. */
export function socialProfiles(links: RawLink[]): SocialProfile[] {
  const found = new Map<string, string>();
  for (const link of links) {
    let host: string;
    let path: string;
    try {
      const u = new URL(link.href);
      host = u.hostname.toLowerCase();
      path = u.pathname;
    } catch {
      continue;
    }
    if (path.length <= 1 || SHARE_PATH.test(path) || CONTENT_PATH.test(path)) continue;
    for (const [pattern, network] of SOCIAL_HOSTS) {
      if (pattern.test(host) && !found.has(network)) found.set(network, link.href);
    }
  }
  return [...found].map(([network, url]) => ({ network, url }));
}

const SEVERITY_ORDER: Record<OverviewFinding['severity'], number> = { error: 0, warning: 1, info: 2 };

// With the findings list hidden, the sidebar badge must only count errors the
// Overview surfaces elsewhere (verdict hero, meta pills, banner) — otherwise
// users see a count with no visible explanation.
const UNSURFACED_ERROR_CODES = new Set(['title-multiple', 'viewport-missing']);

/** Single entry point: combines every source into the tab's analysis. */
export function analyzeOverview(
  raw: RawOverview | null,
  network: OverviewNetwork | null,
  shopify: ShopifyContext | null,
  robots: RobotsResponse | null,
  schema: RawSchemaBlock[],
  llmsTxt: boolean | null = null
): OverviewAnalysis {
  const directives = parseDirectives(raw, network);
  const canonical = canonicalInfo(raw);
  const robotsAllowed = raw ? robotsTxtAllows(robots, raw.url) : null;
  // A 404 robots.txt legitimately means "allow all"; a 5xx/429 or network
  // failure does not — Google pauses crawling while robots.txt errors persist.
  const robotsError: 'server' | 'unreachable' | false = !robots
    ? false
    : !robots.ok
      ? 'unreachable'
      : robots.status >= 500 || robots.status === 429
        ? 'server'
        : false;

  const findings: OverviewFinding[] = [
    ...coreFindings(raw, canonical),
    ...directiveFindings(directives),
    ...technicalFindings(raw, llmsTxt, shopify),
    ...rawVsRenderedFindings(raw, network),
    ...shopifyFindings(raw, shopify, canonical)
  ];

  if (raw) {
    const status = raw.navStatus || (network?.ok ? network.status : 0);
    if (status && (status < 200 || status >= 300)) {
      findings.push({ severity: 'error', code: 'http-status', message: `Page returned HTTP ${status}` });
    }
    if (robotsAllowed === false) {
      findings.push({
        severity: 'warning',
        code: 'robots-blocked',
        message: 'robots.txt blocks Googlebot from crawling this page'
      });
      if (hasNoindex(directives)) {
        findings.push({
          severity: 'warning',
          code: 'robots-noindex-conflict',
          message:
            'Blocked by robots.txt AND noindex; Google never crawls the page, so it never sees the noindex; the URL can stay indexed'
        });
      }
    }
    if (hasNoindex(directives) && (canonical.kind === 'elsewhere' || canonical.kind === 'cross-domain')) {
      findings.push({
        severity: 'warning',
        code: 'noindex-canonical-conflict',
        message: 'noindex combined with a canonical to another URL sends contradictory signals'
      });
    }
  }

  findings.sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity]);

  // A password-protected store hides every page from crawlers regardless of
  // the page's own status, directives, or canonical.
  const indexability: IndexabilityVerdict = findings.some((f) => f.code === 'password-page')
    ? { status: 'not-indexable', reasons: ['Store is password-protected; Google cannot crawl any page'] }
    : computeIndexability(raw, network, directives, canonical, robotsAllowed, robotsError);

  const fallbackDates = schemaDates(schema);
  const titleText = raw?.titles.find((t) => t.length > 0) ?? null;
  const descriptionText = raw?.descriptions.find((d) => d.trim().length > 0) ?? null;

  return {
    indexability,
    findings,
    errorCount: findings.filter((f) => f.severity === 'error' && !UNSURFACED_ERROR_CODES.has(f.code)).length,
    title: { text: titleText, length: titleText?.length ?? 0 },
    description: { text: descriptionText, length: descriptionText?.length ?? 0 },
    canonical,
    directives,
    pageType: raw ? detectPageType(raw.url, shopify?.pageType ?? null) : null,
    dates: {
      published: raw?.publishedTime ?? fallbackDates.published,
      modified: raw?.modifiedTime ?? fallbackDates.modified
    }
  };
}

/** Fetches the DOM-extracted overview snapshot from the active tab. */
export const getOverview = (): Promise<RawOverview | null> =>
  queryActiveTab<RawOverview | null>('get_overview', null, (r) => !!r && typeof (r as RawOverview).url === 'string');

/** Fetches the network-level overview data (status, headers, raw HTML head). */
export const getOverviewNetwork = (): Promise<OverviewNetwork | null> =>
  queryActiveTab<OverviewNetwork | null>(
    'get_overview_network',
    null,
    (r) => !!r && typeof (r as OverviewNetwork).status === 'number'
  );

/** Probes /llms.txt; separate from getOverviewNetwork so a slow probe never delays header data. */
export const getLlmsTxt = (): Promise<boolean | null> =>
  queryActiveTab<boolean | null>('get_llms_txt', null, (r) => typeof r === 'boolean');

/** Fetches the main-world Shopify globals snapshot. */
export const getShopifyContext = (): Promise<ShopifyContext | null> =>
  queryActiveTab<ShopifyContext | null>(
    'get_shopify_context',
    null,
    (r) => !!r && typeof (r as ShopifyContext).isShopify === 'boolean'
  );
