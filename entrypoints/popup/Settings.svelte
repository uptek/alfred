<script lang="ts">
  import type { StoreInfo } from './utils/types';
  import StorefrontPassword from './settings/StorefrontPassword.svelte';
  import SegmentedControl from './components/SegmentedControl.svelte';
  import { getThemeStore } from './stores/theme.svelte';
  import { THEME_OPTIONS, type ThemePreference } from './stores/theme';

  let { storeInfo }: { storeInfo: StoreInfo } = $props();

  const theme = getThemeStore();

  function choose(next: ThemePreference) {
    void theme.setPreference(next);
  }
</script>

<div class="settings-wrapper">
  <section class="appearance">
    <h3 class="appearance__title">Appearance</h3>
    <SegmentedControl
      options={THEME_OPTIONS}
      value={theme.preference}
      label="Color theme"
      onSelect={(v) => choose(v as ThemePreference)} />
  </section>

  <StorefrontPassword {storeInfo} />
</div>

<style>
  .settings-wrapper {
    display: flex;
    flex-direction: column;
  }

  .appearance {
    padding: 0 0 14px;
  }

  .appearance__title {
    margin: 0 0 10px;
    font-size: 11px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: var(--text-muted);
  }

</style>
