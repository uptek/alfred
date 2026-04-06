<script lang="ts">
  import { getSettingsStore } from '../../stores/settings.svelte';
  import { setCheckboxValue, onCheckboxChange } from '~/utils/polaris.polyfill';

  const store = getSettingsStore();

  const settingsItems = [
    { key: 'primarySidebar', label: 'Primary sidebar resizer', details: 'Shows resize handle for the left panel' },
    { key: 'secondarySidebar', label: 'Secondary sidebar resizer', details: 'Shows resize handle for the right panel' },
    { key: 'previewHorizontal', label: 'Preview width resizer', details: 'Shows resize handle to adjust preview area width' },
    { key: 'previewVertical', label: 'Preview height resizer', details: 'Shows resize handle to adjust preview area height' }
  ];

  $effect(() => {
    if (store.isLoading) return;
    const resizers = store.settings.themeCustomizer?.resizers ?? {};
    settingsItems.forEach(({ key }) => {
      setCheckboxValue(`resizer-${key}`, resizers[key as keyof typeof resizers] !== false);
    });
  });

  $effect(() => {
    if (store.isLoading) return;
    const cleanupFunctions: (() => void)[] = [];
    settingsItems.forEach(({ key }) => {
      const cleanup = onCheckboxChange(`resizer-${key}`, async (checked) => {
        await store.updateSettings({
          themeCustomizer: { ...store.settings.themeCustomizer, resizers: { ...store.settings.themeCustomizer?.resizers, [key]: checked } }
        });
      });
      if (cleanup) cleanupFunctions.push(cleanup);
    });
    return () => cleanupFunctions.forEach((fn) => fn());
  });
</script>

<s-section heading="Customizer resizers">
  <s-paragraph>
    Controls which resize handles appear in the theme customizer. These allow you to adjust panel sizes for better workflow.
  </s-paragraph>
  <s-grid gap="small">
    {#each settingsItems as { key, label, details }}
      <s-checkbox name="resizer-{key}" {label} {details}></s-checkbox>
    {/each}
  </s-grid>
</s-section>
