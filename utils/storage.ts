import { storage } from '#imports';

/**
 * Retrieves an item from local storage.
 * @template T - The type of the stored value
 * @param key - The storage key to retrieve (without 'local:' prefix)
 * @returns Promise that resolves to the stored value or null if not found
 */
export async function getItem<T>(key: string): Promise<T | null> {
  return await storage.getItem<T>(`local:${key}`);
}

/**
 * Stores an item in local storage.
 * @template T - The type of the value to store
 * @param key - The storage key (without 'local:' prefix)
 * @param value - The value to store
 */
export async function setItem<T>(key: string, value: T): Promise<void> {
  await storage.setItem(`local:${key}`, value);
}
