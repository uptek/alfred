<script lang="ts">
  import { getSettingsStore } from '../../stores/settings.svelte';

  const store = getSettingsStore();

  const settingsItems = [
    { key: 'collapsibleSidebar', label: 'Collapsible sidebar', details: 'Adds a toggle button to collapse/expand the Shopify admin navigation sidebar' },
    { key: 'warnBeforeClosingCodeEditor', label: 'Warn before closing code editor', details: 'Show a confirmation dialog before closing the theme code editor page' },
    { key: 'themeListUtils', label: 'Theme list utilities', details: 'Adds copy buttons for Theme ID and Preview URL to each theme on the themes list page' },
    { key: 'timeline', label: 'Timeline', details: 'Shows a Shopify-style timeline at the bottom of product, collection, page, blog post, and blog admin screens' }
  ];

  function handleChange(key: string, e: Event) {
    store.updateSettings({ admin: { ...store.settings.admin, [key]: (e.currentTarget as HTMLInputElement).checked } });
  }
</script>

<s-section heading="Shopify Admin">
  <s-paragraph>Customize the Shopify admin dashboard.</s-paragraph>
  <s-grid gap="small">
    {#each settingsItems as { key, label, details }}
      <s-checkbox
        name="admin-{key}"
        {label}
        details={details ?? ''}
        checked={store.settings.admin?.[key as keyof typeof store.settings.admin] ?? false}
        onchange={(e: Event) => handleChange(key, e)}
      ></s-checkbox>
    {/each}
  </s-grid>
</s-section>
