import { useEffect } from 'preact/hooks';
import { useSettings } from '../../hooks/useSettings';
import { setCheckboxValue, onCheckboxChange } from '~/utils/polaris.polyfill';

const appStoreItems = [
  {
    key: 'searchIndexing',
    label: 'Number Search Results',
    details: 'Displays position numbers next to apps in search results'
  },
  {
    key: 'enhancedPartnerPages',
    label: 'Enhanced Partner Pages',
    details: 'Adds a table to enrich apps data with sorting and download options for easier comparison and research'
  },
];

export function AppStoreSettings() {
  const { settings, updateSettings, isLoading } = useSettings();

  // Update checkbox values when settings change
  useEffect(() => {
    if (isLoading) return;

    const appStore = settings.appStore || {};

    appStoreItems.forEach(({ key }) => {
      setCheckboxValue(`appstore-${key}`, appStore[key as keyof typeof appStore] !== false);
    });
  }, [isLoading, settings.appStore]);

  // Set up event listeners - recreate when settings change to use fresh values
  useEffect(() => {
    if (isLoading) return;

    const cleanupFunctions: (() => void)[] = [];

    appStoreItems.forEach(({ key }) => {
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
      cleanupFunctions.forEach(fn => fn());
    };
  }, [settings, updateSettings, isLoading]);

  return (
    <s-section heading="App Store Features">
      <s-paragraph>
        Enhance your Shopify App Store experience with additional features and improvements.
      </s-paragraph>
      <s-grid gap="small">
        {appStoreItems.map(({ key, label, details }) => (
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
