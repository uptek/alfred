<script module lang="ts">
  export type FacetOption = { value: string; label: string; count: number };

  /** One single-select filter dimension; facets combine with AND in the caller. */
  export type Facet = {
    key: string;
    name: string;
    options: FacetOption[];
    selected: string;
    onSelect: (value: string) => void;
  };
</script>

<script lang="ts">
  import type { Snippet } from 'svelte';
  import ToolbarButton from './ToolbarButton.svelte';
  import ExportMenu from './ExportMenu.svelte';
  import type { ExportItem } from './ExportMenu.svelte';
  import SearchField from './SearchField.svelte';

  let {
    facets = [],
    anyFilterActive = false,
    onReset,
    exportItems = [],
    exportLabel,
    searchLabel,
    searchPlaceholder,
    search = $bindable(''),
    searchOpen = $bindable(false),
    actions
  }: {
    facets?: Facet[];
    anyFilterActive?: boolean;
    onReset?: () => void;
    exportItems?: ExportItem[];
    exportLabel: string;
    searchLabel: string;
    searchPlaceholder: string;
    search?: string;
    searchOpen?: boolean;
    actions?: Snippet;
  } = $props();

  // One slot for every dropdown (facets and export share it), so opening one
  // closes the rest. 'export' is reserved; the rest are facet keys.
  let openMenu = $state<string | null>(null);
  let searchField = $state<ReturnType<typeof SearchField> | null>(null);

  function toggleSearch() {
    searchOpen = !searchOpen;
    if (!searchOpen) search = '';
    else setTimeout(() => searchField?.focus(), 0);
  }

  function handleWindowClick(e: MouseEvent) {
    const target = e.target as HTMLElement;
    if (!target.closest('.menu')) openMenu = null;
  }

  function selectedOption(facet: Facet): FacetOption | undefined {
    return facet.options.find(o => o.value === facet.selected);
  }

  function selectFacet(facet: Facet, value: string) {
    openMenu = null;
    facet.onSelect(value);
  }
</script>

<svelte:window onclick={handleWindowClick} onkeydown={(e) => { if (e.key === 'Escape') openMenu = null; }} />

<div class="toolbar">
  <div class="toolbar__row">
    <div class="toolbar__filters">
      {#each facets as facet (facet.key)}
        <div class="dropdown menu">
          <button
            class="dropdown__trigger"
            class:dropdown__trigger--active={facet.selected !== 'all'}
            aria-haspopup="menu"
            aria-expanded={openMenu === facet.key}
            onclick={() => { openMenu = openMenu === facet.key ? null : facet.key; }}
          >
            {facet.selected === 'all' ? facet.name : (selectedOption(facet)?.label ?? facet.name)}
            {#if facet.selected !== 'all'}<span class="dropdown__count">{selectedOption(facet)?.count ?? 0}</span>{/if}
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" class="dropdown__chevron"><path d="M6 9l6 6 6-6"/></svg>
          </button>
          {#if openMenu === facet.key}
            <div class="dropdown__menu" role="menu">
              {#each facet.options as o}
                <button class="dropdown__item" class:dropdown__item--active={facet.selected === o.value} role="menuitem" onclick={() => selectFacet(facet, o.value)}>
                  {o.label}
                  <span class="dropdown__item-count">{o.count}</span>
                </button>
              {/each}
            </div>
          {/if}
        </div>
      {/each}
      {#if anyFilterActive && onReset}
        <button class="reset-btn" onclick={onReset} title="Reset all filters">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"><polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"/></svg>
        </button>
      {/if}
    </div>
    <div class="toolbar__actions">
      {@render actions?.()}
      <ToolbarButton active={searchOpen} onclick={toggleSearch} title={searchLabel}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round"><circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/></svg>
      </ToolbarButton>
      {#if exportItems.length > 0}
        <ExportMenu
          items={exportItems}
          label={exportLabel}
          open={openMenu === 'export'}
          onToggle={() => { openMenu = openMenu === 'export' ? null : 'export'; }}
          onClose={() => { openMenu = null; }}
        />
      {/if}
    </div>
  </div>
  {#if searchOpen}
    <SearchField bind:this={searchField} bind:value={search} placeholder={searchPlaceholder} />
  {/if}
</div>

<style>
  .toolbar { display: flex; flex-direction: column; border-bottom: 1px solid var(--border); flex-shrink: 0; }
  .toolbar__row { display: flex; align-items: center; justify-content: space-between; gap: 10px; padding: 10px 20px; }
  .toolbar__filters { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; min-width: 0; }
  .toolbar__actions { display: flex; align-items: center; gap: 6px; flex-shrink: 0; }

  /* Facet dropdown */
  .dropdown { position: relative; }
  .dropdown__trigger { box-sizing: border-box; display: flex; align-items: center; gap: 4px; height: 28px; padding: 0 10px; border-radius: 6px; border: 1px solid var(--border-strong); background: var(--bg); font-family: inherit; font-size: 12.5px; font-weight: 600; color: var(--text-muted); cursor: pointer; transition: all 0.12s; }
  .dropdown__trigger:hover { border-color: var(--action-hover-border); color: var(--action-hover-fg); background: var(--action-hover-bg); box-shadow: var(--action-hover-shadow); }
  .dropdown__trigger--active { border-color: var(--accent); }
  .dropdown__count { color: var(--text-muted); font-weight: 500; }
  .dropdown__chevron { width: 12px; height: 12px; stroke-width: 2; color: var(--text-muted); }
  .dropdown__menu { position: absolute; top: calc(100% + 4px); left: 0; background: var(--bg); border: 1px solid var(--border-strong); border-radius: 8px; box-shadow: var(--shadow-pop); z-index: 10; min-width: 160px; padding: 4px; }
  .dropdown__item { display: flex; align-items: center; justify-content: space-between; width: 100%; padding: 6px 10px; border: none; background: none; font-family: inherit; font-size: 12.5px; font-weight: 500; color: var(--text-secondary); cursor: pointer; border-radius: 5px; transition: background 0.1s; }
  .dropdown__item:hover { background: var(--bg-hover); }
  .dropdown__item--active { color: var(--text); font-weight: 600; }
  .dropdown__item-count { font-size: 11.5px; font-weight: 500; color: var(--text-muted); }

  /* Reset filters */
  .reset-btn { box-sizing: border-box; display: inline-flex; align-items: center; justify-content: center; width: 28px; height: 28px; padding: 0; border-radius: 6px; border: 1px solid var(--border-strong); background: var(--bg); color: var(--text-muted); cursor: pointer; transition: all 0.12s; flex-shrink: 0; }
  .reset-btn:hover { border-color: var(--border-hover); color: var(--text-secondary); }
  .reset-btn svg { width: 14px; height: 14px; stroke-width: 1.8; }
</style>
