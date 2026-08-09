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

function makeWindow(origin = 'https://shop.example'): FakeWindow {
  const win: FakeWindow = {
    listeners: [],
    posted: [],
    location: { origin },
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
  return win;
}

let win: FakeWindow;
const realWindow = (globalThis as { window?: unknown }).window;

beforeEach(() => {
  win = makeWindow();
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

function serve(overrides: Partial<Methods> = {}) {
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
}

describe('bridge round trip', () => {
  it('resolves with the handler result', async () => {
    serve();
    const client = createBridgeClient<Methods>('test');
    expect(await client.call('ping')).toBe('pong');
  });

  it('passes the payload through to the handler', async () => {
    serve();
    const client = createBridgeClient<Methods>('test');
    expect(await client.call('double', { n: 21 })).toBe(42);
  });

  it('posts to the window origin, never a wildcard', async () => {
    serve();
    const client = createBridgeClient<Methods>('test');
    await client.call('ping');
    expect(win.posted.length).toBeGreaterThan(0);
    expect(win.posted.every((p) => p.targetOrigin === 'https://shop.example')).toBe(true);
  });

  it('gives two same-namespace clients disjoint request ids', async () => {
    serve();
    const a = createBridgeClient<Methods>('test');
    const b = createBridgeClient<Methods>('test');
    await Promise.all([a.call('double', { n: 1 }), b.call('double', { n: 2 })]);
    const ids = win.posted
      .map((p) => p.data as { type?: string; requestId?: string })
      .filter((d) => d.type === 'alfred:test_request')
      .map((d) => d.requestId);
    expect(ids).toHaveLength(2);
    expect(new Set(ids).size).toBe(2);
  });

  it('keeps concurrent calls distinct by request id', async () => {
    serve();
    const client = createBridgeClient<Methods>('test');
    const [a, b, c] = await Promise.all([
      client.call('double', { n: 1 }),
      client.call('double', { n: 2 }),
      client.call('double', { n: 3 })
    ]);
    expect([a, b, c]).toEqual([2, 4, 6]);
  });
});

describe('bridge error paths', () => {
  it('rejects when the handler throws synchronously', async () => {
    serve();
    const client = createBridgeClient<Methods>('test');
    expect(client.call('boom')).rejects.toThrow('handler exploded');
  });

  it('rejects when the handler returns a rejected promise', async () => {
    serve();
    const client = createBridgeClient<Methods>('test');
    expect(client.call('rejects')).rejects.toThrow('async failure');
  });

  it('rejects unknown methods instead of hanging', async () => {
    serve();
    const client = createBridgeClient<Methods>('test');
    expect(client.call('nope' as keyof Methods & string)).rejects.toThrow('Unknown method: nope');
  });

  it('rejects with the method name once the timeout elapses', async () => {
    serve();
    const client = createBridgeClient<Methods>('test', 10);
    expect(client.call('slow')).rejects.toThrow(/test bridge timeout: slow did not respond within 10ms/);
  });

  it('honors a per-call timeout override', async () => {
    serve();
    const client = createBridgeClient<Methods>('test', 60_000);
    expect(client.call('slow', undefined, 10)).rejects.toThrow(/within 10ms/);
  });

  it('does not resolve a call whose timeout already fired', async () => {
    let release: ((value: string) => void) | undefined;
    serve({ slow: () => new Promise<never>((resolve) => (release = resolve as (v: string) => void)) });
    const client = createBridgeClient<Methods>('test', 10);
    const call = client.call('slow');
    expect(call).rejects.toThrow(/timeout/);
    await new Promise((r) => setTimeout(r, 30));
    release?.('late');
    // A late response for a dropped request id must not throw or double-settle.
    await new Promise((r) => setTimeout(r, 10));
  });
});

describe('bridge isolation', () => {
  it('ignores messages from another window', async () => {
    serve();
    const client = createBridgeClient<Methods>('test', 10);
    const call = client.call('ping');
    // A foreign frame forges a response before the real one is delivered.
    const forgedId = (win.posted[0]?.data as { requestId?: string } | undefined)?.requestId;
    expect(forgedId).toBeString();
    for (const listener of win.listeners.slice()) {
      listener({ source: {}, data: { type: 'alfred:test_response', requestId: forgedId, data: 'forged' } });
    }
    expect(await call).toBe('pong');
  });

  it('ignores traffic from a different namespace', async () => {
    createBridgeServer<Methods>('other', { ping: () => 'other-pong' } as Methods);
    serve();
    const client = createBridgeClient<Methods>('test');
    expect(await client.call('ping')).toBe('pong');
  });

  it('ignores malformed messages without a request id', async () => {
    serve();
    const client = createBridgeClient<Methods>('test', 10);
    const call = client.call('ping');
    for (const listener of win.listeners.slice()) {
      listener({ source: win, data: { type: 'alfred:test_response', data: 'no id' } });
      listener({ source: win, data: undefined });
    }
    expect(await call).toBe('pong');
  });
});
