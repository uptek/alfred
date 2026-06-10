import type { AssetLoad, AssetPlacement } from './types';
import { normalizeHost } from './links';

/** How a script's type attribute classifies it; only classic and module ever execute or fetch. */
export type ScriptSubtype = 'classic' | 'module' | 'importmap' | 'speculationrules' | 'json' | 'ld+json' | 'data';

/** JavaScript MIME type essences per the HTML spec; any of these (or no type) means a classic script. */
const JS_MIME_TYPES = new Set([
  'application/ecmascript',
  'application/javascript',
  'application/x-ecmascript',
  'application/x-javascript',
  'text/ecmascript',
  'text/javascript',
  'text/javascript1.0',
  'text/javascript1.1',
  'text/javascript1.2',
  'text/javascript1.3',
  'text/javascript1.4',
  'text/javascript1.5',
  'text/jscript',
  'text/livescript',
  'text/x-ecmascript',
  'text/x-javascript'
]);

/**
 * Classifies a script's type attribute. Matching follows the HTML spec:
 * compare the MIME essence (parameters stripped) case-insensitively, with
 * 'module', 'importmap', and 'speculationrules' as keywords. Anything
 * unrecognized is an inert data block (templates, custom types).
 * @param {string} type - Raw type attribute value ('' when absent).
 * @returns {ScriptSubtype} The script classification.
 */
export function scriptSubtype(type: string): ScriptSubtype {
  const essence = (type.split(';')[0] ?? '').trim().toLowerCase();
  if (essence === '' || JS_MIME_TYPES.has(essence)) return 'classic';
  if (essence === 'module') return 'module';
  if (essence === 'importmap') return 'importmap';
  if (essence === 'speculationrules') return 'speculationrules';
  if (essence === 'application/ld+json') return 'ld+json';
  if (essence === 'application/json' || essence === 'text/json' || essence.endsWith('+json')) return 'json';
  return 'data';
}

/**
 * Resolves how a script loads. Module scripts are deferred by default (the
 * defer attribute is a no-op on them), so only async changes their behavior.
 * @param {ScriptSubtype} subtype - Classification from scriptSubtype().
 * @param {boolean} async - The async IDL attribute.
 * @param {boolean} defer - The defer IDL attribute.
 * @param {boolean} inline - True when the script has no src.
 * @returns {AssetLoad} The load strategy.
 */
export function scriptLoad(subtype: ScriptSubtype, async: boolean, defer: boolean, inline: boolean): AssetLoad {
  if (inline) return 'inline';
  if (subtype === 'module') return async ? 'async' : 'defer';
  return async ? 'async' : defer ? 'defer' : 'blocking';
}

/**
 * A script blocks first render only when it is a synchronous external classic
 * script in <head>. Modules are always deferred, nomodule scripts are not
 * even fetched by modern browsers, and data blocks never execute.
 */
export function isRenderBlockingScript(script: {
  subtype: ScriptSubtype;
  load: AssetLoad;
  placement: AssetPlacement;
  isInline: boolean;
  noModule: boolean;
}): boolean {
  return (
    script.subtype === 'classic' &&
    !script.noModule &&
    !script.isInline &&
    script.load === 'blocking' &&
    script.placement === 'head'
  );
}

/**
 * A stylesheet blocks first render when it sits in <head>, is actually
 * fetched and applied (not disabled, not an alternate stylesheet), and its
 * media query matches the current environment. Non-matching media (print,
 * unmatched queries) loads at low priority without blocking.
 * @param sheet - The stylesheet's placement and applicability facts.
 * @param {(query: string) => boolean} mediaMatches - Evaluates a media query
 *   against the page (window.matchMedia in the content script; a stub in tests).
 * @returns {boolean} True when the stylesheet blocks first render.
 */
export function isRenderBlockingStylesheet(
  sheet: { placement: AssetPlacement; media: string; disabled: boolean; alternate: boolean },
  mediaMatches: (query: string) => boolean
): boolean {
  if (sheet.placement !== 'head' || sheet.disabled || sheet.alternate) return false;
  const media = sheet.media.trim();
  return media === '' || mediaMatches(media);
}

/**
 * Decides whether an asset URL points at a third-party host. Only http(s)
 * URLs are judged (data:/blob: have no host of their own), and the www
 * variant of the page host counts as the same site — matching the Links tab.
 * @param {string} url - Resolved absolute asset URL.
 * @param {string} pageHost - Hostname of the page being analyzed.
 * @returns {boolean} True for third-party assets.
 */
export function isExternalAssetUrl(url: string, pageHost: string): boolean {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return true;
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return false;
  return normalizeHost(parsed.hostname) !== normalizeHost(pageHost);
}

/**
 * Compact display form of an asset URL: same-host assets show just their
 * path (the host would repeat on every row), external assets show host plus
 * path with the www. prefix stripped. Root paths fall back to the host so
 * the cell is never empty.
 * @param {string} src - Resolved absolute asset URL.
 * @param {string | null} pageHost - Hostname of the page, when known.
 * @returns {string} The display string.
 */
export function displaySource(src: string, pageHost: string | null): string {
  let url: URL;
  try {
    url = new URL(src);
  } catch {
    return src;
  }
  const host = normalizeHost(url.hostname);
  const rest = url.pathname + url.search;
  if (rest === '/' || rest === '') return host;
  if (pageHost && host === normalizeHost(pageHost)) return rest;
  return host + rest;
}

/**
 * Formats a byte count for the Size column: B under 1 KB, then KB and MB
 * with one decimal.
 * @param {number} bytes - Byte count.
 * @returns {string} Human-readable size.
 */
export function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
