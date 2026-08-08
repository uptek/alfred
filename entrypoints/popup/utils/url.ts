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
