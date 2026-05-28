<script lang="ts">
  import type { RawLink } from './types';
  import { highlightLinks, scrollToLink } from './utils';
  import { trackAction } from '@/utils/analytics';
  import { untrack, onDestroy } from 'svelte';

  let { links, domain }: { links: RawLink[]; domain: string | null } = $props();

  const siteSlug = $derived(domain?.replace(/^www\./, '').replace(/[^a-z0-9]+/gi, '-').replace(/-+$/, '') ?? 'site');

  let tracked = false;
  $effect(() => {
    if (tracked || links.length === 0) return;
    tracked = true;
    untrack(() => {
      trackAction('links_view', { link_count: links.length, external_count: links.filter(l => l.isExternal).length, nofollow_count: links.filter(l => l.isNofollow).length });
    });
  });

  type Filter = 'all' | 'internal' | 'external' | 'dofollow' | 'nofollow';
  let activeFilter = $state<Filter>('all');
  let search = $state('');
  let searchOpen = $state(false);
  let dropdownOpen = $state(false);
  let exportOpen = $state(false);
  let highlightOn = $state(false);
  let searchInput = $state<HTMLInputElement | null>(null);

  function toggleSearch() {
    searchOpen = !searchOpen;
    if (!searchOpen) search = '';
    else setTimeout(() => searchInput?.focus(), 0);
  }

  function closeDropdowns() {
    dropdownOpen = false;
    exportOpen = false;
  }

  function handleWindowClick(e: MouseEvent) {
    const target = e.target as HTMLElement;
    if (!target.closest('.dropdown')) dropdownOpen = false;
    if (!target.closest('.export')) exportOpen = false;
  }

  const stats = $derived.by(() => {
    let internal = 0, external = 0, dofollow = 0, nofollow = 0;
    const counts: Record<string, number> = {};
    for (const l of links) {
      if (l.isExternal) external++; else internal++;
      if (l.isNofollow) nofollow++; else dofollow++;
      counts[l.href] = (counts[l.href] ?? 0) + 1;
    }
    return { total: links.length, internal, external, dofollow, nofollow, hrefCounts: counts };
  });

  const filtered = $derived.by(() => {
    const q = search.toLowerCase();
    return links.filter(link => {
      if (activeFilter === 'internal' && link.isExternal) return false;
      if (activeFilter === 'external' && !link.isExternal) return false;
      if (activeFilter === 'dofollow' && link.isNofollow) return false;
      if (activeFilter === 'nofollow' && !link.isNofollow) return false;
      if (q && !link.href.toLowerCase().includes(q) && !link.text.toLowerCase().includes(q)) return false;
      return true;
    });
  });

  function displayUrl(link: RawLink): string {
    try {
      const url = new URL(link.href);
      if (!link.isExternal) {
        const path = url.pathname + url.search + url.hash;
        return path || '/';
      }
      const host = url.hostname.replace(/^www\./, '');
      const rest = url.pathname + url.search + url.hash;
      if (rest === '/') return host;
      return host + rest;
    } catch {
      return link.href;
    }
  }

  function toggleHighlight() {
    highlightOn = !highlightOn;
    highlightLinks(highlightOn);
    trackAction('links_highlight', { enabled: highlightOn });
  }

  onDestroy(() => {
    if (highlightOn) highlightLinks(false);
  });

  function handleRowClick(e: MouseEvent, index: number) {
    if ((e.target as HTMLElement).closest('a')) return;
    scrollToLink(index);
    trackAction('links_scroll_to', {});
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
    const header = 'URL,Anchor Text,Dofollow,Type,Rel,Is Image';
    const rows = links.map(l => {
      const anchor = l.isImage ? '[image]' : l.text;
      return [l.href, anchor, !l.isNofollow, l.isExternal ? 'External' : 'Internal', l.rel, l.isImage]
        .map(v => `"${String(v).replace(/"/g, '""')}"`)
        .join(',');
    });
    downloadFile([header, ...rows].join('\n'), `alfred-links-${siteSlug}.csv`, 'text/csv');
    trackAction('links_export', { format: 'csv', link_count: links.length });
    exportOpen = false;
  }

  function exportJson() {
    const data = links.map(l => ({
      url: l.href,
      anchorText: l.isImage ? '[image]' : l.text,
      dofollow: !l.isNofollow,
      type: l.isExternal ? 'external' : 'internal',
      rel: l.rel,
      isImage: l.isImage,
    }));
    downloadFile(JSON.stringify(data, null, 2), `alfred-links-${siteSlug}.json`, 'application/json');
    trackAction('links_export', { format: 'json', link_count: links.length });
    exportOpen = false;
  }

  function exportText() {
    const text = links.map(l => l.href).join('\n');
    downloadFile(text, `alfred-links-${siteSlug}.txt`, 'text/plain');
    trackAction('links_export', { format: 'text', link_count: links.length });
    exportOpen = false;
  }

  function setFilter(f: Filter) {
    activeFilter = f;
    trackAction('links_filter', { filter: f });
  }

  const filters: { id: Filter; label: string }[] = [
    { id: 'all', label: 'All' },
    { id: 'dofollow', label: 'Dofollow' },
    { id: 'nofollow', label: 'Nofollow' },
    { id: 'internal', label: 'Internal' },
    { id: 'external', label: 'External' },
  ];
</script>

<svelte:window onclick={handleWindowClick} onkeydown={(e) => { if (e.key === 'Escape') closeDropdowns(); }} />

{#if links.length === 0}
  <div class="empty-state">
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" class="empty-state__icon"><path d="M10 13a5 5 0 007.54.54l3-3a5 5 0 00-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 00-7.54-.54l-3 3a5 5 0 007.07 7.07l1.71-1.71"/></svg>
    <p>No links found on this page</p>
  </div>
{:else}
  <div class="links-tab">
    <!-- Toolbar -->
    <div class="toolbar">
      <div class="toolbar__row">
        <div class="dropdown">
          <button class="dropdown__trigger" onclick={() => { dropdownOpen = !dropdownOpen; exportOpen = false; }}>
            {filters.find(f => f.id === activeFilter)!.label}
            <span class="dropdown__count">{stats[activeFilter === 'all' ? 'total' : activeFilter]}</span>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" class="dropdown__chevron"><path d="M6 9l6 6 6-6"/></svg>
          </button>
          {#if dropdownOpen}
            <div class="dropdown__menu">
              {#each filters as f}
                <button class="dropdown__item" class:dropdown__item--active={activeFilter === f.id} onclick={() => { setFilter(f.id); dropdownOpen = false; }}>
                  {f.label}
                  <span class="dropdown__item-count">{stats[f.id === 'all' ? 'total' : f.id]}</span>
                </button>
              {/each}
            </div>
          {/if}
        </div>
        <div class="toolbar__actions">
          <button class="toolbar-btn" class:toolbar-btn--active={highlightOn} onclick={toggleHighlight} title="Highlight links on page">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
            Highlight
          </button>
          <button class="toolbar-btn" class:toolbar-btn--active={searchOpen} onclick={toggleSearch} title="Search links">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round"><circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/></svg>
            Search
          </button>
          <div class="export">
            <button class="export__trigger" onclick={() => { exportOpen = !exportOpen; dropdownOpen = false; }} title="Download links">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" class="export__icon"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
              Export
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" class="export__chevron"><path d="M6 9l6 6 6-6"/></svg>
            </button>
            {#if exportOpen}
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
              </div>
            {/if}
          </div>
        </div>
      </div>
      {#if searchOpen}
        <div class="search">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" class="search__icon"><circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/></svg>
          <input class="search__input" type="text" placeholder="Filter URLs or anchor text..." bind:value={search} bind:this={searchInput} />
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
            <th class="th th--num">#</th>
            <th class="th th--url">Target URL <span class="th__count">({filtered.length}/{stats.total})</span></th>
            <th class="th th--follow">Dofollow</th>
            <th class="th th--type">Type</th>
          </tr>
        </thead>
        <tbody>
          {#each filtered as link, i (link.index)}
            <tr class="row" onclick={(e) => handleRowClick(e, link.index)} title="Click to scroll to this link">
              <td class="td td--num">{i + 1}</td>
              <td class="td td--url">
                <div class="url-row">
                  <a href={link.href} target="_blank" rel="noopener noreferrer" class="url" title={link.href}>{displayUrl(link)}</a>
                  {#if stats.hrefCounts[link.href]! > 1}
                    <span class="dup-badge">&times;{stats.hrefCounts[link.href]}</span>
                  {/if}
                </div>
                {#if link.isImage}
                  <span class="anchor-text anchor-text--image">[image]</span>
                {:else if link.text}
                  <span class="anchor-text">{link.text}</span>
                {:else}
                  <span class="anchor-text anchor-text--empty">(no anchor text)</span>
                {/if}
              </td>
              <td class="td td--follow">
                {#if link.isNofollow}
                  <span class="pill pill--red">No</span>
                {:else}
                  <span class="pill pill--green">Yes</span>
                {/if}
              </td>
              <td class="td td--type">{link.isExternal ? 'External' : 'Internal'}</td>
            </tr>
          {/each}
        </tbody>
      </table>
      {#if filtered.length === 0}
        <div class="no-results">No links match this filter</div>
      {/if}
    </div>

  </div>
{/if}

<style>
  .links-tab { display: flex; flex-direction: column; height: 100%; animation: fadeUp 0.4s ease both; }

  /* Empty state */
  .empty-state { display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100%; gap: 8px; color: var(--text-muted); }
  .empty-state__icon { width: 28px; height: 28px; opacity: 0.3; stroke-width: 1.7; }
  .empty-state p { font-size: 13px; margin: 0; }

  /* Toolbar */
  .toolbar { display: flex; flex-direction: column; border-bottom: 1px solid var(--border); flex-shrink: 0; }
  .toolbar__row { display: flex; align-items: center; justify-content: space-between; padding: 10px 20px; }

  /* Dropdown */
  .dropdown { position: relative; }
  .dropdown__trigger { display: flex; align-items: center; gap: 4px; padding: 4px 10px; border-radius: 6px; border: 1px solid var(--border-strong); background: var(--bg); font-family: inherit; font-size: 12.5px; font-weight: 600; color: var(--text); cursor: pointer; transition: all 0.12s; }
  .dropdown__trigger:hover { border-color: var(--border-hover); }
  .dropdown__count { color: var(--text-muted); font-weight: 500; }
  .dropdown__chevron { width: 12px; height: 12px; stroke-width: 2; color: var(--text-muted); }
  .dropdown__menu { position: absolute; top: calc(100% + 4px); left: 0; background: var(--bg); border: 1px solid var(--border-strong); border-radius: 8px; box-shadow: 0 4px 16px rgba(0, 0, 0, 0.08); z-index: 10; min-width: 160px; padding: 4px; }
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
  .export__menu { position: absolute; top: calc(100% + 4px); right: 0; background: var(--bg); border: 1px solid var(--border-strong); border-radius: 8px; box-shadow: 0 4px 16px rgba(0, 0, 0, 0.08); z-index: 10; min-width: 150px; padding: 4px; }
  .export__item { display: flex; align-items: center; justify-content: space-between; width: 100%; padding: 6px 10px; border: none; background: none; font-family: inherit; font-size: 12px; cursor: pointer; border-radius: 5px; transition: background 0.1s; }
  .export__item:hover { background: var(--bg-hover); }
  .export__item-label { font-weight: 600; color: var(--text); }
  .export__item-desc { font-size: 11px; color: var(--text-muted); }

  /* Toolbar buttons */
  .toolbar-btn { display: flex; align-items: center; gap: 4px; padding: 0 8px; height: 28px; border-radius: 6px; border: 1px solid var(--border-strong); background: var(--bg); font-family: inherit; font-size: 11px; font-weight: 600; color: var(--text-muted); cursor: pointer; transition: all 0.12s; }
  .toolbar-btn:hover { border-color: var(--border-hover); color: var(--text-secondary); }
  .toolbar-btn--active { background: var(--btn-bg); color: var(--btn-text); border-color: var(--btn-bg); }
  .toolbar-btn--active:hover { background: var(--btn-bg-hover); border-color: var(--btn-bg-hover); color: var(--btn-text); }
  .toolbar-btn svg { width: 13px; height: 13px; stroke-width: 1.8; flex-shrink: 0; }

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

  .th { text-align: left; font-size: 10.5px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.04em; color: var(--text-label); padding: 8px 8px 8px 0; border-bottom: 1px solid var(--border); position: sticky; top: 0; background: var(--bg); z-index: 1; }
  .th--num { width: 30px; padding-right: 0; }
  .th--follow { width: 76px; }
  .th--type { width: 76px; }
  .th__count { font-weight: 500; color: var(--text-muted); letter-spacing: 0; text-transform: none; }

  .row { cursor: pointer; transition: background 0.1s; }
  .row:hover { background: var(--bg-hover); }

  .td { padding: 9px 8px 9px 0; color: var(--text-secondary); border-bottom: 1px solid var(--border-muted); vertical-align: middle; }
  .td--num { color: var(--text-muted); font-size: 12px; padding-right: 0; }
  .td--url { overflow: hidden; }

  .url-row { display: flex; align-items: center; gap: 6px; min-width: 0; }
  .url { color: var(--accent); text-decoration: none; font-family: 'SF Mono', ui-monospace, monospace; font-size: 12px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; min-width: 0; }
  .url:hover { text-decoration: underline; }
  .dup-badge { flex-shrink: 0; font-size: 10px; font-weight: 600; padding: 0 5px; border-radius: 8px; line-height: 16px; background: var(--warning-bg); color: var(--warning); }

  .anchor-text { display: block; font-size: 11.5px; color: var(--text-secondary); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; margin-top: 1px; }
  .anchor-text--empty { color: var(--error); font-style: italic; }
  .anchor-text--image { color: var(--text-muted); font-style: italic; }

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
