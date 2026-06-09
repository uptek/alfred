import { storage } from '#imports';
import { getItem, setItem } from '~/utils/storage';

export const COMPARE_TRAY_KEY = 'compareTray';
export const COMPARE_TRAY_LIMIT = 4;

export type AddToTrayResult = 'added' | 'duplicate' | 'full';

/**
 * Get the current compare tray contents. A missing or corrupt value is
 * treated as an empty tray.
 */
export async function getTray(): Promise<CompareTrayItem[]> {
  const items = await getItem<CompareTrayItem[]>(COMPARE_TRAY_KEY);
  return Array.isArray(items) ? items : [];
}

/**
 * Add an app to the compare tray.
 * @returns 'added' on success, 'duplicate' if already present, 'full' at the limit
 */
export async function addToTray(item: CompareTrayItem): Promise<AddToTrayResult> {
  const items = await getTray();

  if (items.some((existing) => existing.handle === item.handle)) {
    return 'duplicate';
  }

  if (items.length >= COMPARE_TRAY_LIMIT) {
    return 'full';
  }

  await setItem(COMPARE_TRAY_KEY, [...items, item]);
  return 'added';
}

export async function removeFromTray(handle: string): Promise<void> {
  const items = await getTray();
  await setItem(
    COMPARE_TRAY_KEY,
    items.filter((item) => item.handle !== handle)
  );
}

export async function clearTray(): Promise<void> {
  await setItem(COMPARE_TRAY_KEY, []);
}

/**
 * Watch the tray for changes (fires across tabs via storage events).
 * @returns unwatch function
 */
export function watchTray(callback: (items: CompareTrayItem[]) => void): () => void {
  return storage.watch<CompareTrayItem[]>(`local:${COMPARE_TRAY_KEY}`, (items) => {
    callback(Array.isArray(items) ? items : []);
  });
}
