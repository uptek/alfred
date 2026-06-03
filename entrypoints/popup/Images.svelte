<script lang="ts">
  import type { RawImage, ImageStatus } from './types';
  import { highlightImages, scrollToImage } from './utils';
  import { trackAction } from '@/utils/analytics';
  import { untrack, onDestroy } from 'svelte';

  let { images, domain }: { images: RawImage[]; domain: string | null } = $props();

  const siteSlug = $derived(domain?.replace(/^www\./, '').replace(/[^a-z0-9]+/gi, '-').replace(/-+$/, '') ?? 'site');

  function statusOf(img: RawImage): ImageStatus {
    if (img.broken) return 'broken';
    if (img.lacksAlt && img.source !== 'background') return 'missing-alt';
    return 'ok';
  }

  let tracked = false;
  $effect(() => {
    if (tracked || images.length === 0) return;
    tracked = true;
    untrack(() => {
      trackAction('images_view', {
        image_count: images.length,
        missing_alt_count: images.filter(i => i.lacksAlt).length,
        broken_count: images.filter(i => i.broken).length
      });
    });
  });

  let altFilter = $state('all');
  let formatFilter = $state('all');
  let loadingFilter = $state('all');
  let statusFilter = $state('all');
  let search = $state('');
  let searchOpen = $state(false);
  let openMenu = $state<'alt' | 'format' | 'loading' | 'status' | 'export' | null>(null);

  type SortKey = 'index' | 'size' | 'dims' | 'status';
  let sortKey = $state<SortKey>('index');
  let sortDir = $state<'asc' | 'desc'>('asc');

  let copied = $state(false);
  let copyResetTimer: ReturnType<typeof setTimeout> | null = null;
  let highlightOn = $state(false);
  let searchInput = $state<HTMLInputElement | null>(null);

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
    let altPresent = 0, altMissing = 0, ok = 0, missingAlt = 0, broken = 0, lazy = 0, eager = 0, noLoad = 0;
    const formatCounts: Record<string, number> = {};
    for (const img of images) {
      // Background images have no alt concept; exclude them from both alt buckets.
      if (img.source !== 'background') {
        if (img.lacksAlt) altMissing++; else altPresent++;
      }
      const st = statusOf(img);
      if (st === 'broken') broken++; else if (st === 'missing-alt') missingAlt++; else ok++;
      if (img.loading === 'lazy') lazy++; else if (img.loading === 'eager') eager++; else noLoad++;
      const f = img.format || 'other';
      formatCounts[f] = (formatCounts[f] ?? 0) + 1;
    }
    return { total: images.length, altPresent, altMissing, ok, missingAlt, broken, lazy, eager, noLoad, formatCounts };
  });

  const filtered = $derived.by(() => {
    const q = search.toLowerCase();
    return images.filter(img => {
      if (altFilter === 'notempty' && (img.lacksAlt || img.source === 'background')) return false;
      if (altFilter === 'empty' && (!img.lacksAlt || img.source === 'background')) return false;
      if (formatFilter !== 'all' && (img.format || 'other') !== formatFilter) return false;
      if (loadingFilter !== 'all' && img.loading !== loadingFilter) return false;
      if (statusFilter !== 'all' && statusOf(img) !== statusFilter) return false;
      if (q && !img.src.toLowerCase().includes(q) && !(img.alt ?? '').toLowerCase().includes(q)) return false;
      return true;
    });
  });

  const statusRank: Record<ImageStatus, number> = { ok: 0, 'missing-alt': 1, broken: 2 };

  const sorted = $derived.by(() => {
    const dir = sortDir === 'asc' ? 1 : -1;
    return [...filtered].sort((a, b) => {
      let cmp = 0;
      switch (sortKey) {
        case 'size': cmp = a.size - b.size; break;
        case 'dims': cmp = (a.naturalWidth * a.naturalHeight) - (b.naturalWidth * b.naturalHeight); break;
        case 'status': cmp = statusRank[statusOf(a)] - statusRank[statusOf(b)]; break;
        default: cmp = a.index - b.index;
      }
      if (cmp !== 0) return cmp * dir;
      return a.index - b.index; // stable tiebreak in collection order
    });
  });

  function toggleSort(key: SortKey) {
    if (sortKey === key) {
      sortDir = sortDir === 'asc' ? 'desc' : 'asc';
    } else {
      sortKey = key;
      sortDir = 'asc';
    }
    trackAction('images_sort', { key, dir: sortDir });
  }

  function displayUrl(src: string): string {
    if (!src) return '(no source)';
    try {
      const u = new URL(src);
      const segments = u.pathname.split('/').filter(Boolean);
      const seg = segments[segments.length - 1] ?? u.pathname;
      return '…/' + seg + u.search;
    } catch {
      return src;
    }
  }

  function formatBytes(n: number): string {
    if (!n) return '—';
    if (n < 1024) return n + ' B';
    if (n < 1024 * 1024) return (n / 1024).toFixed(1) + ' KB';
    return (n / (1024 * 1024)).toFixed(1) + ' MB';
  }

  function dimsLabel(img: RawImage): string {
    if (!img.naturalWidth || !img.naturalHeight) return '—';
    return `${img.naturalWidth}×${img.naturalHeight}`;
  }

  function toggleHighlight() {
    highlightOn = !highlightOn;
    highlightImages(highlightOn);
    trackAction('images_highlight', { enabled: highlightOn });
  }

  onDestroy(() => {
    if (highlightOn) highlightImages(false);
    if (copyResetTimer) clearTimeout(copyResetTimer);
  });

  function handleRowClick(e: MouseEvent, index: number) {
    if ((e.target as HTMLElement).closest('a')) return;
    scrollToImage(index);
    trackAction('images_scroll_to', {});
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
    const header = 'URL,Alt,Source,Format,Width,Height,Size (bytes),Loading,Status';
    const rows = images.map(img => {
      return [img.src, img.alt ?? '', img.source, img.format, img.naturalWidth, img.naturalHeight, img.size, img.loading, statusOf(img)]
        .map(v => `"${String(v).replace(/"/g, '""')}"`)
        .join(',');
    });
    downloadFile([header, ...rows].join('\n'), `alfred-images-${siteSlug}.csv`, 'text/csv');
    trackAction('images_export', { format: 'csv', image_count: images.length });
    openMenu = null;
  }

  function exportJson() {
    const data = images.map(img => ({
      url: img.src,
      alt: img.alt,
      source: img.source,
      format: img.format,
      width: img.naturalWidth,
      height: img.naturalHeight,
      size: img.size,
      loading: img.loading,
      status: statusOf(img)
    }));
    downloadFile(JSON.stringify(data, null, 2), `alfred-images-${siteSlug}.json`, 'application/json');
    trackAction('images_export', { format: 'json', image_count: images.length });
    openMenu = null;
  }

  async function copyUrls() {
    const text = images.map(img => img.src).filter(Boolean).join('\n');
    try {
      await navigator.clipboard.writeText(text);
      copied = true;
      if (copyResetTimer) clearTimeout(copyResetTimer);
      copyResetTimer = setTimeout(() => { copied = false; }, 1500);
      trackAction('images_copy', { format: 'urls', image_count: images.length });
    } catch {
      // ignore clipboard errors
    }
  }

  const altOptions = $derived([
    { value: 'all', label: 'All', count: stats.total },
    { value: 'notempty', label: 'Not empty', count: stats.altPresent },
    { value: 'empty', label: 'Empty', count: stats.altMissing },
  ]);
  const formatOptions = $derived([
    { value: 'all', label: 'All', count: stats.total },
    ...Object.entries(stats.formatCounts)
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([f, c]) => ({ value: f, label: f.toUpperCase(), count: c })),
  ]);
  const loadingOptions = $derived([
    { value: 'all', label: 'All', count: stats.total },
    { value: 'lazy', label: 'Lazy', count: stats.lazy },
    { value: 'eager', label: 'Eager', count: stats.eager },
    { value: 'none', label: 'None', count: stats.noLoad },
  ]);
  const statusOptions = $derived([
    { value: 'all', label: 'All', count: stats.total },
    { value: 'ok', label: 'OK', count: stats.ok },
    { value: 'missing-alt', label: 'Missing alt', count: stats.missingAlt },
    { value: 'broken', label: 'Broken', count: stats.broken },
  ]);

  const anyFilterActive = $derived(altFilter !== 'all' || formatFilter !== 'all' || loadingFilter !== 'all' || statusFilter !== 'all' || search.length > 0);

  function setAlt(v: string) { altFilter = v; openMenu = null; trackAction('images_filter', { facet: 'alt', value: v }); }
  function setFormat(v: string) { formatFilter = v; openMenu = null; trackAction('images_filter', { facet: 'format', value: v }); }
  function setLoading(v: string) { loadingFilter = v; openMenu = null; trackAction('images_filter', { facet: 'loading', value: v }); }
  function setStatus(v: string) { statusFilter = v; openMenu = null; trackAction('images_filter', { facet: 'status', value: v }); }

  function resetFilters() {
    altFilter = 'all';
    formatFilter = 'all';
    loadingFilter = 'all';
    statusFilter = 'all';
    search = '';
    searchOpen = false;
    openMenu = null;
    trackAction('images_filter', { reset: true });
  }
</script>

<svelte:window onclick={handleWindowClick} onkeydown={(e) => { if (e.key === 'Escape') closeDropdowns(); }} />

{#if images.length === 0}
  <div class="empty-state">
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" class="empty-state__icon"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="M21 15l-5-5L5 21"/></svg>
    <p>No images found on this page</p>
  </div>
{:else}
  <div class="images-tab">
    {#snippet facet(name: string, key: 'alt' | 'format' | 'loading' | 'status', options: { value: string; label: string; count: number }[], selected: string, onSelect: (v: string) => void)}
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

    {#snippet sortIcon(key: SortKey)}
      {#if sortKey === key}
        <svg class="sort-arrow sort-arrow--active" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round">
          {#if sortDir === 'asc'}<path d="M18 15l-6-6-6 6"/>{:else}<path d="M6 9l6 6 6-6"/>{/if}
        </svg>
      {:else}
        <svg class="sort-arrow sort-arrow--idle" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"><path d="M8 10l4-4 4 4"/><path d="M8 14l4 4 4-4"/></svg>
      {/if}
    {/snippet}

    <!-- Toolbar -->
    <div class="toolbar">
      <div class="toolbar__row">
        <div class="toolbar__filters">
          {@render facet('Alt', 'alt', altOptions, altFilter, setAlt)}
          {@render facet('Format', 'format', formatOptions, formatFilter, setFormat)}
          {@render facet('Loading', 'loading', loadingOptions, loadingFilter, setLoading)}
          {@render facet('Status', 'status', statusOptions, statusFilter, setStatus)}
          {#if anyFilterActive}
            <button class="reset-btn" onclick={resetFilters} title="Reset all filters">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"><polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"/></svg>
            </button>
          {/if}
        </div>
        <div class="toolbar__actions">
          <button class="toolbar-btn" class:toolbar-btn--active={highlightOn} onclick={toggleHighlight} title="Highlight images on page">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
            Highlight
          </button>
          <button class="toolbar-btn" class:toolbar-btn--active={searchOpen} onclick={toggleSearch} title="Search images">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round"><circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/></svg>
          </button>
          <div class="export menu">
            <button class="export__trigger" onclick={() => { openMenu = openMenu === 'export' ? null : 'export'; }} title="Download images">
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
          <input class="search__input" type="text" placeholder="Filter by alt text or URL..." bind:value={search} bind:this={searchInput} />
          {#if search}
            <button class="search__clear" onclick={() => { search = ''; searchInput?.focus(); }}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round"><path d="M18 6L6 18M6 6l12 12"/></svg>
            </button>
          {/if}
        </div>
      {/if}
    </div>

    <!-- Table -->
    <div class="table-wrap">
      <table class="table">
        <thead>
          <tr>
            <th class="th th--img">Image <span class="th__count">({filtered.length}/{stats.total})</span></th>
            <th class="th th--size"><button class="th-btn" class:th-btn--active={sortKey === 'size'} onclick={() => toggleSort('size')} title="Sort by size">Size{@render sortIcon('size')}</button></th>
            <th class="th th--fmt">Fmt</th>
            <th class="th th--dims"><button class="th-btn" class:th-btn--active={sortKey === 'dims'} onclick={() => toggleSort('dims')} title="Sort by dimensions">Dims{@render sortIcon('dims')}</button></th>
            <th class="th th--load">Load</th>
            <th class="th th--status"><button class="th-btn" class:th-btn--active={sortKey === 'status'} onclick={() => toggleSort('status')} title="Sort by status">Status{@render sortIcon('status')}</button></th>
          </tr>
        </thead>
        <tbody>
          {#each sorted as img (img.index)}
            <tr class="row" class:row--hidden={img.isHidden} onclick={(e) => handleRowClick(e, img.index)} title="Click to scroll to this image">
              <td class="td td--img">
                <div class="img-cell">
                  {#if img.src}
                    <img class="thumb" src={img.src} alt="" loading="lazy" />
                  {:else}
                    <div class="thumb thumb--empty"></div>
                  {/if}
                  <div class="img-meta">
                    {#if img.lacksAlt && img.source !== 'background'}
                      <span class="alt-text alt-text--missing">Missing alt text</span>
                    {:else if img.alt}
                      <span class="alt-text">{img.alt}</span>
                    {:else if img.source === 'background'}
                      <span class="alt-text alt-text--muted">background image</span>
                    {:else}
                      <span class="alt-text alt-text--muted">decorative</span>
                    {/if}
                    <div class="url-row">
                      {#if img.source === 'background'}<span class="src-tag">bg</span>{/if}
                      {#if img.src}
                        <a href={img.src} target="_blank" rel="noopener noreferrer" class="url" title={img.src}>{displayUrl(img.src)}</a>
                      {:else}
                        <span class="url url--empty">(no source)</span>
                      {/if}
                    </div>
                  </div>
                </div>
              </td>
              <td class="td td--size">{formatBytes(img.size)}</td>
              <td class="td td--fmt">{img.format ? img.format.toUpperCase() : '—'}</td>
              <td class="td td--dims">{dimsLabel(img)}</td>
              <td class="td td--load">
                {#if img.source === 'background'}
                  <span class="muted">—</span>
                {:else if img.loading === 'eager'}
                  <span class="load-eager">eager</span>
                {:else if img.loading === 'lazy'}
                  lazy
                {:else}
                  <span class="muted">none</span>
                {/if}
              </td>
              <td class="td td--status">
                {#if statusOf(img) === 'broken'}
                  <span class="pill pill--red">Broken</span>
                {:else if statusOf(img) === 'missing-alt'}
                  <span class="pill pill--red">Alt</span>
                {:else}
                  <span class="pill pill--green">OK</span>
                {/if}
              </td>
            </tr>
          {/each}
        </tbody>
      </table>
      {#if filtered.length === 0}
        <div class="no-results">No images match this filter</div>
      {/if}
    </div>
  </div>
{/if}

<style>
  .images-tab { display: flex; flex-direction: column; height: 100%; animation: fadeUp 0.4s ease both; }

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
  .dropdown__trigger--active { border-color: var(--accent); }
  .dropdown__count { color: var(--text-muted); font-weight: 500; }
  .dropdown__chevron { width: 12px; height: 12px; stroke-width: 2; color: var(--text-muted); }
  .dropdown__menu { position: absolute; top: calc(100% + 4px); left: 0; background: var(--bg); border: 1px solid var(--border-strong); border-radius: 8px; box-shadow: var(--shadow-pop); z-index: 10; min-width: 160px; padding: 4px; }
  .dropdown__item { display: flex; align-items: center; justify-content: space-between; width: 100%; padding: 6px 10px; border: none; background: none; font-family: inherit; font-size: 12.5px; font-weight: 500; color: var(--text-secondary); cursor: pointer; border-radius: 5px; transition: background 0.1s; }
  .dropdown__item:hover { background: var(--bg-hover); }
  .dropdown__item--active { color: var(--text); font-weight: 600; }
  .dropdown__item-count { font-size: 11.5px; font-weight: 500; color: var(--text-muted); }

  /* Toolbar actions */
  .toolbar__actions { display: flex; align-items: center; gap: 6px; }

  /* Export dropdown */
  .export { position: relative; }
  .export__trigger { display: flex; align-items: center; gap: 4px; padding: 0 8px; height: 28px; border-radius: 6px; border: 1px solid var(--border-strong); background: var(--bg); font-family: inherit; font-size: 11px; font-weight: 600; color: var(--text-muted); cursor: pointer; transition: all 0.12s; }
  .export__trigger:hover { border-color: var(--border-hover); color: var(--text-secondary); }
  .export__icon { width: 13px; height: 13px; flex-shrink: 0; stroke-width: 1.8; }
  .export__chevron { width: 10px; height: 10px; stroke-width: 2; opacity: 0.6; }
  .export__menu { position: absolute; top: calc(100% + 4px); right: 0; background: var(--bg); border: 1px solid var(--border-strong); border-radius: 8px; box-shadow: var(--shadow-pop); z-index: 10; min-width: 150px; padding: 4px; }
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

  .th { text-align: left; font-size: 10.5px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.04em; color: var(--text-label); padding: 8px 8px 8px 0; border-bottom: 1px solid var(--border); position: sticky; top: 0; background: var(--bg-canvas); z-index: 1; }
  .th--size { width: 58px; text-align: right; }
  .th--fmt { width: 42px; text-align: center; }
  .th--dims { width: 72px; text-align: center; }
  .th--load { width: 50px; text-align: center; }
  .th--status { width: 58px; text-align: center; padding-right: 0; }
  .th__count { font-weight: 500; color: var(--text-muted); letter-spacing: 0; text-transform: none; }

  .th-btn { display: inline-flex; align-items: center; gap: 2px; padding: 0; border: none; background: none; font: inherit; color: inherit; text-transform: inherit; letter-spacing: inherit; cursor: pointer; transition: color 0.12s; }
  .th-btn:hover { color: var(--text-secondary); }
  .th-btn--active { color: var(--text-secondary); }
  .sort-arrow { width: 11px; height: 11px; stroke-width: 2.5; flex-shrink: 0; }
  .sort-arrow--idle { opacity: 0.4; transition: opacity 0.12s; }
  .th-btn:hover .sort-arrow--idle { opacity: 0.75; }

  .row { cursor: pointer; transition: background 0.1s; }
  .row:hover { background: var(--bg-hover); }
  .row--hidden { opacity: 0.5; }

  .td { padding: 9px 8px 9px 0; color: var(--text-secondary); border-bottom: 1px solid var(--border-muted); vertical-align: top; }
  .td--size { text-align: right; white-space: nowrap; }
  .td--fmt { text-align: center; }
  .td--dims { text-align: center; white-space: nowrap; }
  .td--load { text-align: center; white-space: nowrap; }
  .td--status { text-align: center; padding-right: 0; }
  .td--img { overflow: hidden; }

  .img-cell { display: flex; gap: 8px; align-items: flex-start; min-width: 0; }
  .thumb { width: 36px; height: 36px; border-radius: 4px; flex-shrink: 0; object-fit: cover; background: var(--bg-hover); }
  .thumb--empty { background: var(--bg-hover); }
  .img-meta { min-width: 0; }

  .alt-text { display: block; font-size: 12px; color: var(--text); font-weight: 500; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 210px; }
  .alt-text--missing { color: var(--error); }
  .alt-text--muted { color: var(--text-muted); font-style: italic; font-weight: 400; }

  .url-row { display: flex; align-items: center; gap: 5px; min-width: 0; margin-top: 1px; }
  .src-tag { flex-shrink: 0; font-size: 9px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.03em; padding: 0 4px; border-radius: 4px; line-height: 14px; background: var(--bg-hover); color: var(--text-muted); }
  .url { color: var(--accent); text-decoration: none; font-family: 'SF Mono', ui-monospace, monospace; font-size: 11px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; min-width: 0; }
  .url:hover { text-decoration: underline; }
  .url--empty { color: var(--text-muted); font-style: italic; }

  .muted { color: var(--text-muted); }
  .load-eager { color: var(--warning); font-weight: 500; }

  /* Pills */
  .pill { display: inline-flex; align-items: center; font-size: 10px; font-weight: 600; padding: 1px 7px; border-radius: 20px; }
  .pill--green { background: var(--success-bg); color: var(--success-strong); }
  .pill--red { background: var(--error-bg); color: var(--error-strong); }

  .no-results { text-align: center; padding: 24px; font-size: 13px; color: var(--text-muted); }

  @keyframes fadeUp {
    from { opacity: 0; transform: translateY(8px); }
    to { opacity: 1; transform: translateY(0); }
  }
</style>
