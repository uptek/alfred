import { getUserId, getVersion } from './helpers';
import { getItem, setItem } from './storage';
import { getSettings, isEnabled } from './settings';
import { recordSuccess } from './successNudge';
import { sendRuntimeMessage } from './messages';
import { UNINSTALL_SURVEY_URL } from './constants';

const TRACK_ENDPOINT = 'https://api.alfredext.com/track';
const UNINSTALL_ENDPOINT = 'https://api.alfredext.com/uninstall';

// Action catalog — names, per-action time-saved, and cooldown config live in
// analytics-actions.ts, which the track Worker (worker/index.ts) also imports
// as its allowlist.
import type { AnalyticsAction } from './analytics-actions';
import { TIME_SAVINGS, COOLDOWN_MS } from './analytics-actions';

/**
 * Resolve the estimated time saved (in seconds) for a given action.
 * Handles both static values and dynamic functions in the TIME_SAVINGS map.
 * @param action - The analytics action to look up
 * @param metadata - Optional context passed to dynamic time-saving functions (e.g. page_type, app_count)
 * @returns Estimated seconds saved
 */
export function getTimeSaved(action: AnalyticsAction, metadata?: Record<string, unknown>): number {
  // `?? 0` guards unregistered actions: .svelte call sites bypass tsc.
  const config = TIME_SAVINGS[action];
  return (typeof config === 'function' ? config(metadata) : config) ?? 0;
}

/**
 * Mark the review nudge as shown so the analytics event only fires once.
 * @returns true if this is the first time (event should be tracked)
 */
export async function markNudgeShown(): Promise<boolean> {
  const alreadyShown = (await getItem<boolean>('review_nudge_show_once')) ?? false;
  if (alreadyShown) return false;
  await setItem('review_nudge_show_once', true);
  return true;
}

// --- Tracking ---

/**
 * Track a user action and send it to the track Worker (skipped in dev mode).
 * @param action - The action to track
 * @param metadata - Additional context (e.g. page_url, page_type, shop_domain, app_count)
 */
export async function trackAction(action: AnalyticsAction, metadata?: Record<string, unknown>): Promise<void> {
  // Success counting is UX (review nudge), not analytics — runs even when
  // the user has opted out of tracking or in dev mode.
  recordSuccess(action).catch(() => {});
  try {
    const cooldown = COOLDOWN_MS[action];
    const cooldownKey = `cooldown_${action}`;

    // Settings and cooldown reads are independent — fetch them in parallel
    const [settings, lastFired] = await Promise.all([
      getSettings(),
      cooldown ? getItem<number>(cooldownKey) : Promise.resolve(null)
    ]);

    // Respect user's privacy opt-out
    if (!isEnabled(settings.general.analytics)) return;

    // Cooldown check — skip the event if fired too recently
    if (cooldown) {
      if (Date.now() - (lastFired ?? 0) < cooldown) return;
      await setItem(cooldownKey, Date.now());
    }

    // Get all required data
    const userId = await getUserId();
    const version = getVersion();

    // Calculate time saved
    const timeSaved = getTimeSaved(action, metadata);

    // Prepare event data
    const eventData = {
      user_id: userId,
      action,
      time_saved: timeSaved,
      version,
      metadata: metadata ?? {}
    };

    // Disable analytics in development
    if (import.meta.env.DEV) {
      console.log('[Dev Mode] Event not sent:', eventData);
      return;
    }

    // Send to the track Worker (fire and forget). keepalive lets the request survive
    // the popup closing mid-flight (e.g. actions that open a new tab).
    fetch(TRACK_ENDPOINT, {
      method: 'POST',
      keepalive: true,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(eventData)
    }).catch(() => {});
  } catch {
    // Analytics should never break the user experience
  }
}

/**
 * The page Chrome opens after uninstall. With analytics on, it goes through the
 * Worker, which records the uninstall and redirects to the survey.
 */
export async function getUninstallUrl(): Promise<string> {
  try {
    const settings = await getSettings();
    if (import.meta.env.DEV || !isEnabled(settings.general.analytics)) return UNINSTALL_SURVEY_URL;
    const params = new URLSearchParams({ user_id: await getUserId(), version: getVersion() ?? '' });
    return `${UNINSTALL_ENDPOINT}?${params}`;
  } catch {
    return UNINSTALL_SURVEY_URL;
  }
}

/**
 * Send a track_action message from a content script to the background script.
 * Falls back to calling trackAction() directly if the background is unavailable.
 */
export function sendTrackEvent(action: AnalyticsAction, metadata?: Record<string, unknown>): void {
  sendRuntimeMessage({ type: 'track_action', action, metadata }).catch(() => {
    trackAction(action, metadata);
  });
}
