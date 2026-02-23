import { useEffect, useContext } from 'preact/hooks';
import { SettingsContext } from '../../contexts/SettingsContext';
import { setCheckboxValue, onCheckboxChange } from '~/utils/polaris.polyfill';

const settingsItems = [
  {
    key: 'primarySidebar',
    label: 'Primary sidebar resizer',
    details: 'Shows resize handle for the left panel'
  },
  {
    key: 'secondarySidebar',
    label: 'Secondary sidebar resizer',
    details: 'Shows resize handle for the right panel'
  },
  {
    key: 'previewHorizontal',
    label: 'Preview width resizer',
    details: 'Shows resize handle to adjust preview area width'
  },
  {
    key: 'previewVertical',
    label: 'Preview height resizer',
    details: 'Shows resize handle to adjust preview area height'
  }
];

export function CustomizerResizersSetting() {
  const context = useContext(SettingsContext);
  if (!context) throw new Error('CustomizerResizersSetting must be used within SettingsProvider');
  const { settings, updateSettings, isLoading } = context;

  // Update checkbox values when settings change
  useEffect(() => {
    if (isLoading) return;

    const customizerResizers = settings.themeCustomizer?.resizers ?? {};

    settingsItems.forEach(({ key }) => {
      setCheckboxValue(`customizer-${key}`, customizerResizers[key as keyof typeof customizerResizers] !== false);
    });
  }, [isLoading, settings.themeCustomizer?.resizers]);

  useEffect(() => {
    if (isLoading) return;

    // Set initial values for all checkboxes
    const resizers = settings.themeCustomizer?.resizers ?? {};

    // Default all resizers to true if not set
    settingsItems.forEach(({ key }) => {
      setCheckboxValue(`resizer-${key}`, resizers[key as keyof typeof resizers] !== false);
    });
  }, [isLoading, settings.themeCustomizer?.resizers]);

  useEffect(() => {
    if (isLoading) return;

    const cleanupFunctions: (() => void)[] = [];

    settingsItems.forEach(({ key }) => {
      const cleanup = onCheckboxChange(`resizer-${key}`, async (checked) => {
        await updateSettings({
          themeCustomizer: {
            ...settings.themeCustomizer,
            resizers: {
              ...settings.themeCustomizer?.resizers,
              [key]: checked
            }
          }
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
    <s-section heading="Customizer resizers">
      <s-paragraph>
        Controls which resize handles appear in the theme customizer. These allow you to adjust panel sizes for better
        workflow.
      </s-paragraph>
      <s-grid gap="small">
        {settingsItems.map(({ key, label, details }) => (
          <s-checkbox key={key} name={`resizer-${key}`} label={label} details={details} />
        ))}
      </s-grid>
    </s-section>
  );
}
