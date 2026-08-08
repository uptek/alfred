import { untrack } from 'svelte';

/**
 * Fires an analytics call once, the first time `ready()` is true. The default
 * guard is per-mount; pass a module-scoped `state` object to fire once per
 * popup open instead. Must be called during component initialization.
 * @param ready - Reactive gate; the effect re-runs until it returns true.
 * @param fire - Tracking call, run untracked so its reads aren't dependencies.
 * @param state - Optional external done-flag for once-per-popup semantics.
 */
export function trackOnce(ready: () => boolean, fire: () => void, state?: { done: boolean }) {
  const guard = state ?? { done: false };
  $effect(() => {
    if (guard.done || !ready()) return;
    guard.done = true;
    untrack(fire);
  });
}
