<script lang="ts">
  import { getSettingsStore } from '../../stores/settings.svelte';
  import { setCheckboxValue, onCheckboxChange } from '~/utils/polaris.polyfill';

  const store = getSettingsStore();

  const settingsItems = [
    { key: 'presets', label: 'Enable Presets', details: '' }
  ];

  $effect(() => {
    if (store.isLoading) return;
    const collaboratorAccess = store.settings.collaboratorAccess ?? {};
    settingsItems.forEach(({ key }) => {
      setCheckboxValue(`collaborator-${key}`, collaboratorAccess[key as keyof typeof collaboratorAccess] !== false);
    });
  });

  $effect(() => {
    if (store.isLoading) return;
    const cleanupFunctions: (() => void)[] = [];
    settingsItems.forEach(({ key }) => {
      const cleanup = onCheckboxChange(`collaborator-${key}`, async (checked) => {
        await store.updateSettings({ collaboratorAccess: { ...store.settings.collaboratorAccess, [key]: checked } });
      });
      if (cleanup) cleanupFunctions.push(cleanup);
    });
    return () => cleanupFunctions.forEach((fn) => fn());
  });
</script>

<s-section heading="Collaborator Access Presets">
  <s-paragraph>
    Allows you to save and quickly apply permission presets with custom messages when requesting collaborator access to stores.
  </s-paragraph>
  <s-grid gap="small">
    {#each settingsItems as { key, label, details }}
      <s-checkbox name="collaborator-{key}" {label} details={details || ''}></s-checkbox>
    {/each}
  </s-grid>
</s-section>
