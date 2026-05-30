import { getItem } from '@/utils/storage';
import { sendTrackEvent } from '@/utils/analytics';
import { handleReturnUrlRedirect } from '@/utils/storefrontPasswordRedirect';

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

      // Return false for unhandled messages
      return false;
    });
  }
});
