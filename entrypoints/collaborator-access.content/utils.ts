import { getItem, setItem } from '@/utils/storage';
import type { PermissionPreset, PresetStorageData } from './types';

const STORAGE_KEY = 'alfred:permission-presets';

/**
 * Retrieves all permission presets from browser storage.
 * @returns Promise that resolves to an array of permission presets, or empty array if none exist
 */
export async function getPresets(): Promise<PermissionPreset[]> {
  const data = await getItem<PresetStorageData>(STORAGE_KEY);
  return data?.presets || [];
}

/**
 * Saves the entire array of permission presets to browser storage.
 * @param presets - Array of permission presets to save
 * @internal Used internally by savePreset and deletePreset functions
 */
export async function savePresets(presets: PermissionPreset[]): Promise<void> {
  await setItem(STORAGE_KEY, { presets });
}

/**
 * Saves or updates a permission preset in browser storage.
 * If a preset with the same ID exists, it will be updated.
 * If not, the preset will be added as a new entry.
 * @param preset - The permission preset to save or update
 */
export async function savePreset(preset: PermissionPreset): Promise<void> {
  const presets = await getPresets();

  const existingIndex = presets.findIndex((p) => p.id === preset.id);
  if (existingIndex >= 0) {
    presets[existingIndex] = preset;
  } else {
    presets.push(preset);
  }

  await savePresets(presets);
}

/**
 * Deletes a permission preset from browser storage.
 * @param presetId - The ID of the preset to delete
 */
export async function deletePreset(presetId: string): Promise<void> {
  const presets = await getPresets();
  const filteredPresets = presets.filter((p) => p.id !== presetId);
  await savePresets(filteredPresets);
}
