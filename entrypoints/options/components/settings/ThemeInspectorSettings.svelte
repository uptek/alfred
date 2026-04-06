<script lang="ts">
  import { getSettingsStore } from '../../stores/settings.svelte';
  import { setChoiceListValue, onChoiceListChange } from '~/utils/polaris.polyfill';

  const store = getSettingsStore();

  $effect(() => {
    if (store.isLoading) return;
    const value = store.settings.themeCustomizer?.inspector ?? 'default';
    setChoiceListValue('theme-inspector', value);
  });

  $effect(() => {
    if (store.isLoading) return;
    const cleanup = onChoiceListChange('theme-inspector', async (newValue) => {
      await store.updateSettings({
        themeCustomizer: { ...store.settings.themeCustomizer, inspector: newValue as 'default' | 'disable' | 'restore' }
      });
    });
    return () => { if (cleanup) cleanup(); };
  });
</script>

<s-section heading="Theme inspector">
  <s-paragraph>
    Controls how Alfred manages the theme inspector in the customizer. Choose to disable it automatically, remember and restore your last state, or leave it unchanged.
  </s-paragraph>
  <s-choice-list label="Theme inspector" labelAccessibilityVisibility="exclusive" name="theme-inspector">
    <s-choice value="default">Default behavior</s-choice>
    <s-choice value="disable">Disable inspector: Always disables the theme inspector on page load</s-choice>
    <s-choice value="restore">Restore previous state: Remembers and restores your last inspector state</s-choice>
  </s-choice-list>
</s-section>
