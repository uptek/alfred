import { onDestroy } from 'svelte';

/**
 * Clipboard write with a transient "copied" flag keyed by an arbitrary value,
 * for views where several targets share one feedback slot (e.g. per-row copy
 * buttons). Re-copying resets the timer; the pending timer is cleared on
 * component destroy. Must be called during component initialization.
 */
export function createKeyedCopyFeedback<K>(timeoutMs = 1500) {
  let key = $state<K | null>(null);
  let timer: ReturnType<typeof setTimeout> | null = null;

  onDestroy(() => {
    if (timer) clearTimeout(timer);
  });

  return {
    /** Key of the most recent successful copy, or null once feedback expired. */
    get key(): K | null {
      return key;
    },
    /** Writes to the clipboard; returns false when the write was denied. */
    async copy(text: string, copiedKey: K): Promise<boolean> {
      try {
        await navigator.clipboard.writeText(text);
      } catch {
        return false;
      }
      key = copiedKey;
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        key = null;
        timer = null;
      }, timeoutMs);
      return true;
    }
  };
}

/**
 * Single-target variant: `copied` flips true after a successful copy and
 * resets after `timeoutMs`. Must be called during component initialization.
 */
export function createCopyFeedback(timeoutMs = 1500) {
  const keyed = createKeyedCopyFeedback<boolean>(timeoutMs);
  return {
    get copied(): boolean {
      return keyed.key === true;
    },
    copy(text: string): Promise<boolean> {
      return keyed.copy(text, true);
    }
  };
}
