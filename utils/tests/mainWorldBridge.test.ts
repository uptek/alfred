import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { createBridgeClient, createBridgeServer } from '../mainWorldBridge';

type Listener = (event: { source: unknown; data: unknown }) => void;

interface FakeWindow {
  listeners: Listener[];
  posted: { data: unknown; targetOrigin: string }[];
  location: { origin: string };
  addEventListener(type: string, listener: Listener): void;
  postMessage(data: unknown, targetOrigin: string): void;
}

let win: FakeWindow;
const realWindow = (globalThis as { window?: unknown }).window;

beforeEach(() => {
  win = {
    listeners: [],
    posted: [],
    location: { origin: 'https://shop.example' },
    addEventListener(type, listener) {
      if (type === 'message') win.listeners.push(listener);
    },
    postMessage(data, targetOrigin) {
      win.posted.push({ data, targetOrigin });
      // Deliver asynchronously, like the real event loop does.
      queueMicrotask(() => {
        // Copy first: a delivered message can register another listener.
        for (const listener of win.listeners.slice()) listener({ source: win, data });
      });
    }
  };
  (globalThis as { window?: unknown }).window = win;
});

afterEach(() => {
  (globalThis as { window?: unknown }).window = realWindow;
});

interface Methods extends Record<string, (payload: never) => unknown> {
  ping: () => string;
  double: (payload: { n: number }) => number;
  slow: () => Promise<never>;
  boom: () => never;
  rejects: () => Promise<never>;
}

/** Starts the 'test' server and returns a client for it. */
function serve(overrides: Partial<Methods> = {}, timeoutMs?: number) {
  createBridgeServer<Methods>('test', {
    ping: () => 'pong',
    double: ({ n }) => n * 2,
    slow: () => new Promise<never>(() => {}),
    boom: () => {
      throw new Error('handler exploded');
    },
    rejects: () => Promise.reject(new Error('async failure')),
    ...overrides
  } as Methods);
  return createBridgeClient<Methods>('test', timeoutMs);
}

describe('bridge round trip', () => {
  it('resolves concurrent calls with their own results', async () => {
    const client = serve();
    const results = await Promise.all([1, 2, 3].map((n) => client.call('double', { n })));
    expect(results).toEqual([2, 4, 6]);
  });

  it('posts to the window origin, never a wildcard', async () => {
    await serve().call('ping');
    expect(win.posted.length).toBeGreaterThan(0);
    expect(win.posted.every((p) => p.targetOrigin === 'https://shop.example')).toBe(true);
  });

  it('gives two same-namespace clients disjoint request ids', async () => {
    const a = serve();
    const b = createBridgeClient<Methods>('test');
    await Promise.all([a.call('double', { n: 1 }), b.call('double', { n: 2 })]);
    const ids = win.posted
      .map((p) => p.data as { type?: string; requestId?: string })
      .filter((d) => d.type === 'alfred:test_request')
      .map((d) => d.requestId);
    expect(ids).toHaveLength(2);
    expect(new Set(ids).size).toBe(2);
  });
});

describe('bridge error paths', () => {
  it.each([
    ['the handler throws synchronously', 'boom', 'handler exploded'],
    ['the handler returns a rejected promise', 'rejects', 'async failure'],
    ['the method is unknown', 'nope', 'Unknown method: nope']
  ])('rejects when %s', async (_, method, message) => {
    await expect(serve().call(method as keyof Methods & string)).rejects.toThrow(message);
  });

  it.each([
    ['the client default', 10, undefined],
    ['a per-call override', 60_000, 10]
  ])('rejects with the method name once %s timeout elapses', async (_, clientTimeout, callTimeout) => {
    await expect(serve({}, clientTimeout).call('slow', undefined, callTimeout)).rejects.toThrow(
      'test bridge timeout: slow did not respond within 10ms'
    );
  });

  it('drops a late response whose call already timed out', async () => {
    let release: ((value: string) => void) | undefined;
    const client = serve(
      { slow: () => new Promise<never>((resolve) => (release = resolve as (v: string) => void)) },
      10
    );
    await expect(client.call('slow')).rejects.toThrow(/timeout/);
    // A late response for a dropped request id must not throw or double-settle.
    release?.('late');
    await Bun.sleep(10);
  });
});

describe('bridge isolation', () => {
  it.each([
    [
      'from another window',
      (id?: string) => ({ source: {}, data: { type: 'alfred:test_response', requestId: id, data: 'forged' } })
    ],
    ['without a request id', () => ({ source: win, data: { type: 'alfred:test_response', data: 'no id' } })],
    ['with no data', () => ({ source: win, data: undefined })]
  ])('ignores responses %s', async (_, forge) => {
    const call = serve({}, 10).call('ping');
    // The forgery lands before the real response is delivered.
    const id = (win.posted[0]?.data as { requestId?: string } | undefined)?.requestId;
    expect(id).toBeString();
    for (const listener of win.listeners.slice()) listener(forge(id));
    expect(await call).toBe('pong');
  });

  it('ignores traffic from a different namespace', async () => {
    createBridgeServer<Methods>('other', { ping: () => 'other-pong' } as Methods);
    expect(await serve().call('ping')).toBe('pong');
  });
});
