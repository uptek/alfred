import { PageHeader } from './PageHeader';
import { ThemeInspectorSetting } from './settings/ThemeInspectorSetting';
import { CustomizerResizersSetting } from './settings/CustomizerResizersSetting';

export function Settings() {
  return (
    <form id="settings">
      <s-grid gap="base">
        <PageHeader title="Settings" icon="settings" />
        <ThemeInspectorSetting />
        <CustomizerResizersSetting />
        {/* Add more setting components here as needed */}
      </s-grid>
    </form>
  );
}
