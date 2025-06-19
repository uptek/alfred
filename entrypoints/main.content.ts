export default defineContentScript({
  matches: ['<all_urls>'],
  runAt: 'document_start',
  async main() {
    await injectScript('/alfred-main-world.js', {
      keepInDom: true,
    });
  },
});
