import { PageHeader } from '../PageHeader';
import { ThemeInspectorSetting } from '../settings/ThemeInspectorSettings';
import { CustomizerResizersSetting } from '../settings/CustomizerResizersSettings';
import { ShortcutsSetting } from '../settings/ShortcutsSettings';
import { AppStoreSettings } from '../settings/AppStoreSettings';
import { CollaboratorAccessSetting } from '../settings/CollaboratorAccessSettings';
import { AdminSettings } from '../settings/AdminSettings';
import { StorefrontPasswordSettings } from '../settings/StorefrontPasswordSettings';
import { GeneralSettings } from '../settings/GeneralSettings';

export function Settings() {
  return (
    <form id="settings">
      <s-grid gap="base">
        <PageHeader title="Settings" icon="settings" />
        <GeneralSettings />
        <ShortcutsSetting />
        <CollaboratorAccessSetting />
        <AdminSettings />
        <AppStoreSettings />
        <StorefrontPasswordSettings />
        <CustomizerResizersSetting />
        <ThemeInspectorSetting />
        {/* Add more setting components here as needed */}
      </s-grid>
    </form>
  );
}
