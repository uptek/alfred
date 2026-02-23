import { createContext } from 'preact';
import { useState, useEffect, useCallback } from 'preact/hooks';
import { getItem, setItem } from '~/utils/storage';
import { Toast } from '~/utils/toast';

interface SettingsContextValue {
  settings: AlfredSettings;
  updateSettings: (newSettings: Partial<AlfredSettings>) => Promise<boolean>;
  resetSettings: () => Promise<boolean>;
  isLoading: boolean;
  isSaving: boolean;
  defaultSettings: AlfredSettings;
}

const defaultSettings: AlfredSettings = {
  general: {
    restoreRightClick: true,
  },
  themeCustomizer: {
    inspector: 'default',
    resizers: {
      primarySidebar: true,
      secondarySidebar: true,
      previewHorizontal: true,
      previewVertical: true,
    },
  },
  shortcuts: {
    openInAdmin: true,
    openInCustomizer: true,
    copyProductJson: true,
    copyCartJson: true,
    copyThemePreviewUrl: true,
    clearCart: true,
    openSectionInCodeEditor: true,
    openImageInAdmin: true,
  },
  appStore: {
    searchIndexing: true,
    enhancedPartnerPages: true,
  },
  collaboratorAccess: {
    presets: true,
  },
  admin: {
    collapsibleSidebar: true,
    warnBeforeClosingCodeEditor: true,
    themeListUtils: true,
  },
};

export const SettingsContext = createContext<SettingsContextValue | undefined>(
  undefined
);

// Deep merge function to handle nested objects
function deepMerge<T>(target: T, source: Partial<T>): T {
  const result = { ...target };

  for (const key in source) {
    const sourceValue = source[key];
    if (sourceValue !== undefined) {
      if (
        typeof sourceValue === 'object' &&
        sourceValue !== null &&
        !Array.isArray(sourceValue)
      ) {
        // If both target and source have an object at this key, merge them
        if (
          typeof target[key] === 'object' &&
          target[key] !== null &&
          !Array.isArray(target[key])
        ) {
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

export function SettingsProvider({
  children,
}: {
  children: preact.ComponentChildren;
}) {
  const [settings, setSettings] = useState<AlfredSettings>(defaultSettings);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    loadSettings();
  }, []);

  const loadSettings = async () => {
    try {
      setIsLoading(true);
      const storedSettings = await getItem<AlfredSettings>('settings');

      if (!storedSettings) {
        // Initialize with default settings if none exist
        await setItem('settings', defaultSettings);
        setSettings(defaultSettings);
      } else {
        // Merge with defaults to ensure all properties exist
        const mergedSettings = deepMerge(defaultSettings, storedSettings);
        setSettings(mergedSettings);
      }
    } catch (error) {
      console.error('Failed to load settings:', error);
      setSettings(defaultSettings);
    } finally {
      setIsLoading(false);
    }
  };

  const updateSettings = useCallback(
    async (newSettings: Partial<AlfredSettings>) => {
      try {
        setIsSaving(true);

        // Use functional update to always have fresh state
        const updatedSettings = await new Promise<AlfredSettings>((resolve) => {
          setSettings((currentSettings) => {
            const updated = deepMerge(currentSettings, newSettings);
            resolve(updated);
            return updated;
          });
        });

        await setItem('settings', updatedSettings);
        Toast.success('Settings saved');
        return true;
      } catch (error) {
        console.error('Failed to save settings:', error);
        Toast.error('Failed to save settings');
        return false;
      } finally {
        setIsSaving(false);
      }
    },
    []
  );

  const resetSettings = useCallback(async () => {
    try {
      setIsSaving(true);
      await setItem('settings', defaultSettings);
      setSettings(defaultSettings);
      Toast.success('Settings reset to defaults');
      return true;
    } catch (error) {
      console.error('Failed to reset settings:', error);
      Toast.error('Failed to reset settings');
      return false;
    } finally {
      setIsSaving(false);
    }
  }, []);

  return (
    <SettingsContext.Provider
      value={{
        settings,
        updateSettings,
        resetSettings,
        isLoading,
        isSaving,
        defaultSettings,
      }}
    >
      {children}
    </SettingsContext.Provider>
  );
}
