import { browser } from 'wxt/browser';

/**
 * Lets Alfred's pages frame what they show. YouTube embeds refuse to play without a Referer,
 * which extension pages don't send, and changelog.shopify.com forbids framing with
 * X-Frame-Options. The rules apply only to frames inside Alfred's own pages.
 *
 * The page installs the rule itself instead of relying on the background worker: session
 * rules start empty in every browser session, and the worker can start after the first frame.
 */
export function allowFrames() {
  return browser.declarativeNetRequest.updateSessionRules({
    removeRuleIds: [1, 2],
    addRules: [
      {
        id: 1,
        action: {
          type: 'modifyHeaders',
          requestHeaders: [{ header: 'referer', operation: 'set', value: 'https://uptek.com/' }]
        },
        condition: {
          requestDomains: ['www.youtube.com'],
          resourceTypes: ['sub_frame'],
          initiatorDomains: [location.hostname]
        }
      },
      {
        id: 2,
        action: {
          type: 'modifyHeaders',
          responseHeaders: [{ header: 'x-frame-options', operation: 'remove' }]
        },
        condition: {
          requestDomains: ['changelog.shopify.com'],
          resourceTypes: ['sub_frame'],
          initiatorDomains: [location.hostname]
        }
      }
    ]
  });
}
