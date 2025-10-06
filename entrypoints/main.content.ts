export default defineContentScript({
  matches: ['<all_urls>'],
  runAt: 'document_start',
  async main() {
    await injectScript('/alfred-main-world.js', {
      keepInDom: true,
    });

    // Listen for tracking events from the main world
    // @ts-expect-error - CustomEvent is not typed
    window.addEventListener('alfred:track', async (event: CustomEvent) => {
      try {
        const { action, metadata } = event.detail;

        // Send to background script
        await browser.runtime.sendMessage({
          type: 'track_action',
          action,
          metadata,
        });
      } catch (error) {
        console.error('Failed to send tracking event:', error);
      }
    });

    // Listen for postMessage responses from main world
    window.addEventListener('message', (event) => {
      if (event.source !== window) return;

      if (event.data && event.data.type === 'alfred:theme_response') {
        const { requestId, data } = event.data;
        // Dispatch custom event with the response data
        window.dispatchEvent(
          new CustomEvent(`alfred:theme_response_${requestId}`, {
            detail: data,
          })
        );
      }
    });

    /**
     * Listen for messages from registered scripts,
     * relay them to the main world script,
     * and send the response back to the registered script
     */
    browser.runtime.onMessage.addListener((request, _sender, sendResponse) => {
      if (request.action === 'get_theme') {
        // Create a unique request ID
        const requestId = Date.now() + '_' + Math.random();

        // Set up listener for response
        let responseHandled = false;

        const handleThemeResponse = (event: any) => {
          if (responseHandled) return;
          responseHandled = true;

          window.removeEventListener(
            `alfred:theme_response_${requestId}`,
            handleThemeResponse
          );
          clearTimeout(timeoutId);

          sendResponse(
            event.detail || {
              isShopify: false,
              theme: null,
              shop: null,
            }
          );
        };

        // Add timeout fallback
        const timeoutId = setTimeout(() => {
          if (responseHandled) return;
          responseHandled = true;

          window.removeEventListener(
            `alfred:theme_response_${requestId}`,
            handleThemeResponse
          );
          sendResponse({
            isShopify: false,
            theme: null,
            shop: null,
          });
        }, 200);

        window.addEventListener(
          `alfred:theme_response_${requestId}`,
          handleThemeResponse
        );

        // Use postMessage to request theme data
        window.postMessage(
          {
            type: 'alfred:request_theme',
            requestId: requestId,
          },
          '*'
        );

        // Return true to indicate async response
        return true;
      }

      // Return false for unhandled messages
      return false;
    });
  },
});
