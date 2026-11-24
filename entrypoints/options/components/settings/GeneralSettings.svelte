<script lang="ts">
  import { hasDataConsent, requestDataConsent } from '@/utils/analytics';
  import { getSettingsStore } from '../../stores/settings.svelte';

  const store = getSettingsStore();

  // Firefox holds the analytics consent itself, so the checkbox mirrors it and asks for it
  let consent = $state(true);
  void hasDataConsent().then((granted) => (consent = granted));

  function toggle(key: string, checked: boolean) {
    if (key === 'analytics' && checked && !consent) {
      void requestDataConsent().then((granted) => (consent = granted));
    }
    void store.updateSettings({ general: { ...store.settings.general, [key]: checked } });
  }

  const settingsItems = [
    { key: 'analytics', label: 'Share anonymous usage analytics', details: 'When enabled, anonymous feature usage data (e.g. which actions are used) is sent to help improve Alfred. No identifiable data is ever collected.' },
    { key: 'openChangelogOnUpdate', label: 'Open changelog after updates', details: 'Opens the changelog in a new tab whenever Alfred updates to a new version, so you can see what changed. Disable to update silently.' }
  ];
</script>

<s-section heading="General">
  <s-grid gap="small">
    {#each settingsItems as { key, label, details }}
      <s-checkbox
        name="general-{key}"
        {label}
        {details}
        checked={store.settings.general?.[key as keyof typeof store.settings.general] !== false && (key !== 'analytics' || consent)}
        onchange={(e: Event) => toggle(key, (e.currentTarget as HTMLInputElement).checked)}
      ></s-checkbox>
    {/each}
  </s-grid>
</s-section>
