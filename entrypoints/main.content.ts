export default defineContentScript({
  matches: ['<all_urls>'],
  async main() {
    await injectScript('/shopkeeper-utils.js', {
      keepInDom: true,
    });
  },
});
