<script lang="ts">
  import { getSettingsStore } from '../../stores/settings.svelte';

  const store = getSettingsStore();

  const settingsItems = [
    { key: 'analytics', label: 'Share anonymous usage analytics', details: 'When enabled, anonymous feature usage data (e.g. which actions are used) is sent to help improve Alfred. No identifiable data is ever collected.' },
    { key: 'restoreRightClick', label: 'Restore right-click', details: 'Re-enables right-click context menu and text selection on Shopify sites that block them' },
    { key: 'openChangelogOnUpdate', label: 'Open changelog after updates', details: 'Opens the changelog in a new tab whenever Alfred updates to a new version, so you can see what changed. Disable to update silently.' }
  ];
</script>

<s-section heading="General">
  <s-grid gap="small">
    {#each settingsItems as { key, label, details }}
      <s-checkbox
        name="general-{key}"
        {label}
        {details}
        checked={store.settings.general?.[key as keyof typeof store.settings.general] !== false}
        onchange={(e: Event) => store.updateSettings({ general: { ...store.settings.general, [key]: (e.currentTarget as HTMLInputElement).checked } })}
      ></s-checkbox>
    {/each}
  </s-grid>
</s-section>
