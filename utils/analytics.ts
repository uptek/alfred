import { getUserId, getVersion } from './helpers';
import { getItem, setItem } from './storage';

const SUPABASE_URL = 'https://obrjirdnqoiailhbsnmu.supabase.co';
const SUPABASE_ANON_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9icmppcmRucW9pYWlsaGJzbm11Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTA0NzAyMzQsImV4cCI6MjA2NjA0NjIzNH0.i0cWjFKNk8HDZQsVkCn83fTKFROiNzvPf_sTP5xQwAM';
const TRACK_ENDPOINT = `${SUPABASE_URL}/functions/v1/track`;

// Action catalog — names, per-action time-saved, categories, and stats config
// live in analytics-actions.ts; analytics-actions.test.ts keeps the Supabase
// track function's allowlist in sync.
import type { AnalyticsAction } from './analytics-actions';
import { TIME_SAVINGS, EXCLUDED_FROM_STATS, COOLDOWN_MS, ACTION_CATEGORIES } from './analytics-actions';

// --- Usage Stats (local tracking) ---
//
// Accumulates per-action counts and time-saved totals in browser.storage.local
// (key: "usage_stats"). Displayed in the popup's Insights Card once the user
// crosses the milestone threshold. Completely independent of the Supabase
// analytics pipeline — works offline and in dev mode.

/** Number of tracked actions before the Insights Card becomes visible. */
const MILESTONE_THRESHOLD = 3;

/** Local usage stats persisted in `local:usage_stats`.
 *  `installedAt` is set on the first tracked action, not the extension install date.
 *  `milestoneReached` flips to true at MILESTONE_THRESHOLD and never resets. */
export interface UsageStats {
  totalActions: number;
  totalTimeSaved: number;
  actionCounts: Record<string, number>;
  installedAt: string;
  milestoneReached: boolean;
  /** YYYY-MM-DD of the most recent tracked action. Enables streaks and dormancy detection. */
  lastActiveDate: string;
  /** Number of distinct days with at least one tracked action. */
  activeDays: number;
}

function defaultUsageStats(): UsageStats {
  return {
    totalActions: 0,
    totalTimeSaved: 0,
    actionCounts: {},
    installedAt: '',
    milestoneReached: false,
    lastActiveDate: '',
    activeDays: 0
  };
}

/**
 * Resolve the estimated time saved (in seconds) for a given action.
 * Handles both static values and dynamic functions in the TIME_SAVINGS map.
 * @param action - The analytics action to look up
 * @param metadata - Optional context passed to dynamic time-saving functions (e.g. page_type, app_count)
 * @returns Estimated seconds saved
 */
export function getTimeSaved(action: AnalyticsAction, metadata?: Record<string, unknown>): number {
  // `?? 0` guards unregistered actions: .svelte call sites bypass tsc, and an
  // undefined here would NaN-poison the accumulated totalTimeSaved forever.
  const config = TIME_SAVINGS[action];
  return (typeof config === 'function' ? config(metadata) : config) ?? 0;
}

/**
 * Increment local usage stats for a single action. Called internally by
 * trackAction — runs before the dev-mode early return so stats accumulate
 * during development. Actions in EXCLUDED_FROM_STATS are silently skipped.
 * @param action - The analytics action to record
 * @param metadata - Optional context for dynamic time-saving calculation
 */
async function incrementAction(action: AnalyticsAction, metadata?: Record<string, unknown>): Promise<void> {
  if (EXCLUDED_FROM_STATS.has(action)) return;

  const stats = (await getItem<UsageStats>('usage_stats')) ?? defaultUsageStats();

  if (!stats.installedAt) {
    stats.installedAt = new Date().toISOString();
  }

  const today = new Date().toISOString().slice(0, 10);
  if (stats.lastActiveDate !== today) {
    stats.activeDays++;
    stats.lastActiveDate = today;
  }

  stats.totalActions++;
  stats.actionCounts[action] = (stats.actionCounts[action] ?? 0) + 1;
  stats.totalTimeSaved += getTimeSaved(action, metadata);

  if (stats.totalActions >= MILESTONE_THRESHOLD) {
    stats.milestoneReached = true;
  }

  await setItem('usage_stats', stats);
}

/**
 * Read current usage stats from local storage.
 * @returns The stored UsageStats, or defaults if no data exists yet
 */
export async function getUsageStats(): Promise<UsageStats> {
  return (await getItem<UsageStats>('usage_stats')) ?? defaultUsageStats();
}

/**
 * Permanently dismiss the review nudge. Stored in a separate key
 * (`local:review_dismissed`) to avoid race conditions with incrementAction
 * writing to `local:usage_stats`.
 */
export async function dismissReview(): Promise<void> {
  await setItem('review_dismissed', true);
}

/**
 * Check whether the review nudge has been permanently dismissed.
 * @returns true if the user has dismissed or clicked the review link
 */
export async function isReviewDismissed(): Promise<boolean> {
  return (await getItem<boolean>('review_dismissed')) ?? false;
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

/**
 * Aggregate per-action counts into ACTION_CATEGORIES and return the category
 * with the highest total.
 * @param actionCounts - Per-action usage counts from UsageStats
 * @returns The dominant category name, or "Other" when actionCounts is empty
 */
export function getMostUsedCategory(actionCounts: Record<string, number>): string {
  const categoryTotals: Record<string, number> = {};

  for (const [action, count] of Object.entries(actionCounts)) {
    const category = ACTION_CATEGORIES[action as AnalyticsAction] ?? 'Other';
    categoryTotals[category] = (categoryTotals[category] ?? 0) + count;
  }

  let maxCategory = 'Other';
  let maxCount = 0;

  for (const [category, count] of Object.entries(categoryTotals)) {
    if (count > maxCount) {
      maxCount = count;
      maxCategory = category;
    }
  }

  return maxCategory;
}

/**
 * Format a duration in seconds as a human-readable string with tilde prefix
 * to indicate the values are estimates.
 * @param seconds - Duration in seconds
 * @returns Formatted string (e.g. "< 1 min", "~48 min", "~1.3 hrs")
 */
export function formatTimeSaved(seconds: number): string {
  if (seconds < 60) return 'less than a minute';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `~${minutes} min`;
  const hours = seconds / 3600;
  if (hours < 2) return '~1 hr';
  return `~${hours.toFixed(1)} hrs`;
}

// --- Supabase tracking ---

/**
 * Track a user action. Accumulates local usage stats first (always, including
 * dev mode), then sends the event to Supabase (skipped in dev mode).
 * @param action - The action to track
 * @param metadata - Additional context (e.g. page_url, page_type, shop_domain, app_count)
 */
export async function trackAction(action: AnalyticsAction, metadata?: Record<string, unknown>): Promise<void> {
  try {
    // Respect user's privacy opt-out
    const settings = await getItem<AlfredSettings>('settings');
    if (settings?.general?.analytics === false) return;

    // Cooldown check — skip both local stats and Supabase if fired too recently
    const cooldown = COOLDOWN_MS[action];
    if (cooldown) {
      const key = `cooldown_${action}`;
      const lastFired = (await getItem<number>(key)) ?? 0;
      if (Date.now() - lastFired < cooldown) return;
      await setItem(key, Date.now());
    }

    // Local stats first — runs in dev too, before early return
    incrementAction(action, metadata).catch(() => {});

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

    // Send to Supabase (fire and forget). keepalive lets the request survive
    // the popup closing mid-flight (e.g. actions that open a new tab).
    fetch(TRACK_ENDPOINT, {
      method: 'POST',
      keepalive: true,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${SUPABASE_ANON_KEY}`
      },
      body: JSON.stringify(eventData)
    }).catch(() => {});
  } catch {
    // Analytics should never break the user experience
  }
}

/**
 * Send a track_action message from a content script to the background script.
 * Falls back to calling trackAction() directly if the background is unavailable.
 */
export function sendTrackEvent(action: AnalyticsAction, metadata?: Record<string, unknown>): void {
  browser.runtime.sendMessage({ type: 'track_action', action, metadata }).catch(() => {
    trackAction(action, metadata);
  });
}
