import { useEffect, useContext } from 'preact/hooks';
import { SettingsContext } from '../../contexts/SettingsContext';
import { setChoiceListValue, onChoiceListChange } from '~/utils/polaris.polyfill';

export function ThemeInspectorSetting() {
  const context = useContext(SettingsContext);
  if (!context) throw new Error('ThemeInspectorSetting must be used within SettingsProvider');
  const { settings, updateSettings, isLoading } = context;

  useEffect(() => {
    if (isLoading) return;

    // Set initial value
    const value = settings.themeCustomizer?.inspector || 'default';
    setChoiceListValue('theme-inspector', value);
  }, [isLoading, settings.themeCustomizer?.inspector]);

  useEffect(() => {
    if (isLoading) return;

    const cleanupFunctions: (() => void)[] = [];

    // Set up change listener
    const cleanup = onChoiceListChange('theme-inspector', async (newValue) => {
      await updateSettings({
        themeCustomizer: {
          ...settings.themeCustomizer,
          inspector: newValue as 'default' | 'disable' | 'restore',
        },
      });
    });

    if (cleanup) cleanupFunctions.push(cleanup);

    return () => {
      cleanupFunctions.forEach(fn => fn());
    };
  }, [isLoading, settings.themeCustomizer?.inspector, updateSettings]);

  return (
    <s-section heading="Theme inspector">
      <s-paragraph>
        Controls how Alfred manages the theme inspector in the customizer. Choose to disable it automatically,
        remember and restore your last state, or leave it unchanged.
      </s-paragraph>
      <s-choice-list
        label="Theme inspector"
        labelAccessibilityVisibility="exclusive"
        name="theme-inspector"
      >
        <s-choice value="default">
          Default behavior
        </s-choice>
        <s-choice value="disable">
          Disable inspector: Always disables the theme inspector on page load
        </s-choice>
        <s-choice value="restore">
          Restore previous state: Remembers and restores your last inspector state
        </s-choice>
      </s-choice-list>
    </s-section>
  );
}
