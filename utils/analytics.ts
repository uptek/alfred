import { getUserId, getVersion } from './helpers';
import { getItem, setItem } from './storage';

const SUPABASE_URL = 'https://obrjirdnqoiailhbsnmu.supabase.co';
const SUPABASE_ANON_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9icmppcmRucW9pYWlsaGJzbm11Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTA0NzAyMzQsImV4cCI6MjA2NjA0NjIzNH0.i0cWjFKNk8HDZQsVkCn83fTKFROiNzvPf_sTP5xQwAM';
const TRACK_ENDPOINT = `${SUPABASE_URL}/functions/v1/track`;

// Valid action types
export type AnalyticsAction =
  | 'open_in_admin'
  | 'open_in_customizer'
  | 'copy_product_json'
  | 'copy_cart_json'
  | 'copy_theme_preview_url'
  | 'clear_cart'
  | 'save_preset'
  | 'apply_preset'
  | 'appstore_partner_table_view'
  | 'appstore_partner_table_sort'
  | 'appstore_partner_table_export'
  | 'open_section_in_code_editor'
  | 'disable_theme_inspector'
  | 'resize_theme_customizer'
  | 'toggle_admin_sidebar'
  | 'detect_theme'
  | 'autofill_storefront_password'
  | 'open_image_in_admin'
  | 'exit_theme_preview'
  | 'theme_list_copy_id'
  | 'theme_list_copy_preview_url'
  | 'theme_list_preview'
  | 'theme_list_edit_code'
  | 'cartograph_open'
  | 'cartograph_add_item'
  | 'cartograph_update_quantity'
  | 'cartograph_remove_item'
  | 'cartograph_clear'
  | 'cartograph_apply_discount'
  | 'cartograph_update_note'
  | 'cartograph_calculate_shipping'
  | 'cartograph_update_properties'
  | 'cartograph_switch_variant'
  | 'cartograph_update_attributes'
  | 'cartograph_remove_discount'
  | 'cartograph_inspect_json'
  | 'review_nudge_shown'
  | 'review_nudge_clicked'
  | 'review_nudge_dismissed';

// Time savings per action (in seconds)
const TIME_SAVINGS: Record<AnalyticsAction, number | ((metadata?: Record<string, unknown>) => number)> = {
  open_in_admin: (metadata) => {
    if (metadata?.page_type === 'homepage') return 10;
    if (['product', 'page', 'article'].includes(metadata?.page_type as string)) return 45;
    return 25;
  },
  open_in_customizer: (metadata) => {
    if (metadata?.page_type === 'homepage') return 20;
    if (['product', 'page', 'article'].includes(metadata?.page_type as string)) return 45;
    return 30;
  },
  copy_product_json: 30,
  copy_cart_json: 30,
  copy_theme_preview_url: 40,
  clear_cart: 30,
  save_preset: 0,
  apply_preset: (metadata) => {
    return 45 + (metadata?.has_custom_message ? 20 : 0);
  },
  appstore_partner_table_view: (metadata) => Number(metadata?.app_count ?? 0) * 5,
  appstore_partner_table_sort: (metadata) => Number(metadata?.app_count ?? 0) * 2,
  appstore_partner_table_export: (metadata) => Number(metadata?.app_count ?? 0) * 10 + 30,
  open_section_in_code_editor: 30,
  disable_theme_inspector: 3,
  resize_theme_customizer: 3,
  toggle_admin_sidebar: 0,
  detect_theme: 15,
  autofill_storefront_password: 10,
  open_image_in_admin: 15,
  exit_theme_preview: 20,
  theme_list_copy_id: 10,
  theme_list_copy_preview_url: 10,
  theme_list_preview: 5,
  theme_list_edit_code: 5,
  cartograph_open: 0,
  cartograph_add_item: 60,
  cartograph_update_quantity: 15,
  cartograph_remove_item: 15,
  cartograph_clear: 30,
  cartograph_apply_discount: 20,
  cartograph_update_note: 15,
  cartograph_calculate_shipping: 60,
  cartograph_update_properties: 60,
  cartograph_switch_variant: 120,
  cartograph_update_attributes: 60,
  cartograph_remove_discount: 15,
  cartograph_inspect_json: 45,
  review_nudge_shown: 0,
  review_nudge_clicked: 0,
  review_nudge_dismissed: 0
};

// --- Usage Stats (local tracking) ---
//
// Accumulates per-action counts and time-saved totals in browser.storage.local
// (key: "usage_stats"). Displayed in the popup's Insights Card once the user
// crosses the milestone threshold. Completely independent of the Supabase
// analytics pipeline — works offline and in dev mode.

/** Number of tracked actions before the Insights Card becomes visible. */
const MILESTONE_THRESHOLD = 3;

/** Actions that are tracked to Supabase but excluded from local usage stats.
 *  - review_nudge_* events: prevent the Insights Card from inflating its own counters
 *  - detect_theme: fires on every popup open, would trivially reach the milestone */
const EXCLUDED_FROM_STATS = new Set<AnalyticsAction>([
  'review_nudge_shown',
  'review_nudge_clicked',
  'review_nudge_dismissed',
  'detect_theme'
]);

/** Maps every analytics action to a human-readable category for the
 *  "most used" stat in the Insights Card. Exhaustive — TypeScript will
 *  error if a new AnalyticsAction is added without a category entry. */
const ACTION_CATEGORIES: Record<AnalyticsAction, string> = {
  open_in_admin: 'Admin Nav',
  open_in_customizer: 'Admin Nav',
  open_image_in_admin: 'Admin Nav',
  open_section_in_code_editor: 'Admin Nav',
  toggle_admin_sidebar: 'Admin Nav',
  copy_product_json: 'Copy Data',
  copy_cart_json: 'Copy Data',
  copy_theme_preview_url: 'Copy Data',
  theme_list_copy_id: 'Copy Data',
  theme_list_copy_preview_url: 'Copy Data',
  detect_theme: 'Theme Detection',
  exit_theme_preview: 'Theme Detection',
  disable_theme_inspector: 'Theme Detection',
  theme_list_preview: 'Theme Detection',
  theme_list_edit_code: 'Theme Detection',
  cartograph_open: 'Cartograph',
  cartograph_add_item: 'Cartograph',
  cartograph_update_quantity: 'Cartograph',
  cartograph_remove_item: 'Cartograph',
  cartograph_clear: 'Cartograph',
  cartograph_apply_discount: 'Cartograph',
  cartograph_remove_discount: 'Cartograph',
  cartograph_update_note: 'Cartograph',
  cartograph_calculate_shipping: 'Cartograph',
  cartograph_update_properties: 'Cartograph',
  cartograph_switch_variant: 'Cartograph',
  cartograph_update_attributes: 'Cartograph',
  cartograph_inspect_json: 'Cartograph',
  resize_theme_customizer: 'Customizer',
  save_preset: 'Presets',
  apply_preset: 'Presets',
  appstore_partner_table_view: 'App Store',
  appstore_partner_table_sort: 'App Store',
  appstore_partner_table_export: 'App Store',
  clear_cart: 'Storefront',
  autofill_storefront_password: 'Storefront',
  review_nudge_shown: 'Insights',
  review_nudge_clicked: 'Insights',
  review_nudge_dismissed: 'Insights'
};

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
  const config = TIME_SAVINGS[action];
  return typeof config === 'function' ? config(metadata) : config;
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
  const alreadyShown = (await getItem<boolean>('review_nudge_shown_once')) ?? false;
  if (alreadyShown) return false;
  await setItem('review_nudge_shown_once', true);
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

    // Send to Supabase (fire and forget)
    fetch(TRACK_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${SUPABASE_ANON_KEY}`
      },
      body: JSON.stringify(eventData)
    }).catch(() => {
      // Silently ignore errors - analytics should never break the user experience
    });
  } catch (error) {
    // Silently ignore all errors
    console.debug('Analytics error:', error);
  }
}
