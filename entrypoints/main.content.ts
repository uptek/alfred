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
       * Scrolls to a heading by its zero-based DOM index and applies a brief green outline highlight.
       * @param {number} request.index - Zero-based index of the heading among all H1-H6 elements.
       */
      if (request.action === 'scroll_to_heading') {
        const allHeadings = document.querySelectorAll('h1, h2, h3, h4, h5, h6');
        const target = allHeadings[(request as { action: string; index: number }).index];
        if (target instanceof HTMLElement) {
          target.scrollIntoView({ behavior: 'smooth', block: 'center' });
          target.style.outline = '2px solid #95bf47';
          target.style.outlineOffset = '2px';
          target.style.transition = 'outline-color 0.6s';
          setTimeout(() => {
            target.style.outlineColor = 'transparent';
            setTimeout(() => {
              target.style.outline = '';
              target.style.outlineOffset = '';
              target.style.transition = '';
            }, 600);
          }, 1200);
        }
        sendResponse(true);
        return false;
      }

      // Return false for unhandled messages
      return false;
    });
  }
});
