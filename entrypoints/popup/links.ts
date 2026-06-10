import type { LinkKind } from './types';

/** Collapses runs of whitespace (newlines/tabs from multi-line markup) into single spaces. */
const collapse = (text: string): string => text.replace(/\s+/g, ' ').trim();

/** Lowercases a hostname and strips a leading `www.` so the www variant compares as the same site. */
const normalizeHost = (host: string): string => host.toLowerCase().replace(/^www\./, '');

/**
 * Classifies a link by where it points. Only http(s) links are judged
 * internal/external (with the `www.` variant of the page host counting as
 * internal); mailto/tel get their own kinds so they don't skew external
 * stats, and everything else (javascript:, ftp:, unparseable) is 'other'.
 * @param {string} href - Absolute href (anchor.href resolves relative URLs).
 * @param {string} pageHost - Hostname of the page being analyzed.
 * @returns {LinkKind} The link classification.
 */
export function classifyLink(href: string, pageHost: string): LinkKind {
  let url: URL;
  try {
    url = new URL(href);
  } catch {
    return 'other';
  }
  if (url.protocol === 'http:' || url.protocol === 'https:') {
    return normalizeHost(url.hostname) === normalizeHost(pageHost) ? 'internal' : 'external';
  }
  if (url.protocol === 'mailto:') return 'mailto';
  if (url.protocol === 'tel:') return 'tel';
  return 'other';
}

/**
 * Extracts the follow-related hints from a rel attribute. Google treats
 * sponsored and ugc as nofollow-class hints, so all three matter for the
 * Dofollow column.
 * @param {string} rel - Raw rel attribute value (space-separated token list).
 * @returns {{ nofollow: boolean, sponsored: boolean, ugc: boolean }}
 */
export function relFlags(rel: string): { nofollow: boolean; sponsored: boolean; ugc: boolean } {
  return {
    nofollow: /\bnofollow\b/i.test(rel),
    sponsored: /\bsponsored\b/i.test(rel),
    ugc: /\bugc\b/i.test(rel)
  };
}

/**
 * Resolves the accessible anchor text of a link element: text content first,
 * then aria-label, then a descendant image's alt — mirroring what search
 * engines use as anchor text for image links. Interior whitespace is
 * collapsed so multi-line markup reads as one line. Structural parameter
 * type so the content script can pass a live Element while tests pass
 * plain objects.
 * @param el - The anchor element (or a minimal stand-in).
 * @returns {string} The anchor text; '' when the link has no accessible name.
 */
export function linkText(el: {
  textContent: string | null;
  getAttribute(name: string): string | null;
  querySelectorAll(selectors: string): Iterable<{ getAttribute(name: string): string | null }>;
}): string {
  const text = collapse(el.textContent ?? '');
  if (text) return text;

  const ariaLabel = collapse(el.getAttribute('aria-label') ?? '');
  if (ariaLabel) return ariaLabel;

  for (const img of el.querySelectorAll('img[alt]')) {
    const alt = collapse(img.getAttribute('alt') ?? '');
    if (alt) return alt;
  }

  return '';
}

/**
 * Returns the link's fragment when it targets the current document (same
 * origin, path, and query), so the caller can verify the anchor target
 * exists. Any hash on the page URL itself is ignored.
 * @param {string} href - Absolute href of the link.
 * @param {string} pageUrl - URL of the page being analyzed.
 * @returns {string | null} The decoded fragment, or null when the link
 *   points elsewhere or carries no fragment.
 */
export function samePageFragment(href: string, pageUrl: string): string | null {
  try {
    const link = new URL(href);
    const page = new URL(pageUrl);
    if (!link.hash) return null;
    if (link.origin !== page.origin || link.pathname !== page.pathname || link.search !== page.search) {
      return null;
    }
    const raw = link.hash.slice(1);
    try {
      return decodeURIComponent(raw);
    } catch {
      return raw;
    }
  } catch {
    return null;
  }
}

/** Hosts browsers treat as potentially-trustworthy origins even over http. */
const LOOPBACK_HOST = /^(localhost|.+\.localhost|127\.0\.0\.1|\[::1\])$/i;

/**
 * Flags links served over plain http. Loopback hosts are exempt — browsers
 * treat them as secure contexts, and flagging them would mark every link on
 * a local dev site.
 * @param {string} href - Absolute href of the link.
 * @returns {boolean} True for insecure http links.
 */
export function isInsecureHttp(href: string): boolean {
  try {
    const url = new URL(href);
    return url.protocol === 'http:' && !LOOPBACK_HOST.test(url.hostname);
  } catch {
    return false;
  }
}

/**
 * Encodes one CSV field: quotes it, doubles embedded quotes, and prefixes
 * formula-leading characters (= + - @, tab, CR) with an apostrophe so anchor
 * text scraped from arbitrary pages can't execute as a spreadsheet formula.
 * @param {unknown} value - Field value; stringified before encoding.
 * @returns {string} The encoded field including surrounding quotes.
 */
export function csvField(value: unknown): string {
  let text = String(value);
  if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`;
  return `"${text.replace(/"/g, '""')}"`;
}
