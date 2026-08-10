import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { sendRuntimeMessage, sendTabMessage } from '../messages';

interface SentTabMessage {
  tabId: number;
  message: Record<string, unknown>;
}

let tabMessages: SentTabMessage[];
let runtimeMessages: unknown[];
const realBrowser = (globalThis as { browser?: unknown }).browser;

beforeEach(() => {
  tabMessages = [];
  runtimeMessages = [];
  (globalThis as { browser?: unknown }).browser = {
    tabs: {
      sendMessage: async (tabId: number, message: Record<string, unknown>) => {
        tabMessages.push({ tabId, message });
        return 'tab-ack';
      }
    },
    runtime: {
      sendMessage: async (message: unknown) => {
        runtimeMessages.push(message);
        return 'runtime-ack';
      }
    }
  };
});

afterEach(() => {
  (globalThis as { browser?: unknown }).browser = realBrowser;
});

describe('sendTabMessage', () => {
  it('sends a bare action for payloadless messages', async () => {
    await sendTabMessage(7, 'get_headings');
    expect(tabMessages).toEqual([{ tabId: 7, message: { action: 'get_headings' } }]);
  });

  it('flattens the payload onto the action, matching the wire shape', async () => {
    await sendTabMessage(7, 'scroll_to_link', { index: 3 });
    expect(tabMessages[0]?.message).toEqual({ action: 'scroll_to_link', index: 3 });
  });

  it('carries multi-field payloads intact', async () => {
    await sendTabMessage(1, 'search_sitemap_urls', { urls: ['/a', '/b'], query: 'a' });
    expect(tabMessages[0]?.message).toEqual({
      action: 'search_sitemap_urls',
      urls: ['/a', '/b'],
      query: 'a'
    });
  });

  it('never lets a payload field shadow the action', async () => {
    await sendTabMessage(1, 'alfred_toast', { message: 'Saved', toastType: 'success' });
    expect(tabMessages[0]?.message.action).toBe('alfred_toast');
  });

  it('routes to the requested tab and returns the response', async () => {
    expect(await sendTabMessage(42, 'get_theme')).toBe('tab-ack');
    expect(tabMessages[0]?.tabId).toBe(42);
  });

  it('propagates a rejection from a tab with no content script', () => {
    (globalThis as { browser?: unknown }).browser = {
      tabs: {
        sendMessage: async () => {
          throw new Error('Could not establish connection');
        }
      }
    };
    expect(sendTabMessage(9, 'get_links')).rejects.toThrow('Could not establish connection');
  });
});

describe('sendRuntimeMessage', () => {
  it('forwards a track_action message unchanged', async () => {
    await sendRuntimeMessage({ type: 'track_action', action: 'popup_open' });
    expect(runtimeMessages).toEqual([{ type: 'track_action', action: 'popup_open' }]);
  });

  it('preserves optional metadata', async () => {
    await sendRuntimeMessage({ type: 'track_action', action: 'popup_open', metadata: { tab: 'links' } });
    expect(runtimeMessages[0]).toEqual({
      type: 'track_action',
      action: 'popup_open',
      metadata: { tab: 'links' }
    });
  });

  it('forwards a check_link_status message and returns the response', async () => {
    expect(await sendRuntimeMessage({ type: 'check_link_status', url: 'https://a.test' })).toBe('runtime-ack');
    expect(runtimeMessages[0]).toEqual({ type: 'check_link_status', url: 'https://a.test' });
  });
});
