import { useEffect, useContext } from 'preact/hooks';
import { SettingsContext } from '../../contexts/SettingsContext';
import { setCheckboxValue, onCheckboxChange } from '~/utils/polaris.polyfill';

const settingsItems = [
  {
    key: 'presets',
    label: 'Enable Presets',
    details: null
  },
];

export function CollaboratorAccessSetting() {
  const context = useContext(SettingsContext);
  if (!context) throw new Error('CollaboratorAccessSetting must be used within SettingsProvider');
  const { settings, updateSettings, isLoading } = context;

  // Update checkbox values when settings change
  useEffect(() => {
    if (isLoading) return;

    const collaboratorAccess = settings.collaboratorAccess || {};

    settingsItems.forEach(({ key }) => {
      setCheckboxValue(`collaborator-${key}`, collaboratorAccess[key as keyof typeof collaboratorAccess] !== false);
    });
  }, [isLoading, settings.collaboratorAccess]);

  // Set up event listeners - recreate when settings change to use fresh values
  useEffect(() => {
    if (isLoading) return;

    const cleanupFunctions: (() => void)[] = [];

    settingsItems.forEach(({ key }) => {
      const cleanup = onCheckboxChange(`collaborator-${key}`, async (checked) => {
        await updateSettings({
          collaboratorAccess: {
            ...settings.collaboratorAccess,
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
  }, [settings.collaboratorAccess, updateSettings, isLoading]);

  return (
    <s-section heading="Collaborator Access Presets">
      <s-paragraph>
        Allows you to save and quickly apply permission presets with custom messages when requesting collaborator access to stores.
      </s-paragraph>
      <s-grid gap="small">
        {settingsItems.map(({ key, label, details }) => (
          <s-checkbox
            key={key}
            name={`collaborator-${key}`}
            label={label}
            details={details || undefined}
          />
        ))}
      </s-grid>
    </s-section>
  );
}
