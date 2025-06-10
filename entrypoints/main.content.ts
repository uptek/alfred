export default defineContentScript({
  matches: ['<all_urls>'],
  async main() {
    await injectScript('/shopkeeper-main-world.js', {
      keepInDom: true,
    });
  },
});
