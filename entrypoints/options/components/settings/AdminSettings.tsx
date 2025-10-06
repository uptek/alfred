import { useEffect, useContext } from 'preact/hooks';
import { SettingsContext } from '../../contexts/SettingsContext';
import { setCheckboxValue, onCheckboxChange } from '~/utils/polaris.polyfill';

interface SettingItem {
  key: string;
  label: string;
  details?: string;
  subSettings?: SettingItem[];
}

const settingsItems: SettingItem[] = [
  {
    key: 'collapsibleSidebar',
    label: 'Collapsible sidebar',
    details: 'Adds a toggle button to collapse/expand the Shopify admin navigation sidebar'
  },
];

export function AdminSettings() {
  const context = useContext(SettingsContext);
  if (!context) throw new Error('AdminSettings must be used within SettingsProvider');
  const { settings, updateSettings, isLoading } = context;

  const initializeCheckboxes = (items: SettingItem[], prefix = 'admin') => {
    items.forEach(({ key, subSettings }) => {
      // Set initial value
      setCheckboxValue(`${prefix}-${key}`, settings.admin?.[key as keyof typeof settings.admin] || false);

      // Initialize sub-settings if they exist
      if (subSettings && subSettings.length > 0) {
        initializeCheckboxes(subSettings, `${prefix}-${key}`);
      }
    });
  };

  const setupListeners = (items: SettingItem[], prefix = 'admin'): (() => void)[] => {
    const cleanupFunctions: (() => void)[] = [];

    items.forEach(({ key, subSettings }) => {
      const cleanup = onCheckboxChange(`${prefix}-${key}`, async (checked) => {
        await updateSettings({
          admin: {
            ...settings.admin,
            [key]: checked,
          },
        });

        // If unchecking parent, also uncheck sub-settings
        if (!checked && subSettings && subSettings.length > 0) {
          subSettings.forEach(sub => {
            setCheckboxValue(`${prefix}-${key}-${sub.key}`, false);
          });
        }
      });

      if (cleanup) cleanupFunctions.push(cleanup);

      // Setup listeners for sub-settings
      if (subSettings && subSettings.length > 0) {
        cleanupFunctions.push(...setupListeners(subSettings, `${prefix}-${key}`));
      }
    });

    return cleanupFunctions;
  };

  useEffect(() => {
    if (isLoading) return;
    initializeCheckboxes(settingsItems);
  }, [isLoading, settings.admin]);

  useEffect(() => {
    if (isLoading) return;

    const cleanupFunctions = setupListeners(settingsItems);

    return () => {
      cleanupFunctions.forEach(fn => fn());
    };
  }, [isLoading, settings.admin, updateSettings]);

  const renderSettings = (items: SettingItem[], prefix = 'admin', depth = 0) => {
    return items.map(({ key, label, details, subSettings }) => {
      const parentEnabled = depth === 0 || settings.admin?.[key as keyof typeof settings.admin];
      const hasSubSettings = subSettings && subSettings.length > 0;

      return (
        <>
          <div style={{ marginLeft: `${depth * 24}px` }} key={`${prefix}-${key}`}>
            <s-checkbox
              name={`${prefix}-${key}`}
              label={label}
              details={details}
            />
          </div>
          {hasSubSettings && parentEnabled && (
            <div style={{ marginTop: '8px' }}>
              {renderSettings(subSettings, `${prefix}-${key}`, depth + 1)}
            </div>
          )}
        </>
      );
    });
  };

  return (
    <s-section heading="Shopify Admin">
      <s-paragraph>
        Customize the Shopify admin dashboard.
      </s-paragraph>
      <s-grid gap="small">
        {renderSettings(settingsItems)}
      </s-grid>
    </s-section>
  );
}
