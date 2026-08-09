import { getSettings } from '@/utils/settings';
import { sendTrackEvent } from '@/utils/analytics';
import { ANALYTICS_ACTIONS, type AnalyticsAction } from '@/utils/analytics-actions';
import { handleReturnUrlRedirect } from '@/utils/storefrontPasswordRedirect';
import { sniffShopifyDom } from '@/utils/shopifyDetection';
import { Toast } from '@/utils/toast';
import type { TabMessage } from '@/utils/messages';
import { createBridgeClient } from '@/utils/mainWorldBridge';
import { headingText } from './popup/utils/headings';
import type { FragmentTargets } from './popup/utils/links';
import { classifyLink, isBrokenAnchor, isDofollow, isInsecureHttp, linkText, relFlags } from './popup/utils/links';
import { looksLikeHtml } from './popup/utils/robots';
import {
  classifySitemap,
  countUrls,
  extractRobotsSitemaps,
  parseIndexEntries,
  parseUrlsetUrls
} from './popup/utils/sitemaps';
import {
  isExternalAssetUrl,
  isRenderBlockingScript,
  isRenderBlockingStylesheet,
  scriptLoad,
  scriptSubtype
} from './popup/utils/assets';
import {
  altState,
  capDataUri,
  imageFormat,
  isBrokenImage,
  isOversized,
  parseBackgroundUrls
} from './popup/utils/images';

type CollectedImage = { el: Element; source: 'img' | 'picture' | 'background'; bg?: string };

/**
 * Collects all page images in a deterministic order shared by get_images,
 * highlight_images, and scroll_to_image so indices stay consistent across calls.
 * Order: every <img> in DOM order, then every element with a CSS background-image
 * in DOM order; multiple backgrounds on one element yield one entry per url().
 * Inline <svg> icons are intentionally excluded.
 */
function collectImageEls(): CollectedImage[] {
  const out: CollectedImage[] = [];
  for (const el of document.querySelectorAll('img')) {
    out.push({ el, source: el.closest('picture') ? 'picture' : 'img' });
  }
  for (const el of document.querySelectorAll<HTMLElement>('body *')) {
    if (el.tagName === 'IMG') continue;
    // Carry each extracted url so get_images doesn't re-run getComputedStyle.
    for (const bg of parseBackgroundUrls(getComputedStyle(el).backgroundImage)) {
      out.push({ el, source: 'background', bg });
    }
  }
  return out;
}

/** Size of a Resource Timing entry; 0 when opaque cross-origin. */
const resourceSize = (e: PerformanceResourceTiming): number => e.encodedBodySize || e.decodedBodySize || 0;

/** Served from cache: nothing transferred but a decoded body exists. */
const resourceCached = (t?: PerformanceResourceTiming): boolean => !!t && t.transferSize === 0 && t.decodedBodySize > 0;

/**
 * Indexes already-recorded Resource Timing entries by URL — no new network
 * requests. Cross-origin assets without a Timing-Allow-Origin header report
 * 0 (opaque). When a URL has several entries, the largest-size one wins.
 * Shared by the get_assets and get_images handlers.
 */
function buildResourceTimingIndex(): Map<string, PerformanceResourceTiming> {
  const index = new Map<string, PerformanceResourceTiming>();
  try {
    for (const entry of performance.getEntriesByType('resource') as PerformanceResourceTiming[]) {
      const prev = index.get(entry.name);
      if (!prev || resourceSize(entry) > resourceSize(prev)) index.set(entry.name, entry);
    }
  } catch {
    // Resource Timing unavailable; timing-derived fields stay at defaults
  }
  return index;
}

const flashTimers = new WeakMap<HTMLElement, number[]>();

/** How long a scroll-to flash highlight stays fully visible before fading. */
const FLASH_HOLD_MS = 5000;
/** Fade-out duration; the cleanup timer must wait for hold + fade. */
const FLASH_FADE_MS = 800;

/**
 * Scrolls an element into view and applies a brief green dashed outline.
 * Re-triggering on the same element resets its timers, so rapid repeat
 * clicks can't strip the outline early or leave stale inline styles.
 */
function flashOutline(target: HTMLElement): void {
  for (const id of flashTimers.get(target) ?? []) clearTimeout(id);
  target.scrollIntoView({ behavior: 'smooth', block: 'center' });
  target.style.outline = '2px dashed #95bf47';
  target.style.outlineOffset = '3px';
  target.style.transition = `outline-color ${FLASH_FADE_MS}ms`;
  const fade = window.setTimeout(() => {
    target.style.outlineColor = 'transparent';
  }, FLASH_HOLD_MS);
  const clear = window.setTimeout(() => {
    target.style.outline = '';
    target.style.outlineOffset = '';
    target.style.transition = '';
    flashTimers.delete(target);
  }, FLASH_HOLD_MS + FLASH_FADE_MS);
  flashTimers.set(target, [fade, clear]);
}

const IMAGE_HIGHLIGHT_STYLE_ID = 'alfred-image-highlights';

/**
 * Injects the shared image-highlight stylesheet once. Uses border (not outline)
 * so it can't be clipped by overflow:hidden ancestors, and box-sizing:border-box
 * so the border draws inside the element's box without growing it. Shared by the
 * Highlight toggle and the click-to-scroll highlight so they look identical.
 */
function ensureImageHighlightStyle(): void {
  if (document.getElementById(IMAGE_HIGHLIGHT_STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = IMAGE_HIGHLIGHT_STYLE_ID;
  style.textContent = `
    [data-alfred-image-highlight] { box-sizing: border-box !important; }
    [data-alfred-image-highlight="ok"] { border: 2px dashed #22c55e !important; }
    [data-alfred-image-highlight="alt"] { border: 2px dashed #f59e0b !important; }
    [data-alfred-image-highlight="broken"] { border: 2px dashed #ef4444 !important; }
  `;
  document.head.appendChild(style);
}

/** Classifies an image element for highlighting: broken, missing-alt ('alt'), or 'ok'. */
function imageHighlightState(el: Element, source: CollectedImage['source']): string {
  if (source === 'background') return 'ok';
  const img = el as HTMLImageElement;
  if (isBrokenImage(img, img.currentSrc || img.src || '')) return 'broken';
  // Decorative alt="" is a deliberate signal, not a failure; only an absent attribute flags.
  return altState(img.getAttribute('alt')) === 'missing' ? 'alt' : 'ok';
}

// Parsed sitemap URL lists, kept for the page's lifetime so repeated copy and
// search actions fetch each sitemap at most once. Navigation resets it.
const sitemapUrlCache = new Map<string, { urls: string[]; truncated: boolean }>();

export default defineContentScript({
  matches: ['<all_urls>'],
  runAt: 'document_start',
  async main() {
    // Resolved when the main-world script announces its request handlers are
    // registered. Popup relays hold their postMessage until then — a request
    // posted earlier would be silently lost and read as "not a Shopify store".
    let mainWorldReadyResolve!: () => void;
    const mainWorldReady = new Promise<void>((resolve) => {
      mainWorldReadyResolve = resolve;
    });

    // Upper bound on a main-world round trip. Generous because busy storefronts
    // can block the main thread for seconds during load (issue #82); the popup
    // shows a loading state meanwhile, so waiting is free.
    const RELAY_TIMEOUT_MS = 3000;

    const alfredBridge = createBridgeClient<{ getTheme(): unknown; getShopifyContext(): unknown }>('alfred');

    /**
     * Relays a popup request to the main world over the bridge and forwards
     * the response (or `fallback` on timeout/error) through sendResponse.
     * Waits for mainWorldReady so a request posted before the main-world
     * handlers are registered isn't silently lost; the deadline still runs
     * from request receipt, so an unready main world can't hang the popup.
     */
    const relayToMainWorld = (
      method: 'getTheme' | 'getShopifyContext',
      fallback: unknown,
      sendResponse: (response?: unknown) => void
    ): true => {
      let settled = false;
      const finish = (data: unknown) => {
        if (settled) return;
        settled = true;
        clearTimeout(deadline);
        sendResponse(data ?? fallback);
      };
      const deadline = setTimeout(() => finish(fallback), RELAY_TIMEOUT_MS);
      mainWorldReady
        .then(() => alfredBridge.call(method, undefined, RELAY_TIMEOUT_MS))
        .then(finish, () => finish(fallback));
      return true;
    };

    // Listen for tracking events from the main world. The event detail crosses
    // a world boundary, so validate the action instead of trusting the cast.
    window.addEventListener('alfred:track', (event: Event) => {
      const { action, metadata } = (
        event as CustomEvent<{
          action: string;
          metadata?: Record<string, unknown>;
        }>
      ).detail;
      if ((ANALYTICS_ACTIONS as readonly string[]).includes(action)) {
        sendTrackEvent(action as AnalyticsAction, metadata);
      }
    });

    // The main world announces its bridge server is registered.
    window.addEventListener('message', (event: MessageEvent<{ type?: string }>) => {
      if (event.source !== window) return;
      if (event.data?.type === 'alfred:main_world_ready') {
        mainWorldReadyResolve();
      }
    });

    /**
     * Listen for messages from registered scripts,
     * relay them to the main world script,
     * and send the response back to the registered script
     */
    browser.runtime.onMessage.addListener((request: TabMessage, _sender, sendResponse) => {
      // Surface a toast on behalf of the background, which has no DOM of its own.
      if (request.action === 'alfred_toast') {
        const { message, toastType } = request;
        if (message) Toast.show(message, toastType === 'success' ? 'success' : 'error');
        return false;
      }

      /**
       * Relays theme detection request to the main world script via postMessage and returns Shopify theme data.
       * @returns {{ isShopify: boolean, theme: object | null, shop: string | null }}
       */
      if (request.action === 'get_theme') {
        return relayToMainWorld('getTheme', { isShopify: false, theme: null, shop: null }, sendResponse);
      }

      /**
       * Synchronous DOM-only Shopify check for the popup's first paint — no
       * main-world round trip, so it answers before the (relayed, worst-case
       * 3s) get_theme response. A miss is corrected when get_theme resolves.
       * @returns {boolean}
       */
      if (request.action === 'sniff_shopify') {
        sendResponse(sniffShopifyDom(document, window.location.hostname));
        return false;
      }

      /**
       * Relays the Shopify-globals snapshot request to the main world and
       * returns the data the Overview tab reads.
       * @returns {import('./popup/utils/types').ShopifyContext}
       */
      if (request.action === 'get_shopify_context') {
        const emptyContext = {
          isShopify: false,
          pageType: null,
          resourceId: null,
          shop: null,
          locale: null,
          currency: null,
          country: null,
          marketRoot: null,
          themeRole: null,
          designMode: false
        };

        return relayToMainWorld('getShopifyContext', emptyContext, sendResponse);
      }

      /**
       * Extracts all H1-H6 headings from the page in DOM order.
       * @returns {{ level: number, text: string, isHidden: boolean }[]}
       */
      if (request.action === 'get_headings') {
        const headings = Array.from(document.querySelectorAll('h1, h2, h3, h4, h5, h6')).map((el) => ({
          level: parseInt(el.tagName.charAt(1)),
          text: headingText(el),
          isHidden: !(el as HTMLElement).checkVisibility()
        }));
        sendResponse(headings);
        return false;
      }

      /**
       * Extracts every JSON-LD block (`<script type="application/ld+json">`) in
       * DOM order. Each block's text is captured verbatim and parsed once to
       * record whether it is well-formed; the popup re-parses and pretty-prints
       * from the raw text.
       * @returns {RawSchemaBlock[]}
       */
      if (request.action === 'get_schema') {
        // Match on the MIME essence so a type with parameters
        // (e.g. "application/ld+json; charset=utf-8") still counts. The
        // substring selector narrows the candidates; the filter confirms.
        const ldJsonEssence = (el: HTMLScriptElement) =>
          (el.getAttribute('type') ?? '').split(';')[0]!.trim().toLowerCase() === 'application/ld+json';
        const scripts = Array.from(document.querySelectorAll<HTMLScriptElement>('script[type*="ld+json" i]')).filter(
          ldJsonEssence
        );
        const blocks = scripts.map((el, i) => {
          // Full text, never capped: clipping a large valid schema makes it
          // parse as malformed and corrupts Copy/Export.
          const raw = el.textContent ?? '';
          let parseError: string | null = null;
          try {
            JSON.parse(raw);
          } catch (err) {
            parseError = (err as Error).message;
          }
          return {
            index: i,
            raw,
            parseError,
            placement: document.head?.contains(el) ? ('head' as const) : ('body' as const)
          };
        });
        sendResponse(blocks);
        return false;
      }

      /**
       * Extracts every hreflang alternate link tag in DOM order. The resolved
       * href and the authored attribute are both captured so the popup can
       * flag relative URLs, which search engines reject.
       * @returns {import('./popup/utils/types').RawHreflang[]}
       */
      if (request.action === 'get_hreflangs') {
        const tags = Array.from(document.querySelectorAll<HTMLLinkElement>('link[rel~="alternate" i][hreflang]')).map(
          (el, i) => ({
            index: i,
            href: el.href,
            rawHref: el.getAttribute('href') ?? '',
            hreflang: el.getAttribute('hreflang') ?? '',
            inHead: document.head?.contains(el) ?? false
          })
        );
        sendResponse(tags);
        return false;
      }

      /**
       * Extracts all anchor links from the page in DOM order. Each anchor is
       * stamped with its index so scroll_to_link can find it even if the DOM
       * mutates afterwards (lazy menus, carousels).
       * @returns {RawLink[]}
       */
      if (request.action === 'get_links') {
        const pageHost = location.hostname;
        const anchors = Array.from(document.querySelectorAll<HTMLAnchorElement>('a[href]'));
        // Stamp in a separate write-only pass: interleaving setAttribute with the
        // checkVisibility/querySelector reads below risks a style recalc per anchor.
        anchors.forEach((anchor, i) => anchor.setAttribute('data-alfred-link-index', String(i)));
        // Built lazily on the first getElementById miss; getElementsByName walks the
        // whole document per call, which is O(links x DOM) on hash-router pages.
        let anchorNames: Set<string | null> | null = null;
        const targets: FragmentTargets = {
          hasId: (id) => document.getElementById(id) !== null,
          hasNamedAnchor: (name) => {
            anchorNames ??= new Set(Array.from(document.querySelectorAll('a[name]'), (el) => el.getAttribute('name')));
            return anchorNames.has(name);
          }
        };
        const pageUrl = location.href;
        const links = anchors.map((anchor, i) => {
          const href = anchor.href; // serializing getter; read once per anchor
          const rel = anchor.getAttribute('rel') ?? '';
          const { nofollow, sponsored, ugc } = relFlags(rel);
          return {
            index: i,
            href,
            text: linkText(anchor),
            rel,
            kind: classifyLink(href, pageHost),
            isNofollow: nofollow,
            isSponsored: sponsored,
            isUgc: ugc,
            isImage: anchor.querySelector('img, svg, picture') !== null,
            isHidden: !anchor.checkVisibility(),
            isInsecure: isInsecureHttp(href),
            isBrokenAnchor: isBrokenAnchor(href, pageUrl, targets)
          };
        });
        sendResponse(links);
        return false;
      }

      /**
       * Extracts all scripts and stylesheets from the page in DOM order.
       * Covers <script> (external + inline), <link rel="stylesheet">, and inline <style>.
       * Inline content is capped to bound the messaging payload.
       * @returns {import('./popup/utils/types').RawAsset[]}
       */
      if (request.action === 'get_assets') {
        const pageHost = location.hostname;
        const MAX_INLINE = 20000; // cap inline content per asset (~20KB)

        const mediaMatches = (query: string): boolean => {
          try {
            return window.matchMedia(query).matches;
          } catch {
            return true; // on bad input, assume blocking (the pre-matchMedia behavior)
          }
        };
        // Browser-extension injected assets (e.g. content scripts) use these schemes.
        const isBrowserExtensionUrl = (url: string): boolean =>
          /^(?:chrome-extension|moz-extension|safari-web-extension|safari-extension):\/\//i.test(url);
        const byteSize = (text: string): number => {
          try {
            return new Blob([text]).size;
          } catch {
            return text.length;
          }
        };

        const timingByUrl = buildResourceTimingIndex();
        const durationOf = (t?: PerformanceResourceTiming): number => (t ? Math.round(t.duration) : 0);
        const statusOf = (t?: PerformanceResourceTiming): number =>
          t ? ((t as PerformanceResourceTiming & { responseStatus?: number }).responseStatus ?? 0) : 0;
        const sizeFromTiming = (t?: PerformanceResourceTiming): number => (t ? resourceSize(t) : 0);

        const placementOf = (el: Element): 'head' | 'body' | 'footer' => {
          if (document.head?.contains(el)) return 'head';
          if (el.closest('footer')) return 'footer';
          return 'body';
        };

        const nodes = document.querySelectorAll('script, link[rel~="stylesheet" i], style');
        const assets = Array.from(nodes).map((el, i) => {
          const tag = el.tagName.toUpperCase();

          if (tag === 'SCRIPT') {
            const s = el as HTMLScriptElement;
            const src = s.src || null;
            const inline = !src;
            const content = inline ? (s.textContent ?? '') : '';
            const t = src ? timingByUrl.get(src) : undefined;
            const subtype = scriptSubtype(s.type);
            const load = scriptLoad(subtype, s.async, s.defer, inline);
            const placement = placementOf(s);
            return {
              index: i,
              kind: 'script' as const,
              src,
              // Extension-injected assets are tracked separately, not as third-party "External"
              isExternal: src ? !isBrowserExtensionUrl(src) && isExternalAssetUrl(src, pageHost) : false,
              isBrowserExtension: src ? isBrowserExtensionUrl(src) : false,
              isInline: inline,
              type: s.type ? s.type : 'classic',
              subtype,
              load,
              media: '',
              size: inline ? byteSize(content) : sizeFromTiming(t),
              content: inline ? content.slice(0, MAX_INLINE) : null,
              placement,
              cached: resourceCached(t),
              duration: durationOf(t),
              status: statusOf(t),
              renderBlocking: isRenderBlockingScript({
                subtype,
                load,
                placement,
                isInline: inline,
                noModule: s.noModule
              })
            };
          }

          if (tag === 'LINK') {
            const l = el as HTMLLinkElement;
            const href = l.href || null;
            const t = href ? timingByUrl.get(href) : undefined;
            const media = l.media ?? '';
            const placement = placementOf(l);
            return {
              index: i,
              kind: 'style' as const,
              src: href,
              isExternal: href ? !isBrowserExtensionUrl(href) && isExternalAssetUrl(href, pageHost) : false,
              isBrowserExtension: href ? isBrowserExtensionUrl(href) : false,
              isInline: false,
              type: 'stylesheet',
              subtype: 'stylesheet' as const,
              load: 'blocking' as const,
              media,
              size: sizeFromTiming(t),
              content: null,
              placement,
              cached: resourceCached(t),
              duration: durationOf(t),
              status: statusOf(t),
              renderBlocking: isRenderBlockingStylesheet(
                { placement, media, disabled: l.disabled, alternate: l.relList.contains('alternate') },
                mediaMatches
              )
            };
          }

          // STYLE (inline)
          const st = el as HTMLStyleElement;
          const content = st.textContent ?? '';
          return {
            index: i,
            kind: 'style' as const,
            src: null,
            isExternal: false,
            isBrowserExtension: false,
            isInline: true,
            type: 'inline',
            subtype: 'stylesheet' as const,
            load: 'inline' as const,
            media: st.media ?? '',
            size: byteSize(content),
            content: content.slice(0, MAX_INLINE),
            placement: placementOf(st),
            cached: false,
            duration: 0,
            status: 0,
            renderBlocking: false // inline styles have no network cost; not flagged
          };
        });

        sendResponse(assets);
        return false;
      }

      /**
       * Extracts all <img>, <picture>, and CSS background images in collectImageEls() order.
       * Sizes come from the Resource Timing API only (no new network requests); unknowns are 0.
       */
      if (request.action === 'get_images') {
        const pageHost = location.hostname;
        const timingByUrl = buildResourceTimingIndex();

        const resolveUrl = (url: string): string => {
          try {
            return new URL(url, location.href).href;
          } catch {
            return url;
          }
        };

        const collected = collectImageEls();
        // Stamp indices so scroll_to_image can find the element by attribute
        // instead of re-running the full-DOM walk (mirrors get_links).
        collected.forEach(({ el }, i) => el.setAttribute('data-alfred-image-index', String(i)));
        const images = collected.map(({ el, source, bg }, i) => {
          if (source === 'background') {
            const src = bg ? capDataUri(resolveUrl(bg)) : '';
            const t = src ? timingByUrl.get(src) : undefined;
            const rect = el.getBoundingClientRect();
            return {
              index: i,
              source,
              src,
              alt: null,
              lacksAlt: false,
              decorative: false,
              isResponsive: false,
              naturalWidth: 0,
              naturalHeight: 0,
              displayWidth: Math.round(rect.width),
              displayHeight: Math.round(rect.height),
              format: imageFormat(src),
              loading: 'none',
              size: t ? resourceSize(t) : 0,
              cached: resourceCached(t),
              isExternal: src ? isExternalAssetUrl(src, pageHost) : false,
              isHidden: !(el as HTMLElement).checkVisibility(),
              broken: false,
              oversized: false // natural size is unknowable for backgrounds without a fetch
            };
          }
          const img = el as HTMLImageElement;
          const src = capDataUri(img.currentSrc || img.src || '');
          const t = src ? timingByUrl.get(src) : undefined;
          const alt = altState(img.getAttribute('alt'));
          const loadingAttr = img.getAttribute('loading');
          const rect = img.getBoundingClientRect();
          const displayWidth = Math.round(rect.width);
          const displayHeight = Math.round(rect.height);
          return {
            index: i,
            source,
            src,
            alt: img.getAttribute('alt'),
            lacksAlt: alt === 'missing',
            decorative: alt === 'decorative',
            isResponsive: source === 'picture' || img.srcset !== '' || img.sizes !== '',
            naturalWidth: img.naturalWidth,
            naturalHeight: img.naturalHeight,
            displayWidth,
            displayHeight,
            format: imageFormat(src),
            loading: loadingAttr === 'lazy' ? 'lazy' : loadingAttr === 'eager' ? 'eager' : 'none',
            size: t ? resourceSize(t) : 0,
            cached: resourceCached(t),
            isExternal: src ? isExternalAssetUrl(src, pageHost) : false,
            isHidden: !img.checkVisibility(),
            broken: isBrokenImage(img, src),
            oversized: isOversized(
              img.naturalWidth,
              img.naturalHeight,
              displayWidth,
              displayHeight,
              window.devicePixelRatio
            )
          };
        });
        sendResponse(images);
        return false;
      }

      /**
       * Fetches the site's robots.txt (same-origin, from the page context, so
       * it rides the page's HTTP cache, connection, and cookies) and returns
       * the raw text plus HTTP metadata. Analysis happens in the popup.
       * @returns {{ ok: boolean, status: number, content: string, finalUrl: string, size: number, truncated: boolean }}
       */
      if (request.action === 'get_robots') {
        // Cap what crosses runtime messaging into the popup — a huge body
        // would choke sendMessage serialization and the popup renderer.
        const MAX_ROBOTS_BYTES = 600 * 1024; // Google stops processing at 500 KiB
        fetch(`${location.origin}/robots.txt`, { signal: AbortSignal.timeout(8000) })
          .then(async (res) => {
            const content = res.ok ? await res.text() : '';
            const truncated = content.length > MAX_ROBOTS_BYTES;
            const capped = truncated ? content.slice(0, MAX_ROBOTS_BYTES) : content;
            sendResponse({
              ok: true,
              status: res.status,
              content: capped,
              finalUrl: res.url,
              size: new TextEncoder().encode(content).length,
              truncated
            });
          })
          .catch(() => {
            sendResponse({ ok: false, status: 0, content: '', finalUrl: '', size: 0, truncated: false });
          });
        return true;
      }

      /**
       * Extracts everything the Overview tab reads from the live DOM: head
       * meta, canonical links, document facts, visible word count, and the
       * navigation HTTP status.
       * @returns {import('./popup/utils/types').RawOverview}
       */
      if (request.action === 'get_overview') {
        const metaContents = (name: string): string[] =>
          Array.from(document.querySelectorAll<HTMLMetaElement>(`meta[name="${name}" i]`)).map(
            (m) => m.getAttribute('content') ?? ''
          );
        // Crawlers ignore meta descriptions outside <head>.
        const headMetaContents = (name: string): string[] =>
          Array.from(document.head?.querySelectorAll<HTMLMetaElement>(`meta[name="${name}" i]`) ?? []).map(
            (m) => m.getAttribute('content') ?? ''
          );
        const propContent = (prop: string): string | null =>
          document.querySelector<HTMLMetaElement>(`meta[property="${prop}" i]`)?.getAttribute('content') ?? null;
        const canonicals = Array.from(document.querySelectorAll<HTMLLinkElement>('link[rel~="canonical" i]')).map(
          (el) => ({
            raw: el.getAttribute('href') ?? '',
            resolved: el.href,
            inHead: document.head?.contains(el) ?? false
          })
        );
        const favicon = document.querySelector<HTMLLinkElement>('link[rel~="icon" i]');
        // innerText respects CSS visibility, so hidden text doesn't inflate the count.
        const textRoot = document.querySelector<HTMLElement>('main') ?? document.body;
        const wordCount = textRoot ? textRoot.innerText.trim().split(/\s+/).filter(Boolean).length : 0;
        let navStatus = 0;
        try {
          const nav = performance.getEntriesByType('navigation')[0] as
            | (PerformanceNavigationTiming & { responseStatus?: number })
            | undefined;
          navStatus = nav?.responseStatus ?? 0;
        } catch {
          // Navigation Timing unavailable; status stays unknown
        }
        sendResponse({
          url: location.href,
          titles: Array.from(document.querySelectorAll('title'))
            // Inline SVG icons carry accessibility <title> elements; only HTML
            // titles are document titles.
            .filter((t) => t.namespaceURI === 'http://www.w3.org/1999/xhtml')
            .map((t) => t.textContent?.trim() ?? ''),
          descriptions: headMetaContents('description'),
          robotsMeta: metaContents('robots'),
          googlebotMeta: metaContents('googlebot'),
          canonicals,
          viewport: document.querySelector<HTMLMetaElement>('meta[name="viewport" i]')?.getAttribute('content') ?? null,
          charset: document.characterSet,
          lang: document.documentElement.lang,
          faviconHref: favicon?.href ?? null,
          ogSiteName: propContent('og:site_name'),
          publishedTime: propContent('article:published_time'),
          modifiedTime: propContent('article:modified_time'),
          wordCount,
          navStatus
        });
        return false;
      }

      /**
       * Scrapes every og:/twitter:/article:/fb: meta tag in document order so
       * the Social tab can pair siblings like og:image + og:image:width.
       * @returns {import('./popup/utils/types').RawSocial}
       */
      if (request.action === 'get_social') {
        const SOCIAL_PREFIXES = ['og:', 'twitter:', 'article:', 'fb:'];
        // Hostile pages can emit unbounded metas/values; cap before shipping to the
        // popup so its reactive lint/preview pipeline can't be flooded.
        const MAX_METAS = 200;
        const MAX_VALUE = 2000;
        const metas = Array.from(document.querySelectorAll<HTMLMetaElement>('meta[property], meta[name]'))
          .map((m): { attr: 'property' | 'name'; key: string; value: string } | null => {
            const attr: 'property' | 'name' = m.hasAttribute('property') ? 'property' : 'name';
            const key = m.getAttribute(attr) ?? '';
            const value = (m.getAttribute('content') ?? '').slice(0, MAX_VALUE);
            if (!value || !SOCIAL_PREFIXES.some((prefix) => key.startsWith(prefix))) return null;
            return { attr, key, value };
          })
          .filter((m): m is { attr: 'property' | 'name'; key: string; value: string } => m !== null)
          .slice(0, MAX_METAS);
        sendResponse({
          metas,
          fallbackTitle: document.title,
          fallbackDescription:
            document.querySelector<HTMLMetaElement>('meta[name="description" i]')?.getAttribute('content') ?? '',
          pageUrl: location.href
        });
        return false;
      }

      /**
       * Network-level overview data: re-fetches the current URL from the page
       * context (rides its cache/cookies) for the HTTP status, X-Robots-Tag
       * header, and raw pre-JavaScript head tags.
       * @returns {import('./popup/utils/types').OverviewNetwork}
       */
      if (request.action === 'get_overview_network') {
        const MAX_HTML_BYTES = 1024 * 1024;
        const pageFetch = fetch(location.href, { signal: AbortSignal.timeout(8000) })
          .then(async (res) => {
            const base = {
              ok: true,
              status: res.status,
              xRobotsTag: res.headers.get('x-robots-tag'),
              rawTitle: null as string | null,
              rawDescription: null as string | null,
              rawCanonical: null as string | null,
              rawRobotsMeta: null as string | null
            };
            try {
              const html = (await res.text()).slice(0, MAX_HTML_BYTES);
              const doc = new DOMParser().parseFromString(html, 'text/html');
              base.rawTitle = doc.querySelector('title')?.textContent?.trim() ?? null;
              base.rawDescription = doc.querySelector('meta[name="description" i]')?.getAttribute('content') ?? null;
              base.rawCanonical = doc.querySelector('link[rel~="canonical" i]')?.getAttribute('href') ?? null;
              base.rawRobotsMeta = doc.querySelector('meta[name="robots" i]')?.getAttribute('content') ?? null;
            } catch {
              // Body unreadable; the header-level data is still useful
            }
            return base;
          })
          .catch(() => ({
            ok: false,
            status: 0,
            xRobotsTag: null,
            rawTitle: null,
            rawDescription: null,
            rawCanonical: null,
            rawRobotsMeta: null
          }));
        pageFetch.then((page) => sendResponse(page));
        return true;
      }

      /**
       * Probes /llms.txt separately so a slow probe never delays the page's
       * header-level data (status, X-Robots-Tag) reaching the popup.
       */
      if (request.action === 'get_llms_txt') {
        // SPA fallbacks serve HTML at any path with a 200, so a status check
        // alone would false-positive; require the body to not look like HTML.
        fetch(`${location.origin}/llms.txt`, { signal: AbortSignal.timeout(8000) })
          .then(async (res) => res.ok && !looksLikeHtml((await res.text()).slice(0, 4096)))
          .catch(() => false)
          .then((llmsTxt) => sendResponse(llmsTxt));
        return true;
      }

      /**
       * Discovers and fetches the site's sitemaps from the page context
       * (rides its HTTP cache and cookies): robots.txt Sitemap: lines first,
       * falling back to /sitemap.xml, then all index children in parallel.
       * Only compact stats cross runtime messaging — bodies are counted here
       * and discarded, so a 50 MB product sitemap never hits sendMessage.
       * @returns {import('./popup/utils/sitemaps').SitemapsData}
       */
      const MAX_SITEMAP_BYTES = 5 * 1024 * 1024;

      const readCapped = async (res: Response): Promise<{ text: string; truncated: boolean }> => {
        const reader = res.body?.getReader();
        if (!reader) return { text: await res.text(), truncated: false };
        const decoder = new TextDecoder();
        let text = '';
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          text += decoder.decode(value, { stream: true });
          if (text.length > MAX_SITEMAP_BYTES) {
            reader.cancel().catch(() => {});
            return { text: text.slice(0, MAX_SITEMAP_BYTES), truncated: true };
          }
        }
        return { text, truncated: false };
      };

      if (request.action === 'get_sitemaps') {
        const MAX_ROOTS = 5;
        const MAX_CHILDREN = 50;

        // Body is returned separately so index roots can parse children
        // without the body ever entering the response payload.
        const fetchDoc = async (url: string, lastmod: string | null) => {
          const node = {
            url,
            finalUrl: '',
            ok: false,
            status: 0,
            kind: 'invalid' as ReturnType<typeof classifySitemap>,
            urlCount: 0,
            truncated: false,
            lastmod,
            children: [] as unknown[]
          };
          try {
            const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
            node.finalUrl = res.url;
            node.status = res.status;
            if (!res.ok) return { node, text: '' };
            const { text, truncated } = await readCapped(res);
            node.ok = true;
            node.truncated = truncated;
            node.kind = classifySitemap(text);
            if (node.kind === 'urlset' || node.kind === 'index') node.urlCount = countUrls(text);
            return { node, text: node.kind === 'index' ? text : '' };
          } catch {
            return { node, text: '' };
          }
        };

        (async () => {
          let robotsSitemaps: string[] = [];
          try {
            const res = await fetch(`${location.origin}/robots.txt`, { signal: AbortSignal.timeout(8000) });
            if (res.ok) robotsSitemaps = extractRobotsSitemaps((await res.text()).slice(0, 600 * 1024));
          } catch {
            // No robots.txt reachable — fall through to the /sitemap.xml convention.
          }
          const rootUrls = [
            ...new Set(robotsSitemaps.length > 0 ? robotsSitemaps : [`${location.origin}/sitemap.xml`])
          ].slice(0, MAX_ROOTS);

          const nodes = await Promise.all(
            rootUrls.map(async (rootUrl) => {
              const { node, text } = await fetchDoc(rootUrl, null);
              if (node.kind === 'index') {
                const entries = parseIndexEntries(text);
                node.urlCount = entries.length;
                node.children = (
                  await Promise.all(entries.slice(0, MAX_CHILDREN).map((e) => fetchDoc(e.loc, e.lastmod)))
                ).map((c) => c.node);
              }
              return node;
            })
          );
          sendResponse({ nodes, robotsSitemaps });
        })();
        return true;
      }

      /**
       * Fetches one sitemap's URL list through the per-page cache, so repeat
       * copy/search actions against the same sitemap cost one fetch total.
       * @returns null when the fetch fails.
       */
      const getUrlList = async (url: string): Promise<{ urls: string[]; truncated: boolean } | null> => {
        const cached = sitemapUrlCache.get(url);
        if (cached) return cached;
        try {
          const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
          if (!res.ok) return null;
          const { text, truncated } = await readCapped(res);
          const entry = { urls: parseUrlsetUrls(text), truncated };
          sitemapUrlCache.set(url, entry);
          return entry;
        } catch {
          return null;
        }
      };

      /**
       * Fetches a single sitemap on demand and returns its page URLs, for the
       * per-row "copy all links" action. Same page-context rationale as
       * get_sitemaps; the URL list (not the body) crosses messaging, capped.
       */
      if (request.action === 'get_sitemap_urls') {
        const MAX_URLS = 10_000;
        const { url } = request;
        if (!url || !/^https?:\/\//i.test(url)) {
          sendResponse(null);
          return true;
        }
        (async () => {
          const list = await getUrlList(url);
          if (!list) {
            sendResponse(null);
            return;
          }
          sendResponse({
            urls: list.urls.slice(0, MAX_URLS),
            truncated: list.truncated || list.urls.length > MAX_URLS
          });
        })();
        return true;
      }

      /**
       * Searches a query string across the URL lists of the given sitemaps
       * (case-insensitive substring). Bodies are fetched here and cached per
       * page load; only the capped match list crosses messaging.
       */
      if (request.action === 'search_sitemap_urls') {
        const MAX_MATCHES = 200;
        const MAX_SITEMAPS = 50;
        const { urls, query } = request;
        if (!Array.isArray(urls) || typeof query !== 'string' || !query.trim()) {
          sendResponse(null);
          return true;
        }
        const valid = urls.filter((u) => typeof u === 'string' && /^https?:\/\//i.test(u));
        const targets = valid.slice(0, MAX_SITEMAPS);
        (async () => {
          const lists = await Promise.all(targets.map(async (u) => ({ u, list: await getUrlList(u) })));
          const q = query.trim().toLowerCase();
          const matches: { sitemap: string; url: string }[] = [];
          // Sitemaps past the cap were never searched; surface them as unsearched.
          const failed: string[] = valid.slice(MAX_SITEMAPS);
          let total = 0;
          let truncated = false;
          for (const { u, list } of lists) {
            if (!list) {
              failed.push(u);
              continue;
            }
            truncated ||= list.truncated;
            for (const pageUrl of list.urls) {
              if (pageUrl.toLowerCase().includes(q)) {
                total += 1;
                if (matches.length < MAX_MATCHES) matches.push({ sitemap: u, url: pageUrl });
              }
            }
          }
          sendResponse({ matches, total, failed, truncated });
        })();
        return true;
      }

      /**
       * Toggles colored dashed outlines on all page links (green=internal, purple=external, red=nofollow).
       * @param {boolean} request.enabled - Whether to apply or remove highlights.
       */
      if (request.action === 'highlight_links') {
        const { enabled } = request;
        const styleId = 'alfred-link-highlights';
        const existing = document.getElementById(styleId);
        if (!enabled) {
          existing?.remove();
          document.querySelectorAll('[data-alfred-link-highlight]').forEach((el) => {
            (el as HTMLElement).removeAttribute('data-alfred-link-highlight');
          });
          sendResponse(true);
          return false;
        }
        if (!existing) {
          const style = document.createElement('style');
          style.id = styleId;
          style.textContent = `
            [data-alfred-link-highlight="internal"] { outline: 2px dashed #22c55e !important; outline-offset: 3px !important; }
            [data-alfred-link-highlight="external"] { outline: 2px dashed #7c3aed !important; outline-offset: 3px !important; }
            [data-alfred-link-highlight="nofollow"] { outline: 2px dashed #ef4444 !important; outline-offset: 3px !important; }
          `;
          document.head.appendChild(style);
        }
        const pageHost = location.hostname;
        document.querySelectorAll('a[href]').forEach((el) => {
          const anchor = el as HTMLAnchorElement;
          const { nofollow, sponsored, ugc } = relFlags(anchor.getAttribute('rel') ?? '');
          const dofollow = isDofollow({ isNofollow: nofollow, isSponsored: sponsored, isUgc: ugc });
          const kind = classifyLink(anchor.href, pageHost);
          anchor.setAttribute(
            'data-alfred-link-highlight',
            !dofollow ? 'nofollow' : kind === 'internal' ? 'internal' : 'external'
          );
        });
        sendResponse(true);
        return false;
      }

      /**
       * Scrolls to a link and applies a brief green dashed outline highlight.
       * Prefers the index stamped by get_links so DOM mutations since the
       * snapshot don't shift the target; falls back to the nth a[href].
       * @param {number} request.index - Zero-based index of the link among all `a[href]` elements.
       */
      if (request.action === 'scroll_to_link') {
        const index = Number(request.index);
        if (!Number.isInteger(index) || index < 0) {
          sendResponse(false);
          return false;
        }
        const target =
          document.querySelector(`a[data-alfred-link-index="${index}"]`) ?? document.querySelectorAll('a[href]')[index];
        if (target instanceof HTMLElement) flashOutline(target);
        sendResponse(true);
        return false;
      }

      if (request.action === 'scroll_to_heading') {
        const allHeadings = document.querySelectorAll('h1, h2, h3, h4, h5, h6');
        const target = allHeadings[request.index];
        if (target instanceof HTMLElement) flashOutline(target);
        sendResponse(true);
        return false;
      }

      /**
       * Toggles colored dashed outlines on all collected images
       * (green=ok, amber=missing alt, red=broken).
       * @param {boolean} request.enabled - Whether to apply or remove highlights.
       */
      if (request.action === 'highlight_images') {
        const { enabled } = request;
        if (!enabled) {
          document.getElementById(IMAGE_HIGHLIGHT_STYLE_ID)?.remove();
          document.querySelectorAll('[data-alfred-image-highlight]').forEach((el) => {
            (el as HTMLElement).removeAttribute('data-alfred-image-highlight');
          });
          sendResponse(true);
          return false;
        }
        ensureImageHighlightStyle();
        // Mark the stylesheet so scroll_to_image's cleanup knows the global
        // highlight owns the attributes and must not strip them.
        const highlightStyle = document.getElementById(IMAGE_HIGHLIGHT_STYLE_ID);
        if (highlightStyle) highlightStyle.dataset.global = 'true';
        // Clear stale attributes (the DOM may have changed since the last toggle).
        document.querySelectorAll('[data-alfred-image-highlight]').forEach((el) => {
          (el as HTMLElement).removeAttribute('data-alfred-image-highlight');
        });
        for (const { el, source } of collectImageEls()) {
          (el as HTMLElement).setAttribute('data-alfred-image-highlight', imageHighlightState(el, source));
        }
        sendResponse(true);
        return false;
      }

      /**
       * Scrolls to an image by its collectImageEls() index and applies the same
       * status-colored highlight border as the Highlight toggle, briefly. If the
       * global highlight is already on (the element already carries the attribute),
       * the border is left in place; otherwise it is removed after a short delay.
       * @param {number} request.index - Zero-based index in collectImageEls() order.
       */
      if (request.action === 'scroll_to_image') {
        const index = request.index;
        // Prefer the index stamped by get_images; fall back to the full walk
        // (an element with several background images keeps only the last stamp).
        const stamped = document.querySelector(`[data-alfred-image-index="${index}"]`);
        const item: CollectedImage | undefined = stamped
          ? {
              el: stamped,
              source:
                stamped.tagName === 'IMG' ? (stamped.closest('picture') ? 'picture' : 'img') : ('background' as const)
            }
          : collectImageEls()[index];
        if (item) {
          const { el, source } = item;
          ensureImageHighlightStyle();
          const hadHighlight = el.hasAttribute('data-alfred-image-highlight');
          el.setAttribute('data-alfred-image-highlight', imageHighlightState(el, source));
          el.scrollIntoView({ behavior: 'smooth', block: 'center' });
          if (!hadHighlight) {
            setTimeout(() => {
              // Skip removal if the global Highlight toggle was switched on meanwhile.
              const globalOn = !!document.getElementById(IMAGE_HIGHLIGHT_STYLE_ID)?.dataset.global;
              if (!globalOn) el.removeAttribute('data-alfred-image-highlight');
            }, FLASH_HOLD_MS);
          }
        }
        sendResponse(true);
        return false;
      }

      // Return false for unhandled messages
      return false;
    });

    // Listeners are registered above, before any awaits, so a popup opened
    // during page load gets a queued response instead of "receiving end does
    // not exist" (issue #82).

    // Handle redirect back to intended page after successful password entry
    if (await handleReturnUrlRedirect()) {
      return; // Stop further execution since we're navigating away
    }

    // Get settings before injecting the script
    const settings = await getSettings();

    await injectScript('/alfred-main-world.js', {
      keepInDom: true
    });

    // Pass settings to main world via postMessage (avoids React hydration errors)
    window.postMessage(
      {
        type: 'alfred:settings',
        settings: settings ?? {}
      },
      '*'
    );
  }
});
