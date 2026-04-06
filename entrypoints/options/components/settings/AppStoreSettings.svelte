<script lang="ts">
  import { getSettingsStore } from '../../stores/settings.svelte';

  const store = getSettingsStore();

  const settingsItems = [
    { key: 'searchIndexing', label: 'Number Search Results', details: 'Displays position numbers next to apps in search results' },
    { key: 'enhancedPartnerPages', label: 'Enhanced Partner Pages', details: 'Adds a table to enrich apps data with sorting and download options for easier comparison and research' }
  ];
</script>

<s-section heading="App Store features">
  <s-paragraph>Enhance your Shopify App Store experience with additional features and improvements.</s-paragraph>
  <s-grid gap="small">
    {#each settingsItems as { key, label, details }}
      <s-checkbox
        name="appstore-{key}"
        {label}
        {details}
        checked={store.settings.appStore?.[key as keyof typeof store.settings.appStore] !== false}
        onchange={(e: Event) => store.updateSettings({ appStore: { ...store.settings.appStore, [key]: (e.currentTarget as HTMLInputElement).checked } })}
      ></s-checkbox>
    {/each}
  </s-grid>
</s-section>
