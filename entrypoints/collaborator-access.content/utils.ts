import { getItem, setItem } from '@/utils/storage';
import type { PermissionPreset } from './types';

const STORAGE_KEY = 'alfred:permission-presets';
const HOTLINK_PRESET_PARAM = 'alfred_preset';

type StoredPermissionPreset = PermissionPreset;

/**
 * Generates a unique ID for a preset.
 * @returns A unique preset ID
 */
export function generatePresetId(): string {
  return Math.random().toString(36).substring(2, 8) + Date.now().toString(36);
}

/**
 * Builds the hotlink URL for a preset using the current partner ID.
 * @param handle - The preset handle to include in the hotlink
 * @returns A collaborator request URL with the preset param appended
 */
export function buildHotlinkUrl(handle: string): string {
  const url = new URL(window.location.href);
  const partnerId = url.pathname.split('/').filter(Boolean)[0];

  return `${url.host}/${partnerId}/stores/new?store_domain={{ customer.shopifyDomain }}&store_type=managed_store&${HOTLINK_PRESET_PARAM}=${handle}`;
}

/**
 * Normalizes a preset handle into a URL-friendly slug.
 * @param value - Raw handle input
 * @returns The normalized handle, or null if empty after normalization
 */
export function normalizePresetHandle(value: string | undefined): string | null {
  const normalized =
    value
      ?.trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') ?? '';
  return normalized || null;
}

/**
 * Ensures a preset handle is unique within the current preset collection.
 * @param handle - Preferred handle, if one exists
 * @param presets - Current set of presets to compare against
 * @param currentPresetId - Current preset ID when updating an existing preset
 * @returns A unique handle
 */
function ensureUniquePresetHandle(handle: string | undefined, presets: PermissionPreset[], currentPresetId?: string): string {
  const existingHandles = new Set(presets.filter((preset) => preset.id !== currentPresetId).map((preset) => preset.handle));

  const preferredHandle = normalizePresetHandle(handle);
  if (preferredHandle && !existingHandles.has(preferredHandle)) {
    return preferredHandle;
  }

  const baseHandle = preferredHandle ?? 'preset';
  let suffix = 2;
  let generatedHandle = `${baseHandle}-${suffix}`;

  while (existingHandles.has(generatedHandle)) {
    suffix += 1;
    generatedHandle = `${baseHandle}-${suffix}`;
  }

  return generatedHandle;
}

/**
 * Normalizes a stored preset before it is used in the app.
 * @param preset - Stored preset record
 * @param presets - Already-normalized presets used for uniqueness checks
 * @returns A normalized preset ready for runtime use
 */
function normalizePreset(preset: StoredPermissionPreset, presets: PermissionPreset[]): PermissionPreset {
  return {
    ...preset,
    name: preset.name.trim(),
    handle: ensureUniquePresetHandle(preset.handle ?? preset.name, presets, preset.id),
    createdAt: preset.createdAt || Date.now(),
  };
}

/**
 * Retrieves all permissions presets from browser storage.
 * @returns Promise that resolves to an array of permissions presets, or empty array if none exist
 */
export async function getPresets(): Promise<PermissionPreset[]> {
  const data = await getItem<{ presets?: StoredPermissionPreset[] }>(STORAGE_KEY);
  const storedPresets = data?.presets ?? [];
  const normalizedPresets = storedPresets.reduce<PermissionPreset[]>((acc, preset) => {
    acc.push(normalizePreset(preset, acc));
    return acc;
  }, []);

  if (
    storedPresets.length !== normalizedPresets.length ||
    storedPresets.some(
      (preset, index) =>
        preset.handle !== normalizedPresets[index]?.handle ||
        preset.name !== normalizedPresets[index]?.name ||
        preset.createdAt !== normalizedPresets[index]?.createdAt,
    )
  ) {
    await setItem(STORAGE_KEY, { presets: normalizedPresets });
  }

  return normalizedPresets;
}

/**
 * Saves the entire array of permissions presets to browser storage.
 * @param presets - Array of permissions presets to save
 * @internal Used internally by savePreset and deletePreset functions
 */
export async function savePresets(presets: StoredPermissionPreset[]): Promise<PermissionPreset[]> {
  const normalizedPresets = presets.reduce<PermissionPreset[]>((acc, preset) => {
    acc.push(normalizePreset(preset, acc));
    return acc;
  }, []);

  await setItem(STORAGE_KEY, { presets: normalizedPresets });
  return normalizedPresets;
}

/**
 * Saves or updates a permissions preset in browser storage.
 * If a preset with the same ID exists, it will be updated.
 * If not, the preset will be added as a new entry.
 * @param preset - The permissions preset to save or update
 */
export async function savePreset(preset: StoredPermissionPreset): Promise<PermissionPreset> {
  const presets = await getPresets();
  const updatedPresets: StoredPermissionPreset[] = [...presets];

  const existingIndex = updatedPresets.findIndex((p) => p.id === preset.id);
  if (existingIndex >= 0) {
    updatedPresets[existingIndex] = preset;
  } else {
    updatedPresets.push(preset);
  }

  const savedPresets = await savePresets(updatedPresets);
  return savedPresets.find((savedPreset) => savedPreset.id === preset.id)!;
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
        const importedPresets = JSON.parse(text) as StoredPermissionPreset[];

        if (!Array.isArray(importedPresets)) {
          throw new Error('Invalid file format. Expected an array of presets.');
        }

        // Import each preset one by one
        let importCount = 0;
        for (const importedPreset of importedPresets) {
          const newPreset: StoredPermissionPreset = {
            ...importedPreset,
            id: generatePresetId(),
            createdAt: importedPreset.createdAt || Date.now(),
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
