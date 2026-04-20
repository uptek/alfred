<script lang="ts">
  import { getSettingsStore } from '../../stores/settings.svelte';

  const store = getSettingsStore();

  const settingsItems = [
    { key: 'primarySidebar', label: 'Primary sidebar resizer', details: 'Shows resize handle for the left panel' },
    { key: 'secondarySidebar', label: 'Secondary sidebar resizer', details: 'Shows resize handle for the right panel' },
    { key: 'previewHorizontal', label: 'Preview width resizer', details: 'Shows resize handle to adjust preview area width' },
    { key: 'previewVertical', label: 'Preview height resizer', details: 'Shows resize handle to adjust preview area height' }
  ];
</script>

<s-section heading="Customizer resizers">
  <s-paragraph>
    Controls which resize handles appear in the theme customizer. These allow you to adjust panel sizes for better workflow.
  </s-paragraph>
  <s-grid gap="small">
    {#each settingsItems as { key, label, details }}
      <s-checkbox
        name="resizer-{key}"
        {label}
        {details}
        checked={store.settings.themeCustomizer?.resizers?.[key as keyof typeof store.settings.themeCustomizer.resizers] !== false}
        onchange={(e: Event) => store.updateSettings({
          themeCustomizer: { ...store.settings.themeCustomizer, resizers: { ...store.settings.themeCustomizer?.resizers, [key]: (e.currentTarget as HTMLInputElement).checked } }
        })}
      ></s-checkbox>
    {/each}
  </s-grid>
</s-section>
