import { storage } from '#imports';
import { SCHEMA_VERSION, keyFor, isFreshFor, type PersistedBlob, type PopupSection } from './tabState';

/**
 * Per-browser-tab popup state, persisted to session storage so a view survives
 * the popup closing. The record is keyed by tab id and stamped with the page
 * URL: it is restored only on the same tab + same URL, deleted when the tab
 * closes (see the tabs.onRemoved listener in the background), and naturally gone
 * on browser restart (session area). Any storage failure degrades to in-memory.
 */

export type { PopupSection } from './tabState';

const SAVE_DEBOUNCE_MS = 250;

let tabId: number | null = null;
let pageUrl: string | null = null;
let restoredActiveSection: PopupSection | null = null;

// Latest serialized value per section plus the active section, flushed to
// storage on a debounce. Plain (non-reactive) state: components own the reactive
// copies and push snapshots in via saveSection / setActiveSection.
let sectionData: Record<string, unknown> = {};
let activeSection: PopupSection | null = null;

let saveTimer: ReturnType<typeof setTimeout> | null = null;
let pagehideBound = false;

/** Writes the current snapshot to session storage; no-op until hydrate() runs. */
function flush() {
  saveTimer = null;
  if (tabId === null || pageUrl === null) return;
  const blob: PersistedBlob = { v: SCHEMA_VERSION, url: pageUrl, activeSection, sections: sectionData };
  storage.setItem(keyFor(tabId), blob).catch(() => {});
}

/** Coalesces bursts of changes (e.g. a streaming scan) into one debounced write. */
function scheduleSave() {
  if (saveTimer === null) saveTimer = setTimeout(flush, SAVE_DEBOUNCE_MS);
}

/**
 * Writes the snapshot immediately, cancelling any pending debounce. Use right
 * after a high-value, low-frequency change (e.g. a completed scan) so it can't be
 * lost in the debounce window if the popup closes a moment later.
 */
function flushNow() {
  if (saveTimer !== null) clearTimeout(saveTimer);
  flush();
}

/**
 * Binds the store to a tab and loads any saved state for it. Restores only when
 * the stored blob matches this URL and schema version; otherwise starts empty.
 * Must be awaited before reading restoredActiveSection or getSection.
 * @param id - The active tab's id, used as the storage key.
 * @param url - The current page URL; a mismatch discards stale state.
 */
async function hydrate(id: number, url: string): Promise<void> {
  tabId = id;
  pageUrl = url;
  // Start clean so a second hydrate or a reused popup context (e.g. side panel)
  // can't carry a prior tab/URL's state forward.
  sectionData = {};
  activeSection = null;
  restoredActiveSection = null;
  // Best-effort flush when the popup is dismissed, so the final state isn't lost
  // inside the debounce window (e.g. clicking a link right after a scan).
  if (!pagehideBound && typeof window !== 'undefined') {
    window.addEventListener('pagehide', flush);
    pagehideBound = true;
  }
  try {
    const blob = await storage.getItem<PersistedBlob>(keyFor(id));
    if (isFreshFor(blob, url)) {
      sectionData = { ...blob.sections };
      activeSection = blob.activeSection;
      restoredActiveSection = blob.activeSection;
    }
  } catch {
    // Storage unavailable: run in-memory only.
  }
}

/**
 * Returns the restored slice a section saved under `name`, or undefined if none
 * was restored. Components use it to seed their initial reactive state.
 * @param name - The section's slice key (e.g. 'links').
 */
function getSection<T>(name: string): T | undefined {
  return sectionData[name] as T | undefined;
}

/**
 * Stores a section's serialized snapshot and schedules a debounced write. Call
 * from a reactive effect so the snapshot tracks the section's state.
 * @param name - The section's slice key (e.g. 'links').
 * @param value - A JSON-serializable snapshot of the section's persisted state.
 */
function saveSection(name: string, value: unknown): void {
  sectionData[name] = value;
  scheduleSave();
}

/**
 * Records the currently open popup section and schedules a save. Ignores
 * no-op writes so re-applying the restored section doesn't trigger a write.
 * @param section - The active tab/section in the popup.
 */
function setActiveSection(section: PopupSection): void {
  if (section === activeSection) return;
  activeSection = section;
  scheduleSave();
}

/** Accessor for the per-tab state store's public surface. */
export function getTabState() {
  return {
    hydrate,
    getSection,
    saveSection,
    setActiveSection,
    flushNow,
    get restoredActiveSection() {
      return restoredActiveSection;
    }
  };
}
