import { PageHeader } from './PageHeader';
import { ThemeInspectorSetting } from './settings/ThemeInspectorSetting';

export function Settings() {
  return (
    <form id="settings">
      <s-grid gap="base">
        <PageHeader title="Settings" icon="settings" />
        <ThemeInspectorSetting />
        {/* Add more setting components here as needed */}
      </s-grid>
    </form>
  );
}
