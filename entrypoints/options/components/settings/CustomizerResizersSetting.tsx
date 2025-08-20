import { useEffect } from 'preact/hooks';
import { useSettings } from '../../hooks/useSettings';
import { setCheckboxValue, onCheckboxChange } from '~/utils/polaris.polyfill';

export function CustomizerResizersSetting() {
  const { settings, updateSettings, isLoading } = useSettings();

  useEffect(() => {
    if (isLoading) return;

    // Set initial values for all checkboxes
    const resizers = settings.themeCustomizer?.resizers || {};

    // Default all resizers to true if not set
    setCheckboxValue('resizer-primary-sidebar', resizers.primarySidebar !== false);
    setCheckboxValue('resizer-secondary-sidebar', resizers.secondarySidebar !== false);
    setCheckboxValue('resizer-main-horizontal', resizers.mainHorizontal !== false);
    setCheckboxValue('resizer-main-vertical', resizers.mainVertical !== false);

    // Set up change listeners for each checkbox
    onCheckboxChange('resizer-primary-sidebar', async (checked) => {
      await updateSettings({
        themeCustomizer: {
          ...settings.themeCustomizer,
          resizers: {
            ...settings.themeCustomizer?.resizers,
            primarySidebar: checked,
          },
        },
      });
    });

    onCheckboxChange('resizer-secondary-sidebar', async (checked) => {
      await updateSettings({
        themeCustomizer: {
          ...settings.themeCustomizer,
          resizers: {
            ...settings.themeCustomizer?.resizers,
            secondarySidebar: checked,
          },
        },
      });
    });

    onCheckboxChange('resizer-main-horizontal', async (checked) => {
      await updateSettings({
        themeCustomizer: {
          ...settings.themeCustomizer,
          resizers: {
            ...settings.themeCustomizer?.resizers,
            mainHorizontal: checked,
          },
        },
      });
    });

    onCheckboxChange('resizer-main-vertical', async (checked) => {
      await updateSettings({
        themeCustomizer: {
          ...settings.themeCustomizer,
          resizers: {
            ...settings.themeCustomizer?.resizers,
            mainVertical: checked,
          },
        },
      });
    });
  }, [isLoading, settings]);

  return (
    <s-section heading="Customizer resizers">
      <s-paragraph>
        Choose which resize handles to show in the theme customizer. These allow you to adjust panel sizes for better workflow.
      </s-paragraph>
      <s-grid gap="small">
        <s-checkbox
          name="resizer-primary-sidebar"
          label="Primary sidebar resizer"
          details="Show resize handle for the left panel"
        />
        <s-checkbox
          name="resizer-secondary-sidebar"
          label="Secondary sidebar resizer"
          details="Show resize handle for the right panel"
        />
        <s-checkbox
          name="resizer-main-horizontal"
          label="Main preview width resizer"
          details="Show resize handle to adjust preview width"
        />
        <s-checkbox
          name="resizer-main-vertical"
          label="Main preview height resizer"
          details="Show resize handle to adjust preview height"
        />
      </s-grid>
    </s-section>
  );
}
