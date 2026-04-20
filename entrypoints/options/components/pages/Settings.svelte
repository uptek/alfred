<script lang="ts">
  import PageHeader from '../PageHeader.svelte';
  import ThemeInspectorSettings from '../settings/ThemeInspectorSettings.svelte';
  import CustomizerResizersSettings from '../settings/CustomizerResizersSettings.svelte';
  import ShortcutsSettings from '../settings/ShortcutsSettings.svelte';
  import AppStoreSettings from '../settings/AppStoreSettings.svelte';
  import CollaboratorAccessSettings from '../settings/CollaboratorAccessSettings.svelte';
  import AdminSettings from '../settings/AdminSettings.svelte';
  import StorefrontPasswordSettings from '../settings/StorefrontPasswordSettings.svelte';
  import GeneralSettings from '../settings/GeneralSettings.svelte';
</script>

<form id="settings">
  <s-grid gap="base">
    <PageHeader title="Settings" icon="settings" />
    <GeneralSettings />
    <ShortcutsSettings />
    <CollaboratorAccessSettings />
    <AdminSettings />
    <AppStoreSettings />
    <StorefrontPasswordSettings />
    <CustomizerResizersSettings />
    <ThemeInspectorSettings />
  </s-grid>
</form>
