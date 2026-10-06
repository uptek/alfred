import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { type RuntimeMessage, sendRuntimeMessage, sendTabMessage } from '../messages';

const g = globalThis as { browser?: unknown };
const realBrowser = g.browser;
let tabMessages: { tabId: number; message: Record<string, unknown> }[];
let runtimeMessages: unknown[];

beforeEach(() => {
  tabMessages = [];
  runtimeMessages = [];
  g.browser = {
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
  g.browser = realBrowser;
});

describe('sendTabMessage', () => {
  it('sends { action, ...payload } to the requested tab and returns the response', async () => {
    expect(await sendTabMessage(42, 'get_headings')).toBe('tab-ack');
    await sendTabMessage(7, 'scroll_to_link', { index: 3 });
    await sendTabMessage(1, 'search_sitemap_urls', { urls: ['/a', '/b'], query: 'a' });
    expect(tabMessages).toEqual([
      { tabId: 42, message: { action: 'get_headings' } },
      { tabId: 7, message: { action: 'scroll_to_link', index: 3 } },
      { tabId: 1, message: { action: 'search_sitemap_urls', urls: ['/a', '/b'], query: 'a' } }
    ]);
  });

  it('propagates a rejection from a tab with no content script', async () => {
    g.browser = {
      tabs: {
        sendMessage: async () => {
          throw new Error('Could not establish connection');
        }
      }
    };
    await expect(sendTabMessage(9, 'get_links')).rejects.toThrow('Could not establish connection');
  });
});

describe('sendRuntimeMessage', () => {
  it.each<RuntimeMessage>([
    { type: 'track_action', action: 'popup_open' },
    { type: 'track_action', action: 'popup_open', metadata: { tab: 'links' } },
    { type: 'check_link_status', url: 'https://a.test' }
  ])('forwards %j unchanged and returns the response', async (message) => {
    const expected = structuredClone(message);
    expect(await sendRuntimeMessage(message)).toBe('runtime-ack');
    expect(runtimeMessages).toEqual([expected]);
  });

  it('turns a synchronous throw from an invalidated extension context into a rejection', async () => {
    g.browser = {
      runtime: {
        sendMessage: () => {
          throw new Error('Extension context invalidated.');
        }
      }
    };
    await expect(sendRuntimeMessage({ type: 'track_action', action: 'popup_open' })).rejects.toThrow(
      'Extension context invalidated.'
    );
  });
});
