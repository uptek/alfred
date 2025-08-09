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
  },
});
