<script lang="ts">
  import { getSettingsStore } from '../../stores/settings.svelte';

  const store = getSettingsStore();
</script>

<s-section heading="Theme inspector">
  <s-paragraph>
    Controls how Alfred manages the theme inspector in the customizer. Choose to disable it automatically, remember and restore your last state, or leave it unchanged.
  </s-paragraph>
  <s-choice-list
    label="Theme inspector"
    labelAccessibilityVisibility="exclusive"
    name="theme-inspector"
    value={store.settings.themeCustomizer?.inspector ?? 'default'}
    onchange={(e: Event) => store.updateSettings({
      themeCustomizer: { ...store.settings.themeCustomizer, inspector: (e.currentTarget as HTMLElement & { value: string }).value as 'default' | 'disable' | 'restore' }
    })}
  >
    <s-choice value="default">Default behavior</s-choice>
    <s-choice value="disable">Disable inspector: Always disables the theme inspector on page load</s-choice>
    <s-choice value="restore">Restore previous state: Remembers and restores your last inspector state</s-choice>
  </s-choice-list>
</s-section>
