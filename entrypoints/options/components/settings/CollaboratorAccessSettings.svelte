<script lang="ts">
  import { getSettingsStore } from '../../stores/settings.svelte';

  const store = getSettingsStore();
</script>

<s-section heading="Collaborator Access">
  <s-stack gap="base">
    <!-- Presets on the collaboration request page -->
    <s-stack gap="small-300">
      <s-paragraph>
        Save and quickly apply permission presets with custom messages on the Shopify collaboration request page.
      </s-paragraph>
      <s-checkbox
        name="collaborator-presets"
        label="Enable permission presets"
        checked={store.settings.collaboratorAccess?.presets !== false}
        onchange={(e: Event) =>
          store.updateSettings({
            collaboratorAccess: {
              ...store.settings.collaboratorAccess,
              presets: (e.currentTarget as HTMLInputElement).checked
            }
          })}
      ></s-checkbox>
    </s-stack>

    <s-divider></s-divider>

    <!-- Request access from any storefront (right-click menu) -->
    <s-stack gap="small-300">
      <s-text><b>Request store access context menu (shortcut)</b></s-text>
      <s-paragraph>
        Adds a right-click menu on Shopify stores, so you can request collaborator access right from the storefront. Your saved presets appear in the menu too.
      </s-paragraph>

      <s-checkbox
        name="collaborator-request-menu"
        label="Enable the right-click menu"
        checked={store.settings.shortcuts?.requestStoreAccess !== false}
        onchange={(e: Event) =>
          store.updateSettings({
            shortcuts: {
              ...store.settings.shortcuts,
              requestStoreAccess: (e.currentTarget as HTMLInputElement).checked
            }
          })}
      ></s-checkbox>

      <s-choice-list
        label="When you pick a preset from the menu"
        name="collaborator-preset-action"
        values={[store.settings.collaboratorAccess?.presetMenuItemBehavior === 'submit' ? 'submit' : 'apply']}
        onchange={(e: Event) =>
          store.updateSettings({
            collaboratorAccess: {
              ...store.settings.collaboratorAccess,
              presetMenuItemBehavior:
                (e.currentTarget as HTMLElement & { values: string[] }).values[0] === 'submit'
                  ? 'submit'
                  : 'apply'
            }
          })}
      >
        <s-choice value="apply">Open and apply the preset</s-choice>
        <s-choice value="submit">Open, apply, and submit automatically</s-choice>
      </s-choice-list>

      <s-text-field
        label="Presets to show in the menu"
        name="collaborator-menu-presets"
        details="Comma-separated preset handles, in the order they should appear. Leave empty to show all presets. Handles that don't match a preset are skipped."
        value={store.settings.collaboratorAccess?.presetMenuItemHandles ?? ''}
        onchange={(e: Event) =>
          store.updateSettings({
            collaboratorAccess: {
              ...store.settings.collaboratorAccess,
              presetMenuItemHandles: (e.currentTarget as HTMLInputElement).value
            }
          })}
      ></s-text-field>

      <s-text-field
        label="Shopify organization ID"
        name="collaborator-organization-id"
        details="The organization the request opens under. Alfred fills it in automatically the first time you visit your Partner dashboard. Change it if you work across more than one organization."
        inputMode="numeric"
        value={store.settings.collaboratorAccess?.organizationId ?? ''}
        onchange={(e: Event) =>
          store.updateSettings({
            collaboratorAccess: {
              ...store.settings.collaboratorAccess,
              organizationId: (e.currentTarget as HTMLInputElement).value.trim()
            }
          })}
      ></s-text-field>
    </s-stack>
  </s-stack>
</s-section>
