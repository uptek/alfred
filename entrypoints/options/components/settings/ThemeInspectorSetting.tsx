import { useEffect } from 'preact/hooks';
import { useSettings } from '../../hooks/useSettings';
import { setChoiceListValue, onChoiceListChange } from '~/utils/polaris.polyfill';

export function ThemeInspectorSetting() {
  const { settings, updateSettings, isLoading } = useSettings();

  useEffect(() => {
    if (isLoading) return;

    // Set initial value
    const value = settings.themeCustomizer?.inspector || 'default';
    setChoiceListValue('theme-inspector', value);

    // Set up change listener
    onChoiceListChange('theme-inspector', async (newValue) => {
      await updateSettings({
        themeCustomizer: {
          ...settings.themeCustomizer,
          inspector: newValue as 'default' | 'disable' | 'restore',
        },
      });
    });
  }, [isLoading]);

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
        <s-choice
          label="Default behavior"
          value="default"
        />
        <s-choice
          label="Disable inspector"
          value="disable"
          details="Always disables the theme inspector on page load"
        />
        <s-choice
          label="Restore previous state"
          value="restore"
          details="Remembers and restores your last inspector state"
        />
      </s-choice-list>
    </s-section>
  );
}
