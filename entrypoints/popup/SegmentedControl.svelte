<script lang="ts">
  type Option = { value: string; label: string };

  let {
    options,
    value,
    onSelect,
    label,
    tablist = false
  }: {
    options: Option[];
    value: string;
    onSelect: (value: string) => void;
    label: string;
    /** Render tablist/tab semantics (switching views) instead of a pressed-button group (picking a setting). */
    tablist?: boolean;
  } = $props();
</script>

<div class="segmented" role={tablist ? 'tablist' : 'group'} aria-label={label}>
  {#each options as option (option.value)}
    <button
      type="button"
      class="segmented__option"
      class:segmented__option--active={value === option.value}
      role={tablist ? 'tab' : undefined}
      aria-selected={tablist ? value === option.value : undefined}
      aria-pressed={tablist ? undefined : value === option.value}
      onclick={() => onSelect(option.value)}>
      {option.label}
    </button>
  {/each}
</div>

<style>
  .segmented {
    display: inline-flex;
    gap: 2px;
    padding: 2px;
    background: var(--bg-inset);
    border: 1px solid var(--border);
    border-radius: 8px;
  }

  .segmented__option {
    padding: 5px 14px;
    font-size: 12.5px;
    font-weight: 600;
    font-family: inherit;
    color: var(--text-secondary);
    background: transparent;
    border: 1px solid transparent;
    border-radius: 6px;
    cursor: pointer;
    transition: background 0.12s, color 0.12s, border-color 0.12s, box-shadow 0.12s;
  }

  .segmented__option:hover {
    color: var(--text);
  }

  .segmented__option:focus-visible {
    outline: 2px solid var(--accent);
    outline-offset: 2px;
  }

  .segmented__option--active {
    color: var(--text);
    background: var(--bg);
    box-shadow: var(--shadow-tab);
  }

  /* In light mode the white pill + shadow carries the shape; the border is only
     needed in dark, where the lift surface barely contrasts with the well.
     Mirrors index.html's two dark selectors (media default + explicit toggle). */
  :global([data-theme='dark']) .segmented__option--active {
    border-color: var(--border);
  }
  @media (prefers-color-scheme: dark) {
    :global(:root:not([data-theme='light'])) .segmented__option--active {
      border-color: var(--border);
    }
  }
</style>
