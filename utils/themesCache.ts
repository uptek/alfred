import { getItem, setItem } from './storage';
import type { ThemeStoreEntry } from '@/entrypoints/popup/types';

const STORAGE_KEY = 'themes_cache';
const TTL_MS = 24 * 60 * 60 * 1000; // 24 hours
const REMOTE_URL = 'https://bucket.alfred.uptek.com/themes.json';

interface ThemesCacheData {
  themes: ThemeStoreEntry[];
  fetchedAt: number;
  version: string;
}

/**
 * Check if the cached themes data is stale and needs refreshing.
 * Cache is considered stale when:
 * - No cache exists
 * - Cache age exceeds TTL (24 hours)
 * - Extension version has changed (cache bust on update)
 *
 * @param cache - The cached data to check, or null if no cache exists
 * @returns `true` if cache should be refreshed
 */
function isCacheStale(cache: ThemesCacheData | null): boolean {
  if (!cache) return true;
  if (Date.now() - cache.fetchedAt > TTL_MS) return true;

  try {
    const currentVersion = browser.runtime.getManifest().version;
    if (cache.version !== currentVersion) return true;
  } catch {
    // If we can't get version, don't treat as stale
  }

  return false;
}

/**
 * Fetch themes from Cloudflare R2 and persist to chrome.storage.local.
 * Validates the response is a non-empty array before caching.
 *
 * @returns The fetched themes array, or `null` if the request fails or returns invalid data
 */
async function fetchAndCacheThemes(): Promise<ThemeStoreEntry[] | null> {
  try {
    const response = await fetch(REMOTE_URL);
    if (!response.ok) return null;

    const themes: ThemeStoreEntry[] = await response.json();
    if (!Array.isArray(themes) || themes.length === 0) return null;

    await setItem<ThemesCacheData>(STORAGE_KEY, {
      themes,
      fetchedAt: Date.now(),
      version: browser.runtime.getManifest().version,
    });

    return themes;
  } catch {
    return null;
  }
}

/**
 * Get the themes list with a three-tier fallback strategy:
 * 1. Fresh cache (< 24h old, same extension version)
 * 2. Remote fetch from R2 (if cache is stale or missing)
 * 3. Stale cache (if fetch fails but old data exists)
 * 4. Empty array (if no cache and no network)
 *
 * @returns Array of theme store entries, never rejects
 */
export async function getThemes(): Promise<ThemeStoreEntry[]> {
  const cache = await getItem<ThemesCacheData>(STORAGE_KEY);

  if (cache && !isCacheStale(cache)) {
    return cache.themes;
  }

  const freshThemes = await fetchAndCacheThemes();
  if (freshThemes) return freshThemes;

  // Fetch failed — use stale cache if available
  if (cache) return cache.themes;

  return [];
}

/**
 * Refresh the themes cache if stale. Intended for background script use
 * (e.g., on extension install/update) to pre-warm the cache before the
 * user opens the popup.
 *
 * Silent on failure — never throws.
 */
export async function refreshThemesCacheIfNeeded(): Promise<void> {
  try {
    const cache = await getItem<ThemesCacheData>(STORAGE_KEY);
    if (isCacheStale(cache)) {
      await fetchAndCacheThemes();
    }
  } catch {
    // Silent — background refresh should not throw
  }
}
