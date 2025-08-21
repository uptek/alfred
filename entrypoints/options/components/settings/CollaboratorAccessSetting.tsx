import { useEffect } from 'preact/hooks';
import { useSettings } from '../../hooks/useSettings';
import { setCheckboxValue, onCheckboxChange } from '~/utils/polaris.polyfill';

const collaboratorItems = [
  {
    key: 'presets',
    label: 'Enable Presets',
    details: null
  },
];

export function CollaboratorAccessSetting() {
  const { settings, updateSettings, isLoading } = useSettings();

  // Update checkbox values when settings change
  useEffect(() => {
    if (isLoading) return;

    const collaboratorAccess = settings.collaboratorAccess || {};

    collaboratorItems.forEach(({ key }) => {
      setCheckboxValue(`collaborator-${key}`, collaboratorAccess[key as keyof typeof collaboratorAccess] !== false);
    });
  }, [isLoading, settings.collaboratorAccess]);

  // Set up event listeners - recreate when settings change to use fresh values
  useEffect(() => {
    if (isLoading) return;

    const cleanupFunctions: (() => void)[] = [];

    collaboratorItems.forEach(({ key }) => {
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
  }, [settings, updateSettings, isLoading]);

  return (
    <s-section heading="Collaborator Access Presets">
      <s-paragraph>
        Allows you to save and quickly apply permission presets with custom messages when requesting collaborator access to stores.
      </s-paragraph>
      <s-grid gap="small">
        {collaboratorItems.map(({ key, label, details }) => (
          <s-checkbox
            key={key}
            name={`collaborator-${key}`}
            label={label}
            details={details}
          />
        ))}
      </s-grid>
    </s-section>
  );
}
