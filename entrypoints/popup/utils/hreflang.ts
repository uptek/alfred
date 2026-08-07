import type { RawHreflang } from './types';
import { queryActiveTab } from './messaging';

/**
 * Extracts all hreflang alternate link tags from the active tab via content script.
 * @returns {Promise<RawHreflang[]>} Tags in DOM order, or empty array on failure.
 */
export const getHreflangs = (): Promise<RawHreflang[]> => queryActiveTab<RawHreflang[]>('get_hreflangs', []);

/**
 * Validates an hreflang value against what Google actually accepts: `x-default`,
 * or ISO 639-1 language (2 letters), optionally followed by ISO 15924 script
 * (4 letters) and/or ISO 3166-1 alpha-2 region. Full BCP 47 allows more
 * (extensions, variants), but Google ignores those, so they're flagged.
 */
export function isValidHreflangCode(code: string): boolean {
  if (code.toLowerCase() === 'x-default') return true;
  return /^[a-z]{2,3}(?:-[a-z]{4})?(?:-[a-z]{2})?$/i.test(code);
}

/** Lowercases a code so `en-GB` and `EN-gb` dedupe as one entry. */
const normCode = (code: string): string => code.trim().toLowerCase();

/**
 * Normalizes a URL for self-reference comparison: drops the hash, lowercases
 * the host, and strips a single trailing slash so `/en` and `/en/` match.
 * Returns null for unparseable input.
 */
export function normalizeUrl(url: string): string | null {
  try {
    const u = new URL(url);
    u.hash = '';
    const path = u.pathname.length > 1 ? u.pathname.replace(/\/$/, '') : u.pathname;
    return `${u.protocol}//${u.host.toLowerCase()}${path}${u.search}`;
  } catch {
    return null;
  }
}

export type HreflangIssueId =
  | 'invalid-code'
  | 'relative-href'
  | 'duplicate-code'
  | 'conflicting-code'
  | 'outside-head'
  | 'missing-self'
  | 'missing-x-default';

export interface HreflangIssue {
  id: HreflangIssueId;
  severity: 'error' | 'warning';
  message: string;
}

export interface HreflangEntry extends RawHreflang {
  /** The tag references the page being analyzed. */
  isSelf: boolean;
  invalidCode: boolean;
  /** Authored href is not absolute; Google requires fully-qualified URLs. */
  relativeHref: boolean;
  /** Same code appears on another tag (same or different URL). */
  duplicateCode: boolean;
  /** Same code points at a different URL elsewhere in the set. */
  conflictingCode: boolean;
}

export interface HreflangAnalysis {
  entries: HreflangEntry[];
  issues: HreflangIssue[];
  hasXDefault: boolean;
  hasSelf: boolean;
  errorCount: number;
  warningCount: number;
}

const ABSOLUTE_HREF = /^https?:\/\//i;

/**
 * Validates an hreflang tag set against Google's rules: absolute URLs, valid
 * language-script-region codes, no duplicate codes, a self-referencing entry,
 * and (advisory) an x-default. Per-tag defects land on the entry; set-level
 * defects land in `issues`.
 * @param tags - Tags as extracted from the page, in DOM order.
 * @param pageUrl - URL of the page being analyzed; null skips the self check.
 */
export function analyzeHreflangs(tags: RawHreflang[], pageUrl: string | null): HreflangAnalysis {
  const page = pageUrl ? normalizeUrl(pageUrl) : null;

  const byCode = new Map<string, Set<string>>();
  const codeCounts = new Map<string, number>();
  for (const t of tags) {
    const code = normCode(t.hreflang);
    codeCounts.set(code, (codeCounts.get(code) ?? 0) + 1);
    const urls = byCode.get(code) ?? new Set<string>();
    urls.add(normalizeUrl(t.href) ?? t.href);
    byCode.set(code, urls);
  }

  const entries: HreflangEntry[] = tags.map((t) => {
    const code = normCode(t.hreflang);
    return {
      ...t,
      isSelf: page !== null && normalizeUrl(t.href) === page,
      invalidCode: !isValidHreflangCode(t.hreflang),
      relativeHref: !ABSOLUTE_HREF.test(t.rawHref.trim()),
      duplicateCode: (codeCounts.get(code) ?? 0) > 1,
      conflictingCode: (byCode.get(code)?.size ?? 0) > 1
    };
  });

  const issues: HreflangIssue[] = [];
  if (tags.length > 0) {
    const conflicts = [...byCode.entries()].filter(([, urls]) => urls.size > 1);
    for (const [code] of conflicts) {
      issues.push({
        id: 'conflicting-code',
        severity: 'error',
        message: `"${code}" is declared more than once with different URLs — search engines will pick one arbitrarily`
      });
    }
    const exactDupes = [...codeCounts.entries()].filter(([code, n]) => n > 1 && (byCode.get(code)?.size ?? 0) === 1);
    for (const [code] of exactDupes) {
      issues.push({ id: 'duplicate-code', severity: 'warning', message: `"${code}" is declared more than once` });
    }

    const invalid = entries.filter((e) => e.invalidCode);
    if (invalid.length > 0) {
      issues.push({
        id: 'invalid-code',
        severity: 'error',
        message: `${invalid.length === 1 ? 'Invalid language code' : `${invalid.length} invalid language codes`}: ${[...new Set(invalid.map((e) => `"${e.hreflang}"`))].join(', ')} — use language, optional script, optional region (e.g. en, en-GB, zh-Hant-TW)`
      });
    }

    const relative = entries.filter((e) => e.relativeHref);
    if (relative.length > 0) {
      issues.push({
        id: 'relative-href',
        severity: 'error',
        message: `${relative.length} ${relative.length === 1 ? 'tag uses' : 'tags use'} a relative URL — hreflang URLs must be fully qualified (https://...)`
      });
    }

    const outsideHead = entries.filter((e) => !e.inHead);
    if (outsideHead.length > 0) {
      issues.push({
        id: 'outside-head',
        severity: 'error',
        message: `${outsideHead.length} ${outsideHead.length === 1 ? 'tag is' : 'tags are'} outside <head> — search engines ignore hreflang in <body>`
      });
    }

    if (page !== null && !entries.some((e) => e.isSelf)) {
      issues.push({
        id: 'missing-self',
        severity: 'error',
        message: "No self-referencing tag — the set must include this page's own URL or it may be ignored entirely"
      });
    }

    if (!entries.some((e) => normCode(e.hreflang) === 'x-default')) {
      issues.push({
        id: 'missing-x-default',
        severity: 'warning',
        message: 'No x-default tag — add one to control which page unmatched languages see'
      });
    }
  }

  return {
    entries,
    issues,
    hasXDefault: entries.some((e) => normCode(e.hreflang) === 'x-default'),
    hasSelf: entries.some((e) => e.isSelf),
    errorCount: issues.filter((i) => i.severity === 'error').length,
    warningCount: issues.filter((i) => i.severity === 'warning').length
  };
}
