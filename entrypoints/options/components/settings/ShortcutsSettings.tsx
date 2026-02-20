import { useEffect, useContext } from 'preact/hooks';
import { SettingsContext } from '../../contexts/SettingsContext';
import { setCheckboxValue, onCheckboxChange } from '~/utils/polaris.polyfill';

interface ShortcutItem {
  key: string;
  label: string;
  details: string;
}

interface ShortcutCategory {
  label: string;
  items: ShortcutItem[];
}

const shortcutCategories: ShortcutCategory[] = [
  {
    label: 'Navigation',
    items: [
      {
        key: 'openInAdmin',
        label: 'Open in Admin',
        details: 'Opens the current page in Shopify Admin',
      },
      {
        key: 'openInCustomizer',
        label: 'Open in Customizer',
        details: 'Opens the current page in theme customizer',
      },
      {
        key: 'openSectionInCodeEditor',
        label: 'Open Section in Code Editor',
        details: 'Opens the clicked section in theme code editor',
      },
      {
        key: 'openImageInAdmin',
        label: 'Open Image in Admin > Files',
        details:
          'Opens (searches) the right-clicked image in Shopify Admin > Files',
      },
    ],
  },
  {
    label: 'Theme',
    items: [
      {
        key: 'copyThemePreviewUrl',
        label: 'Copy Theme Preview URL',
        details: 'Copies preview URL with context of current page',
      },
      {
        key: 'exitThemePreview',
        label: 'Exit Theme Preview',
        details: 'Exits the current theme preview and loads the live theme',
      },
    ],
  },
  {
    label: 'Data',
    items: [
      {
        key: 'copyProductJson',
        label: 'Copy Product JSON',
        details: 'Copies current product data as JSON to clipboard',
      },
      {
        key: 'copyCartJson',
        label: 'Copy Cart JSON',
        details: 'Copies cart data as JSON to clipboard',
      },
    ],
  },
  {
    label: 'Cart',
    items: [
      {
        key: 'clearCart',
        label: 'Clear Cart',
        details: 'Removes all items from the cart',
      },
    ],
  },
];

const allShortcutItems = shortcutCategories.flatMap(
  (category) => category.items
);

export function ShortcutsSetting() {
  const context = useContext(SettingsContext);
  if (!context)
    throw new Error('ShortcutsSetting must be used within SettingsProvider');
  const { settings, updateSettings, isLoading } = context;

  // Update checkbox values when settings change
  useEffect(() => {
    if (isLoading) return;

    const shortcuts = settings.shortcuts ?? {};

    allShortcutItems.forEach(({ key }) => {
      setCheckboxValue(
        `shortcut-${key}`,
        shortcuts[key as keyof typeof shortcuts] !== false
      );
    });
  }, [isLoading, settings.shortcuts]);

  // Set up event listeners - recreate when settings change to use fresh values
  useEffect(() => {
    if (isLoading) return;

    const cleanupFunctions: (() => void)[] = [];

    allShortcutItems.forEach(({ key }) => {
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
      cleanupFunctions.forEach((fn) => fn());
    };
  }, [settings, updateSettings, isLoading]);

  return (
    <s-section heading="Shortcuts (right-click menu)">
      <s-paragraph>
        Controls which shortcuts appear in the right-click context menu when
        using Alfred on Shopify stores.
      </s-paragraph>
      <s-stack gap="base">
        {shortcutCategories.map((category, categoryIndex) => (
          <>
            <s-stack key={category.label} gap="small-300">
              <s-text><b>{category.label}</b></s-text>
              <s-stack gap="small">
                {category.items.map(({ key, label, details }) => (
                  <s-checkbox
                    key={key}
                    name={`shortcut-${key}`}
                    label={label}
                    details={details}
                  />
                ))}
              </s-stack>
            </s-stack>
            {categoryIndex < shortcutCategories.length - 1 && <s-divider></s-divider>}
          </>
        ))}
      </s-stack>
    </s-section>
  );
}
