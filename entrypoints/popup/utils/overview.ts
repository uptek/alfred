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
  ShopifyContext
} from './types';
import { parseRobots, isAllowed, looksLikeHtml } from './robots';

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
    for (const part of content.split(',')) {
      const token = part.trim();
      if (!token) continue;
      const colon = token.indexOf(':');
      const name = (colon === -1 ? token : token.slice(0, colon)).trim().toLowerCase();
      const value = colon === -1 ? null : token.slice(colon + 1).trim();
      if (!name) continue;
      // X-Robots-Tag may scope directives to one bot: "googlebot: noindex".
      if (source === 'header' && value !== null && !KNOWN_DIRECTIVES.has(name)) {
        push(value, source);
        continue;
      }
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
  const canonicals = raw?.canonicals ?? [];
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
  const pageHost = new URL(raw.url).hostname;
  if (targetHost !== pageHost) return { kind: 'cross-domain', href: first.resolved };
  return normalizeUrl(first.resolved) === normalizeUrl(raw.url)
    ? { kind: 'self', href: first.resolved }
    : { kind: 'elsewhere', href: first.resolved };
}

/** Title, description, and canonical findings. */
export function coreFindings(raw: RawOverview | null, canonical: CanonicalInfo): OverviewFinding[] {
  if (!raw) return [];
  const findings: OverviewFinding[] = [];
  const titles = raw.titles.filter((t) => t.length > 0);
  if (titles.length === 0) {
    findings.push({ severity: 'error', code: 'title-missing', message: 'Page has no <title> tag' });
  } else {
    if (raw.titles.length > 1) {
      findings.push({
        severity: 'error',
        code: 'title-multiple',
        message: `${raw.titles.length} <title> tags found; search engines may pick either one`
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
      message: 'No meta description, Google will compose its own snippet'
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
        message: 'Multiple conflicting canonical tags, Google ignores all of them'
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
  network: OverviewNetwork | null,
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
  if (network?.llmsTxt) {
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
  robotsAllowed: boolean | null
): IndexabilityVerdict {
  if (!raw) return { status: 'unknown', reasons: ['Page data unavailable'] };
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
  return {
    status: 'indexable',
    reasons: [`HTTP ${status || 200}, crawlable, no noindex, canonical OK`]
  };
}
