<script lang="ts">
  import { getSettingsStore } from '../../stores/settings.svelte';

  const store = getSettingsStore();

  interface SettingItem {
    key: string;
    label: string;
    details?: string;
    subSettings?: SettingItem[];
  }

  const settingsItems: SettingItem[] = [
    { key: 'collapsibleSidebar', label: 'Collapsible sidebar', details: 'Adds a toggle button to collapse/expand the Shopify admin navigation sidebar' },
    { key: 'warnBeforeClosingCodeEditor', label: 'Warn before closing code editor', details: 'Show a confirmation dialog before closing the theme code editor page' },
    { key: 'themeListUtils', label: 'Theme list utilities', details: 'Adds copy buttons for Theme ID and Preview URL to each theme on the themes list page' }
  ];

  function handleChange(key: string, e: Event) {
    store.updateSettings({ admin: { ...store.settings.admin, [key]: (e.currentTarget as HTMLInputElement).checked } });
  }
</script>

{#snippet renderSettings(items: SettingItem[], depth: number)}
  {#each items as { key, label, details, subSettings }}
    <div style="margin-left: {depth * 24}px">
      <s-checkbox
        name="admin-{key}"
        {label}
        details={details ?? ''}
        checked={store.settings.admin?.[key as keyof typeof store.settings.admin] ?? false}
        onchange={(e: Event) => handleChange(key, e)}
      ></s-checkbox>
    </div>
    {#if subSettings && subSettings.length > 0 && store.settings.admin?.[key as keyof typeof store.settings.admin]}
      <div style="margin-top: 8px">
        {@render renderSettings(subSettings, depth + 1)}
      </div>
    {/if}
  {/each}
{/snippet}

<s-section heading="Shopify Admin">
  <s-paragraph>Customize the Shopify admin dashboard.</s-paragraph>
  <s-grid gap="small">
    {@render renderSettings(settingsItems, 0)}
  </s-grid>
</s-section>
