import { useEffect, useContext } from 'preact/hooks';
import { SettingsContext } from '../../contexts/SettingsContext';
import { setCheckboxValue, onCheckboxChange } from '~/utils/polaris.polyfill';

const settingsItems = [
  {
    key: 'searchIndexing',
    label: 'Number Search Results',
    details: 'Displays position numbers next to apps in search results',
  },
  {
    key: 'enhancedPartnerPages',
    label: 'Enhanced Partner Pages',
    details:
      'Adds a table to enrich apps data with sorting and download options for easier comparison and research',
  },
];

export function AppStoreSettings() {
  const context = useContext(SettingsContext);
  if (!context)
    throw new Error('AppStoreSettings must be used within SettingsProvider');
  const { settings, updateSettings, isLoading } = context;

  // Update checkbox values when settings change
  useEffect(() => {
    if (isLoading) return;

    const appStore = settings.appStore ?? {};

    settingsItems.forEach(({ key }) => {
      setCheckboxValue(
        `appstore-${key}`,
        appStore[key as keyof typeof appStore] !== false
      );
    });
  }, [isLoading, settings.appStore]);

  // Set up event listeners - recreate when settings change to use fresh values
  useEffect(() => {
    if (isLoading) return;

    const cleanupFunctions: (() => void)[] = [];

    settingsItems.forEach(({ key }) => {
      const cleanup = onCheckboxChange(`appstore-${key}`, async (checked) => {
        await updateSettings({
          appStore: {
            ...settings.appStore,
            [key]: checked,
          },
        });
      });

      if (cleanup) cleanupFunctions.push(cleanup);
    });

    // Cleanup old listeners when settings change
    return () => {
      cleanupFunctions.forEach((fn) => fn());
    };
  }, [settings.appStore, updateSettings, isLoading]);

  return (
    <s-section heading="App Store features">
      <s-paragraph>
        Enhance your Shopify App Store experience with additional features and
        improvements.
      </s-paragraph>
      <s-grid gap="small">
        {settingsItems.map(({ key, label, details }) => (
          <s-checkbox
            key={key}
            name={`appstore-${key}`}
            label={label}
            details={details}
          />
        ))}
      </s-grid>
    </s-section>
  );
}
