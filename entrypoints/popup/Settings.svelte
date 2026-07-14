<script lang="ts">
  import type { StoreInfo } from './utils/types';
  import StorefrontPassword from './settings/StorefrontPassword.svelte';
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
    <div class="segmented" role="group" aria-label="Color theme">
      {#each THEME_OPTIONS as option}
        <button
          type="button"
          class="segmented__option"
          class:segmented__option--active={theme.preference === option.value}
          aria-pressed={theme.preference === option.value}
          onclick={() => choose(option.value)}>
          {option.label}
        </button>
      {/each}
    </div>
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

  .segmented {
    display: inline-flex;
    gap: 2px;
    padding: 2px;
    background: var(--bg-inset);
    border: 1px solid var(--border);
    border-radius: 8px;
  }

  .segmented__option {
    padding: 6px 16px;
    font-size: 12px;
    font-weight: 500;
    color: var(--text-secondary);
    background: transparent;
    border: none;
    border-radius: 6px;
    cursor: pointer;
    transition: background 0.12s, color 0.12s, box-shadow 0.12s;
  }

  .segmented__option:hover {
    color: var(--text);
  }

  .segmented__option--active {
    color: var(--text);
    background: var(--bg);
    box-shadow: var(--shadow-sm);
  }
</style>
