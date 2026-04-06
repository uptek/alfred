<script lang="ts">
  import { getSettingsStore } from '../../stores/settings.svelte';
  import { setCheckboxValue, onCheckboxChange } from '~/utils/polaris.polyfill';

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

  function initializeCheckboxes(items: SettingItem[], prefix = 'admin') {
    items.forEach(({ key, subSettings }) => {
      setCheckboxValue(`${prefix}-${key}`, store.settings.admin?.[key as keyof typeof store.settings.admin] ?? false);
      if (subSettings && subSettings.length > 0) {
        initializeCheckboxes(subSettings, `${prefix}-${key}`);
      }
    });
  }

  function setupListeners(items: SettingItem[], prefix = 'admin'): (() => void)[] {
    const cleanupFunctions: (() => void)[] = [];
    items.forEach(({ key, subSettings }) => {
      const cleanup = onCheckboxChange(`${prefix}-${key}`, async (checked) => {
        await store.updateSettings({ admin: { ...store.settings.admin, [key]: checked } });
        if (!checked && subSettings && subSettings.length > 0) {
          subSettings.forEach((sub) => { setCheckboxValue(`${prefix}-${key}-${sub.key}`, false); });
        }
      });
      if (cleanup) cleanupFunctions.push(cleanup);
      if (subSettings && subSettings.length > 0) {
        cleanupFunctions.push(...setupListeners(subSettings, `${prefix}-${key}`));
      }
    });
    return cleanupFunctions;
  }

  $effect(() => {
    if (store.isLoading) return;
    initializeCheckboxes(settingsItems);
  });

  $effect(() => {
    if (store.isLoading) return;
    const cleanupFunctions = setupListeners(settingsItems);
    return () => cleanupFunctions.forEach((fn) => fn());
  });
</script>

{#snippet renderSettings(items: SettingItem[], prefix: string, depth: number)}
  {#each items as { key, label, details, subSettings }}
    <div style="margin-left: {depth * 24}px">
      <s-checkbox name="{prefix}-{key}" {label} details={details ?? ''}></s-checkbox>
    </div>
    {#if subSettings && subSettings.length > 0 && store.settings.admin?.[key as keyof typeof store.settings.admin]}
      <div style="margin-top: 8px">
        {@render renderSettings(subSettings, `${prefix}-${key}`, depth + 1)}
      </div>
    {/if}
  {/each}
{/snippet}

<s-section heading="Shopify Admin">
  <s-paragraph>Customize the Shopify admin dashboard.</s-paragraph>
  <s-grid gap="small">
    {@render renderSettings(settingsItems, 'admin', 0)}
  </s-grid>
</s-section>
