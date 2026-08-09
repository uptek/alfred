import type { LinkKind, RawLink, LinkStatusResult, SummaryItem } from './types';
import { queryActiveTab, sendToActiveTab } from './messaging';
import { sendRuntimeMessage } from '@/utils/messages';
import type { TextSourceElement } from './dom-text';
import { accessibleText } from './dom-text';

/**
 * Extracts all anchor links from the active tab via content script.
 * @returns {Promise<RawLink[]>} Array of links in DOM order, or empty array on failure.
 */
export const getLinks = (): Promise<RawLink[]> => queryActiveTab<RawLink[]>('get_links', []);

/**
 * Toggles colored dashed outlines on all links in the active tab (green=internal, purple=external, red=nofollow).
 * @param {boolean} enabled - Whether to apply or remove highlights.
 */
export const highlightLinks = (enabled: boolean): Promise<void> => sendToActiveTab('highlight_links', { enabled });

/**
 * Scrolls the active tab to a link by its zero-based DOM index and briefly highlights it.
 * @param {number} index - Zero-based index of the link among all `a[href]` elements.
 */
export const scrollToLink = (index: number): Promise<void> => sendToActiveTab('scroll_to_link', { index });

/**
 * Asks the background service worker to resolve a link's HTTP status. The check
 * runs there so it survives the popup closing and can read cross-origin codes.
 * @param {string} url - Absolute http(s) URL to check.
 * @returns {Promise<LinkStatusResult>} Status bucket; 'error' if unreachable.
 */
export const checkLinkStatus = async (url: string): Promise<LinkStatusResult> => {
  try {
    const res = (await sendRuntimeMessage({ type: 'check_link_status', url })) as LinkStatusResult | undefined;
    return res ?? { status: 0, bucket: 'error' };
  } catch {
    return { status: 0, bucket: 'error' };
  }
};

/** Collapses runs of whitespace (newlines/tabs from multi-line markup) into single spaces. */
const collapse = (text: string): string => text.replace(/\s+/g, ' ').trim();

/** Lowercases a hostname and strips a leading `www.` so the www variant compares as the same site. */
export const normalizeHost = (host: string): string => host.toLowerCase().replace(/^www\./, '');

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
export function linkText(el: TextSourceElement): string {
  return accessibleText(el, collapse);
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

/** Follow-hint flags as carried on RawLink. */
type FollowFlags = { isNofollow: boolean; isSponsored: boolean; isUgc: boolean };

/**
 * A link passes follow equity only when it carries none of the nofollow-class
 * hints; Google treats sponsored and ugc as nofollow variants. Shared by the
 * popup's Dofollow column and the on-page link highlighter so the two can't
 * drift apart.
 */
export const isDofollow = (link: FollowFlags): boolean => !link.isNofollow && !link.isSponsored && !link.isUgc;

/** Sort rank for the Dofollow column: dofollow, then ugc, sponsored, nofollow. */
export const followRank = (link: FollowFlags): number =>
  link.isNofollow ? 3 : link.isSponsored ? 2 : link.isUgc ? 1 : 0;

/**
 * Builds the Links footer summary. Count and external total always show; every
 * defect count is suppressed at zero so a clean page reads as a short bar.
 * @param links - The rows currently visible (post-filter), not the full set.
 * @param statuses - Checked HTTP statuses keyed by href; unchecked links are absent.
 */
export function summarizeLinks(links: RawLink[], statuses: ReadonlyMap<string, LinkStatusResult>): SummaryItem[] {
  let external = 0,
    nofollowish = 0,
    insecure = 0,
    broken = 0;
  let httpRedirect = 0,
    httpDead = 0;
  for (const l of links) {
    if (l.kind === 'external') external++;
    if (!isDofollow(l)) nofollowish++;
    if (l.isInsecure) insecure++;
    if (l.isBrokenAnchor) broken++;
    const st = statuses.get(l.href);
    if (st) {
      if (st.bucket === 'redirect') httpRedirect++;
      else if (st.bucket === 'client-error' || st.bucket === 'server-error' || st.bucket === 'error') httpDead++;
    }
  }
  const items: SummaryItem[] = [
    { text: `${links.length} ${links.length === 1 ? 'link' : 'links'}` },
    { text: `${external} external` }
  ];
  if (nofollowish > 0) {
    items.push({ text: `${nofollowish} nofollow`, title: 'Links carrying nofollow, sponsored, or ugc hints' });
  }
  if (insecure > 0) items.push({ text: `${insecure} insecure http`, tone: 'warn' });
  if (broken > 0) items.push({ text: `${broken} broken #`, tone: 'err' });
  if (httpRedirect > 0) {
    items.push({ text: `${httpRedirect} redirect`, tone: 'warn', title: 'Links that respond with a 3xx redirect' });
  }
  if (httpDead > 0) {
    items.push({
      text: `${httpDead} failing`,
      tone: 'err',
      title: 'Links returning 4xx/5xx or unreachable (advisory)'
    });
  }
  return items;
}
