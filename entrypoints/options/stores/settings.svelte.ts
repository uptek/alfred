import { getItem, setItem } from '~/utils/storage';
import {
  deepMerge,
  defaultSettings,
  mergeSettings,
  updateSettings as persistSettings,
  type ResolvedSettings
} from '~/utils/settings';
import { Toast } from '@/utils/toast';

// Module-level reactive state
let settings = $state.raw<ResolvedSettings>(defaultSettings);
let isLoading = $state(true);
let isSaving = $state(false);

async function loadSettings() {
  try {
    isLoading = true;
    const storedSettings = await getItem<AlfredSettings>('settings');

    // First run: persist the defaults so other contexts see a complete blob.
    if (!storedSettings) {
      await setItem('settings', defaultSettings);
    }
    settings = mergeSettings(storedSettings);
  } catch (error) {
    console.error('Failed to load settings:', error);
    settings = defaultSettings;
  } finally {
    isLoading = false;
  }
}

async function updateSettings(newSettings: Partial<AlfredSettings>): Promise<boolean> {
  try {
    isSaving = true;
    // Reflect the patch before the storage round-trip. Handlers build their
    // patch by spreading the current group (`{ ...store.settings.shortcuts }`),
    // so a second toggle fired mid-write would otherwise spread pre-patch
    // values and undo the first one.
    settings = deepMerge(settings, newSettings as Partial<ResolvedSettings>);
    settings = await persistSettings(newSettings);
    Toast.success('Settings saved');
    return true;
  } catch (error) {
    console.error('Failed to save settings:', error);
    Toast.error('Failed to save settings');
    return false;
  } finally {
    isSaving = false;
  }
}

async function resetSettings(): Promise<boolean> {
  try {
    isSaving = true;
    // A straight write, not the merging facade: reset must also clear keys that
    // have no default (organizationId, presetMenuItemHandles), which a merge of
    // defaults over the stored blob would leave behind.
    await setItem('settings', defaultSettings);
    settings = defaultSettings;
    Toast.success('Settings reset to defaults');
    return true;
  } catch (error) {
    console.error('Failed to reset settings:', error);
    Toast.error('Failed to reset settings');
    return false;
  } finally {
    isSaving = false;
  }
}

// Initialize on import
loadSettings().catch(() => {});

export function getSettingsStore() {
  return {
    get settings() {
      return settings;
    },
    get isLoading() {
      return isLoading;
    },
    get isSaving() {
      return isSaving;
    },
    get defaultSettings() {
      return defaultSettings;
    },
    updateSettings,
    resetSettings
  };
}
