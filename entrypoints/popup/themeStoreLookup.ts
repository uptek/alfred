import type { Theme, ThemeStoreEntry } from './types';
import { getThemes } from '@/utils/themesCache';

/**
 * Look up enriched theme data from cached/fetched themes.json.
 * Cascading strategy:
 * 1. Match by theme_store_id
 * 2. Match by schema_name against name
 * 3. Match by name against name
 */
export async function lookupThemeStoreEntry(theme: Theme | null): Promise<ThemeStoreEntry | null> {
  if (!theme) return null;

  const themes = await getThemes();

  // 1. Match by theme_store_id
  if (theme.theme_store_id) {
    const match = themes.find((t) => t.theme_store_id === theme.theme_store_id);
    if (match) return match;
  }

  // 2. Match by schema_name
  if (theme.schema_name) {
    const match = themes.find((t) => t.name.toLowerCase() === theme.schema_name!.toLowerCase());
    if (match) return match;
  }

  // 3. Match by name
  if (theme.name) {
    const match = themes.find((t) => t.name.toLowerCase() === theme.name!.toLowerCase());
    if (match) return match;
  }

  return null;
}
