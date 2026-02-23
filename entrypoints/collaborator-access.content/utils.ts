import { getItem, setItem } from '@/utils/storage';
import type { PermissionPreset, PresetStorageData } from './types';

const STORAGE_KEY = 'alfred:permission-presets';

/**
 * Generates a unique ID for a preset.
 * @returns A unique preset ID
 */
export function generatePresetId(): string {
  return Math.random().toString(36).substring(2, 8) + Date.now().toString(36);
}

/**
 * Retrieves all permissions presets from browser storage.
 * @returns Promise that resolves to an array of permissions presets, or empty array if none exist
 */
export async function getPresets(): Promise<PermissionPreset[]> {
  const data = await getItem<PresetStorageData>(STORAGE_KEY);
  return data?.presets ?? [];
}

/**
 * Saves the entire array of permissions presets to browser storage.
 * @param presets - Array of permissions presets to save
 * @internal Used internally by savePreset and deletePreset functions
 */
export async function savePresets(presets: PermissionPreset[]): Promise<void> {
  await setItem(STORAGE_KEY, { presets });
}

/**
 * Saves or updates a permissions preset in browser storage.
 * If a preset with the same ID exists, it will be updated.
 * If not, the preset will be added as a new entry.
 * @param preset - The permissions preset to save or update
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
 * Deletes a permissions preset from browser storage.
 * @param presetId - The ID of the preset to delete
 */
export async function deletePreset(presetId: string): Promise<void> {
  const presets = await getPresets();
  const filteredPresets = presets.filter((p) => p.id !== presetId);
  await savePresets(filteredPresets);
}

/**
 * Exports permissions presets as a JSON file download.
 * @param presetsToExport - Array of presets to export
 */
export function exportPresets(presetsToExport: PermissionPreset[]): void {
  // Remove id and lastUsed fields from export
  const cleanedPresets = presetsToExport.map(({ id: _id, lastUsed: _lastUsed, ...preset }) => preset);
  const dataStr = JSON.stringify(cleanedPresets, null, 2);
  const dataUri = 'data:application/json;charset=utf-8,' + encodeURIComponent(dataStr);
  const filename = `shopify-alfred-permissions-presets-${new Date().toISOString().split('T')[0]}.json`;

  const linkElement = document.createElement('a');
  linkElement.setAttribute('href', dataUri);
  linkElement.setAttribute('download', filename);
  linkElement.click();
}

/**
 * Imports permissions presets from a JSON file.
 * @returns Promise that resolves to the number of imported presets, or null if cancelled
 */
export function importPresets(): Promise<number | null> {
  return new Promise((resolve, reject) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';

    input.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) {
        resolve(null);
        return;
      }

      try {
        const text = await file.text();
        const importedPresets = JSON.parse(text) as PermissionPreset[];

        if (!Array.isArray(importedPresets)) {
          throw new Error('Invalid file format. Expected an array of presets.');
        }

        // Import each preset one by one
        let importCount = 0;
        for (const importedPreset of importedPresets) {
          const newPreset: PermissionPreset = {
            ...importedPreset,
            id: generatePresetId(),
            createdAt: importedPreset.createdAt || Date.now()
          };

          await savePreset(newPreset);
          importCount++;
        }

        resolve(importCount);
      } catch (error) {
        reject(error as Error);
      }
    };

    input.click();
  });
}
