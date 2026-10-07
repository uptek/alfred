import { afterAll, beforeEach, describe, expect, it, mock, spyOn } from 'bun:test';
import * as analytics from '../../../utils/analytics';
import { startHeartbeat } from '../heartbeat';

// browser is swapped on globalThis and trackAction is spied, both restored after,
// since all test files share one process.
const g = globalThis as Record<string, unknown>;
const realBrowser = g.browser;

let existingAlarm: { name: string } | undefined;
let onAlarm: ((alarm: { name: string }) => void) | undefined;
const create = mock(async (_name: string, _info: unknown) => {});
const track = spyOn(analytics, 'trackAction').mockImplementation(async () => {});

beforeEach(() => {
  existingAlarm = undefined;
  onAlarm = undefined;
  create.mockClear();
  track.mockClear();
  g.browser = {
    alarms: {
      get: async () => existingAlarm,
      create,
      onAlarm: { addListener: (listener: typeof onAlarm) => (onAlarm = listener) }
    }
  };
});

afterAll(() => {
  track.mockRestore();
  g.browser = realBrowser;
});

describe('startHeartbeat', () => {
  it('schedules a daily alarm when none exists', async () => {
    await startHeartbeat();
    expect(create).toHaveBeenCalledWith('heartbeat', { delayInMinutes: 1, periodInMinutes: 24 * 60 });
  });

  it('keeps an existing alarm, since recreating it restarts the timer', async () => {
    existingAlarm = { name: 'heartbeat' };
    await startHeartbeat();
    expect(create).not.toHaveBeenCalled();
  });

  it('listens synchronously and tracks only its own alarm', async () => {
    const started = startHeartbeat();
    expect(onAlarm).toBeDefined();
    await started;

    onAlarm!({ name: 'other' });
    expect(track).not.toHaveBeenCalled();

    onAlarm!({ name: 'heartbeat' });
    expect(track).toHaveBeenCalledWith('heartbeat');
  });
});
