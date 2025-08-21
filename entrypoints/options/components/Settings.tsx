import { PageHeader } from './PageHeader';
import { ThemeInspectorSetting } from './settings/ThemeInspectorSetting';
import { CustomizerResizersSetting } from './settings/CustomizerResizersSetting';
import { ShortcutsSetting } from './settings/ShortcutsSetting';
import { AppStoreSettings } from './settings/AppStoreSettings';

export function Settings() {
  return (
    <form id="settings">
      <s-grid gap="base">
        <PageHeader title="Settings" icon="settings" />
        <ThemeInspectorSetting />
        <CustomizerResizersSetting />
        <ShortcutsSetting />
        <AppStoreSettings />
        {/* Add more setting components here as needed */}
      </s-grid>
    </form>
  );
}
