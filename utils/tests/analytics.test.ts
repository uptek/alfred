import { afterAll, beforeEach, describe, expect, it, mock, spyOn } from 'bun:test';
import worker from '../../worker/index';
import * as helpers from '../helpers';
import * as settingsModule from '../settings';
import * as successNudge from '../successNudge';
import { sendTrackEvent, trackAction } from '../analytics';

// trackAction's storage-backed dependencies are spied, not module-mocked, so
// their own tests stay intact. fetch and browser are swapped on globalThis and
// restored after.
const g = globalThis as Record<string, unknown>;
const realFetch = g.fetch;
const realBrowser = g.browser;

const fetchMock = mock((_url: string, _init: RequestInit) => Promise.resolve(new Response()));
const sendMessage = mock((_message: unknown) => Promise.resolve());
let analyticsEnabled = true;

const spies = [
  spyOn(settingsModule, 'getSettings').mockImplementation(async () =>
    settingsModule.mergeSettings({ general: { analytics: analyticsEnabled } })
  ),
  spyOn(helpers, 'getUserId').mockImplementation(async () => 'u1'),
  spyOn(helpers, 'getVersion').mockImplementation(() => '2026.10.07'),
  spyOn(successNudge, 'recordSuccess').mockImplementation(async () => {})
];

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

beforeEach(() => {
  analyticsEnabled = true;
  fetchMock.mockReset();
  fetchMock.mockImplementation(() => Promise.resolve(new Response()));
  sendMessage.mockReset();
  sendMessage.mockImplementation(() => Promise.resolve());
  g.fetch = fetchMock;
  g.browser = { runtime: { sendMessage } };
});

afterAll(() => {
  for (const spy of spies) spy.mockRestore();
  g.fetch = realFetch;
  g.browser = realBrowser;
});

describe('trackAction', () => {
  it('posts the event to the track Worker with no Authorization header', async () => {
    await trackAction('links_export', { format: 'csv' });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe('https://api.alfredext.com/track');
    expect(init).toMatchObject({ method: 'POST', keepalive: true });
    // The Worker's preflight allows only content-type, so any extra header breaks content-script sends
    expect(init.headers).toEqual({ 'Content-Type': 'application/json' });
    expect(JSON.parse(init.body as string)).toEqual({
      user_id: 'u1',
      action: 'links_export',
      time_saved: 60,
      version: '2026.10.07',
      metadata: { format: 'csv' }
    });
  });

  it('sends a payload the Worker accepts and stores', async () => {
    await trackAction('popup_open');
    const [url, init] = fetchMock.mock.calls[0]!;
    const inserts: unknown[][] = [];
    const env = {
      DB: { prepare: () => ({ bind: (...values: unknown[]) => ({ run: async () => void inserts.push(values) }) }) }
    };
    await worker.fetch(new Request(url, init), env);
    expect(inserts.map((values) => values.slice(1))).toEqual([['u1', 'popup_open', 0, '2026.10.07', '{}']]);
  });

  it('swallows a network failure', async () => {
    fetchMock.mockImplementation(() => Promise.reject(new TypeError('Failed to fetch')));
    expect(await trackAction('popup_open')).toBeUndefined();
    await flush();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('sends nothing when the user opted out of analytics', async () => {
    analyticsEnabled = false;
    await trackAction('popup_open');
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('sendTrackEvent', () => {
  it('routes through the background when it is reachable', async () => {
    sendTrackEvent('cartograph_open', { a: 1 });
    await flush();
    expect(sendMessage).toHaveBeenCalledWith({ type: 'track_action', action: 'cartograph_open', metadata: { a: 1 } });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('posts directly to the Worker when the background is unreachable', async () => {
    sendMessage.mockImplementation(() => Promise.reject(new Error('Receiving end does not exist')));
    sendTrackEvent('cartograph_open');
    await flush();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0]![0]).toBe('https://api.alfredext.com/track');
  });
});
