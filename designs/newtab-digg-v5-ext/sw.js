// Rules apply only to frames inside this extension's pages.
// 1: lift community.shopify.dev's frame blocking.
// 2: YouTube embeds refuse to play without a Referer (Error 153), and extension pages send none.
const setRule = () =>
  chrome.declarativeNetRequest.updateSessionRules({
    removeRuleIds: [1, 2],
    addRules: [{
      id: 1,
      action: {
        type: 'modifyHeaders',
        responseHeaders: [
          { header: 'x-frame-options', operation: 'remove' },
          { header: 'content-security-policy', operation: 'remove' },
        ],
      },
      condition: { requestDomains: ['community.shopify.dev'], resourceTypes: ['sub_frame'], initiatorDomains: [chrome.runtime.id] },
    }, {
      id: 2,
      action: { type: 'modifyHeaders', requestHeaders: [{ header: 'referer', operation: 'set', value: 'https://uptek.com/' }] },
      condition: { requestDomains: ['www.youtube.com'], resourceTypes: ['sub_frame'], initiatorDomains: [chrome.runtime.id] },
    }],
  });
chrome.runtime.onInstalled.addListener(setRule);
chrome.runtime.onStartup.addListener(setRule);
chrome.action.onClicked.addListener(() => chrome.tabs.create({ url: 'newtab.html?v=2' }));
