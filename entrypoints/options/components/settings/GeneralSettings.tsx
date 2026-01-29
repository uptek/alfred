import { useEffect, useContext } from 'preact/hooks';
import { SettingsContext } from '../../contexts/SettingsContext';
import { setCheckboxValue, onCheckboxChange } from '~/utils/polaris.polyfill';

const settingsItems = [
  {
    key: 'restoreRightClick',
    label: 'Restore right-click',
    details:
      'Re-enables right-click context menu and text selection on Shopify sites that block them',
  },
];

export function GeneralSettings() {
  const context = useContext(SettingsContext);
  if (!context)
    throw new Error('GeneralSettings must be used within SettingsProvider');
  const { settings, updateSettings, isLoading } = context;

  useEffect(() => {
    if (isLoading) return;

    settingsItems.forEach(({ key }) => {
      setCheckboxValue(
        `general-${key}`,
        settings.general?.[key as keyof typeof settings.general] !== false
      );
    });
  }, [isLoading, settings.general]);

  useEffect(() => {
    if (isLoading) return;

    const cleanupFunctions: (() => void)[] = [];

    settingsItems.forEach(({ key }) => {
      const cleanup = onCheckboxChange(`general-${key}`, async (checked) => {
        await updateSettings({
          general: {
            ...settings.general,
            [key]: checked,
          },
        });
      });

      if (cleanup) cleanupFunctions.push(cleanup);
    });

    return () => {
      cleanupFunctions.forEach((fn) => fn());
    };
  }, [isLoading, settings.general, updateSettings]);

  return (
    <s-section heading="General">
      {/* <s-paragraph>General settings that apply to all websites.</s-paragraph> */}
      <s-grid gap="small">
        {settingsItems.map(({ key, label, details }) => (
          <s-checkbox
            key={key}
            name={`general-${key}`}
            label={label}
            details={details}
          />
        ))}
      </s-grid>
    </s-section>
  );
}
