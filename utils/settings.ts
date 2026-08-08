// Direct path instead of '#imports' so bun test can resolve this module.
import { storage } from 'wxt/utils/storage';
import { getItem, setItem } from './storage';

/** AlfredSettings with every top-level group guaranteed present (post-merge shape). */
export type ResolvedSettings = {
  [K in keyof AlfredSettings]-?: NonNullable<AlfredSettings[K]>;
};

export const defaultSettings: ResolvedSettings = {
  general: {
    analytics: true,
    restoreRightClick: true,
    openChangelogOnUpdate: true
  },
  themeCustomizer: {
    inspector: 'default',
    resizers: {
      primarySidebar: true,
      secondarySidebar: true,
      previewHorizontal: true,
      previewVertical: true
    }
  },
  shortcuts: {
    openInAdmin: true,
    openInCustomizer: true,
    copyProductJson: true,
    copyCartJson: true,
    copyThemePreviewUrl: true,
    exitThemePreview: true,
    clearCart: true,
    cartograph: true,
    openSectionInCodeEditor: true,
    openImageInAdmin: true,
    requestStoreAccess: true
  },
  appStore: {
    searchIndexing: true,
    enhancedPartnerPages: true,
    compareApps: true
  },
  collaboratorAccess: {
    presets: true,
    presetMenuItemBehavior: 'apply'
  },
  admin: {
    collapsibleSidebar: true,
    warnBeforeClosingCodeEditor: true,
    themeListUtils: true,
    timeline: true
  }
};

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Deep-merges a partial settings object over a base, recursing into nested
 * groups so a stored blob missing newer keys still picks up their defaults.
 */
export function deepMerge<T>(target: T, source: Partial<T>): T {
  const result = { ...target };

  for (const key in source) {
    const sourceValue = source[key];
    if (sourceValue !== undefined) {
      if (isPlainObject(sourceValue) && isPlainObject(target[key])) {
        result[key] = deepMerge(
          target[key] as Record<string, unknown>,
          sourceValue as Partial<Record<string, unknown>>
        ) as T[Extract<keyof T, string>];
      } else {
        result[key] = sourceValue as T[Extract<keyof T, string>];
      }
    }
  }

  return result;
}

/**
 * Merges a stored (possibly partial or null) settings blob over the defaults.
 * @param stored - Raw value from storage or a storage watcher.
 * @returns Settings with every group present.
 */
export function mergeSettings(stored: AlfredSettings | null | undefined): ResolvedSettings {
  return stored ? deepMerge(defaultSettings, stored) : { ...defaultSettings };
}

/**
 * Settings flags are enabled unless explicitly false, so blobs saved before a
 * flag existed keep the feature on. Every enabled-check must go through this.
 * @param flag - The setting value to test.
 */
export function isEnabled(flag: boolean | undefined | null): boolean {
  return flag !== false;
}

/**
 * Reads settings from storage, merged over defaults.
 */
export async function getSettings(): Promise<ResolvedSettings> {
  return mergeSettings(await getItem<AlfredSettings>('settings'));
}

/**
 * Merges a patch into stored settings and persists the defaults-merged result,
 * so partial writers can't strip groups other features rely on.
 * @param patch - Partial settings to apply.
 * @returns The persisted, fully-merged settings.
 */
export async function updateSettings(patch: Partial<AlfredSettings>): Promise<ResolvedSettings> {
  const merged = deepMerge<ResolvedSettings>(await getSettings(), patch as Partial<ResolvedSettings>);
  await setItem('settings', merged);
  return merged;
}

/**
 * Watches the settings blob, invoking the callback with the defaults-merged
 * value on every change.
 * @param callback - Receives the new resolved settings.
 * @returns Unwatch function.
 */
export function watchSettings(callback: (settings: ResolvedSettings) => void): () => void {
  return storage.watch<AlfredSettings>('local:settings', (newValue) => {
    callback(mergeSettings(newValue));
  });
}
