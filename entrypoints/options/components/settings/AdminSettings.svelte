<script lang="ts">
  import { getSettingsStore } from '../../stores/settings.svelte';

  const store = getSettingsStore();

  const settingsItems = [
    { key: 'warnBeforeClosingCodeEditor', label: 'Warn before closing code editor', details: 'Show a confirmation dialog before closing the theme code editor page' },
    { key: 'themeListUtils', label: 'Theme list utilities', details: 'Adds copy buttons for Theme ID and Preview URL to each theme on the themes list page' },
    { key: 'timeline', label: 'Timeline', details: 'Shows a Shopify-style timeline at the bottom of product, collection, page, blog post, and blog admin screens' }
  ];

  function handleChange(key: string, e: Event) {
    store.updateSettings({ admin: { [key]: (e.currentTarget as HTMLInputElement).checked } });
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
    <!-- Own label so the description sits above the choices; the list's details render below them. -->
    <s-stack gap="small-300">
      <s-text>Sidekick</s-text>
      <s-paragraph color="subdued">
        Controls where Sidekick appears in the admin, or hides it altogether. Hover the floating bar to switch in one click.
      </s-paragraph>
      <s-choice-list
        label="Sidekick"
        labelAccessibilityVisibility="exclusive"
        name="admin-sidekick"
        values={[store.settings.admin?.sidekick ?? 'default']}
        onchange={(e: Event) => store.updateSettings({
          admin: { sidekick: ((e.currentTarget as HTMLElement & { values: string[] }).values[0] ?? 'default') as SidekickMode }
        })}
      >
        <s-choice value="default">Default</s-choice>
        <s-choice value="sidebar">
          Sidebar
          <s-text slot="details">Moves Sidekick to the left sidebar. It opens as a docked panel.</s-text>
        </s-choice>
        <s-choice value="hidden">
          Hidden
          <s-text slot="details">Hides the floating bar completely. To bring it back, switch this setting to Default.</s-text>
        </s-choice>
      </s-choice-list>
    </s-stack>
  </s-grid>
</s-section>
