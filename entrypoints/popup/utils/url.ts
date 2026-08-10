/**
 * Schemes the popup refuses to hand back to the browser. `javascript:` and
 * `vbscript:` would run in the extension's own origin, and today only MV3's
 * default `script-src 'self'` stops them; `data:`, `blob:`, and `filesystem:`
 * are either blocked as top-frame navigations or resolve against the extension
 * rather than the page, so the target is dead or misleading either way.
 */
const INERT_SCHEMES = new Set(['javascript:', 'vbscript:', 'data:', 'blob:', 'filesystem:']);

/**
 * Whether the popup should render a page URL as a live link. Everything the
 * browser can meaningfully open stays clickable, including mailto:, tel:, sms:,
 * ftp:, and app deep links; only INERT_SCHEMES and unparseable URLs render as
 * plain text.
 * @param {string} url - Resolved absolute URL collected from the page.
 */
export function isNavigable(url: string): boolean {
  try {
    return !INERT_SCHEMES.has(new URL(url).protocol);
  } catch {
    return false;
  }
}

/**
 * Normalizes a URL into a comparable form: hash dropped, host lowercased,
 * trailing slashes trimmed (root `/` kept), query kept.
 * @param {string} url - Absolute URL to normalize.
 * @returns {string | null} Normalized URL, or null when unparseable.
 */
export function normalizeUrl(url: string): string | null {
  try {
    const u = new URL(url);
    let path = u.pathname.replace(/\/+$/, '');
    if (path === '') path = '/';
    return `${u.origin.toLowerCase()}${path}${u.search}`;
  } catch {
    return null;
  }
}
