import { getItem, setItem } from './storage';
import type { AnalyticsAction } from './analytics-actions';

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

const STRONG_ACTIONS = new Set<AnalyticsAction>([
  'popup.links.status_check',
  'popup.links.export',
  'popup.links.copy',
  'popup.assets.export',
  'popup.assets.copy',
  'popup.images.export',
  'popup.images.copy',
  'popup.headings.copy',
  'popup.overview.copy',
  'popup.schema.copy',
  'popup.schema.export',
  'popup.hreflangs.copy',
  'popup.hreflangs.export',
  'popup.sitemaps.copy',
  'popup.sitemaps.urls_copy',
  'popup.sitemaps.export',
  'popup.social.tags_copy',
  'popup.robots.copy',
  'apps.compare.export',
  'apps.partner_table.export',
  'storefront.cartograph.discount_apply',
  'storefront.cartograph.item_add',
  'storefront.cartograph.quantity_update',
  'storefront.shortcuts.product_json_copy',
  'storefront.shortcuts.cart_json_copy'
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
export async function recordSuccess(action: AnalyticsAction): Promise<void> {
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
