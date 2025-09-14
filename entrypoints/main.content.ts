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

    /**
     * Listen for messages from registered scripts,
     * relay them to the main world script,
     * and send the response back to the registered script
     */
    browser.runtime.onMessage.addListener((request, _sender, sendResponse) => {
      if (request.action === 'get_theme') {
        // Create a unique event ID to handle the response
        const eventId = `alfred:get_theme_response_${Date.now()}`;

        // Listen for the response from main world
        const handleThemeData = (event: any) => {
          window.removeEventListener(eventId, handleThemeData);
          sendResponse(event.detail);
        };

        window.addEventListener(eventId, handleThemeData);

        // Request theme data from the already-injected Alfred script
        window.dispatchEvent(new CustomEvent('alfred:request_theme', {
          detail: { responseEvent: eventId }
        }));

        // Return true to indicate async response
        return true;
      }
    });
  },
});
