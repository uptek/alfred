import { getItem, setItem } from './storage';

/**
 * Review nudge scheduling. Value events accumulate a weighted score;
 * the nudge shows only when the score threshold is met AND the minimum
 * gap since the last show has passed. Points are ×10-scaled integers to
 * avoid float drift in storage.
 *
 * Lifecycle: show resets the score (value must be re-earned), an explicit
 * "Maybe later" counts toward the dismissal cap, a backdrop close counts
 * nothing, and any star click retires the nudge forever.
 */
const STRONG_POINTS = 30;
const PASSIVE_POINTS = 3;
const SCORE_THRESHOLD = 90;
const MIN_GAP_MS = 5 * 24 * 60 * 60 * 1000;
const MAX_DISMISSALS = 7;

const STATE_KEY = 'success_nudge_state';

interface NudgeState {
  score: number;
  lastShownAt: number;
  impressions: number;
  dismissals: number;
  done: boolean;
}

const DEFAULT_STATE: NudgeState = {
  score: 0,
  lastShownAt: 0,
  impressions: 0,
  dismissals: 0,
  done: false
};

const STRONG_ACTIONS = new Set([
  'links_check_status',
  'links_export',
  'links_copy',
  'assets_export',
  'assets_copy',
  'images_export',
  'images_copy',
  'headings_copy',
  'overview_copy',
  'schema_copy',
  'schema_export',
  'hreflangs_copy',
  'hreflangs_export',
  'sitemaps_copy',
  'sitemaps_copy_urls',
  'sitemaps_export',
  'social_copy_tags',
  'robots_copy',
  'compare_export_markdown',
  'compare_export_csv',
  'compare_export_json',
  'appstore_partner_table_export',
  'cartograph_apply_discount',
  'cartograph_add_item',
  'cartograph_update_quantity',
  'copy_product_json',
  'copy_cart_json'
]);

let onTrigger: (() => void) | null = null;

/** Register the UI callback fired when the nudge becomes due (popup only). */
export function onSuccessNudge(cb: (() => void) | null): void {
  onTrigger = cb;
}

async function getState(): Promise<NudgeState> {
  return (await getItem<NudgeState>(STATE_KEY)) ?? { ...DEFAULT_STATE };
}

async function addPoints(points: number): Promise<void> {
  const state = await getState();
  if (state.done || state.dismissals >= MAX_DISMISSALS) return;
  state.score += points;

  const due = state.score >= SCORE_THRESHOLD && Date.now() - state.lastShownAt >= MIN_GAP_MS;
  // Only consume the show when a UI is registered to display it — a
  // threshold crossed in a content script waits for the next popup event.
  if (due && onTrigger) {
    state.lastShownAt = Date.now();
    state.score = 0;
    state.impressions += 1;
    await setItem(STATE_KEY, state);
    onTrigger();
    return;
  }
  await setItem(STATE_KEY, state);
}

/** Count a deliberate value action (exports, copies, checks, cart mutations). */
export async function recordSuccess(action: string): Promise<void> {
  if (!STRONG_ACTIONS.has(action)) return;
  await addPoints(STRONG_POINTS);
}

/** Count a qualified passive view (tab dwelled on long enough to deliver value). */
export async function recordPassiveValue(): Promise<void> {
  await addPoints(PASSIVE_POINTS);
}

/** Funnel context stamped on nudge analytics events. */
export async function getNudgeStats(): Promise<{ impression: number; dismissals: number }> {
  const state = await getState();
  return { impression: state.impressions, dismissals: state.dismissals };
}

/** Any star click: reviewed or gave feedback — never ask again. */
export async function nudgeRated(): Promise<void> {
  const state = await getState();
  state.done = true;
  await setItem(STATE_KEY, state);
}

/** Explicit "Maybe later" click — the only close that counts toward the cap. */
export async function nudgeDeferred(): Promise<void> {
  const state = await getState();
  state.dismissals += 1;
  if (state.dismissals >= MAX_DISMISSALS) state.done = true;
  await setItem(STATE_KEY, state);
}
