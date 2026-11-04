import { afterAll, beforeEach, describe, expect, it, spyOn } from 'bun:test';
import * as storage from '../storage';
import { nudgeDeferred, nudgeRated, onSuccessNudge, recordTimeSaved } from '../successNudge';

// Storage is spied onto an in-memory map, not module-mocked, so other test
// files keep their own stand-ins.
const store = new Map<string, unknown>();
const spies = [
  spyOn(storage, 'getItem').mockImplementation(
    async <T>(key: string) => structuredClone(store.get(key) ?? null) as T | null
  ),
  spyOn(storage, 'setItem').mockImplementation(async <T>(key: string, value: T) => {
    store.set(key, structuredClone(value));
  })
];

const STATE_KEY = 'success_nudge_state';
const DAY = 24 * 60 * 60 * 1000;
const state = () => store.get(STATE_KEY) as { score: number; lastShownAt: number; impressions: number };

let shows = 0;
const show = () => void shows++;

beforeEach(() => {
  store.clear();
  shows = 0;
  onSuccessNudge(show);
});

afterAll(() => {
  onSuccessNudge(null);
  for (const spy of spies) spy.mockRestore();
});

describe('review nudge', () => {
  it('shows once five minutes are saved, then starts over', async () => {
    await recordTimeSaved(299);
    expect(shows).toBe(0);

    await recordTimeSaved(1);
    expect(shows).toBe(1);
    expect(state()).toMatchObject({ score: 0, impressions: 1 });
  });

  it('waits five days between shows', async () => {
    await recordTimeSaved(300);
    await recordTimeSaved(300);
    expect(shows).toBe(1);

    state().lastShownAt -= 5 * DAY;
    await recordTimeSaved(1);
    expect(shows).toBe(2);
  });

  it('holds a due nudge until a popup event saves time', async () => {
    onSuccessNudge(null);
    await recordTimeSaved(300);
    onSuccessNudge(show);

    await recordTimeSaved(0);
    expect(shows).toBe(0);

    await recordTimeSaved(5);
    expect(shows).toBe(1);
  });

  it('stops after a rating or the seventh "Maybe later"', async () => {
    await nudgeRated();
    await recordTimeSaved(300);
    expect(shows).toBe(0);

    store.clear();
    for (let i = 0; i < 7; i++) await nudgeDeferred();
    await recordTimeSaved(300);
    expect(shows).toBe(0);
  });
});
