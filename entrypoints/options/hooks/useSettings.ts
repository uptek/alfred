import { useState, useEffect, useCallback } from 'preact/hooks';
import { getItem, setItem } from '~/utils/storage';

const defaultSettings: AlfredSettings = {
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
  },
  appStore: {
    searchIndexing: true,
    enhancedPartnerPages: true,
  },
};

export function useSettings() {
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
        const mergedSettings: AlfredSettings = {
          themeCustomizer: {
            ...defaultSettings.themeCustomizer,
            ...(storedSettings.themeCustomizer || {}),
          },
          shortcuts: {
            ...defaultSettings.shortcuts,
            ...(storedSettings.shortcuts || {}),
          },
          appStore: {
            ...defaultSettings.appStore,
            ...(storedSettings.appStore || {}),
          },
        };
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

        const updatedSettings: AlfredSettings = {
          ...settings,
          ...newSettings,
        };

        await setItem('settings', updatedSettings);
        setSettings(updatedSettings);

        return true;
      } catch (error) {
        console.error('Failed to save settings:', error);
        return false;
      } finally {
        setIsSaving(false);
      }
    },
    [settings]
  );

  const resetSettings = useCallback(async () => {
    try {
      setIsSaving(true);
      await setItem('settings', defaultSettings);
      setSettings(defaultSettings);
      return true;
    } catch (error) {
      console.error('Failed to reset settings:', error);
      return false;
    } finally {
      setIsSaving(false);
    }
  }, []);

  return {
    settings,
    updateSettings,
    resetSettings,
    isLoading,
    isSaving,
    defaultSettings,
  };
}
