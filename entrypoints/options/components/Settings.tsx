import { PageHeader } from './PageHeader';
import { ThemeInspectorSetting } from './settings/ThemeInspectorSetting';
import { CustomizerResizersSetting } from './settings/CustomizerResizersSetting';
import { ShortcutsSetting } from './settings/ShortcutsSetting';
import { AppStoreSettings } from './settings/AppStoreSettings';
import { CollaboratorAccessSetting } from './settings/CollaboratorAccessSetting';

export function Settings() {
  return (
    <form id="settings">
      <s-grid gap="base">
        <PageHeader title="Settings" icon="settings" />
        <ShortcutsSetting />
        <CollaboratorAccessSetting />
        <AppStoreSettings />
        <CustomizerResizersSetting />
        <ThemeInspectorSetting />
        {/* Add more setting components here as needed */}
      </s-grid>
    </form>
  );
}
