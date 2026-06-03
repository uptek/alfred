import { getItem } from '@/utils/storage';
import { sendTrackEvent } from '@/utils/analytics';
import { handleReturnUrlRedirect } from '@/utils/storefrontPasswordRedirect';

type CollectedImage = { el: Element; source: 'img' | 'picture' | 'background' };

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
      out.push({ el, source: 'background' });
    }
  }
  return out;
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
          text: (el.textContent ?? '').trim(),
          isHidden: !(el as HTMLElement).checkVisibility()
        }));
        sendResponse(headings);
        return false;
      }

      /**
       * Extracts all anchor links from the page in DOM order.
       * @returns {{ index: number, href: string, text: string, rel: string, isExternal: boolean, isNofollow: boolean, isImage: boolean, isHidden: boolean }[]}
       */
      if (request.action === 'get_links') {
        const pageHost = location.hostname;
        const links = Array.from(document.querySelectorAll('a[href]')).map((el, i) => {
          const anchor = el as HTMLAnchorElement;
          const rel = anchor.getAttribute('rel') ?? '';
          let isExternal = false;
          try {
            isExternal = anchor.hostname !== pageHost;
          } catch {
            isExternal = true;
          }
          return {
            index: i,
            href: anchor.href,
            text: (anchor.textContent ?? '').trim(),
            rel,
            isExternal,
            isNofollow: /\bnofollow\b/i.test(rel),
            isImage: anchor.querySelector('img, svg, picture') !== null,
            isHidden: !anchor.checkVisibility()
          };
        });
        sendResponse(links);
        return false;
      }

      /**
       * Extracts all scripts and stylesheets from the page in DOM order.
       * Covers <script> (external + inline), <link rel="stylesheet">, and inline <style>.
       * Inline content is capped to bound the messaging payload.
       * @returns {{ index: number, kind: 'script'|'style', src: string|null, isExternal: boolean, isInline: boolean, type: string, load: string, media: string, size: number, content: string|null }[]}
       */
      if (request.action === 'get_assets') {
        const pageHost = location.hostname;
        const MAX_INLINE = 20000; // cap inline content per asset (~20KB)

        const isExternalUrl = (url: string): boolean => {
          try {
            return new URL(url, location.href).hostname !== pageHost;
          } catch {
            return true;
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
            const load = inline ? 'inline' : s.async ? 'async' : s.defer ? 'defer' : 'blocking';
            const placement = placementOf(s);
            return {
              index: i,
              kind: 'script' as const,
              src,
              // Extension-injected assets are tracked separately, not as third-party "External"
              isExternal: src ? !isBrowserExtensionUrl(src) && isExternalUrl(src) : false,
              isBrowserExtension: src ? isBrowserExtensionUrl(src) : false,
              isInline: inline,
              type: s.type ? s.type : 'classic',
              load,
              media: '',
              size: inline ? byteSize(content) : sizeFromTiming(t),
              content: inline ? content.slice(0, MAX_INLINE) : null,
              placement,
              cached: cachedOf(t),
              duration: durationOf(t),
              status: statusOf(t),
              // Sync external script in <head> blocks the parser before first paint
              renderBlocking: placement === 'head' && !inline && load === 'blocking'
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
              isExternal: href ? !isBrowserExtensionUrl(href) && isExternalUrl(href) : false,
              isBrowserExtension: href ? isBrowserExtensionUrl(href) : false,
              isInline: false,
              type: 'stylesheet',
              load: 'blocking',
              media,
              size: sizeFromTiming(t),
              content: null,
              placement,
              cached: cachedOf(t),
              duration: durationOf(t),
              status: statusOf(t),
              // Stylesheets in <head> block render unless they target print only
              renderBlocking: placement === 'head' && media !== 'print'
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
            load: 'inline',
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
        const bgUrl = (el: Element): string => {
          const bg = getComputedStyle(el).backgroundImage;
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

        const images = collectImageEls().map(({ el, source }, i) => {
          if (source === 'background') {
            const src = bgUrl(el);
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
          const rel = anchor.getAttribute('rel') ?? '';
          const isNofollow = /\bnofollow\b/i.test(rel);
          let isExternal = false;
          try {
            isExternal = anchor.hostname !== pageHost;
          } catch {
            isExternal = true;
          }
          anchor.setAttribute(
            'data-alfred-link-highlight',
            isNofollow ? 'nofollow' : isExternal ? 'external' : 'internal'
          );
        });
        sendResponse(true);
        return false;
      }

      /**
       * Scrolls to a link by its zero-based DOM index and applies a brief green dashed outline highlight.
       * @param {number} request.index - Zero-based index of the link among all `a[href]` elements.
       */
      if (request.action === 'scroll_to_link') {
        const allLinks = document.querySelectorAll('a[href]');
        const target = allLinks[(request as { action: string; index: number }).index];
        if (target instanceof HTMLElement) {
          target.scrollIntoView({ behavior: 'smooth', block: 'center' });
          target.style.outline = '2px dashed #95bf47';
          target.style.outlineOffset = '3px';
          target.style.transition = 'outline-color 0.8s';
          setTimeout(() => {
            target.style.outlineColor = 'transparent';
            setTimeout(() => {
              target.style.outline = '';
              target.style.outlineOffset = '';
              target.style.transition = '';
            }, 800);
          }, 5000);
        }
        sendResponse(true);
        return false;
      }

      if (request.action === 'scroll_to_heading') {
        const allHeadings = document.querySelectorAll('h1, h2, h3, h4, h5, h6');
        const target = allHeadings[(request as { action: string; index: number }).index];
        if (target instanceof HTMLElement) {
          target.scrollIntoView({ behavior: 'smooth', block: 'center' });
          target.style.outline = '2px dashed #95bf47';
          target.style.outlineOffset = '3px';
          target.style.transition = 'outline-color 0.8s';
          setTimeout(() => {
            target.style.outlineColor = 'transparent';
            setTimeout(() => {
              target.style.outline = '';
              target.style.outlineOffset = '';
              target.style.transition = '';
            }, 800);
          }, 5000);
        }
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
        const styleId = 'alfred-image-highlights';
        const existing = document.getElementById(styleId);
        if (!enabled) {
          existing?.remove();
          document.querySelectorAll('[data-alfred-image-highlight]').forEach((el) => {
            (el as HTMLElement).removeAttribute('data-alfred-image-highlight');
          });
          sendResponse(true);
          return false;
        }
        if (!existing) {
          const style = document.createElement('style');
          style.id = styleId;
          style.textContent = `
            [data-alfred-image-highlight="ok"] { outline: 2px dashed #22c55e !important; outline-offset: 3px !important; }
            [data-alfred-image-highlight="alt"] { outline: 2px dashed #f59e0b !important; outline-offset: 3px !important; }
            [data-alfred-image-highlight="broken"] { outline: 2px dashed #ef4444 !important; outline-offset: 3px !important; }
          `;
          document.head.appendChild(style);
        }
        for (const { el, source } of collectImageEls()) {
          let state = 'ok';
          if (source !== 'background') {
            const img = el as HTMLImageElement;
            if (img.complete && img.naturalWidth === 0 && (img.currentSrc || img.src)) {
              state = 'broken';
            } else {
              const altAttr = img.getAttribute('alt');
              if (altAttr === null || altAttr.trim() === '') state = 'alt';
            }
          }
          (el as HTMLElement).setAttribute('data-alfred-image-highlight', state);
        }
        sendResponse(true);
        return false;
      }

      /**
       * Scrolls to an image by its collectImageEls() index and applies a brief highlight.
       * @param {number} request.index - Zero-based index in collectImageEls() order.
       */
      if (request.action === 'scroll_to_image') {
        const target = collectImageEls()[(request as { action: string; index: number }).index]?.el;
        if (target instanceof HTMLElement) {
          target.scrollIntoView({ behavior: 'smooth', block: 'center' });
          target.style.outline = '2px dashed #95bf47';
          target.style.outlineOffset = '3px';
          target.style.transition = 'outline-color 0.8s';
          setTimeout(() => {
            target.style.outlineColor = 'transparent';
            setTimeout(() => {
              target.style.outline = '';
              target.style.outlineOffset = '';
              target.style.transition = '';
            }, 800);
          }, 5000);
        }
        sendResponse(true);
        return false;
      }

      // Return false for unhandled messages
      return false;
    });
  }
});
