<script lang="ts">
  import { getSettingsStore } from '../../stores/settings.svelte';

  const store = getSettingsStore();

  const settingsItems = [
    { key: 'presets', label: 'Enable Presets', details: '' }
  ];
</script>

<s-section heading="Collaborator Access Presets">
  <s-paragraph>
    Allows you to save and quickly apply permission presets with custom messages when requesting collaborator access to stores.
  </s-paragraph>
  <s-grid gap="small">
    {#each settingsItems as { key, label, details }}
      <s-checkbox
        name="collaborator-{key}"
        {label}
        details={details || ''}
        checked={store.settings.collaboratorAccess?.[key as keyof typeof store.settings.collaboratorAccess] !== false}
        onchange={(e: Event) => store.updateSettings({ collaboratorAccess: { ...store.settings.collaboratorAccess, [key]: (e.currentTarget as HTMLInputElement).checked } })}
      ></s-checkbox>
    {/each}
  </s-grid>
</s-section>
