import { getItem } from '@/utils/storage';
import { sendTrackEvent } from '@/utils/analytics';
import { handleReturnUrlRedirect } from '@/utils/storefrontPasswordRedirect';
import { Toast } from '@/utils/toast';
import { headingText } from './popup/headings';
import { classifyLink, isInsecureHttp, linkText, relFlags, samePageFragment } from './popup/links';
import {
  isExternalAssetUrl,
  isRenderBlockingScript,
  isRenderBlockingStylesheet,
  scriptLoad,
  scriptSubtype
} from './popup/assets';

type CollectedImage = { el: Element; source: 'img' | 'picture' | 'background'; bg?: string };

/**
 * Collects all page images in a deterministic order shared by get_images,
 * highlight_images, and scroll_to_image so indices stay consistent across calls.
 * Order: every <img> in DOM order, then every element with a CSS background-image
 * in DOM order. Inline <svg> icons are intentionally excluded.
 */
function collectImageEls(): CollectedImage[] {
  const out: CollectedImage[] = [];
  for (const el of document.querySelectorAll('img')) {
    out.push({ el, source: el.closest('picture') ? 'picture' : 'img' });
  }
  for (const el of document.querySelectorAll<HTMLElement>('body *')) {
    if (el.tagName === 'IMG') continue;
    const bg = getComputedStyle(el).backgroundImage;
    if (bg && bg !== 'none' && /url\(/i.test(bg)) {
      // Carry the resolved background-image string so get_images doesn't re-run getComputedStyle.
      out.push({ el, source: 'background', bg });
    }
  }
  return out;
}

const flashTimers = new WeakMap<HTMLElement, number[]>();

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
  target.style.transition = 'outline-color 0.8s';
  const fade = window.setTimeout(() => {
    target.style.outlineColor = 'transparent';
  }, 5000);
  const clear = window.setTimeout(() => {
    target.style.outline = '';
    target.style.outlineOffset = '';
    target.style.transition = '';
    flashTimers.delete(target);
  }, 5800);
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
  if (img.complete && img.naturalWidth === 0 && (img.currentSrc || img.src)) return 'broken';
  const altAttr = img.getAttribute('alt');
  if (altAttr === null || altAttr.trim() === '') return 'alt';
  return 'ok';
}

export default defineContentScript({
  matches: ['<all_urls>'],
  runAt: 'document_start',
  async main() {
    // Handle redirect back to intended page after successful password entry
    if (await handleReturnUrlRedirect()) {
      return; // Stop further execution since we're navigating away
    }

    // Get settings before injecting the script
    const settings = await getItem<AlfredSettings>('settings');

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

    // Listen for tracking events from the main world
    window.addEventListener('alfred:track', (event: Event) => {
      const { action, metadata } = (
        event as CustomEvent<{
          action: string;
          metadata?: Record<string, unknown>;
        }>
      ).detail;
      sendTrackEvent(action as import('@/utils/analytics').AnalyticsAction, metadata);
    });

    // Listen for postMessage responses from main world
    window.addEventListener('message', (event: MessageEvent<{ type: string; requestId: string; data: unknown }>) => {
      if (event.source !== window) return;

      if (event.data?.type === 'alfred:theme_response') {
        const { requestId, data } = event.data;
        // Dispatch custom event with the response data
        window.dispatchEvent(
          new CustomEvent(`alfred:theme_response_${requestId}`, {
            detail: data
          })
        );
      }
    });

    /**
     * Listen for messages from registered scripts,
     * relay them to the main world script,
     * and send the response back to the registered script
     */
    browser.runtime.onMessage.addListener((request: { action: string }, _sender, sendResponse) => {
      // Surface a toast on behalf of the background, which has no DOM of its own.
      if (request.action === 'alfred_toast') {
        const { message, toastType } = request as {
          action: string;
          message?: string;
          toastType?: 'success' | 'error';
        };
        if (message) Toast.show(message, toastType === 'success' ? 'success' : 'error');
        return false;
      }

      /**
       * Relays theme detection request to the main world script via postMessage and returns Shopify theme data.
       * @returns {{ isShopify: boolean, theme: object | null, shop: string | null }}
       */
      if (request.action === 'get_theme') {
        // Create a unique request ID
        const requestId = Date.now() + '_' + Math.random();

        // Set up listener for response
        let responseHandled = false;

        const handleThemeResponse = (event: Event) => {
          if (responseHandled) return;
          responseHandled = true;

          window.removeEventListener(`alfred:theme_response_${requestId}`, handleThemeResponse);
          clearTimeout(timeoutId);

          sendResponse(
            (
              event as CustomEvent<{
                isShopify: boolean;
                theme: unknown;
                shop: unknown;
              }>
            ).detail ?? {
              isShopify: false,
              theme: null,
              shop: null
            }
          );
        };

        // Add timeout fallback
        const timeoutId = setTimeout(() => {
          if (responseHandled) return;
          responseHandled = true;

          window.removeEventListener(`alfred:theme_response_${requestId}`, handleThemeResponse);
          sendResponse({
            isShopify: false,
            theme: null,
            shop: null
          });
        }, 200);

        window.addEventListener(`alfred:theme_response_${requestId}`, handleThemeResponse);

        // Use postMessage to request theme data
        window.postMessage(
          {
            type: 'alfred:request_theme',
            requestId: requestId
          },
          '*'
        );

        // Return true to indicate async response
        return true;
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
       * Extracts all anchor links from the page in DOM order. Each anchor is
       * stamped with its index so scroll_to_link can find it even if the DOM
       * mutates afterwards (lazy menus, carousels).
       * @returns {RawLink[]}
       */
      if (request.action === 'get_links') {
        const pageHost = location.hostname;
        const links = Array.from(document.querySelectorAll('a[href]')).map((el, i) => {
          const anchor = el as HTMLAnchorElement;
          anchor.setAttribute('data-alfred-link-index', String(i));
          const rel = anchor.getAttribute('rel') ?? '';
          const { nofollow, sponsored, ugc } = relFlags(rel);
          const fragment = samePageFragment(anchor.href, location.href);
          const isBrokenAnchor =
            fragment !== null &&
            fragment !== '' &&
            fragment !== 'top' && // #top scrolls to the document top even without a target
            !document.getElementById(fragment) &&
            document.getElementsByName(fragment).length === 0;
          return {
            index: i,
            href: anchor.href,
            text: linkText(anchor),
            rel,
            kind: classifyLink(anchor.href, pageHost),
            isNofollow: nofollow,
            isSponsored: sponsored,
            isUgc: ugc,
            isImage: anchor.querySelector('img, svg, picture') !== null,
            isHidden: !anchor.checkVisibility(),
            isInsecure: isInsecureHttp(anchor.href),
            isBrokenAnchor
          };
        });
        sendResponse(links);
        return false;
      }

      /**
       * Extracts all scripts and stylesheets from the page in DOM order.
       * Covers <script> (external + inline), <link rel="stylesheet">, and inline <style>.
       * Inline content is capped to bound the messaging payload.
       * @returns {import('./popup/types').RawAsset[]}
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

        // Pull already-recorded timing from the Resource Timing API — no new network
        // request. Cross-origin assets without a Timing-Allow-Origin header report 0
        // (opaque), so third-party trackers often have no size/status/duration.
        const sizeOf = (e: PerformanceResourceTiming) => e.encodedBodySize || e.decodedBodySize || 0;
        const timingByUrl = new Map<string, PerformanceResourceTiming>();
        try {
          for (const entry of performance.getEntriesByType('resource') as PerformanceResourceTiming[]) {
            const prev = timingByUrl.get(entry.name);
            if (!prev || sizeOf(entry) > sizeOf(prev)) timingByUrl.set(entry.name, entry);
          }
        } catch {
          // Resource Timing unavailable; timing-derived fields stay at defaults
        }

        const cachedOf = (t?: PerformanceResourceTiming): boolean =>
          !!t && t.transferSize === 0 && t.decodedBodySize > 0;
        const durationOf = (t?: PerformanceResourceTiming): number => (t ? Math.round(t.duration) : 0);
        const statusOf = (t?: PerformanceResourceTiming): number =>
          t ? ((t as PerformanceResourceTiming & { responseStatus?: number }).responseStatus ?? 0) : 0;
        const sizeFromTiming = (t?: PerformanceResourceTiming): number => (t ? sizeOf(t) : 0);

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
              cached: cachedOf(t),
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
              cached: cachedOf(t),
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
        const isExternalUrl = (url: string): boolean => {
          try {
            return new URL(url, location.href).hostname !== pageHost;
          } catch {
            return true;
          }
        };
        const sizeOf = (e: PerformanceResourceTiming) => e.encodedBodySize || e.decodedBodySize || 0;
        const timingByUrl = new Map<string, PerformanceResourceTiming>();
        try {
          for (const entry of performance.getEntriesByType('resource') as PerformanceResourceTiming[]) {
            const prev = timingByUrl.get(entry.name);
            if (!prev || sizeOf(entry) > sizeOf(prev)) timingByUrl.set(entry.name, entry);
          }
        } catch {
          // Resource Timing unavailable; size/cached stay at defaults
        }
        const cachedOf = (t?: PerformanceResourceTiming): boolean =>
          !!t && t.transferSize === 0 && t.decodedBodySize > 0;

        const resolveUrl = (url: string): string => {
          try {
            return new URL(url, location.href).href;
          } catch {
            return url;
          }
        };
        const bgUrl = (bg: string): string => {
          const m = /url\((['"]?)(.*?)\1\)/i.exec(bg);
          return m && m[2] ? resolveUrl(m[2]) : '';
        };
        const formatOf = (url: string): string => {
          try {
            const path = new URL(url, location.href).pathname;
            const ext = path.slice(path.lastIndexOf('.') + 1).toLowerCase();
            if (ext === 'jpeg') return 'jpg';
            return /^(png|jpg|webp|avif|gif|svg)$/.test(ext) ? ext : '';
          } catch {
            return '';
          }
        };

        const images = collectImageEls().map(({ el, source, bg }, i) => {
          if (source === 'background') {
            const src = bgUrl(bg ?? '');
            const t = src ? timingByUrl.get(src) : undefined;
            return {
              index: i,
              source,
              src,
              alt: null,
              lacksAlt: false,
              isResponsive: false,
              naturalWidth: 0,
              naturalHeight: 0,
              format: formatOf(src),
              loading: 'none',
              size: t ? sizeOf(t) : 0,
              cached: cachedOf(t),
              isExternal: src ? isExternalUrl(src) : false,
              isHidden: !(el as HTMLElement).checkVisibility(),
              broken: false
            };
          }
          const img = el as HTMLImageElement;
          const src = img.currentSrc || img.src || '';
          const t = src ? timingByUrl.get(src) : undefined;
          const altAttr = img.getAttribute('alt');
          const loadingAttr = img.getAttribute('loading');
          return {
            index: i,
            source,
            src,
            alt: altAttr,
            lacksAlt: altAttr === null || altAttr.trim() === '',
            isResponsive: source === 'picture' || img.srcset !== '' || img.sizes !== '',
            naturalWidth: img.naturalWidth,
            naturalHeight: img.naturalHeight,
            format: formatOf(src),
            loading: loadingAttr === 'lazy' ? 'lazy' : loadingAttr === 'eager' ? 'eager' : 'none',
            size: t ? sizeOf(t) : 0,
            cached: cachedOf(t),
            isExternal: src ? isExternalUrl(src) : false,
            isHidden: !img.checkVisibility(),
            broken: img.complete && img.naturalWidth === 0 && src !== ''
          };
        });
        sendResponse(images);
        return false;
      }

      /**
       * Toggles colored dashed outlines on all page links (green=internal, purple=external, red=nofollow).
       * @param {boolean} request.enabled - Whether to apply or remove highlights.
       */
      if (request.action === 'highlight_links') {
        const { enabled } = request as { action: string; enabled: boolean };
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
          const kind = classifyLink(anchor.href, pageHost);
          anchor.setAttribute(
            'data-alfred-link-highlight',
            nofollow || sponsored || ugc ? 'nofollow' : kind === 'internal' ? 'internal' : 'external'
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
        const { index } = request as { action: string; index: number };
        const target =
          document.querySelector(`a[data-alfred-link-index="${index}"]`) ?? document.querySelectorAll('a[href]')[index];
        if (target instanceof HTMLElement) flashOutline(target);
        sendResponse(true);
        return false;
      }

      if (request.action === 'scroll_to_heading') {
        const allHeadings = document.querySelectorAll('h1, h2, h3, h4, h5, h6');
        const target = allHeadings[(request as { action: string; index: number }).index];
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
        const { enabled } = request as { action: string; enabled: boolean };
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
        const item = collectImageEls()[(request as { action: string; index: number }).index];
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
            }, 5000);
          }
        }
        sendResponse(true);
        return false;
      }

      // Return false for unhandled messages
      return false;
    });
  }
});
