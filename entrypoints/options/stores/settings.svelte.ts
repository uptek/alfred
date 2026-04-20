import { getItem, setItem } from '~/utils/storage';
import { Toast } from '~/utils/toast';

const defaultSettings: AlfredSettings = {
  general: {
    restoreRightClick: true
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
    openImageInAdmin: true
  },
  appStore: {
    searchIndexing: true,
    enhancedPartnerPages: true
  },
  collaboratorAccess: {
    presets: true
  },
  admin: {
    collapsibleSidebar: true,
    warnBeforeClosingCodeEditor: true,
    themeListUtils: true
  }
};

// Deep merge function to handle nested objects
function deepMerge<T>(target: T, source: Partial<T>): T {
  const result = { ...target };

  for (const key in source) {
    const sourceValue = source[key];
    if (sourceValue !== undefined) {
      if (typeof sourceValue === 'object' && sourceValue !== null && !Array.isArray(sourceValue)) {
        if (typeof target[key] === 'object' && target[key] !== null && !Array.isArray(target[key])) {
          result[key] = deepMerge(
            target[key] as Record<string, unknown>,
            sourceValue as Partial<Record<string, unknown>>
          ) as T[Extract<keyof T, string>];
        } else {
          result[key] = sourceValue as T[Extract<keyof T, string>];
        }
      } else {
        result[key] = sourceValue as T[Extract<keyof T, string>];
      }
    }
  }

  return result;
}

// Module-level reactive state
let settings = $state.raw<AlfredSettings>(defaultSettings);
let isLoading = $state(true);
let isSaving = $state(false);

async function loadSettings() {
  try {
    isLoading = true;
    const storedSettings = await getItem<AlfredSettings>('settings');

    if (!storedSettings) {
      await setItem('settings', defaultSettings);
      settings = defaultSettings;
    } else {
      settings = deepMerge(defaultSettings, storedSettings);
    }
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
    settings = deepMerge(settings, newSettings);
    await setItem('settings', settings);
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
