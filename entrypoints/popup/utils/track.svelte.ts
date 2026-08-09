import { untrack } from 'svelte';
import { trackAction } from '@/utils/analytics';
import type { AnalyticsAction } from '@/utils/analytics-actions';

// Actions already reported during this popup open. Module scope on purpose:
// App.svelte renders tabs through an `{#if activeTab === ...}` chain, so every
// tab component unmounts and remounts on each tab switch. A per-mount guard
// would re-award the tab's time-saved credit every time the user tabs back.
// Closing the popup tears down this module, which is exactly the reset we want:
// the next open is a genuine new view.
const reported = new Set<AnalyticsAction>();

/**
 * Reports a tab's view event once per popup open, as soon as its data lands.
 * @param action - Analytics action, doubling as the once-per-popup key.
 * @param ready - Reactive gate; the effect re-runs until it returns true.
 * @param metadata - Built untracked, so its reads don't become dependencies.
 */
export function trackViewOnce(
  action: AnalyticsAction,
  ready: () => boolean,
  metadata: () => Record<string, unknown>
): void {
  $effect(() => {
    if (reported.has(action) || !ready()) return;
    reported.add(action);
    untrack(() => trackAction(action, metadata()));
  });
}
