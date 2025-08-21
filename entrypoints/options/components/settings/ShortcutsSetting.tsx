import { useEffect } from 'preact/hooks';
import { useSettings } from '../../hooks/useSettings';
import { setCheckboxValue, onCheckboxChange } from '~/utils/polaris.polyfill';

const shortcutItems = [
  { key: 'openInAdmin', label: 'Open in Admin', details: 'Open the current page in Shopify Admin' },
  { key: 'openInCustomizer', label: 'Open in Customizer', details: 'Open the current page in theme customizer' },
  { key: 'copyProductJson', label: 'Copy Product JSON', details: 'Copy product data as JSON to clipboard' },
  { key: 'copyCartJson', label: 'Copy Cart JSON', details: 'Copy cart data as JSON to clipboard' },
  { key: 'copyThemePreviewUrl', label: 'Copy Theme Preview URL', details: 'Copy preview URL with theme ID' },
  { key: 'clearCart', label: 'Clear Cart', details: 'Remove all items from the cart' },
  { key: 'openSectionInCodeEditor', label: 'Open Section in Code Editor', details: 'Open the clicked section in theme code editor' },
];

export function ShortcutsSetting() {
  const { settings, updateSettings, isLoading } = useSettings();

  // Update checkbox values when settings change
  useEffect(() => {
    if (isLoading) return;

    const shortcuts = settings.shortcuts || {};

    shortcutItems.forEach(({ key }) => {
      setCheckboxValue(`shortcut-${key}`, shortcuts[key as keyof typeof shortcuts] !== false);
    });
  }, [isLoading, settings.shortcuts]);

  // Set up event listeners - recreate when settings change to use fresh values
  useEffect(() => {
    if (isLoading) return;

    const cleanupFunctions: (() => void)[] = [];

    shortcutItems.forEach(({ key }) => {
      const cleanup = onCheckboxChange(`shortcut-${key}`, async (checked) => {
        await updateSettings({
          shortcuts: {
            ...settings.shortcuts,
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
    <s-section heading="Shortcuts (Right-click menu)">
      <s-paragraph>
        Choose which shortcuts to show in the right-click context menu when using Alfred on Shopify stores.
      </s-paragraph>
      <s-grid gap="small">
        {shortcutItems.map(({ key, label, details }) => (
          <s-checkbox
            key={key}
            name={`shortcut-${key}`}
            label={label}
            details={details}
          />
        ))}
      </s-grid>
    </s-section>
  );
}
