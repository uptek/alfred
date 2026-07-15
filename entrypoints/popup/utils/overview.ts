// Overview tab: DOM/meta extraction wrappers plus a pure analyzer. All
// analysis functions are browser-API-free so `bun test` covers them; the
// three getters at the bottom are the only content-script wrappers.
import type { RawOverview, OverviewNetwork, RobotsDirective, CanonicalInfo, OverviewFinding } from './types';

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
