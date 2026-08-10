// Sitemap discovery, classification, counting, and health analysis. All
// parsing is regex-based (never DOMParser) so it is pure and bun-testable,
// and so a multi-MB body costs one linear scan; `getSitemaps` is the lone
// content-script wrapper.
import { looksLikeHtml, type LintSeverity } from './robots';
import { queryActiveTab } from './messaging';

export type SitemapKind = 'index' | 'urlset' | 'html' | 'invalid';

export interface SitemapNode {
  url: string;
  /** URL after redirects; '' on network error. */
  finalUrl: string;
  /** Fetch reached the server with a 2xx. */
  ok: boolean;
  /** HTTP status; 0 on network error. */
  status: number;
  kind: SitemapKind;
  /** urlset: <loc> count in the (possibly capped) body; index: total children listed. */
  urlCount: number;
  /** Body exceeded the read cap — urlCount is a floor. */
  truncated: boolean;
  /** From the parent index's <lastmod>; null on roots. */
  lastmod: string | null;
  /** Fetched children (index roots only, depth 1, capped). */
  children: SitemapNode[];
}

export interface SitemapsData {
  nodes: SitemapNode[];
  /** Absolute Sitemap: URLs found in robots.txt. */
  robotsSitemaps: string[];
}

/**
 * Fetches and analyzes the site's sitemaps via the content script. Runs in
 * the page context so requests ride the page's HTTP cache and cookies.
 * @returns {Promise<SitemapsData | null>} Stats per sitemap, or null when the tab is unreachable.
 */
export const getSitemaps = (): Promise<SitemapsData | null> =>
  queryActiveTab<SitemapsData | null>(
    'get_sitemaps',
    null,
    (r) => !!r && Array.isArray((r as { nodes?: unknown }).nodes)
  );

export interface SitemapUrlsResult {
  urls: string[];
  /** Body or URL list hit a cap — the list is a subset. */
  truncated: boolean;
}

/**
 * Fetches one sitemap on demand (page context) and returns its page URLs.
 * @param url - Absolute URL of the urlset sitemap to read.
 * @returns The URL list, or null when the fetch fails or the tab is unreachable.
 */
export const getSitemapUrls = (url: string): Promise<SitemapUrlsResult | null> =>
  queryActiveTab<SitemapUrlsResult | null>(
    'get_sitemap_urls',
    null,
    (r) => !!r && Array.isArray((r as { urls?: unknown }).urls),
    { url }
  );

export interface SitemapSearchMatch {
  /** URL of the sitemap the page URL was found in. */
  sitemap: string;
  url: string;
}

export interface SitemapSearchResult {
  /** Capped match list; `total` holds the uncapped count. */
  matches: SitemapSearchMatch[];
  total: number;
  /** Sitemap URLs that could not be fetched, so were not searched. */
  failed: string[];
  /** Some searched sitemap bodies hit the read cap — results may be partial. */
  truncated: boolean;
}

/**
 * Searches a string across the page URLs of the given sitemaps via the content
 * script (case-insensitive substring; bodies cached per page load).
 * @param urls - Sitemap URLs to search inside.
 * @param query - Substring to look for in each page URL.
 * @returns Matches with their source sitemap, or null when the tab is unreachable.
 */
export const searchSitemapUrls = (urls: string[], query: string): Promise<SitemapSearchResult | null> =>
  queryActiveTab<SitemapSearchResult | null>(
    'search_sitemap_urls',
    null,
    (r) => !!r && Array.isArray((r as { matches?: unknown }).matches),
    { urls, query }
  );

export function classifySitemap(text: string): SitemapKind {
  if (looksLikeHtml(text)) return 'html';
  if (/<sitemapindex[\s>]/i.test(text)) return 'index';
  if (/<urlset[\s>]/i.test(text)) return 'urlset';
  return 'invalid';
}

function decodeXmlEntities(s: string): string {
  return s
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&');
}

const SITEMAP_BLOCK = /<sitemap[\s>][\s\S]*?<\/sitemap>/gi;
const LOC = /<loc[^>]*>([\s\S]*?)<\/loc>/i;
const LASTMOD = /<lastmod[^>]*>([\s\S]*?)<\/lastmod>/i;

export function parseIndexEntries(text: string): { loc: string; lastmod: string | null }[] {
  const entries: { loc: string; lastmod: string | null }[] = [];
  for (const block of text.match(SITEMAP_BLOCK) ?? []) {
    const loc = block.match(LOC)?.[1]?.trim();
    if (!loc) continue;
    entries.push({
      loc: decodeXmlEntities(loc),
      lastmod: block.match(LASTMOD)?.[1]?.trim() || null
    });
  }
  return entries;
}

/** Extracts page URLs (`<loc>` contents) from a urlset body, entity-decoded. */
export function parseUrlsetUrls(text: string): string[] {
  const urls: string[] = [];
  for (const m of text.matchAll(/<loc[^>]*>([\s\S]*?)<\/loc>/gi)) {
    const loc = m[1]?.trim();
    if (loc) urls.push(decodeXmlEntities(loc));
  }
  return urls;
}

export function countUrls(text: string): number {
  return text.match(/<loc[\s>]/gi)?.length ?? 0;
}

export function extractRobotsSitemaps(robotsText: string): string[] {
  return [...robotsText.matchAll(/^\s*sitemap\s*:\s*(\S+)\s*$/gim)]
    .map((m) => m[1]!)
    .filter((u) => /^https?:\/\//i.test(u));
}

export function sitemapFilename(url: string): string {
  try {
    const u = new URL(url);
    const segment = u.pathname.split('/').findLast(Boolean);
    return segment ?? u.host;
  } catch {
    return url;
  }
}

export interface SitemapCategory {
  label: string;
  abbr: string;
  color: string;
}

const CATEGORIES: { pattern: RegExp; category: SitemapCategory }[] = [
  { pattern: /product/, category: { label: 'Products', abbr: 'P', color: '#4a90d9' } },
  { pattern: /collection/, category: { label: 'Collections', abbr: 'C', color: '#5c6ac4' } },
  { pattern: /page/, category: { label: 'Pages', abbr: 'Pg', color: '#ff6b35' } },
  { pattern: /blog|article/, category: { label: 'Blogs', abbr: 'B', color: '#e84393' } },
  { pattern: /agentic|discovery|llm/, category: { label: 'Discovery', abbr: 'AI', color: '#12b886' } },
  { pattern: /image/, category: { label: 'Images', abbr: 'I', color: '#0ca678' } },
  { pattern: /video/, category: { label: 'Videos', abbr: 'V', color: '#f59f00' } },
  { pattern: /news/, category: { label: 'News', abbr: 'N', color: '#748ffc' } }
];

export function categorizeSitemap(url: string): SitemapCategory {
  const name = sitemapFilename(url).toLowerCase();
  return CATEGORIES.find((c) => c.pattern.test(name))?.category ?? { label: 'Sitemap', abbr: 'S', color: '#8a8f98' };
}

export interface SitemapFinding {
  severity: LintSeverity;
  code: string;
  message: string;
}

export interface SitemapsAnalysis {
  /** At least one root fetched with a 2xx. */
  ok: boolean;
  findings: SitemapFinding[];
  errorCount: number;
  /** Child sitemaps across all indexes; a flat urlset root counts as 1. */
  totalSitemaps: number;
  /** Sum of urlset URL counts (children + flat roots). */
  totalUrls: number;
}

/** Bound the findings list — a hostile index can list thousands of children. */
const MAX_FINDINGS = 50;

/**
 * Single analysis pipeline shared by the sidebar badge (App.svelte) and the
 * Sitemaps tab, so the two surfaces can never disagree about the same data.
 */
export function analyzeSitemaps(data: SitemapsData | null): SitemapsAnalysis {
  if (!data) return { ok: false, findings: [], errorCount: 0, totalSitemaps: 0, totalUrls: 0 };

  const findings: SitemapFinding[] = [];
  const ok = data.nodes.some((n) => n.ok);
  let totalSitemaps = 0;
  let totalUrls = 0;
  let anyTruncated = false;

  if (!ok) {
    const first = data.nodes[0];
    const detail = first
      ? first.status === 0
        ? 'the request failed'
        : `returned HTTP ${first.status}`
      : 'no candidates';
    findings.push({ severity: 'error', code: 'no-sitemap', message: `No sitemap found: ${detail}` });
  }

  const inspect = (n: SitemapNode, isChild: boolean) => {
    anyTruncated ||= n.truncated;
    if (!n.ok) {
      if (isChild) {
        totalSitemaps += 1;
        const detail = n.status === 0 ? 'request failed' : `HTTP ${n.status}`;
        findings.push({
          severity: 'warning',
          code: 'child-fetch-failed',
          message: `${sitemapFilename(n.url)} could not be fetched (${detail})`
        });
      }
      return;
    }
    if (n.kind === 'html') {
      findings.push({
        severity: 'warning',
        code: 'serves-html',
        message: `${sitemapFilename(n.url)} serves HTML instead of XML: crawlers cannot read it`
      });
      return;
    }
    if (n.kind === 'invalid') {
      findings.push({
        severity: 'error',
        code: 'invalid-xml',
        message: `${sitemapFilename(n.url)} is not a valid sitemap (no <urlset> or <sitemapindex>)`
      });
      return;
    }
    if (n.kind === 'urlset') {
      totalSitemaps += 1;
      totalUrls += n.urlCount;
      if (n.urlCount === 0) {
        findings.push({
          severity: 'warning',
          code: 'empty-sitemap',
          message: `${sitemapFilename(n.url)} contains no URLs`
        });
      }
      return;
    }
    // index
    if (isChild) {
      // Depth-1 fetch: a nested index's own children were not followed.
      totalSitemaps += 1;
      return;
    }
    if (n.children.length === 0) {
      findings.push({
        severity: 'warning',
        code: 'empty-index',
        message: `${sitemapFilename(n.url)} is an index with no child sitemaps`
      });
    }
    for (const child of n.children) inspect(child, true);
  };

  for (const root of data.nodes) inspect(root, false);

  if (ok && data.robotsSitemaps.length === 0) {
    findings.push({
      severity: 'info',
      code: 'not-in-robots',
      message: 'robots.txt has no Sitemap: line. Adding one helps crawlers discover it'
    });
  }
  if (anyTruncated) {
    findings.push({
      severity: 'info',
      code: 'truncated',
      message: 'Some sitemaps were larger than the read limit. URL counts are a minimum'
    });
  }

  const order: Record<LintSeverity, number> = { error: 0, warning: 1, info: 2 };
  const sorted = findings.sort((a, b) => order[a.severity] - order[b.severity]);
  const errorCount = sorted.reduce((n, f) => n + (f.severity === 'error' ? 1 : 0), 0);
  return { ok, findings: sorted.slice(0, MAX_FINDINGS), errorCount, totalSitemaps, totalUrls };
}
