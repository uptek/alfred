<script lang="ts">
  import { getSettingsStore } from '../../stores/settings.svelte';
  import { setCheckboxValue, onCheckboxChange } from '~/utils/polaris.polyfill';

  const store = getSettingsStore();

  const settingsItems = [
    { key: 'searchIndexing', label: 'Number Search Results', details: 'Displays position numbers next to apps in search results' },
    { key: 'enhancedPartnerPages', label: 'Enhanced Partner Pages', details: 'Adds a table to enrich apps data with sorting and download options for easier comparison and research' }
  ];

  $effect(() => {
    if (store.isLoading) return;
    const appStore = store.settings.appStore ?? {};
    settingsItems.forEach(({ key }) => {
      setCheckboxValue(`appstore-${key}`, appStore[key as keyof typeof appStore] !== false);
    });
  });

  $effect(() => {
    if (store.isLoading) return;
    const cleanupFunctions: (() => void)[] = [];
    settingsItems.forEach(({ key }) => {
      const cleanup = onCheckboxChange(`appstore-${key}`, async (checked) => {
        await store.updateSettings({ appStore: { ...store.settings.appStore, [key]: checked } });
      });
      if (cleanup) cleanupFunctions.push(cleanup);
    });
    return () => cleanupFunctions.forEach((fn) => fn());
  });
</script>

<s-section heading="App Store features">
  <s-paragraph>Enhance your Shopify App Store experience with additional features and improvements.</s-paragraph>
  <s-grid gap="small">
    {#each settingsItems as { key, label, details }}
      <s-checkbox name="appstore-{key}" {label} {details}></s-checkbox>
    {/each}
  </s-grid>
</s-section>
