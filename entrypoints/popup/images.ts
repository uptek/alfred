import type { ImageSource, ImageStatus } from './types';

/** What the alt attribute says about an image; only 'missing' is an accessibility/SEO failure. */
export type AltState = 'present' | 'decorative' | 'missing';

/**
 * Classifies an alt attribute. An absent attribute is a failure; an empty (or
 * whitespace-only) one is the spec's deliberate "decorative, skip me" signal
 * and must not be flagged.
 * @param {string | null} alt - Raw alt attribute (null when absent).
 * @returns {AltState} The classification.
 */
export function altState(alt: string | null): AltState {
  if (alt === null) return 'missing';
  return alt.trim() === '' ? 'decorative' : 'present';
}

/**
 * Resolves an image's status. Broken beats missing alt; backgrounds have no
 * alt concept and decorative images are intentionally unlabeled, so neither
 * is ever flagged for alt.
 */
export function imageStatus(img: { broken: boolean; alt: AltState; source: ImageSource }): ImageStatus {
  if (img.broken) return 'broken';
  if (img.alt === 'missing' && img.source !== 'background') return 'missing-alt';
  return 'ok';
}

const IMAGE_FORMATS = new Set(['png', 'jpg', 'webp', 'avif', 'gif', 'svg']);

/** Maps MIME subtypes and CDN format aliases onto the canonical format names. */
function normalizeFormat(value: string): string {
  const v = value.toLowerCase();
  if (v === 'jpeg' || v === 'pjpg' || v === 'pjpeg') return 'jpg';
  if (v === 'svg+xml') return 'svg';
  return v;
}

/**
 * Detects an image's format: data-URI MIME first, then the path extension,
 * then a format/fm query param (extensionless CDN routes).
 * @param {string} url - Resolved absolute image URL.
 * @returns {string} png|jpg|webp|avif|gif|svg, or '' when unknown.
 */
export function imageFormat(url: string): string {
  const dataMime = /^data:image\/([a-z0-9.+-]+)/i.exec(url);
  if (dataMime) {
    const fmt = normalizeFormat(dataMime[1] ?? '');
    return IMAGE_FORMATS.has(fmt) ? fmt : '';
  }
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return '';
  }
  const dot = u.pathname.lastIndexOf('.');
  if (dot !== -1) {
    const ext = normalizeFormat(u.pathname.slice(dot + 1));
    if (IMAGE_FORMATS.has(ext)) return ext;
  }
  const param = u.searchParams.get('format') ?? u.searchParams.get('fm');
  if (param) {
    const fmt = normalizeFormat(param);
    if (IMAGE_FORMATS.has(fmt)) return fmt;
  }
  return '';
}

/**
 * Compact display form of an image source: the last path segment plus query
 * string. Data URIs collapse to their MIME ('data:image/png') so a base64
 * payload never lands in the cell, the tooltip, or the search haystack.
 * @param {string} src - Resolved image URL ('' when none).
 * @returns {string} The display string.
 */
export function fileLabel(src: string): string {
  if (!src) return '(no source)';
  if (src.startsWith('data:')) {
    const end = src.search(/[;,]/);
    return end === -1 ? src : src.slice(0, end);
  }
  try {
    const u = new URL(src);
    const segments = u.pathname.split('/').filter(Boolean);
    return (segments[segments.length - 1] ?? u.pathname) + u.search;
  } catch {
    return src;
  }
}

/**
 * Extracts every url() from a computed background-image value, so multiple
 * backgrounds ('url(a), url(b)') and gradient combos each yield their images.
 * @param {string} bg - Computed background-image value.
 * @returns {string[]} The url() arguments, in declaration order.
 */
export function parseBackgroundUrls(bg: string): string[] {
  const out: string[] = [];
  const re = /url\((['"]?)(.*?)\1\)/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(bg)) !== null) {
    if (m[2]) out.push(m[2]);
  }
  return out;
}

/**
 * Lighthouse-style "properly size images" check: an image is oversized when
 * it ships more than 4x the pixels its rendered box needs at the device's
 * pixel ratio (2x headroom per dimension). Unknown natural sizes (lazy, not
 * decoded) and unrendered boxes never flag.
 * @param {number} naturalWidth - Intrinsic width in px.
 * @param {number} naturalHeight - Intrinsic height in px.
 * @param {number} displayWidth - Rendered CSS width in px.
 * @param {number} displayHeight - Rendered CSS height in px.
 * @param {number} dpr - window.devicePixelRatio (non-positive falls back to 1).
 * @returns {boolean} True when the image is wastefully large.
 */
export function isOversized(
  naturalWidth: number,
  naturalHeight: number,
  displayWidth: number,
  displayHeight: number,
  dpr: number
): boolean {
  if (!naturalWidth || !naturalHeight || !displayWidth || !displayHeight) return false;
  const ratio = dpr > 0 ? dpr : 1;
  return naturalWidth * naturalHeight > displayWidth * displayHeight * ratio * ratio * 4;
}
