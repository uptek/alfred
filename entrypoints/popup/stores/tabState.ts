/**
 * Pure schema + validation for per-tab popup state. Kept free of runes and WXT
 * auto-imports so it can be unit-tested directly; the reactive/storage glue lives
 * in tabState.svelte.ts.
 */

export type PopupSection = 'theme' | 'headings' | 'links' | 'assets' | 'images' | 'schema' | 'settings';

export const SCHEMA_VERSION = 1;

export const keyFor = (tabId: number) => `session:popupTabState:${tabId}` as const;

export interface PersistedBlob {
  v: number;
  url: string;
  activeSection: PopupSection | null;
  sections: Record<string, unknown>;
}

/**
 * Whether a stored blob may hydrate the current view: it must match the schema
 * version and belong to the URL currently open (a different URL means the tab
 * navigated, which busts everything).
 */
export function isFreshFor(blob: unknown, url: string): blob is PersistedBlob {
  if (!blob || typeof blob !== 'object') return false;
  const b = blob as Partial<PersistedBlob>;
  return b.v === SCHEMA_VERSION && b.url === url && typeof b.sections === 'object' && b.sections !== null;
}
