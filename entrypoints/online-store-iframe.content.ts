export default defineContentScript({
  matches: ['https://online-store-web.shopifyapps.com/*'],
  allFrames: true,
  runAt: 'document_start',
  main() {
    console.log('hello world');
  },
});