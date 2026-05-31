<script lang="ts">
  import type { RawAsset } from './types';
  import { trackAction } from '@/utils/analytics';
  import { untrack, onDestroy } from 'svelte';

  let { assets, domain }: { assets: RawAsset[]; domain: string | null } = $props();

  const siteSlug = $derived(domain?.replace(/^www\./, '').replace(/[^a-z0-9]+/gi, '-').replace(/-+$/, '') ?? 'site');

  let tracked = false;
  $effect(() => {
    if (tracked || assets.length === 0) return;
    tracked = true;
    untrack(() => {
      trackAction('assets_view', {
        total: assets.length,
        script_count: assets.filter(a => a.kind === 'script').length,
        style_count: assets.filter(a => a.kind === 'style').length,
        external_count: assets.filter(a => a.isExternal).length
      });
    });
  });

  type SortKey = 'index' | 'src' | 'size' | 'time' | 'type' | 'load';
  let sortKey = $state<SortKey>('index');
  let sortDir = $state<'asc' | 'desc'>('asc');

  let search = $state('');
  let searchOpen = $state(false);
  let openMenu = $state<'type' | 'source' | 'load' | 'export' | null>(null);
  let typeFilter = $state('all');
  let sourceFilter = $state('all');
  let loadFilter = $state('all');
  let copied = $state(false);
  let copyResetTimer: ReturnType<typeof setTimeout> | null = null;
  let searchInput = $state<HTMLInputElement | null>(null);
  let expanded = $state<Set<number>>(new Set());

  function toggleSearch() {
    searchOpen = !searchOpen;
    if (!searchOpen) search = '';
    else setTimeout(() => searchInput?.focus(), 0);
  }

  function closeDropdowns() {
    openMenu = null;
  }

  function handleWindowClick(e: MouseEvent) {
    const target = e.target as HTMLElement;
    if (!target.closest('.menu')) openMenu = null;
  }

  const stats = $derived.by(() => {
    let scripts = 0, styles = 0, external = 0, inline = 0, browserExtension = 0;
    const hrefCounts: Record<string, number> = {};
    const loadCounts: Record<string, number> = { async: 0, defer: 0, blocking: 0, inline: 0 };
    for (const a of assets) {
      if (a.kind === 'script') scripts++; else styles++;
      if (a.isExternal) external++;
      if (a.isInline) inline++;
      if (a.isBrowserExtension) browserExtension++;
      loadCounts[a.load] = (loadCounts[a.load] ?? 0) + 1;
      if (a.src) hrefCounts[a.src] = (hrefCounts[a.src] ?? 0) + 1;
    }
    return { total: assets.length, scripts, styles, external, inline, browserExtension, loadCounts, hrefCounts };
  });

  function matchesSource(a: RawAsset): boolean {
    switch (sourceFilter) {
      case 'external': return a.isExternal;
      case 'inline': return a.isInline;
      case 'browser-extension': return a.isBrowserExtension;
      default: return true;
    }
  }

  // Each facet is one single-select dimension; they combine with AND.
  function matchesFilter(a: RawAsset): boolean {
    if (typeFilter !== 'all' && a.kind !== typeFilter) return false;
    if (sourceFilter !== 'all' && !matchesSource(a)) return false;
    if (loadFilter !== 'all' && a.load !== loadFilter) return false;
    return true;
  }

  const filtered = $derived.by(() => {
    const q = search.toLowerCase();
    return assets.filter(a => {
      if (!matchesFilter(a)) return false;
      if (q) {
        const hay = `${a.src ?? ''} ${a.type}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  });

  const sorted = $derived.by(() => {
    const dir = sortDir === 'asc' ? 1 : -1;
    return [...filtered].sort((a, b) => {
      let cmp = 0;
      switch (sortKey) {
        case 'src': cmp = (a.src ?? 'inline').localeCompare(b.src ?? 'inline'); break;
        case 'size': cmp = a.size - b.size; break;
        case 'time': cmp = a.duration - b.duration; break;
        case 'type': cmp = a.kind.localeCompare(b.kind); break;
        case 'load': cmp = a.load.localeCompare(b.load); break;
        default: cmp = a.index - b.index;
      }
      if (cmp !== 0) return cmp * dir;
      return a.index - b.index; // stable tiebreak in DOM order
    });
  });

  function toggleSort(key: SortKey) {
    if (sortKey === key) {
      sortDir = sortDir === 'asc' ? 'desc' : 'asc';
    } else {
      sortKey = key;
      // numbers default to largest/slowest first; text defaults A→Z
      sortDir = key === 'size' || key === 'time' ? 'desc' : 'asc';
    }
    trackAction('assets_sort', { key, dir: sortDir });
  }

  function displaySource(a: RawAsset): string {
    if (!a.src) return 'inline';
    try {
      const url = new URL(a.src);
      const host = url.hostname.replace(/^www\./, '');
      const rest = url.pathname + url.search;
      if (rest === '/' || rest === '') return host;
      return host + rest;
    } catch {
      return a.src;
    }
  }

  function formatSize(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    return `${(bytes / 1024).toFixed(1)} KB`;
  }

  onDestroy(() => {
    if (copyResetTimer) clearTimeout(copyResetTimer);
  });

  function handleRowClick(e: MouseEvent, a: RawAsset) {
    if ((e.target as HTMLElement).closest('a')) return;
    if (a.isInline && a.content) {
      const next = new Set(expanded);
      if (next.has(a.index)) next.delete(a.index);
      else { next.add(a.index); trackAction('assets_expand_inline', { kind: a.kind }); }
      expanded = next;
    } else if (a.src) {
      window.open(a.src, '_blank', 'noopener,noreferrer');
      trackAction('assets_view_source', { kind: a.kind, external: true });
    }
  }

  function downloadFile(content: string, filename: string, mime: string) {
    const blob = new Blob([content], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }

  function exportCsv() {
    const header = 'Kind,Source,Type,Load,Placement,Size (bytes),Time (ms),Status,Cached,Render-Blocking,Duplicate,Browser Extension';
    const rows = assets.map(a => {
      const dup = a.src ? (stats.hrefCounts[a.src] ?? 1) : 1;
      return [a.kind, a.src ?? 'inline', a.type, a.load, a.placement, a.size || '', a.duration || '', a.status || '', a.cached, a.renderBlocking, dup, a.isBrowserExtension]
        .map(v => `"${String(v).replace(/"/g, '""')}"`)
        .join(',');
    });
    downloadFile([header, ...rows].join('\n'), `alfred-assets-${siteSlug}.csv`, 'text/csv');
    trackAction('assets_export', { format: 'csv', count: assets.length });
    openMenu = null;
  }

  function exportJson() {
    const data = assets.map(a => ({
      kind: a.kind,
      source: a.src ?? 'inline',
      type: a.type,
      load: a.load,
      placement: a.placement,
      size: a.size || null,
      duration: a.duration || null,
      status: a.status || null,
      cached: a.cached,
      renderBlocking: a.renderBlocking,
      duplicate: a.src ? (stats.hrefCounts[a.src] ?? 1) : 1,
      browserExtension: a.isBrowserExtension
    }));
    downloadFile(JSON.stringify(data, null, 2), `alfred-assets-${siteSlug}.json`, 'application/json');
    trackAction('assets_export', { format: 'json', count: assets.length });
    openMenu = null;
  }

  function exportText() {
    const text = assets.filter(a => a.src).map(a => a.src).join('\n');
    downloadFile(text, `alfred-assets-${siteSlug}.txt`, 'text/plain');
    trackAction('assets_export', { format: 'text', count: assets.length });
    openMenu = null;
  }

  async function copyUrls() {
    const text = assets.filter(a => a.src).map(a => a.src).join('\n');
    try {
      await navigator.clipboard.writeText(text);
      copied = true;
      if (copyResetTimer) clearTimeout(copyResetTimer);
      copyResetTimer = setTimeout(() => { copied = false; }, 1500);
      trackAction('assets_copy', { format: 'urls', count: assets.filter(a => a.src).length });
    } catch {
      // ignore clipboard errors
    }
  }

  const typeOptions = $derived([
    { value: 'all', label: 'All', count: stats.total },
    { value: 'script', label: 'Scripts', count: stats.scripts },
    { value: 'style', label: 'Styles', count: stats.styles },
  ]);
  const sourceOptions = $derived([
    { value: 'all', label: 'All', count: stats.total },
    { value: 'external', label: 'External', count: stats.external },
    { value: 'inline', label: 'Inline', count: stats.inline },
    { value: 'browser-extension', label: 'Browser Extension', count: stats.browserExtension },
  ]);
  const loadOptions = $derived([
    { value: 'all', label: 'All', count: stats.total },
    { value: 'async', label: 'Async', count: stats.loadCounts.async ?? 0 },
    { value: 'defer', label: 'Defer', count: stats.loadCounts.defer ?? 0 },
    { value: 'blocking', label: 'Blocking', count: stats.loadCounts.blocking ?? 0 },
    { value: 'inline', label: 'Inline', count: stats.loadCounts.inline ?? 0 },
  ]);

  const anyFilterActive = $derived(
    typeFilter !== 'all' || sourceFilter !== 'all' || loadFilter !== 'all' || search.length > 0
  );

  function setType(v: string) { typeFilter = v; openMenu = null; trackAction('assets_filter', { facet: 'type', value: v }); }
  function setSource(v: string) { sourceFilter = v; openMenu = null; trackAction('assets_filter', { facet: 'source', value: v }); }
  function setLoad(v: string) { loadFilter = v; openMenu = null; trackAction('assets_filter', { facet: 'load', value: v }); }

  function resetFilters() {
    typeFilter = 'all';
    sourceFilter = 'all';
    loadFilter = 'all';
    search = '';
    searchOpen = false;
    openMenu = null;
    trackAction('assets_filter', { reset: true });
  }
</script>

<svelte:window onclick={handleWindowClick} onkeydown={(e) => { if (e.key === 'Escape') closeDropdowns(); }} />

{#if assets.length === 0}
  <div class="empty-state">
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" class="empty-state__icon"><polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/></svg>
    <p>No scripts or styles found on this page</p>
  </div>
{:else}
  <div class="assets-tab">
    {#snippet facet(name: string, key: 'type' | 'source' | 'load', options: { value: string; label: string; count: number }[], selected: string, onSelect: (v: string) => void)}
      <div class="dropdown menu">
        <button class="dropdown__trigger" class:dropdown__trigger--active={selected !== 'all'} onclick={() => { openMenu = openMenu === key ? null : key; }}>
          {selected === 'all' ? name : (options.find(o => o.value === selected)?.label ?? name)}
          {#if selected !== 'all'}<span class="dropdown__count">{options.find(o => o.value === selected)?.count ?? 0}</span>{/if}
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" class="dropdown__chevron"><path d="M6 9l6 6 6-6"/></svg>
        </button>
        {#if openMenu === key}
          <div class="dropdown__menu">
            {#each options as o}
              <button class="dropdown__item" class:dropdown__item--active={selected === o.value} onclick={() => onSelect(o.value)}>
                {o.label}
                <span class="dropdown__item-count">{o.count}</span>
              </button>
            {/each}
          </div>
        {/if}
      </div>
    {/snippet}

    <!-- Toolbar -->
    <div class="toolbar">
      <div class="toolbar__row">
        <div class="toolbar__filters">
          {@render facet('Type', 'type', typeOptions, typeFilter, setType)}
          {@render facet('Source', 'source', sourceOptions, sourceFilter, setSource)}
          {@render facet('Loading', 'load', loadOptions, loadFilter, setLoad)}

          {#if anyFilterActive}
            <button class="reset-btn" onclick={resetFilters} title="Reset all filters">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"><polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"/></svg>
            </button>
          {/if}
        </div>
        <div class="toolbar__actions">
          <button class="toolbar-btn" class:toolbar-btn--active={searchOpen} onclick={toggleSearch} title="Search assets">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round"><circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/></svg>
          </button>
          <div class="export menu">
            <button class="export__trigger" onclick={() => { openMenu = openMenu === 'export' ? null : 'export'; }} title="Download assets">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" class="export__icon"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
              Export
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" class="export__chevron"><path d="M6 9l6 6 6-6"/></svg>
            </button>
            {#if openMenu === 'export'}
              <div class="export__menu">
                <button class="export__item" onclick={exportCsv}>
                  <span class="export__item-label">CSV</span>
                  <span class="export__item-desc">All fields</span>
                </button>
                <button class="export__item" onclick={exportJson}>
                  <span class="export__item-label">JSON</span>
                  <span class="export__item-desc">All fields</span>
                </button>
                <button class="export__item" onclick={exportText}>
                  <span class="export__item-label">Text</span>
                  <span class="export__item-desc">URLs only</span>
                </button>
                <div class="export__divider"></div>
                <button class="export__item" onclick={copyUrls}>
                  <span class="export__item-label">{copied ? 'Copied!' : 'Copy'}</span>
                  <span class="export__item-desc">URLs only</span>
                </button>
              </div>
            {/if}
          </div>
        </div>
      </div>
      {#if searchOpen}
        <div class="search">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" class="search__icon"><circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/></svg>
          <input class="search__input" type="text" placeholder="Filter by URL or type..." bind:value={search} bind:this={searchInput} />
          {#if search}
            <button class="search__clear" onclick={() => { search = ''; searchInput?.focus(); }}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round"><path d="M18 6L6 18M6 6l12 12"/></svg>
            </button>
          {/if}
        </div>
      {/if}
    </div>

    {#snippet sortIcon(key: SortKey)}
      {#if sortKey === key}
        <svg class="sort-arrow sort-arrow--active" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round">
          {#if sortDir === 'asc'}<path d="M18 15l-6-6-6 6"/>{:else}<path d="M6 9l6 6 6-6"/>{/if}
        </svg>
      {:else}
        <svg class="sort-arrow sort-arrow--idle" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"><path d="M8 10l4-4 4 4"/><path d="M8 14l4 4 4-4"/></svg>
      {/if}
    {/snippet}

    <!-- Table -->
    <div class="table-wrap">
      <table class="table">
        <thead>
          <tr>
            <th class="th th--num"><button class="th-btn" class:th-btn--active={sortKey === 'index'} onclick={() => toggleSort('index')} title="Sort by document order">#{@render sortIcon('index')}</button></th>
            <th class="th th--src"><button class="th-btn" class:th-btn--active={sortKey === 'src'} onclick={() => toggleSort('src')} title="Sort by source">Source{@render sortIcon('src')}</button> <span class="th__count">({filtered.length}/{stats.total})</span></th>
            <th class="th th--size"><button class="th-btn" class:th-btn--active={sortKey === 'size'} onclick={() => toggleSort('size')} title="Sort by size">Size{@render sortIcon('size')}</button></th>
            <th class="th th--time"><button class="th-btn" class:th-btn--active={sortKey === 'time'} onclick={() => toggleSort('time')} title="Sort by load time">Time{@render sortIcon('time')}</button></th>
            <th class="th th--kind"><button class="th-btn" class:th-btn--active={sortKey === 'type'} onclick={() => toggleSort('type')} title="Sort by type">Type{@render sortIcon('type')}</button></th>
            <th class="th th--load"><button class="th-btn" class:th-btn--active={sortKey === 'load'} onclick={() => toggleSort('load')} title="Sort by load strategy">Load{@render sortIcon('load')}</button></th>
          </tr>
        </thead>
        <tbody>
          {#each sorted as asset, i (asset.index)}
            <tr class="row" class:row--clickable={(asset.isInline && asset.content) || asset.src} onclick={(e) => handleRowClick(e, asset)} title={asset.isInline ? (asset.content ? 'Click to view source' : '') : 'Click to open source'}>
              <td class="td td--num">{i + 1}</td>
              <td class="td td--src">
                <div class="src-row">
                  {#if asset.src}
                    <a href={asset.src} target="_blank" rel="noopener noreferrer" class="src" title={asset.src}>{displaySource(asset)}</a>
                  {:else}
                    <span class="src src--inline">inline</span>
                  {/if}
                  {#if asset.isInline && asset.content}
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" class="expand-chevron" class:expand-chevron--open={expanded.has(asset.index)}><path d="M6 9l6 6 6-6"/></svg>
                  {/if}
                </div>
              </td>
              <td class="td td--size">
                {#if asset.size > 0}
                  <span title={asset.isInline ? 'Inline size' : 'Transfer size'}>{formatSize(asset.size)}</span>
                {:else}
                  <span class="muted">&mdash;</span>
                {/if}
              </td>
              <td class="td td--time">
                {#if asset.cached}
                  <span class="time-cached" title="Served from cache — no network time">cached</span>
                {:else if asset.duration > 0}
                  {asset.duration} ms
                {:else}
                  <span class="muted">&mdash;</span>
                {/if}
              </td>
              <td class="td td--kind">{asset.kind === 'script' ? 'Script' : 'Style'}</td>
              <td class="td td--load">{asset.load}</td>
            </tr>
            {#if asset.isInline && asset.content && expanded.has(asset.index)}
              <tr class="code-row">
                <td></td>
                <td colspan="5"><pre class="code">{asset.content}</pre></td>
              </tr>
            {/if}
          {/each}
        </tbody>
      </table>
      {#if filtered.length === 0}
        <div class="no-results">No assets match this filter</div>
      {/if}
    </div>
  </div>
{/if}

<style>
  .assets-tab { display: flex; flex-direction: column; height: 100%; animation: fadeUp 0.4s ease both; }

  /* Empty state */
  .empty-state { display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100%; gap: 8px; color: var(--text-muted); }
  .empty-state__icon { width: 28px; height: 28px; opacity: 0.3; stroke-width: 1.7; }
  .empty-state p { font-size: 13px; margin: 0; }

  /* Toolbar */
  .toolbar { display: flex; flex-direction: column; border-bottom: 1px solid var(--border); flex-shrink: 0; }
  .toolbar__row { display: flex; align-items: center; justify-content: space-between; gap: 10px; padding: 10px 20px; }
  .toolbar__filters { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; min-width: 0; }

  /* Dropdown */
  .dropdown { position: relative; }
  .dropdown__trigger { display: flex; align-items: center; gap: 4px; height: 28px; padding: 0 10px; border-radius: 6px; border: 1px solid var(--border-strong); background: var(--bg); font-family: inherit; font-size: 12.5px; font-weight: 600; color: var(--text-muted); cursor: pointer; transition: all 0.12s; }
  .dropdown__trigger:hover { border-color: var(--border-hover); color: var(--text-secondary); }
  .dropdown__count { color: var(--text-muted); font-weight: 500; }
  .dropdown__chevron { width: 12px; height: 12px; stroke-width: 2; color: var(--text-muted); }
  .dropdown__menu { position: absolute; top: calc(100% + 4px); left: 0; background: var(--bg); border: 1px solid var(--border-strong); border-radius: 8px; box-shadow: 0 4px 16px rgba(0, 0, 0, 0.08); z-index: 10; min-width: 160px; padding: 4px; }
  .dropdown__item { display: flex; align-items: center; justify-content: space-between; width: 100%; padding: 6px 10px; border: none; background: none; font-family: inherit; font-size: 12.5px; font-weight: 500; color: var(--text-secondary); cursor: pointer; border-radius: 5px; transition: background 0.1s; }
  .dropdown__item:hover { background: var(--bg-hover); }
  .dropdown__item--active { color: var(--text); font-weight: 600; }
  .dropdown__item-count { font-size: 11.5px; font-weight: 500; color: var(--text-muted); }
  .dropdown__trigger--active { border-color: var(--accent); }

  /* Toolbar actions */
  .toolbar__actions { display: flex; align-items: center; gap: 6px; }

  /* Export dropdown */
  .export { position: relative; }
  .export__trigger { display: flex; align-items: center; gap: 4px; padding: 0 8px; height: 28px; border-radius: 6px; border: 1px solid var(--border-strong); background: var(--bg); font-family: inherit; font-size: 11px; font-weight: 600; color: var(--text-muted); cursor: pointer; transition: all 0.12s; }
  .export__trigger:hover { border-color: var(--border-hover); color: var(--text-secondary); }
  .export__icon { width: 13px; height: 13px; flex-shrink: 0; stroke-width: 1.8; }
  .export__chevron { width: 10px; height: 10px; stroke-width: 2; opacity: 0.6; }
  .export__menu { position: absolute; top: calc(100% + 4px); right: 0; background: var(--bg); border: 1px solid var(--border-strong); border-radius: 8px; box-shadow: 0 4px 16px rgba(0, 0, 0, 0.08); z-index: 10; min-width: 150px; padding: 4px; }
  .export__item { display: flex; align-items: center; justify-content: space-between; width: 100%; padding: 6px 10px; border: none; background: none; font-family: inherit; font-size: 12px; cursor: pointer; border-radius: 5px; transition: background 0.1s; }
  .export__item:hover { background: var(--bg-hover); }
  .export__item-label { font-weight: 600; color: var(--text); }
  .export__item-desc { font-size: 11px; color: var(--text-muted); }
  .export__divider { height: 1px; margin: 4px 6px; background: var(--border); }

  /* Toolbar buttons */
  .toolbar-btn { display: flex; align-items: center; gap: 4px; padding: 0 8px; height: 28px; border-radius: 6px; border: 1px solid var(--border-strong); background: var(--bg); font-family: inherit; font-size: 11px; font-weight: 600; color: var(--text-muted); cursor: pointer; transition: all 0.12s; }
  .toolbar-btn:hover { border-color: var(--border-hover); color: var(--text-secondary); }
  .toolbar-btn--active { background: var(--btn-bg); color: var(--btn-text); border-color: var(--btn-bg); }
  .toolbar-btn--active:hover { background: var(--btn-bg-hover); border-color: var(--btn-bg-hover); color: var(--btn-text); }
  .toolbar-btn svg { width: 13px; height: 13px; stroke-width: 1.8; flex-shrink: 0; }

  /* Reset filters */
  .dropdown__trigger, .toolbar-btn, .export__trigger, .reset-btn { box-sizing: border-box; }
  .reset-btn { display: inline-flex; align-items: center; justify-content: center; width: 28px; height: 28px; padding: 0; border-radius: 6px; border: 1px solid var(--border-strong); background: var(--bg); color: var(--text-muted); cursor: pointer; transition: all 0.12s; flex-shrink: 0; }
  .reset-btn:hover { border-color: var(--border-hover); color: var(--text-secondary); }
  .reset-btn svg { width: 14px; height: 14px; stroke-width: 1.8; }

  /* Search */
  .search { display: flex; align-items: center; gap: 6px; margin: 0 20px 10px; padding: 5px 10px; border: 1px solid var(--border-strong); border-radius: 6px; transition: border-color 0.12s; }
  .search:focus-within { border-color: var(--border-hover); }
  .search__icon { width: 14px; height: 14px; flex-shrink: 0; stroke-width: 1.8; color: var(--text-muted); }
  .search__input { flex: 1; border: none; outline: none; background: none; font-family: inherit; font-size: 12px; color: var(--text); }
  .search__input::placeholder { color: var(--text-placeholder); }
  .search__clear { display: flex; align-items: center; justify-content: center; width: 16px; height: 16px; padding: 0; border: none; background: none; cursor: pointer; color: var(--text-muted); border-radius: 3px; transition: all 0.12s; }
  .search__clear:hover { color: var(--text-secondary); background: var(--bg-hover); }
  .search__clear svg { width: 12px; height: 12px; stroke-width: 2; }

  /* Table */
  .table-wrap { flex: 1; overflow-y: auto; overflow-x: hidden; padding: 0 20px; }
  .table-wrap::-webkit-scrollbar { width: 3px; }
  .table-wrap::-webkit-scrollbar-thumb { background: var(--scrollbar); border-radius: 3px; }

  .table { width: 100%; border-collapse: collapse; font-size: 13px; table-layout: fixed; }

  .th { text-align: left; font-size: 10.5px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.04em; color: var(--text-label); padding: 8px 8px 8px 0; border-bottom: 1px solid var(--border); position: sticky; top: 0; background: var(--bg); z-index: 1; }
  .th--num { width: 30px; padding-right: 0; }
  .th--size { width: 64px; }
  .th--time { width: 58px; }
  .th--kind { width: 60px; }
  .th--load { width: 64px; }
  .th__count { font-weight: 500; color: var(--text-muted); letter-spacing: 0; text-transform: none; }

  .th-btn { display: inline-flex; align-items: center; gap: 2px; padding: 0; border: none; background: none; font: inherit; color: inherit; text-transform: inherit; letter-spacing: inherit; cursor: pointer; transition: color 0.12s; }
  .th-btn:hover { color: var(--text-secondary); }
  .th-btn--active { color: var(--text-secondary); }
  .sort-arrow { width: 11px; height: 11px; stroke-width: 2.5; flex-shrink: 0; }
  .sort-arrow--idle { opacity: 0.4; transition: opacity 0.12s; }
  .th-btn:hover .sort-arrow--idle { opacity: 0.75; }

  .row { transition: background 0.1s; }
  .row--clickable { cursor: pointer; }
  .row--clickable:hover { background: var(--bg-hover); }

  .td { padding: 9px 8px 9px 0; color: var(--text-secondary); border-bottom: 1px solid var(--border-muted); vertical-align: middle; }
  .td--num { color: var(--text-muted); font-size: 12px; padding-right: 0; }
  .td--src { overflow: hidden; }

  .src-row { display: flex; align-items: center; gap: 6px; min-width: 0; }
  .src { color: var(--accent); text-decoration: none; font-family: 'SF Mono', ui-monospace, monospace; font-size: 12px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; min-width: 0; }
  .src:hover { text-decoration: underline; }
  .src--inline { color: var(--text-muted); font-style: italic; }
  .expand-chevron { width: 12px; height: 12px; flex-shrink: 0; stroke-width: 2; color: var(--text-muted); transition: transform 0.15s; }
  .expand-chevron--open { transform: rotate(180deg); }

  .td--size, .td--time { font-size: 12px; color: var(--text-muted); font-variant-numeric: tabular-nums; }
  .time-cached { font-size: 11px; font-weight: 600; color: var(--success-strong); }
  .muted { color: var(--text-muted); }

  /* Inline code expand */
  .code-row td { padding: 0 8px 9px 0; border-bottom: 1px solid var(--border-muted); }
  .code { margin: 0; padding: 10px 12px; background: var(--bg-raised); border: 1px solid var(--border); border-radius: 6px; font-family: 'SF Mono', ui-monospace, monospace; font-size: 11px; line-height: 1.5; color: var(--text-secondary); white-space: pre-wrap; word-break: break-word; max-height: 240px; overflow: auto; }
  .code::-webkit-scrollbar { width: 4px; height: 4px; }
  .code::-webkit-scrollbar-thumb { background: var(--scrollbar); border-radius: 3px; }

  .no-results { text-align: center; padding: 24px; font-size: 13px; color: var(--text-muted); }

  @keyframes fadeUp {
    from { opacity: 0; transform: translateY(8px); }
    to { opacity: 1; transform: translateY(0); }
  }
</style>
