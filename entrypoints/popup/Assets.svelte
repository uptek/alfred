<script lang="ts">
  import type { RawAsset } from './utils/types';
  import type { AssetFlag } from './utils/assets';
  import { displaySource as displaySourceUrl, hasOwnLoad, matchesAssetFlag, typeLabel } from './utils/assets';
  import { csvField, downloadFile, formatSize, siteSlug as siteSlugOf } from './utils/format';
  import { createCopyFeedback } from './utils/copy.svelte';
  import { trackOnce } from './utils/track.svelte';
  import SummaryBar from './components/SummaryBar.svelte';
  import type { SummaryItem } from './components/SummaryBar.svelte';
  import TableToolbar from './components/TableToolbar.svelte';
  import type { Facet } from './components/TableToolbar.svelte';
  import type { ExportItem } from './components/ExportMenu.svelte';
  import SortHeader from './components/SortHeader.svelte';
  import { trackAction } from '@/utils/analytics';
  import { withCsvCredit } from '@/utils/credit';
  import { getTabState } from './stores/tabState.svelte';

  let { assets, domain }: { assets: RawAsset[]; domain: string | null } = $props();

  const siteSlug = $derived(siteSlugOf(domain ?? undefined));

  trackOnce(
    () => assets.length > 0,
    () =>
      trackAction('assets_view', {
        total: assets.length,
        script_count: assets.filter(a => a.kind === 'script').length,
        style_count: assets.filter(a => a.kind === 'style').length,
        external_count: assets.filter(a => a.isExternal).length
      })
  );

  type SortKey = 'index' | 'src' | 'size' | 'time' | 'type' | 'load';

  interface AssetsPersisted {
    sortKey: SortKey;
    sortDir: 'asc' | 'desc';
    search: string;
    searchOpen: boolean;
    typeFilter: string;
    sourceFilter: string;
    loadFilter: string;
    flagFilter: string;
    expanded: number[];
  }

  const tabState = getTabState();
  const restored = tabState.getSection<AssetsPersisted>('assets');

  let sortKey = $state<SortKey>(restored?.sortKey ?? 'index');
  let sortDir = $state<'asc' | 'desc'>(restored?.sortDir ?? 'asc');

  let search = $state(restored?.search ?? '');
  let searchOpen = $state(restored?.searchOpen ?? false);
  let typeFilter = $state(restored?.typeFilter ?? 'all');
  let sourceFilter = $state(restored?.sourceFilter ?? 'all');
  let loadFilter = $state(restored?.loadFilter ?? 'all');
  let flagFilter = $state(restored?.flagFilter ?? 'all');
  const copyFeedback = createCopyFeedback();
  let expanded = $state<Set<number>>(new Set(restored?.expanded ?? []));

  // Serialize the expanded set only when it actually changes, so high-frequency
  // search/filter edits below don't re-spread it every keystroke.
  const expandedArr = $derived([...expanded]);

  // Mirror the persisted slice into the per-tab cache on change (the store
  // debounces the write), so filters, sort, search, and expanded rows survive the
  // popup closing and reopening on the same page.
  $effect(() => {
    tabState.saveSection('assets', {
      sortKey,
      sortDir,
      search,
      searchOpen,
      typeFilter,
      sourceFilter,
      loadFilter,
      flagFilter,
      expanded: expandedArr
    });
  });

  const stats = $derived.by(() => {
    let scripts = 0, styles = 0, external = 0, inline = 0, browserExtension = 0;
    let renderBlocking = 0, failed = 0;
    const hrefCounts: Record<string, number> = {};
    const loadCounts: Record<string, number> = { async: 0, defer: 0, blocking: 0, inline: 0 };
    for (const a of assets) {
      if (a.kind === 'script') scripts++; else styles++;
      if (a.isExternal) external++;
      if (a.isInline) inline++;
      if (a.isBrowserExtension) browserExtension++;
      if (a.renderBlocking) renderBlocking++;
      if (a.status >= 400) failed++;
      if (hasOwnLoad(a)) loadCounts[a.load] = (loadCounts[a.load] ?? 0) + 1;
      if (a.src) hrefCounts[a.src] = (hrefCounts[a.src] ?? 0) + 1;
    }
    let duplicates = 0;
    for (const a of assets) {
      if (a.src && (hrefCounts[a.src] ?? 0) > 1) duplicates++;
    }
    return { total: assets.length, scripts, styles, external, inline, browserExtension, renderBlocking, failed, duplicates, loadCounts, hrefCounts };
  });

  function matchesSource(a: RawAsset): boolean {
    switch (sourceFilter) {
      case 'external': return a.isExternal;
      case 'inline': return a.isInline;
      case 'browser-extension': return a.isBrowserExtension;
      default: return true;
    }
  }

  function matchesFlag(a: RawAsset): boolean {
    if (flagFilter === 'all') return true;
    return matchesAssetFlag(a, flagFilter as AssetFlag, stats.hrefCounts);
  }

  // Each facet is one single-select dimension; they combine with AND.
  function matchesFilter(a: RawAsset): boolean {
    if (typeFilter !== 'all' && a.kind !== typeFilter) return false;
    if (sourceFilter !== 'all' && !matchesSource(a)) return false;
    if (loadFilter !== 'all' && (!hasOwnLoad(a) || a.load !== loadFilter)) return false;
    if (flagFilter !== 'all' && !matchesFlag(a)) return false;
    return true;
  }

  // Search matches URL, type, and inline source content; lowercased once per
  // asset list instead of on every keystroke.
  const haystacks = $derived(new Map(assets.map(a => [a.index, `${a.src ?? ''} ${a.type} ${a.content ?? ''}`.toLowerCase()])));

  const filtered = $derived.by(() => {
    const q = search.toLowerCase();
    return assets.filter(a => {
      if (!matchesFilter(a)) return false;
      if (q && !(haystacks.get(a.index) ?? '').includes(q)) return false;
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
        case 'type': cmp = typeLabel(a).localeCompare(typeLabel(b)); break;
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
    return displaySourceUrl(a.src, domain);
  }

  // Load = neutral fact about how the asset is declared. 'sync' (was 'blocking')
  // is deliberately distinct from the 'render-blocking' flag, which is the verdict.
  // Async/defer don't apply to stylesheets, so styles show '—'.
  function loadLabel(a: RawAsset): string {
    if (a.isInline) return 'inline';
    if (a.kind === 'style') return '—';
    return a.load === 'blocking' ? 'sync' : a.load;
  }

  function loadTitle(a: RawAsset): string {
    if (a.isInline) return 'Inline: no separate request';
    if (a.kind === 'style') return "Stylesheets are render-blocking by default; async/defer don't apply";
    if (a.load === 'inline') return 'Inert data block: its src is ignored and never fetched';
    if (a.load === 'async') return "Async: loads in parallel, doesn't block parsing";
    if (a.load === 'defer') return 'Defer: runs after the document is parsed';
    return 'Synchronous: blocks the parser while it loads';
  }

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

  function exportCsv() {
    const header = 'Kind,Source,Type,Subtype,Load,Placement,Media,Size (bytes),Time (ms),Status,Cached,Render-Blocking,Duplicate,Browser Extension';
    const rows = assets.map(a => {
      const dup = a.src ? (stats.hrefCounts[a.src] ?? 1) : 1;
      return [a.kind, a.src ?? 'inline', a.type, a.subtype, a.load, a.placement, a.media, a.size || '', a.duration || '', a.status || '', a.cached, a.renderBlocking, dup, a.isBrowserExtension]
        .map(csvField)
        .join(',');
    });
    downloadFile(withCsvCredit([header, ...rows].join('\n')), `alfred-assets-${siteSlug}.csv`, 'text/csv');
    trackAction('assets_export', { format: 'csv', count: assets.length });
  }

  function exportJson() {
    const data = assets.map(a => ({
      kind: a.kind,
      source: a.src ?? 'inline',
      type: a.type,
      subtype: a.subtype,
      load: a.load,
      placement: a.placement,
      media: a.media || null,
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
  }

  function exportText() {
    const text = assets.filter(a => a.src).map(a => a.src).join('\n');
    downloadFile(text, `alfred-assets-${siteSlug}.txt`, 'text/plain');
    trackAction('assets_export', { format: 'text', count: assets.length });
  }

  async function copyUrls() {
    const text = assets.filter(a => a.src).map(a => a.src).join('\n');
    if (await copyFeedback.copy(text)) {
      trackAction('assets_copy', { format: 'urls', count: assets.filter(a => a.src).length });
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
  // Only offered when something is flagged, so clean pages keep a short toolbar.
  const flagOptions = $derived([
    { value: 'all', label: 'All', count: stats.total },
    ...(stats.renderBlocking > 0 ? [{ value: 'render-blocking', label: 'Render-blocking', count: stats.renderBlocking }] : []),
    ...(stats.failed > 0 ? [{ value: 'failed', label: 'Failed', count: stats.failed }] : []),
    ...(stats.duplicates > 0 ? [{ value: 'duplicate', label: 'Duplicate', count: stats.duplicates }] : []),
  ]);

  const anyFilterActive = $derived(
    typeFilter !== 'all' || sourceFilter !== 'all' || loadFilter !== 'all' || flagFilter !== 'all' || search.length > 0
  );

  function setType(v: string) { typeFilter = v; trackAction('assets_filter', { facet: 'type', value: v }); }
  function setSource(v: string) { sourceFilter = v; trackAction('assets_filter', { facet: 'source', value: v }); }
  function setLoad(v: string) { loadFilter = v; trackAction('assets_filter', { facet: 'load', value: v }); }
  function setFlag(v: string) { flagFilter = v; trackAction('assets_filter', { facet: 'flag', value: v }); }

  const facets = $derived<Facet[]>([
    { key: 'type', name: 'Type', options: typeOptions, selected: typeFilter, onSelect: setType },
    { key: 'source', name: 'Source', options: sourceOptions, selected: sourceFilter, onSelect: setSource },
    { key: 'load', name: 'Loading', options: loadOptions, selected: loadFilter, onSelect: setLoad },
    ...(flagOptions.length > 1 ? [{ key: 'flag', name: 'Flags', options: flagOptions, selected: flagFilter, onSelect: setFlag }] : []),
  ]);

  const exportItems = $derived<ExportItem[]>([
    { label: 'CSV', desc: 'All fields', onClick: exportCsv },
    { label: 'JSON', desc: 'All fields', onClick: exportJson },
    { label: 'Text', desc: 'URLs only', onClick: exportText },
    { label: copyFeedback.copied ? 'Copied!' : 'Copy', desc: 'URLs only', onClick: copyUrls, keepOpen: true, dividerBefore: true },
  ]);

  function resetFilters() {
    typeFilter = 'all';
    sourceFilter = 'all';
    loadFilter = 'all';
    flagFilter = 'all';
    search = '';
    searchOpen = false;
    trackAction('assets_filter', { reset: true });
  }

  // Summary of the current view: known sizes only — opaque cross-origin
  // assets report 0 and are left out of the total.
  const summaryItems = $derived.by(() => {
    let scripts = 0, styles = 0, bytes = 0, renderBlocking = 0;
    for (const a of filtered) {
      if (a.kind === 'script') scripts++; else styles++;
      bytes += a.size;
      if (a.renderBlocking) renderBlocking++;
    }
    const items: SummaryItem[] = [
      { text: `${scripts} ${scripts === 1 ? 'script' : 'scripts'}` },
      { text: `${styles} ${styles === 1 ? 'style' : 'styles'}` }
    ];
    if (bytes > 0) items.push({ text: formatSize(bytes), title: 'Sum of known sizes; opaque cross-origin assets are not included' });
    if (renderBlocking > 0) items.push({ text: `${renderBlocking} render-blocking`, tone: 'warn' });
    return items;
  });
</script>

{#if assets.length === 0}
  <div class="empty-state">
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" class="empty-state__icon"><polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/></svg>
    <p>No scripts or styles found on this page</p>
  </div>
{:else}
  <div class="assets-tab">
    <TableToolbar
      {facets}
      {anyFilterActive}
      {exportItems}
      onReset={resetFilters}
      exportLabel="Download assets"
      searchLabel="Search assets"
      searchPlaceholder="Filter by URL or type..."
      bind:search
      bind:searchOpen
    />

    <!-- Table -->
    <div class="table-wrap">
      <table class="table">
        <thead>
          <tr>
            <th class="th th--num"><SortHeader label="#" active={sortKey === 'index'} dir={sortDir} onclick={() => toggleSort('index')} title="Sort by document order" /></th>
            <th class="th th--src"><SortHeader label="Source" active={sortKey === 'src'} dir={sortDir} onclick={() => toggleSort('src')} title="Sort by source" /> <span class="th__count">({filtered.length}/{stats.total})</span></th>
            <th class="th th--size"><SortHeader label="Size" active={sortKey === 'size'} dir={sortDir} onclick={() => toggleSort('size')} title="Sort by size" /></th>
            <th class="th th--time"><SortHeader label="Time" active={sortKey === 'time'} dir={sortDir} onclick={() => toggleSort('time')} title="Sort by load time" /></th>
            <th class="th th--kind"><SortHeader label="Type" active={sortKey === 'type'} dir={sortDir} onclick={() => toggleSort('type')} title="Sort by type" /></th>
            <th class="th th--load"><SortHeader label="Load" active={sortKey === 'load'} dir={sortDir} onclick={() => toggleSort('load')} title="Sort by load strategy" /></th>
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
                  {#if asset.status >= 400}
                    <span class="pill pill--red" title="Failed request: HTTP {asset.status}">{asset.status}</span>
                  {/if}
                  {#if asset.renderBlocking}
                    <span class="pill pill--amber" title="Blocks first render">render-blocking</span>
                  {/if}
                  {#if asset.kind === 'style' && asset.media}
                    <span class="media-tag" title="Applies when media query matches: {asset.media}">{asset.media}</span>
                  {/if}
                  {#if asset.src && (stats.hrefCounts[asset.src] ?? 0) > 1}
                    <span class="dup-badge" title="Loaded {stats.hrefCounts[asset.src]} times">&times;{stats.hrefCounts[asset.src]}</span>
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
                  <span class="time-cached" title="Served from cache: no network time">cached</span>
                {:else if asset.duration > 0}
                  {asset.duration} ms
                {:else}
                  <span class="muted">&mdash;</span>
                {/if}
              </td>
              <td class="td td--kind"><span title={asset.type}>{typeLabel(asset)}</span></td>
              <td class="td td--load"><span class="load-tag" class:load-tag--na={asset.kind === 'style' && !asset.isInline} title={loadTitle(asset)}>{loadLabel(asset)}</span></td>
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
    {#if filtered.length > 0}
      <SummaryBar items={summaryItems} />
    {/if}
  </div>
{/if}

<style>
  .assets-tab { display: flex; flex-direction: column; height: 100%; animation: fadeUp 0.4s ease both; }

  /* Empty state */
  .empty-state { display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100%; gap: 8px; color: var(--text-muted); }
  .empty-state__icon { width: 28px; height: 28px; opacity: 0.3; stroke-width: 1.7; }
  .empty-state p { font-size: 13px; margin: 0; }

  /* Table — full-bleed rows: no wrapper side padding, gutter lives on the edge cells */


  /* Edge-cell gutters keep content inset while row/hover background spans full width */
  .code-row td:last-child { padding-right: 20px; }

  .th--num { width: 30px; padding-right: 0; }
  .th--size { width: 64px; }
  .th--time { width: 58px; }
  .th--kind { width: 60px; }
  .th--load { width: 64px; }

  .row--clickable { cursor: pointer; }
  .row--clickable:hover { background: var(--bg-hover); }

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

  /* Load = neutral fact (async/defer/sync/inline). Color is reserved for problem flags only. */
  .load-tag { font-size: 12px; color: var(--text-secondary); }
  .load-tag--na { color: var(--text-muted); }

  /* Pills & badges (matches Links tab) */
  .pill { display: inline-flex; align-items: center; flex-shrink: 0; font-size: 10px; font-weight: 600; padding: 1px 7px; border-radius: 20px; white-space: nowrap; }
  .pill--red { background: var(--error-bg); color: var(--error-strong); }
  .pill--amber { background: var(--warning-bg); color: var(--warning); }
  .dup-badge { flex-shrink: 0; font-size: 10px; font-weight: 600; padding: 0 5px; border-radius: 8px; line-height: 16px; background: var(--warning-bg); color: var(--warning); }

  /* Inline code expand */
  .code-row td { padding: 0 8px 9px 0; border-bottom: 1px solid var(--border-muted); }
  .code { margin: 0; padding: 10px 12px; background: var(--bg-raised); border: 1px solid var(--border); border-radius: 6px; font-family: 'SF Mono', ui-monospace, monospace; font-size: 11px; line-height: 1.5; color: var(--text-secondary); white-space: pre-wrap; word-break: break-word; max-height: 240px; overflow: auto; }
  .code::-webkit-scrollbar { width: 4px; height: 4px; }
  .code::-webkit-scrollbar-thumb { background: var(--scrollbar); border-radius: 3px; }

  /* Stylesheet media attribute — neutral fact, not a problem flag */
  .media-tag { flex-shrink: 0; font-size: 10px; font-weight: 500; padding: 1px 6px; border-radius: 20px; white-space: nowrap; max-width: 120px; overflow: hidden; text-overflow: ellipsis; background: var(--bg-raised); color: var(--text-muted); border: 1px solid var(--border); }


  @keyframes fadeUp {
    from { opacity: 0; transform: translateY(8px); }
    to { opacity: 1; transform: translateY(0); }
  }
</style>
