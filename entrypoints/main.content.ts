export default defineContentScript({
  matches: ['<all_urls>'],
  runAt: 'document_start',
  async main() {
    await injectScript('/shopkeeper-main-world.js', {
      keepInDom: true,
    });
  },
});
