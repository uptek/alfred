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
    setCheckboxValue('resizer-preview-horizontal', resizers.previewHorizontal !== false);
    setCheckboxValue('resizer-preview-vertical', resizers.previewVertical !== false);

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

    onCheckboxChange('resizer-preview-horizontal', async (checked) => {
      await updateSettings({
        themeCustomizer: {
          ...settings.themeCustomizer,
          resizers: {
            ...settings.themeCustomizer?.resizers,
            previewHorizontal: checked,
          },
        },
      });
    });

    onCheckboxChange('resizer-preview-vertical', async (checked) => {
      await updateSettings({
        themeCustomizer: {
          ...settings.themeCustomizer,
          resizers: {
            ...settings.themeCustomizer?.resizers,
            previewVertical: checked,
          },
        },
      });
    });
  }, [isLoading, settings.themeCustomizer?.resizers]);

  return (
    <s-section heading="Customizer resizers">
      <s-paragraph>
        Controls which resize handles appear in the theme customizer. These allow you to adjust panel sizes for better workflow.
      </s-paragraph>
      <s-grid gap="small">
        <s-checkbox
          name="resizer-primary-sidebar"
          label="Primary sidebar resizer"
          details="Shows resize handle for the left panel"
        />
        <s-checkbox
          name="resizer-secondary-sidebar"
          label="Secondary sidebar resizer"
          details="Shows resize handle for the right panel"
        />
        <s-checkbox
          name="resizer-preview-horizontal"
          label="Preview width resizer"
          details="Shows resize handle to adjust preview area width"
        />
        <s-checkbox
          name="resizer-preview-vertical"
          label="Preview height resizer"
          details="Shows resize handle to adjust preview area height"
        />
      </s-grid>
    </s-section>
  );
}
