<script lang="ts">
  import {
    categorizeSitemap,
    getSitemapUrls,
    searchSitemapUrls,
    sitemapFilename,
    type SitemapNode,
    type SitemapSearchResult,
    type SitemapsAnalysis,
    type SitemapsData
  } from './utils/sitemaps';
  import { csvField, downloadFile } from './utils/format';
  import { getActiveTab } from './utils/messaging';
  import { createCopyFeedback, createKeyedCopyFeedback } from './utils/copy.svelte';
  import { trackViewOnce } from './utils/track.svelte';
  import { trackAction } from '@/utils/analytics';
  import { withCsvCredit } from '@/utils/credit';
  import { untrack } from 'svelte';
  import ActionButton from './components/ActionButton.svelte';
  import ExportMenu from './components/ExportMenu.svelte';
  import type { ExportItem } from './components/ExportMenu.svelte';
  import SearchField from './components/SearchField.svelte';
  import SortHeader from './components/SortHeader.svelte';

  let {
    data,
    analysis,
    loading = false
  }: { data: SitemapsData | null; analysis: SitemapsAnalysis; loading?: boolean } = $props();

  // Flatten for rendering: index children as rows; a flat urlset root is its own row.
  const rows = $derived.by(() => {
    if (!data) return [];
    const out: { node: SitemapNode; fromIndex: boolean }[] = [];
    for (const root of data.nodes) {
      if (!root.ok) continue;
      if (root.kind === 'index') {
        for (const child of root.children) out.push({ node: child, fromIndex: true });
      } else if (root.kind === 'urlset') {
        out.push({ node: root, fromIndex: false });
      }
    }
    return out;
  });

  type SortKey = 'name' | 'urls' | 'modified' | 'status';
  let sortKey = $state<SortKey>('urls');
  let sortDir = $state<'asc' | 'desc'>('desc');

  function toggleSort(key: SortKey) {
    if (sortKey === key) {
      sortDir = sortDir === 'asc' ? 'desc' : 'asc';
    } else {
      sortKey = key;
      // Counts read best largest-first; text and dates smallest-first.
      sortDir = key === 'urls' ? 'desc' : 'asc';
    }
  }

  const sortedRows = $derived.by(() => {
    const dir = sortDir === 'asc' ? 1 : -1;
    const cmp = (a: SitemapNode, b: SitemapNode): number => {
      switch (sortKey) {
        case 'name':
          return sitemapFilename(a.url).localeCompare(sitemapFilename(b.url));
        case 'urls':
          return a.urlCount - b.urlCount;
        case 'modified': {
          // Missing lastmod always sinks to the bottom regardless of direction.
          if (!a.lastmod && !b.lastmod) return 0;
          if (!a.lastmod) return dir;
          if (!b.lastmod) return -dir;
          return Date.parse(a.lastmod) - Date.parse(b.lastmod) || 0;
        }
        case 'status':
          return (a.ok ? 0 : 1) - (b.ok ? 0 : 1) || a.status - b.status;
      }
    };
    return [...rows].sort((a, b) => cmp(a.node, b.node) * dir);
  });

  const anyTruncated = $derived(rows.some(({ node }) => node.truncated));

  const openUrl = $derived(data?.nodes.find((n) => n.ok)?.finalUrl ?? data?.nodes[0]?.url ?? null);

  const TRUNCATED_HINT = 'Count is a minimum, sitemap exceeded the read limit';

  function formatLastmod(iso: string): string {
    const t = Date.parse(iso);
    if (Number.isNaN(t)) return iso;
    const days = Math.floor((Date.now() - t) / 86_400_000);
    if (days <= 0) return 'today';
    if (days < 60) return `${days}d ago`;
    return new Date(t).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
  }

  function openSitemap() {
    if (!openUrl) return;
    window.open(openUrl, '_blank');
    trackAction('sitemaps_open');
  }

  function openRow(node: SitemapNode) {
    window.open(node.finalUrl || node.url, '_blank');
    trackAction('sitemaps_open');
  }

  const copyFeedback = createCopyFeedback();
  async function copyUrls() {
    const text = rows.map(({ node }) => node.finalUrl || node.url).join('\n');
    if (await copyFeedback.copy(text)) trackAction('sitemaps_copy');
  }

  // Per-row action feedback, keyed by sitemap URL so sorting can't misplace it.
  const urlCopy = createKeyedCopyFeedback<string>();
  const linksCopy = createKeyedCopyFeedback<string>();
  let pendingLinksKey = $state<string | null>(null);

  async function copySitemapUrl(node: SitemapNode) {
    if (await urlCopy.copy(node.finalUrl || node.url, node.url)) trackAction('sitemaps_copy');
  }

  async function copySitemapLinks(node: SitemapNode) {
    if (pendingLinksKey) return;
    pendingLinksKey = node.url;
    try {
      const result = await getSitemapUrls(node.finalUrl || node.url);
      if (!result || result.urls.length === 0) return;
      if (await linksCopy.copy(result.urls.join('\n'), node.url)) {
        trackAction('sitemaps_copy_urls', { url_count: result.urls.length, truncated: result.truncated });
      }
    } catch {
      // ignore fetch errors
    } finally {
      pendingLinksKey = null;
    }
  }

  // Search across all sitemap URL lists (content-script fetch, cached per page).
  const MIN_QUERY = 2;
  let query = $state('');
  let searching = $state(false);
  let searchResult = $state<SitemapSearchResult | null>(null);
  let searchSeq = 0;

  const searchActive = $derived(query.trim().length >= MIN_QUERY);
  const searchTargets = $derived(
    rows.filter(({ node }) => node.ok && node.kind === 'urlset').map(({ node }) => node.finalUrl || node.url)
  );

  $effect(() => {
    const q = query.trim();
    if (q.length < MIN_QUERY) {
      searchResult = null;
      searching = false;
      return;
    }
    const seq = ++searchSeq;
    searching = true;
    const timer = setTimeout(async () => {
      const result = await searchSitemapUrls(untrack(() => searchTargets), q);
      if (seq !== searchSeq) return;
      searching = false;
      searchResult = result;
      if (result) trackAction('sitemaps_search', { query_length: q.length, match_count: result.total });
    }, 350);
    return () => clearTimeout(timer);
  });

  async function findCurrentPage() {
    try {
      const tab = await getActiveTab();
      if (!tab?.url) return;
      const u = new URL(tab.url);
      query = u.host + u.pathname;
    } catch {
      // tab URL unavailable — leave the field as-is
    }
  }

  let menuOpen = $state(false);

  function exportRow(node: SitemapNode) {
    return {
      url: node.finalUrl || node.url,
      filename: sitemapFilename(node.url),
      category: categorizeSitemap(node.url).label,
      urlCount: node.urlCount,
      truncated: node.truncated,
      lastmod: node.lastmod,
      status: node.status,
      kind: node.kind
    };
  }

  function exportCsv() {
    const header = 'URL,Filename,Category,URL Count,Truncated,Last Modified,Status,Kind';
    const csvRows = rows.map(({ node }) => {
      const r = exportRow(node);
      return [r.url, r.filename, r.category, r.urlCount, r.truncated, r.lastmod ?? '', r.status, r.kind]
        .map(csvField)
        .join(',');
    });
    downloadFile(withCsvCredit([header, ...csvRows].join('\n')), 'sitemaps.csv', 'text/csv');
    trackAction('sitemaps_export', { format: 'csv' });
  }

  function exportJson() {
    const data = rows.map(({ node }) => exportRow(node));
    downloadFile(JSON.stringify(data, null, 2), 'sitemaps.json', 'application/json');
    trackAction('sitemaps_export', { format: 'json' });
  }

  function exportText() {
    const text = rows.map(({ node }) => node.finalUrl || node.url).join('\n');
    downloadFile(text, 'sitemaps.txt', 'text/plain');
    trackAction('sitemaps_export', { format: 'txt' });
  }

  const exportItems = $derived<ExportItem[]>([
    { label: 'CSV', desc: 'All fields', onClick: exportCsv },
    { label: 'JSON', desc: 'All fields', onClick: exportJson },
    { label: 'Text', desc: 'URLs only', onClick: exportText },
    { label: copyFeedback.copied ? 'Copied!' : 'Copy', desc: 'URLs only', onClick: copyUrls, keepOpen: true, dividerBefore: true },
  ]);

  function severityLabel(severity: string): string {
    return severity === 'error' ? 'Error' : severity === 'warning' ? 'Warning' : 'Info';
  }

  trackViewOnce('sitemaps_view', () => data !== null, () => ({
    ok: analysis.ok,
    sitemap_count: analysis.totalSitemaps,
    url_count: analysis.totalUrls,
    error_count: analysis.errorCount
  }));

  function handleWindowClick(e: MouseEvent) {
    const target = e.target as HTMLElement;
    if (!target.closest('.export')) menuOpen = false;
  }
</script>

<svelte:window
  onclick={handleWindowClick}
  onkeydown={(e) => {
    if (e.key === 'Escape') menuOpen = false;
  }}
/>

{#snippet copyLinksIcon()}
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round">
    <rect x="8" y="2" width="8" height="4" rx="1" />
    <path d="M16 4h2a2 2 0 012 2v14a2 2 0 01-2 2H6a2 2 0 01-2-2V6a2 2 0 012-2h2" />
    <line x1="8" y1="11" x2="16" y2="11" />
    <line x1="8" y1="15" x2="16" y2="15" />
  </svg>
{/snippet}

{#snippet checkIcon()}
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round">
    <polyline points="20 6 9 17 4 12" />
  </svg>
{/snippet}

{#if loading}
  <div class="empty-state">
    <div class="empty-state__spinner"></div>
    <p>Loading sitemaps…</p>
  </div>
{:else if data === null}
  <div class="empty-state">
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" class="empty-state__icon"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4m0-4h.01"/></svg>
    <p>Couldn't reach this page: reload the tab and reopen Alfred</p>
  </div>
{:else if !analysis.ok}
  <div class="sitemaps-tab">
    <div class="sitemaps__body">
      <div class="banner banner--info">
        <div class="banner__icon">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4m0-4h.01"/></svg>
        </div>
        <div>
          <div class="banner__title">No sitemap found</div>
          {#if analysis.findings[0]}<div class="banner__sub">{analysis.findings[0].message}</div>{/if}
        </div>
      </div>
      {#if analysis.findings.length > 0}
        <div class="issues">
          {#each analysis.findings as f}
            <div class="issue">
              <span class="issue__dot issue__dot--{f.severity}" role="img" aria-label={severityLabel(f.severity)} title={severityLabel(f.severity)}></span>
              <span class="issue__msg">{f.message}</span>
            </div>
          {/each}
        </div>
      {/if}
    </div>
  </div>
{:else}
  <div class="sitemaps-tab">
    <div class="sitemaps__header">
      <div>
        <div class="sitemaps__title">Sitemaps</div>
        <div class="sitemaps__subtitle">
          {analysis.totalSitemaps} {analysis.totalSitemaps === 1 ? 'sitemap' : 'sitemaps'} &middot; {analysis.totalUrls.toLocaleString()}{anyTruncated ? '+' : ''} URLs
        </div>
      </div>
      <div class="sitemaps__actions">
        {#if openUrl}
          <ActionButton onclick={openSitemap}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round"><path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6M15 3h6v6M10 14L21 3"/></svg>
            Open sitemap.xml
          </ActionButton>
        {/if}
        {#if rows.length > 0}
          <ExportMenu
            items={exportItems}
            label="Download sitemap data"
            open={menuOpen}
            onToggle={() => { menuOpen = !menuOpen; }}
            onClose={() => { menuOpen = false; }}
          />
        {/if}
      </div>
    </div>

    <div class="sitemaps__body">
      {#if analysis.findings.length > 0}
        <div class="issues">
          {#each analysis.findings as f}
            <div class="issue">
              <span class="issue__dot issue__dot--{f.severity}" role="img" aria-label={severityLabel(f.severity)} title={severityLabel(f.severity)}></span>
              <span class="issue__msg">{f.message}</span>
            </div>
          {/each}
        </div>
      {/if}

      {#if rows.length > 0}
        <SearchField bind:value={query} placeholder="Search URLs across all sitemaps" clearLabel="Clear search">
          {#snippet trailing()}
            <button class="search__find" title="Search for the page open in this tab" onclick={findCurrentPage}>
              This page
            </button>
          {/snippet}
        </SearchField>
      {/if}

      {#if searchActive}
        {#if searching && !searchResult}
          <div class="search-status">
            <div class="empty-state__spinner"></div>
            <span>Searching {searchTargets.length} {searchTargets.length === 1 ? 'sitemap' : 'sitemaps'}…</span>
          </div>
        {:else if searchResult}
          <div class="search-results" class:search-results--stale={searching}>
            <div class="search-results__meta">
              {searchResult.total.toLocaleString()} {searchResult.total === 1 ? 'match' : 'matches'}
              {#if searchResult.total > searchResult.matches.length}
                &middot; showing first {searchResult.matches.length}
              {/if}
              {#if searchResult.truncated}
                &middot; some sitemaps exceeded the read limit, results may be partial
              {/if}
              {#if searchResult.failed.length > 0}
                &middot; {searchResult.failed.length} {searchResult.failed.length === 1 ? 'sitemap' : 'sitemaps'} could not be searched
              {/if}
            </div>
            {#each searchResult.matches as m (m.sitemap + m.url)}
              <div class="match">
                <a class="match__url" href={m.url} target="_blank" rel="noopener" title={m.url}>
                  {m.url.replace(/^https?:\/\//, '')}
                </a>
                <a class="match__sitemap" href={m.sitemap} target="_blank" rel="noopener" title="Open {sitemapFilename(m.sitemap)}">
                  {sitemapFilename(m.sitemap)}
                </a>
              </div>
            {/each}
            {#if searchResult.matches.length === 0}
              <div class="search-status search-status--empty">No sitemap URLs contain "{query.trim()}"</div>
            {/if}
          </div>
        {:else}
          <div class="search-status search-status--empty">Search failed: reload the tab and try again</div>
        {/if}
      {:else if rows.length > 0}
        <div class="sitemaps-table-wrap">
          <table class="table">
            <thead>
              <tr>
                <th class="th th--sitemap">
                  <SortHeader label="Sitemap" active={sortKey === 'name'} dir={sortDir} onclick={() => toggleSort('name')} title="Sort by name" />
                </th>
                <th class="th th--urls">
                  <SortHeader label="URLs" active={sortKey === 'urls'} dir={sortDir} onclick={() => toggleSort('urls')} title="Sort by URL count" />
                </th>
                <th class="th th--modified">
                  <SortHeader label="Modified" active={sortKey === 'modified'} dir={sortDir} onclick={() => toggleSort('modified')} title="Sort by last modified" />
                </th>
                <th class="th th--status">
                  <SortHeader label="Status" active={sortKey === 'status'} dir={sortDir} onclick={() => toggleSort('status')} title="Sort by status" />
                </th>
                <th class="th th--actions"><span class="visually-hidden">Actions</span></th>
              </tr>
            </thead>
            <tbody>
              {#each sortedRows as { node } (node.url)}
                {@const category = categorizeSitemap(node.url)}
                {@const name = sitemapFilename(node.url)}
                <tr
                  class="row"
                  class:row--failed={!node.ok}
                  title="Open {name}"
                  tabindex="0"
                  onclick={() => openRow(node)}
                  onkeydown={(e) => {
                    if (e.key === 'Enter' && e.target === e.currentTarget) openRow(node);
                  }}
                >
                  <td class="td">
                    <div class="sitemap-row">
                      <span class="sitemap-chip" style="background: {category.color}">{category.abbr}</span>
                      <span class="sitemap-name">{name}</span>
                    </div>
                  </td>
                  <td class="td td--urls-cell">
                    {#if node.ok}
                      <span class="url-count" title={node.truncated ? TRUNCATED_HINT : undefined}>
                        {node.urlCount.toLocaleString()}{node.truncated ? '+' : ''}
                      </span>
                    {:else}
                      <span class="url-count url-count--muted">&mdash;</span>
                    {/if}
                  </td>
                  <td class="td">{#if node.lastmod}{formatLastmod(node.lastmod)}{:else}&mdash;{/if}</td>
                  <td class="td td--status-cell">
                    {#if node.ok}
                      <span class="status-dot" role="img" aria-label="OK" title="OK"></span>
                    {:else}
                      <span class="pill pill--red" title={node.status === 0 ? 'Request failed' : `HTTP ${node.status}`}>
                        {node.status === 0 ? 'ERR' : node.status}
                      </span>
                    {/if}
                  </td>
                  <td class="td td--actions-cell">
                    <div class="row-actions">
                      <button
                        class="row-action"
                        class:row-action--copied={urlCopy.key === node.url}
                        title={urlCopy.key === node.url ? 'Copied' : 'Copy sitemap URL'}
                        onclick={(e) => {
                          e.stopPropagation();
                          copySitemapUrl(node);
                        }}
                      >
                        {#if urlCopy.key === node.url}
                          {@render checkIcon()}
                        {:else}
                          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round">
                            <rect x="9" y="9" width="13" height="13" rx="2" />
                            <path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" />
                          </svg>
                        {/if}
                      </button>
                      {#if node.ok}
                        <button
                          class="row-action"
                          class:row-action--copied={linksCopy.key === node.url}
                          class:row-action--pending={pendingLinksKey === node.url}
                          title={linksCopy.key === node.url ? 'Copied' : 'Copy all links in this sitemap'}
                          onclick={(e) => {
                            e.stopPropagation();
                            copySitemapLinks(node);
                          }}
                        >
                          {#if linksCopy.key === node.url}
                            {@render checkIcon()}
                          {:else}
                            {@render copyLinksIcon()}
                          {/if}
                        </button>
                      {:else}
                        <button
                          class="row-action row-action--disabled"
                          title="Copy all links in this sitemap (unavailable, sitemap failed to load)"
                          aria-disabled="true"
                          tabindex="-1"
                        >
                          {@render copyLinksIcon()}
                        </button>
                      {/if}
                    </div>
                  </td>
                </tr>
              {/each}
            </tbody>
            <tfoot>
              <tr>
                <td class="td">{analysis.totalSitemaps} {analysis.totalSitemaps === 1 ? 'sitemap' : 'sitemaps'}</td>
                <td class="td td--urls-cell">
                  <span title={anyTruncated ? TRUNCATED_HINT : undefined}>
                    {analysis.totalUrls.toLocaleString()}{anyTruncated ? '+' : ''}
                  </span>
                </td>
                <td class="td" colspan="3"></td>
              </tr>
            </tfoot>
          </table>
        </div>
      {/if}
    </div>
  </div>
{/if}

<style>
  .sitemaps-tab { display: flex; flex-direction: column; height: 100%; animation: fadeUp 0.4s ease both; }

  /* Empty / loading state */
  .empty-state { display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100%; gap: 8px; color: var(--text-muted); }
  .empty-state__icon { width: 28px; height: 28px; opacity: 0.3; stroke-width: 1.7; }
  .empty-state__spinner { width: 20px; height: 20px; border: 2px solid var(--border-strong); border-top-color: var(--accent); border-radius: 50%; animation: spin 0.8s linear infinite; }
  .empty-state p { font-size: 13px; margin: 0; }

  /* Header */
  .sitemaps__header { display: flex; align-items: center; justify-content: space-between; gap: 10px; padding: 14px 20px; border-bottom: 1px solid var(--border); flex-shrink: 0; }
  .sitemaps__title { font-size: 14px; font-weight: 600; color: var(--text); letter-spacing: -0.01em; }
  .sitemaps__subtitle { font-size: 11.5px; color: var(--text-muted); margin-top: 2px; }
  .sitemaps__actions { display: flex; gap: 6px; flex-shrink: 0; }

  .sitemaps__body { flex: 1; overflow-y: auto; overflow-x: hidden; }
  .sitemaps__body::-webkit-scrollbar { width: 3px; }
  .sitemaps__body::-webkit-scrollbar-thumb { background: var(--scrollbar); border-radius: 3px; }

  /* Banner (no-sitemap error state) */
  .banner { display: flex; align-items: center; gap: 12px; padding: 13px 16px; border-radius: 10px; margin: 20px 20px 0; }
  .banner--info { background: var(--accent-tint); border: 1px solid color-mix(in srgb, var(--accent) 15%, transparent); }
  .banner__icon { width: 30px; height: 30px; border-radius: 50%; display: flex; align-items: center; justify-content: center; flex-shrink: 0; background: var(--bg); color: var(--accent); }
  .banner__icon svg { width: 15px; height: 15px; stroke-width: 2.2; }
  .banner__title { font-size: 13.5px; font-weight: 600; color: var(--text); }
  .banner__sub { font-size: 12px; color: var(--text-muted); margin-top: 1px; }

  /* Findings — Robots-tab issues styling */
  .issues { display: flex; flex-direction: column; padding: 4px 20px 0; }
  .issue { display: flex; align-items: center; gap: 10px; padding: 8px 0; border-bottom: 1px solid var(--border-muted); font-size: 12.5px; color: var(--text-secondary); }
  .issue:last-child { border-bottom: none; }
  .issue__dot { width: 7px; height: 7px; border-radius: 50%; flex-shrink: 0; }
  .issue__dot--error { background: var(--error); }
  .issue__dot--warning { background: var(--warning); }
  .issue__dot--info { background: var(--text-faint); }
  .issue__msg { flex: 1; min-width: 0; }

  /* Search — same control as the Links tab */
  /* Right padding is 3px because the This-page button carries 7px of its own;
     3 + 7 keeps the text 10px from the edge, matching the icon on the left. */
  .search__find { flex-shrink: 0; padding: 2px 7px; border: none; background: none; cursor: pointer; font-family: inherit; font-size: 10.5px; font-weight: 600; white-space: nowrap; color: var(--text-muted); text-decoration: underline; text-underline-offset: 2px; border-radius: 4px; transition: all 0.12s; }
  .search__find:hover { color: var(--text); background: var(--bg-hover); }

  /* Search results */
  .search-status { display: flex; align-items: center; gap: 8px; padding: 16px 20px; font-size: 12.5px; color: var(--text-muted); }
  .search-status--empty { justify-content: center; padding: 24px 20px; }
  .search-results { padding: 4px 0 20px; }
  .search-results--stale { opacity: 0.6; }
  .search-results__meta { padding: 8px 20px; font-size: 11.5px; color: var(--text-muted); border-bottom: 1px solid var(--border); }
  .match { display: flex; align-items: center; gap: 10px; padding: 8px 20px; border-bottom: 1px solid var(--border-muted); transition: background 0.1s; }
  .match:hover { background: var(--bg-hover); }
  .match__url { flex: 1; min-width: 0; font-family: 'SF Mono', ui-monospace, monospace; font-size: 12px; color: var(--accent); text-decoration: none; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .match__url:hover { text-decoration: underline; }
  .match__sitemap { flex-shrink: 0; font-size: 10.5px; font-weight: 600; color: var(--text-muted); text-decoration: none; }
  .match__sitemap:hover { color: var(--text-secondary); text-decoration: underline; }

  /* Table — full-bleed rows like Links/Assets: no wrapper side padding, gutter
     lives on the edge cells so hover background spans the popup's full width */
  .sitemaps-table-wrap { padding: 6px 0 20px; }
  .th--sitemap { width: auto; }
  .th--urls { width: 92px; text-align: right; }
  .th--modified { width: 78px; }
  .th--status { width: 56px; text-align: right; }
  .th--actions { width: 82px; }

  .row { cursor: pointer; }
  .row:hover { background: var(--bg-hover); }
  .row--failed .td { color: var(--text-muted); }
  .td--urls-cell { text-align: right; }
  .td--status-cell { text-align: right; }

  .sitemap-row { display: flex; align-items: center; gap: 8px; min-width: 0; }
  .sitemap-chip { width: 18px; height: 18px; border-radius: 5px; display: flex; align-items: center; justify-content: center; color: #fff; font-size: 9px; font-weight: 700; flex-shrink: 0; }
  .sitemap-name { font-size: 12px; font-weight: 600; color: var(--text); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; min-width: 0; }
  .row:hover .sitemap-name { text-decoration: underline; text-decoration-color: var(--text); }
  .row--failed .sitemap-name { color: var(--text-muted); }

  .url-count { display: block; font-family: 'SF Mono', ui-monospace, monospace; font-size: 12px; font-weight: 600; color: var(--text); }
  .url-count--muted { color: var(--text-muted); font-weight: 400; }
  .status-dot { display: inline-block; width: 7px; height: 7px; border-radius: 50%; background: var(--success); }

  .pill { display: inline-flex; align-items: center; flex-shrink: 0; font-size: 10px; font-weight: 600; padding: 1px 7px; border-radius: 20px; white-space: nowrap; }
  .pill--red { background: var(--error-bg); color: var(--error-strong); }

  /* Row actions */
  .row-actions { display: flex; align-items: center; justify-content: flex-end; gap: 2px; }
  .row-action { display: inline-flex; align-items: center; justify-content: center; width: 26px; height: 26px; padding: 0; border-radius: 6px; border: 1px solid transparent; background: none; color: var(--text-muted); cursor: pointer; flex-shrink: 0; transition: all 0.12s; }
  /* The row underneath is already --bg-hover, so a plain gray wash would blend
     in; the lift surface + border reads as a small raised button instead. */
  .row-action:hover { background: var(--bg); border-color: var(--border-hover); color: var(--text); }
  .row-action svg { width: 14px; height: 14px; stroke-width: 1.8; }
  .row-action--disabled { opacity: 0.35; pointer-events: none; }
  .row-action--pending { opacity: 0.5; pointer-events: none; }
  .row-action--copied { color: var(--success); }
  .row-action--copied:hover { color: var(--success); background: none; border-color: transparent; box-shadow: none; }

  .table tfoot .td { border-bottom: none; border-top: 1px solid var(--border); font-weight: 600; color: var(--text-secondary); }

  .visually-hidden { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; }

  /* Export dropdown */

  @keyframes fadeUp {
    from { opacity: 0; transform: translateY(8px); }
    to { opacity: 1; transform: translateY(0); }
  }
  @keyframes spin { to { transform: rotate(360deg); } }
</style>
