import { getItem, setItem } from './storage';

/**
 * Review nudge scheduling. Every tracked event adds its seconds saved
 * (TIME_SAVINGS) to a score, and the nudge shows once the score reaches the
 * threshold AND the minimum gap since the last show has passed.
 *
 * Lifecycle: show resets the score (the time must be saved again), an
 * explicit "Maybe later" counts toward the dismissal cap, a backdrop close
 * counts nothing, and any star click retires the nudge forever.
 */
const SCORE_THRESHOLD = 5 * 60;
const MIN_GAP_MS = 5 * 24 * 60 * 60 * 1000;
const MAX_DISMISSALS = 7;

const STATE_KEY = 'success_nudge_state';

interface NudgeState {
  /** Seconds saved since the last show. */
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

let onTrigger: (() => void) | null = null;

/** Register the UI callback fired when the nudge becomes due (popup only). */
export function onSuccessNudge(cb: (() => void) | null): void {
  onTrigger = cb;
}

async function getState(): Promise<NudgeState> {
  return (await getItem<NudgeState>(STATE_KEY)) ?? { ...DEFAULT_STATE };
}

/** Count the seconds an event saved toward the next nudge. */
export async function recordTimeSaved(seconds: number): Promise<void> {
  if (!(seconds > 0)) return;
  const state = await getState();
  if (state.done) return;
  state.score += seconds;

  const due = state.score >= SCORE_THRESHOLD && Date.now() - state.lastShownAt >= MIN_GAP_MS;
  // Only consume the show when a UI is registered to display it: a
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
