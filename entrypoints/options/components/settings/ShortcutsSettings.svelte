<script lang="ts">
  import { getSettingsStore } from '../../stores/settings.svelte';

  const store = getSettingsStore();

  const shortcutCategories = [
    {
      label: 'Navigation',
      items: [
        { key: 'openInAdmin', label: 'Open in Admin', details: 'Opens the current page in Shopify Admin' },
        { key: 'openInCustomizer', label: 'Open in Customizer', details: 'Opens the current page in theme customizer' },
        { key: 'openSectionInCodeEditor', label: 'Open Section in Code Editor', details: 'Opens the clicked section in theme code editor' },
        { key: 'openImageInAdmin', label: 'Open Image in Admin > Files', details: 'Opens (searches) the right-clicked image in Shopify Admin > Files' }
      ]
    },
    {
      label: 'Theme',
      items: [
        { key: 'copyThemePreviewUrl', label: 'Copy Theme Preview URL', details: 'Copies preview URL with context of current page' },
        { key: 'exitThemePreview', label: 'Exit Theme Preview', details: 'Exits the current theme preview and loads the live theme' }
      ]
    },
    {
      label: 'Data',
      items: [
        { key: 'copyProductJson', label: 'Copy Product JSON', details: 'Copies current product data as JSON to clipboard' },
        { key: 'copyCartJson', label: 'Copy Cart JSON', details: 'Copies cart data as JSON to clipboard' }
      ]
    },
    {
      label: 'Cart',
      items: [
        { key: 'clearCart', label: 'Clear Cart', details: 'Removes all items from the cart' },
        { key: 'cartograph', label: 'Cartograph', details: 'Opens a full-featured cart editor overlay' }
      ]
    }
  ];

  function handleChange(key: string, e: Event) {
    store.updateSettings({ shortcuts: { ...store.settings.shortcuts, [key]: (e.currentTarget as HTMLInputElement).checked } });
  }
</script>

<s-section heading="Shortcuts (right-click menu)">
  <s-paragraph>
    Controls which shortcuts appear in the right-click context menu when using Alfred on Shopify stores.
  </s-paragraph>
  <s-stack gap="base">
    {#each shortcutCategories as category, categoryIndex}
      <s-stack gap="small-300">
        <s-text><b>{category.label}</b></s-text>
        <s-stack gap="small">
          {#each category.items as { key, label, details }}
            <s-checkbox
              name="shortcut-{key}"
              {label}
              {details}
              checked={store.settings.shortcuts?.[key as keyof typeof store.settings.shortcuts] !== false}
              onchange={(e: Event) => handleChange(key, e)}
            ></s-checkbox>
          {/each}
        </s-stack>
      </s-stack>
      {#if categoryIndex < shortcutCategories.length - 1}
        <s-divider></s-divider>
      {/if}
    {/each}
  </s-stack>
</s-section>
