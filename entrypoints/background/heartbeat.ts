import { trackAction } from '@/utils/analytics';

const ALARM = 'heartbeat';

/**
 * Track a heartbeat about once a day while Alfred is enabled. A user whose heartbeats
 * stop without an uninstall event has disabled Alfred or stopped using Chrome.
 */
export async function startHeartbeat(): Promise<void> {
  // Added before any await: a waking service worker only hears listeners from its first turn
  browser.alarms.onAlarm.addListener(({ name }) => {
    if (name === ALARM) void trackAction('system.extension.ping');
  });
  // create() on an existing name restarts its timer, and the worker wakes many times a day
  if (!(await browser.alarms.get(ALARM))) {
    await browser.alarms.create(ALARM, { delayInMinutes: 1, periodInMinutes: 24 * 60 });
  }
}
