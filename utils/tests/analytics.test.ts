import { afterAll, beforeEach, describe, expect, it, mock, spyOn } from 'bun:test';
import worker from '../../worker/index';
import * as helpers from '../helpers';
import * as settingsModule from '../settings';
import * as successNudge from '../successNudge';
import { getUninstallUrl, sendTrackEvent, trackAction } from '../analytics';

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

const SURVEY_URL = 'https://tally.so/r/zx79O8';
const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

/** Runs a request through the Worker, returning its response and the rows it inserted (minus the random id). */
async function sendToWorker(request: Request) {
  const rows: unknown[][] = [];
  const DB = {
    prepare: () => ({ bind: (...values: unknown[]) => ({ run: async () => void rows.push(values.slice(1)) }) })
  };
  return { response: await worker.fetch(request, { DB }), rows };
}

beforeEach(() => {
  analyticsEnabled = true;
  fetchMock.mockClear();
  sendMessage.mockClear();
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
    await trackAction('popup.links.export', { format: 'csv' });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe('https://api.alfredext.com/track');
    expect(init).toMatchObject({ method: 'POST', keepalive: true });
    // The Worker's preflight allows only content-type, so any extra header breaks content-script sends
    expect(init.headers).toEqual({ 'Content-Type': 'application/json' });
    expect(JSON.parse(init.body as string)).toEqual({
      user_id: 'u1',
      action: 'popup.links.export',
      time_saved: 60,
      version: '2026.10.07',
      metadata: { format: 'csv' }
    });
  });

  it('sends a payload the Worker accepts and stores', async () => {
    await trackAction('popup.app.open');
    const [url, init] = fetchMock.mock.calls[0]!;
    const { rows } = await sendToWorker(new Request(url, init));
    expect(rows).toEqual([['u1', 'popup.app.open', 0, '2026.10.07', '{}', null]]);
  });

  it('swallows a network failure', async () => {
    fetchMock.mockImplementationOnce(() => Promise.reject(new TypeError('Failed to fetch')));
    expect(await trackAction('popup.app.open')).toBeUndefined();
    await flush();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('sends nothing when the user opted out of analytics', async () => {
    analyticsEnabled = false;
    await trackAction('popup.app.open');
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('getUninstallUrl', () => {
  it('routes the survey through the Worker, which records the uninstall', async () => {
    const url = await getUninstallUrl();
    expect(url).toBe('https://api.alfredext.com/uninstall?user_id=u1&version=2026.10.07');
    const { response, rows } = await sendToWorker(new Request(url));
    expect(response.headers.get('Location')).toBe(SURVEY_URL);
    expect(rows).toEqual([['u1', 'system.extension.uninstall', 0, '2026.10.07', '{}', null]]);
  });

  it.each([
    ['the user opted out of analytics', () => (analyticsEnabled = false)],
    ['settings cannot be read', () => spies[0]!.mockImplementationOnce(() => Promise.reject(new Error('no storage')))]
  ])('opens the survey directly when %s', async (_, arrange) => {
    arrange();
    expect(await getUninstallUrl()).toBe(SURVEY_URL);
  });
});

describe('sendTrackEvent', () => {
  it('routes through the background when it is reachable', async () => {
    sendTrackEvent('storefront.cartograph.open', { a: 1 });
    await flush();
    expect(sendMessage).toHaveBeenCalledWith({
      type: 'track_action',
      action: 'storefront.cartograph.open',
      metadata: { a: 1 }
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('posts directly to the Worker when the background is unreachable', async () => {
    sendMessage.mockImplementationOnce(() => Promise.reject(new Error('Receiving end does not exist')));
    sendTrackEvent('storefront.cartograph.open');
    await flush();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0]![0]).toBe('https://api.alfredext.com/track');
  });
});
