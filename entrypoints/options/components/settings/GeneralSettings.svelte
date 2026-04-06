<script lang="ts">
  import { getSettingsStore } from '../../stores/settings.svelte';
  import { setCheckboxValue, onCheckboxChange } from '~/utils/polaris.polyfill';

  const store = getSettingsStore();

  const settingsItems = [
    { key: 'restoreRightClick', label: 'Restore right-click', details: 'Re-enables right-click context menu and text selection on Shopify sites that block them' }
  ];

  $effect(() => {
    if (store.isLoading) return;
    settingsItems.forEach(({ key }) => {
      setCheckboxValue(`general-${key}`, store.settings.general?.[key as keyof typeof store.settings.general] !== false);
    });
  });

  $effect(() => {
    if (store.isLoading) return;
    const cleanupFunctions: (() => void)[] = [];
    settingsItems.forEach(({ key }) => {
      const cleanup = onCheckboxChange(`general-${key}`, async (checked) => {
        await store.updateSettings({ general: { ...store.settings.general, [key]: checked } });
      });
      if (cleanup) cleanupFunctions.push(cleanup);
    });
    return () => cleanupFunctions.forEach((fn) => fn());
  });
</script>

<s-section heading="General">
  <s-grid gap="small">
    {#each settingsItems as { key, label, details }}
      <s-checkbox name="general-{key}" {label} {details}></s-checkbox>
    {/each}
  </s-grid>
</s-section>
