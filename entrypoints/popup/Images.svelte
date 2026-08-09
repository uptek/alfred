<script lang="ts">
  import type { RawImage, ImageStatus } from './utils/types';
  import type { AltState } from './utils/images';
  import { altState, fileLabel, imageStatus, highlightImages, scrollToImage, summarizeImages } from './utils/images';
  import { csvField, downloadFile, formatSize, siteSlug as siteSlugOf } from './utils/format';
  import { createCopyFeedback } from './utils/copy.svelte';
  import { trackOnce } from './utils/track.svelte';
  import SummaryBar from './components/SummaryBar.svelte';
  import TableToolbar from './components/TableToolbar.svelte';
  import type { Facet } from './components/TableToolbar.svelte';
  import type { ExportItem } from './components/ExportMenu.svelte';
  import ToolbarButton from './components/ToolbarButton.svelte';
  import SortHeader from './components/SortHeader.svelte';
  import { trackAction } from '@/utils/analytics';
  import { withCsvCredit } from '@/utils/credit';
  import { onDestroy, onMount } from 'svelte';
  import { getTabState } from './stores/tabState.svelte';

  let { images, domain }: { images: RawImage[]; domain: string | null } = $props();

  const siteSlug = $derived(siteSlugOf(domain ?? undefined));

  // Backgrounds have no alt concept (alt is null); everything else defers to altState
  // so the classification has a single source of truth.
  const altOf = (img: RawImage): AltState => (img.source === 'background' ? 'present' : altState(img.alt));

  // Status is read several times per row (cell, sort, filter, summary); compute once per list.
  const statusByIndex = $derived(
    new Map(images.map((img) => [img.index, imageStatus({ broken: img.broken, alt: altOf(img), source: img.source })]))
  );
  const statusOf = (img: RawImage): ImageStatus => statusByIndex.get(img.index) ?? 'ok';

  trackOnce(
    () => images.length > 0,
    () =>
      trackAction('images_view', {
        image_count: images.length,
        missing_alt_count: images.filter(i => i.lacksAlt).length,
        broken_count: images.filter(i => i.broken).length
      })
  );

  type SortKey = 'index' | 'size' | 'format' | 'dims' | 'load' | 'status';

  interface ImagesPersisted {
    altFilter: string;
    formatFilter: string;
    loadingFilter: string;
    statusFilter: string;
    flagFilter: string;
    search: string;
    searchOpen: boolean;
    highlightOn: boolean;
    sortKey: SortKey;
    sortDir: 'asc' | 'desc';
  }

  const tabState = getTabState();
  const restored = tabState.getSection<ImagesPersisted>('images');

  let altFilter = $state(restored?.altFilter ?? 'all');
  let formatFilter = $state(restored?.formatFilter ?? 'all');
  let loadingFilter = $state(restored?.loadingFilter ?? 'all');
  let statusFilter = $state(restored?.statusFilter ?? 'all');
  let flagFilter = $state(restored?.flagFilter ?? 'all');
  let search = $state(restored?.search ?? '');
  let searchOpen = $state(restored?.searchOpen ?? false);

  let sortKey = $state<SortKey>(restored?.sortKey ?? 'index');
  let sortDir = $state<'asc' | 'desc'>(restored?.sortDir ?? 'asc');

  const copyFeedback = createCopyFeedback();
  let highlightOn = $state(restored?.highlightOn ?? false);

  // onDestroy strips the on-page outlines when the popup closes, so re-apply them
  // if the restored state had highlighting on.
  onMount(() => {
    if (highlightOn) highlightImages(true);
  });

  // Mirror the persisted slice into the per-tab cache on change (the store
  // debounces the write), so filters, sort, search, and highlight survive the
  // popup closing and reopening on the same page.
  $effect(() => {
    tabState.saveSection('images', {
      altFilter,
      formatFilter,
      loadingFilter,
      statusFilter,
      flagFilter,
      search,
      searchOpen,
      highlightOn,
      sortKey,
      sortDir
    });
  });

  const stats = $derived.by(() => {
    let altPresent = 0, altDecorative = 0, altMissing = 0, ok = 0, missingAlt = 0, broken = 0, lazy = 0, eager = 0, noLoad = 0, oversized = 0;
    const formatCounts: Record<string, number> = {};
    for (const img of images) {
      // Background images have no alt concept and no loading attribute; exclude them from those buckets.
      if (img.source !== 'background') {
        const alt = altOf(img);
        if (alt === 'missing') altMissing++; else if (alt === 'decorative') altDecorative++; else altPresent++;
        if (img.loading === 'lazy') lazy++; else if (img.loading === 'eager') eager++; else noLoad++;
      }
      const st = statusOf(img);
      if (st === 'broken') broken++; else if (st === 'missing-alt') missingAlt++; else ok++;
      if (img.oversized) oversized++;
      const f = img.format || 'other';
      formatCounts[f] = (formatCounts[f] ?? 0) + 1;
    }
    return { total: images.length, altPresent, altDecorative, altMissing, ok, missingAlt, broken, lazy, eager, noLoad, oversized, formatCounts };
  });

  // Lowercased searchable text per image, built once per list (not per keystroke).
  // Data URIs contribute their MIME label so a base64 payload never enters the haystack.
  const haystacks = $derived(
    new Map(
      images.map((img) => [
        img.index,
        `${img.src.startsWith('data:') ? fileLabel(img.src) : img.src} ${img.alt ?? ''}`.toLowerCase()
      ])
    )
  );

  const filtered = $derived.by(() => {
    const q = search.toLowerCase();
    return images.filter(img => {
      if (altFilter !== 'all' && (img.source === 'background' || altOf(img) !== altFilter)) return false;
      if (formatFilter !== 'all' && (img.format || 'other') !== formatFilter) return false;
      // Backgrounds have no loading attribute (the cell shows "—"), so they never match a loading filter.
      if (loadingFilter !== 'all' && (img.source === 'background' || img.loading !== loadingFilter)) return false;
      if (statusFilter !== 'all' && statusOf(img) !== statusFilter) return false;
      if (flagFilter === 'oversized' && !img.oversized) return false;
      if (q && !(haystacks.get(img.index) ?? '').includes(q)) return false;
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
        case 'format': cmp = (a.format || '').localeCompare(b.format || ''); break;
        case 'dims': cmp = (a.naturalWidth * a.naturalHeight) - (b.naturalWidth * b.naturalHeight); break;
        case 'load': cmp = a.loading.localeCompare(b.loading); break;
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

  function dimsLabel(img: RawImage): string {
    if (!img.naturalWidth || !img.naturalHeight) return '—';
    return `${img.naturalWidth}×${img.naturalHeight}`;
  }

  function dimsTitle(img: RawImage): string | undefined {
    if (!img.naturalWidth || !img.displayWidth) return undefined;
    const base = `Natural ${img.naturalWidth}×${img.naturalHeight} px, displayed ${img.displayWidth}×${img.displayHeight} px`;
    return img.oversized ? `Oversized: ${base}` : base;
  }

  /** Tooltip-safe source: data URIs collapse to their MIME label instead of the payload. */
  function srcTitle(src: string): string {
    return src.startsWith('data:') ? fileLabel(src) : src;
  }

  const summaryItems = $derived(summarizeImages(filtered, statusByIndex));

  function toggleHighlight() {
    highlightOn = !highlightOn;
    highlightImages(highlightOn);
    trackAction('images_highlight', { enabled: highlightOn });
  }

  onDestroy(() => {
    if (highlightOn) highlightImages(false);
  });

  function handleRowClick(e: MouseEvent, index: number) {
    if ((e.target as HTMLElement).closest('a')) return;
    scrollToImage(index);
    trackAction('images_scroll_to', {});
  }

  function exportCsv() {
    const header = 'URL,Alt,Source,Format,Width,Height,Display Width,Display Height,Size (bytes),Loading,Status,Oversized';
    const rows = images.map(img => {
      return [img.src, img.alt ?? '', img.source, img.format, img.naturalWidth, img.naturalHeight, img.displayWidth, img.displayHeight, img.size, img.loading, statusOf(img), img.oversized]
        .map(csvField)
        .join(',');
    });
    downloadFile(withCsvCredit([header, ...rows].join('\n')), `alfred-images-${siteSlug}.csv`, 'text/csv');
    trackAction('images_export', { format: 'csv', image_count: images.length });
  }

  function exportJson() {
    const data = images.map(img => ({
      url: img.src,
      alt: img.alt,
      source: img.source,
      format: img.format,
      width: img.naturalWidth,
      height: img.naturalHeight,
      displayWidth: img.displayWidth,
      displayHeight: img.displayHeight,
      size: img.size,
      loading: img.loading,
      status: statusOf(img),
      oversized: img.oversized
    }));
    downloadFile(JSON.stringify(data, null, 2), `alfred-images-${siteSlug}.json`, 'application/json');
    trackAction('images_export', { format: 'json', image_count: images.length });
  }

  async function copyUrls() {
    const text = images.map(img => img.src).filter(Boolean).join('\n');
    if (await copyFeedback.copy(text)) trackAction('images_copy', { format: 'urls', image_count: images.length });
  }

  const altOptions = $derived([
    { value: 'all', label: 'All', count: stats.total },
    { value: 'present', label: 'Present', count: stats.altPresent },
    { value: 'decorative', label: 'Decorative', count: stats.altDecorative },
    { value: 'missing', label: 'Missing', count: stats.altMissing },
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
  // Only offered when something is flagged, so clean pages keep a short toolbar.
  const flagOptions = $derived([
    { value: 'all', label: 'All', count: stats.total },
    ...(stats.oversized > 0 ? [{ value: 'oversized', label: 'Oversized', count: stats.oversized }] : []),
  ]);

  const anyFilterActive = $derived(altFilter !== 'all' || formatFilter !== 'all' || loadingFilter !== 'all' || statusFilter !== 'all' || flagFilter !== 'all' || search.length > 0);

  function setAlt(v: string) { altFilter = v; trackAction('images_filter', { facet: 'alt', value: v }); }
  function setFormat(v: string) { formatFilter = v; trackAction('images_filter', { facet: 'format', value: v }); }
  function setLoading(v: string) { loadingFilter = v; trackAction('images_filter', { facet: 'loading', value: v }); }
  function setStatus(v: string) { statusFilter = v; trackAction('images_filter', { facet: 'status', value: v }); }
  function setFlag(v: string) { flagFilter = v; trackAction('images_filter', { facet: 'flag', value: v }); }

  const facets = $derived<Facet[]>([
    { key: 'alt', name: 'Alt', options: altOptions, selected: altFilter, onSelect: setAlt },
    { key: 'format', name: 'Format', options: formatOptions, selected: formatFilter, onSelect: setFormat },
    { key: 'loading', name: 'Loading', options: loadingOptions, selected: loadingFilter, onSelect: setLoading },
    { key: 'status', name: 'Status', options: statusOptions, selected: statusFilter, onSelect: setStatus },
    ...(flagOptions.length > 1 ? [{ key: 'flag', name: 'Flags', options: flagOptions, selected: flagFilter, onSelect: setFlag }] : []),
  ]);

  const exportItems = $derived<ExportItem[]>([
    { label: 'CSV', desc: 'All fields', onClick: exportCsv },
    { label: 'JSON', desc: 'All fields', onClick: exportJson },
    { label: copyFeedback.copied ? 'Copied!' : 'Copy', desc: 'URLs only', onClick: copyUrls, keepOpen: true, dividerBefore: true },
  ]);

  function resetFilters() {
    altFilter = 'all';
    formatFilter = 'all';
    loadingFilter = 'all';
    statusFilter = 'all';
    flagFilter = 'all';
    search = '';
    searchOpen = false;
    trackAction('images_filter', { reset: true });
  }
</script>

{#if images.length === 0}
  <div class="empty-state">
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" class="empty-state__icon"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="M21 15l-5-5L5 21"/></svg>
    <p>No images found on this page</p>
  </div>
{:else}
  <div class="images-tab">
    {#snippet actions()}
      <ToolbarButton active={highlightOn} onclick={toggleHighlight} ariaLabel="Highlight images on page" title="Highlight images on page">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"><path d="m9 11-6 6v3h9l3-3"/><path d="m22 12-4.6 4.6a2 2 0 0 1-2.8 0l-5.2-5.2a2 2 0 0 1 0-2.8L14 4"/></svg>
      </ToolbarButton>
    {/snippet}

    <TableToolbar
      {facets}
      {anyFilterActive}
      {exportItems}
      {actions}
      onReset={resetFilters}
      exportLabel="Download images"
      searchLabel="Search images"
      searchPlaceholder="Filter by alt text or URL..."
      bind:search
      bind:searchOpen
    />

    <!-- Table -->
    <div class="table-wrap">
      <table class="table">
        <thead>
          <tr>
            <th class="th th--img">Image <span class="th__count">({filtered.length}/{stats.total})</span></th>
            <th class="th th--size"><SortHeader label="Size" active={sortKey === 'size'} dir={sortDir} onclick={() => toggleSort('size')} title="Sort by size" /></th>
            <th class="th th--fmt"><SortHeader label="Fmt" active={sortKey === 'format'} dir={sortDir} onclick={() => toggleSort('format')} title="Sort by format" /></th>
            <th class="th th--dims"><SortHeader label="Dims" active={sortKey === 'dims'} dir={sortDir} onclick={() => toggleSort('dims')} title="Sort by dimensions" /></th>
            <th class="th th--load"><SortHeader label="Load" active={sortKey === 'load'} dir={sortDir} onclick={() => toggleSort('load')} title="Sort by loading" /></th>
            <th class="th th--status"><SortHeader label="Status" active={sortKey === 'status'} dir={sortDir} onclick={() => toggleSort('status')} title="Sort by status" /></th>
          </tr>
        </thead>
        <tbody>
          {#each sorted as img (img.index)}
            <tr class="row" class:row--hidden={img.isHidden} onclick={(e) => handleRowClick(e, img.index)} title="Click to scroll to this image">
              <td class="td td--img">
                <div class="img-cell">
                  {#if img.src && !img.src.startsWith('data:')}
                    <a href={img.src} target="_blank" rel="noopener noreferrer" class="thumb-link" title="Open image in new tab" onclick={() => trackAction('images_open', { source: img.source })}>
                      <img class="thumb" src={img.src} alt="" loading="lazy" />
                    </a>
                  {:else if img.src.includes(',')}
                    <!-- Browsers block top-frame navigation to data: URLs, so no link -->
                    <img class="thumb" src={img.src} alt="" loading="lazy" />
                  {:else}
                    <!-- No src, or a data URI capped to its MIME essence (no renderable payload) -->
                    <div class="thumb thumb--empty"></div>
                  {/if}
                  <div class="img-meta">
                    {#if img.source === 'background'}
                      <span class="alt-text alt-text--muted">Background image</span>
                    {:else}
                      <span class="alt-text" title={img.lacksAlt ? 'Missing alt text' : img.decorative ? 'Empty alt attribute (decorative image)' : img.alt}>
                        <span class="alt-label">Alt:</span>
                        {#if img.lacksAlt}
                          <span class="alt-missing">Missing</span>
                        {:else if img.decorative}
                          <span class="alt-decorative">decorative</span>
                        {:else}
                          {img.alt}
                        {/if}
                      </span>
                    {/if}
                    <div class="url-row">
                      {#if img.source === 'background'}<span class="src-tag">bg</span>{/if}
                      {#if img.src}
                        <span class="filename" title={srcTitle(img.src)}>{fileLabel(img.src)}</span>
                      {:else}
                        <span class="filename filename--empty">(no source)</span>
                      {/if}
                    </div>
                  </div>
                </div>
              </td>
              <td class="td td--size">{img.size ? formatSize(img.size) : '—'}</td>
              <td class="td td--fmt">{img.format ? img.format.toUpperCase() : '—'}</td>
              <td class="td td--dims"><span class:dims--oversized={img.oversized} title={dimsTitle(img)}>{dimsLabel(img)}</span></td>
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
                  <!-- Amber, matching the on-page highlight severity (red is reserved for broken) -->
                  <span class="pill pill--amber">Alt</span>
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

    {#if filtered.length > 0}
      <SummaryBar items={summaryItems} />
    {/if}
  </div>
{/if}

<style>
  .images-tab { display: flex; flex-direction: column; height: 100%; animation: fadeUp 0.4s ease both; }

  /* Empty state */
  .empty-state { display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100%; gap: 8px; color: var(--text-muted); }
  .empty-state__icon { width: 28px; height: 28px; opacity: 0.3; stroke-width: 1.7; }
  .empty-state p { font-size: 13px; margin: 0; }

  /* Table — full-bleed rows: no wrapper side padding, gutter lives on the edge cells */


  /* Edge-cell gutters keep content inset while row/hover background spans full width */

  .th--size { width: 58px; text-align: right; }
  .th--fmt { width: 42px; text-align: center; }
  .th--dims { width: 72px; text-align: center; }
  .th--load { width: 50px; text-align: center; }
  .th--status { width: 58px; text-align: center; padding-right: 0; }

  .row { cursor: pointer; }
  .row:hover { background: var(--bg-hover); }
  .row--hidden { opacity: 0.5; }

  /* Two-line image cell reads better top-aligned than the shared middle default. */
  .td { vertical-align: top; }
  .td--size { text-align: right; white-space: nowrap; }
  .td--fmt { text-align: center; }
  .td--dims { text-align: center; white-space: nowrap; }
  .td--load { text-align: center; white-space: nowrap; }
  .td--status { text-align: center; padding-right: 0; }
  .td--img { overflow: hidden; }

  .img-cell { display: flex; gap: 8px; align-items: flex-start; min-width: 0; }
  .thumb-link { display: block; flex-shrink: 0; line-height: 0; border-radius: 4px; }
  .thumb-link:hover { box-shadow: 0 0 0 1.5px var(--accent); }
  .thumb { width: 36px; height: 36px; border-radius: 4px; flex-shrink: 0; object-fit: cover; background: var(--bg-hover); }
  .thumb--empty { background: var(--bg-hover); }
  .img-meta { min-width: 0; }

  .alt-text { display: block; font-size: 12px; color: var(--text); font-weight: 500; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 210px; }
  .alt-text--muted { color: var(--text-muted); font-style: italic; font-weight: 400; }
  .alt-label { color: var(--text-muted); font-weight: 600; margin-right: 1px; }
  .alt-missing { color: var(--warning); font-weight: 600; }
  .alt-decorative { display: inline-block; vertical-align: 1px; font-size: 9px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.03em; padding: 0 4px; border-radius: 4px; line-height: 14px; background: var(--bg-hover); color: var(--text-muted); }

  .url-row { display: flex; align-items: center; gap: 5px; min-width: 0; margin-top: 1px; }
  .src-tag { flex-shrink: 0; font-size: 9px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.03em; padding: 0 4px; border-radius: 4px; line-height: 14px; background: var(--bg-hover); color: var(--text-muted); }
  .filename { font-family: 'SF Mono', ui-monospace, monospace; font-size: 11px; color: var(--text-muted); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; min-width: 0; }
  .filename--empty { font-style: italic; }

  .muted { color: var(--text-muted); }
  .load-eager { color: var(--warning); font-weight: 500; }
  .dims--oversized { color: var(--warning); font-weight: 600; }

  /* Pills */
  .pill { display: inline-flex; align-items: center; font-size: 10px; font-weight: 600; padding: 1px 7px; border-radius: 20px; }
  .pill--green { background: var(--success-bg); color: var(--success-strong); }
  .pill--red { background: var(--error-bg); color: var(--error-strong); }
  .pill--amber { background: var(--warning-bg); color: var(--warning); }


  @keyframes fadeUp {
    from { opacity: 0; transform: translateY(8px); }
    to { opacity: 1; transform: translateY(0); }
  }
</style>
