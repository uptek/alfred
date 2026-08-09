<script lang="ts">
  import type { LinkKind, RawLink, LinkStatusResult } from './utils/types';
  import { followRank, isDofollow, highlightLinks, scrollToLink, checkLinkStatus, summarizeLinks } from './utils/links';
  import { isNavigable } from './utils/url';
  import { csvField, downloadFile, siteSlug as siteSlugOf } from './utils/format';
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
  import { SvelteMap } from 'svelte/reactivity';
  import { getTabState } from './stores/tabState.svelte';

  let { links, domain }: { links: RawLink[]; domain: string | null } = $props();

  const siteSlug = $derived(siteSlugOf(domain ?? undefined));

  trackOnce(
    () => links.length > 0,
    () => trackAction('links_view', { link_count: links.length, external_count: links.filter(l => l.kind === 'external').length, nofollow_count: links.filter(l => l.isNofollow).length })
  );

  type SortKey = 'index' | 'url' | 'follow' | 'type' | 'status';

  interface LinksPersisted {
    statuses: [string, LinkStatusResult][];
    typeFilter: string;
    followFilter: string;
    anchorFilter: string;
    statusFilter: string;
    showHidden: boolean;
    search: string;
    searchOpen: boolean;
    highlightOn: boolean;
    sortKey: SortKey;
    sortDir: 'asc' | 'desc';
  }

  const tabState = getTabState();
  const restored = tabState.getSection<LinksPersisted>('links');

  let typeFilter = $state(restored?.typeFilter ?? 'all');
  let followFilter = $state(restored?.followFilter ?? 'all');
  let anchorFilter = $state(restored?.anchorFilter ?? 'all');
  let statusFilter = $state(restored?.statusFilter ?? 'all');
  let showHidden = $state(restored?.showHidden ?? true);
  let search = $state(restored?.search ?? '');
  let searchOpen = $state(restored?.searchOpen ?? false);

  let sortKey = $state<SortKey>(restored?.sortKey ?? 'index');
  let sortDir = $state<'asc' | 'desc'>(restored?.sortDir ?? 'asc');

  const copyFeedback = createCopyFeedback();
  let highlightOn = $state(restored?.highlightOn ?? false);

  // onDestroy strips the on-page outlines when the popup closes, so re-apply them
  // if the restored state had highlighting on.
  onMount(() => {
    if (highlightOn) highlightLinks(true);
  });

  // On-demand HTTP status, keyed by href so duplicate links share one result.
  // Seeded from the per-tab cache so a prior scan survives reopening the popup.
  const statuses = new SvelteMap<string, LinkStatusResult>(restored?.statuses ?? []);
  let checking = $state(false);
  let checkDone = $state(0);
  let checkTotal = $state(0);
  let checkRun = 0; // bumped to cancel an in-flight sweep (unmount or re-run)

  // Serialize the status map only when it actually changes, so high-frequency
  // filter/search edits below don't re-spread the whole map every keystroke.
  const statusEntries = $derived([...statuses]);

  // Mirror the persisted slice into the per-tab cache whenever it changes (the
  // store debounces the write), so the scan, filters, and sort survive the popup
  // closing and reopening on the same page.
  $effect(() => {
    tabState.saveSection('links', {
      statuses: statusEntries,
      typeFilter,
      followFilter,
      anchorFilter,
      statusFilter,
      showHidden,
      search,
      searchOpen,
      highlightOn,
      sortKey,
      sortDir
    });
  });

  // A finished scan is the costly result worth keeping; persist it immediately
  // (not on the debounce) so closing the popup right after can't drop it.
  $effect(() => {
    if (!checking) tabState.flushNow();
  });

  // A new page (links prop reassigned) invalidates prior results: cancel any
  // in-flight sweep and clear the map so stale statuses can't color new rows.
  // svelte-ignore state_referenced_locally
  let trackedLinks = links;
  $effect(() => {
    if (links === trackedLinks) return;
    trackedLinks = links;
    checkRun++;
    checking = false;
    checkDone = 0;
    checkTotal = 0;
    statuses.clear();
    // The Status facet hides once results are gone, so a lingering status filter
    // would silently empty the table with no visible control to undo it.
    statusFilter = 'all';
  });

  // HEAD-first checks minimise side effects, but auto-firing every link could
  // still hit side-effecting GET endpoints, so this stays an explicit action.
  async function checkStatuses() {
    if (checking) return;
    // Fragments are never sent in HTTP requests, so /page#a and /page#b hit the
    // same resource. Probe each target once and fan the result to every variant.
    const variantsByTarget = new Map<string, string[]>();
    for (const l of links) {
      if (l.kind !== 'internal' && l.kind !== 'external') continue;
      const target = l.href.split('#')[0]!;
      const variants = variantsByTarget.get(target);
      if (variants) variants.push(l.href);
      else variantsByTarget.set(target, [l.href]);
    }
    const urls = [...variantsByTarget.keys()];
    if (urls.length === 0) return;
    const run = ++checkRun;
    checking = true;
    checkTotal = urls.length;
    checkDone = 0;
    trackAction('links_check_status', { count: urls.length });

    // Batch results into the SvelteMap on a timer rather than per-result: the
    // stats/summary/sorted deriveds each scan all links, so writing once per
    // result is O(n^2) on large pages. Flushing periodically caps recomputes.
    const pending: Array<[string, LinkStatusResult]> = [];
    let done = 0;
    let flushTimer: ReturnType<typeof setTimeout> | null = null;
    const flush = () => {
      flushTimer = null;
      if (run !== checkRun) return;
      for (const [url, res] of pending) statuses.set(url, res);
      pending.length = 0;
      checkDone = done;
    };
    const scheduleFlush = () => {
      if (flushTimer === null) flushTimer = setTimeout(flush, 150);
    };

    let next = 0;
    const worker = async () => {
      // eslint-disable-next-line no-unmodified-loop-condition
      while (next < urls.length && run === checkRun) {
        const url = urls[next++];
        const res = await checkLinkStatus(url);
        if (run !== checkRun) return;
        for (const href of variantsByTarget.get(url)!) pending.push([href, res]);
        done++;
        scheduleFlush();
        // Most links share one origin, so back-to-back bursts trip rate limits.
        // Space requests out with jitter; correctness matters more than speed here.
        if (next < urls.length) await new Promise((r) => setTimeout(r, 180 + Math.random() * 160));
      }
    };
    // Low concurrency on purpose: 4 connections to a single host is polite enough
    // to avoid 429s on Cloudflare-fronted stores while still finishing quickly.
    const pool = Math.min(4, urls.length);
    await Promise.all(Array.from({ length: pool }, worker));
    if (flushTimer !== null) clearTimeout(flushTimer);
    flush();
    if (run === checkRun) checking = false;
  }

  function statusLabel(s: LinkStatusResult): string {
    if (s.bucket === 'redirect') return s.status > 0 ? String(s.status) : '3xx';
    if (s.bucket === 'error') return 'err';
    return String(s.status);
  }

  function statusTitle(s: LinkStatusResult): string {
    switch (s.bucket) {
      case 'ok': return `HTTP ${s.status} OK`;
      case 'redirect': return 'Redirects (3xx): exact code is not exposed to extensions';
      case 'client-error': return `HTTP ${s.status}: client error`;
      case 'server-error': return `HTTP ${s.status}: server error`;
      default: return 'Unreachable, blocked, or timed out (may differ for a real visitor)';
    }
  }

  const stats = $derived.by(() => {
    let internal = 0, external = 0, other = 0, dofollow = 0, nofollow = 0, sponsored = 0, ugc = 0,
      image = 0, text = 0, none = 0, hidden = 0;
    let statusOk = 0, statusRedirect = 0, statusFailing = 0;
    const counts: Record<string, number> = {};
    for (const l of links) {
      if (l.kind === 'internal') internal++; else if (l.kind === 'external') external++; else other++;
      if (l.isNofollow) nofollow++;
      if (l.isSponsored) sponsored++;
      if (l.isUgc) ugc++;
      if (isDofollow(l)) dofollow++;
      if (l.isImage) image++;
      if (l.text !== '') text++; else none++;
      if (l.isHidden) hidden++;
      counts[l.href] = (counts[l.href] ?? 0) + 1;
      const st = statuses.get(l.href);
      if (st) {
        if (st.bucket === 'ok') statusOk++;
        else if (st.bucket === 'redirect') statusRedirect++;
        else statusFailing++;
      }
    }
    return { total: links.length, internal, external, other, dofollow, nofollow, sponsored, ugc, image, text, none, hidden, statusOk, statusRedirect, statusFailing, hrefCounts: counts };
  });

  // Lowercased searchable text per link, built once per list (not per keystroke).
  const haystacks = $derived(new Map(links.map((l) => [l.index, `${l.href} ${l.text}`.toLowerCase()])));

  const filtered = $derived.by(() => {
    const q = search.toLowerCase();
    return links.filter(link => {
      if (typeFilter === 'internal' && link.kind !== 'internal') return false;
      if (typeFilter === 'external' && link.kind !== 'external') return false;
      if (typeFilter === 'other' && (link.kind === 'internal' || link.kind === 'external')) return false;
      if (followFilter === 'dofollow' && !isDofollow(link)) return false;
      if (followFilter === 'nofollow' && !link.isNofollow) return false;
      if (followFilter === 'sponsored' && !link.isSponsored) return false;
      if (followFilter === 'ugc' && !link.isUgc) return false;
      if (anchorFilter === 'text' && link.text === '') return false;
      if (anchorFilter === 'image' && !link.isImage) return false;
      if (anchorFilter === 'none' && link.text !== '') return false;
      if (statusFilter !== 'all') {
        const bucket = statuses.get(link.href)?.bucket;
        if (statusFilter === 'failing') {
          if (bucket !== 'client-error' && bucket !== 'server-error' && bucket !== 'error') return false;
        } else if (bucket !== statusFilter) return false;
      }
      if (!showHidden && link.isHidden) return false;
      if (q && !(haystacks.get(link.index) ?? '').includes(q)) return false;
      return true;
    });
  });

  const KIND_RANK: Record<LinkKind, number> = { internal: 0, external: 1, mailto: 2, tel: 3, other: 4 };

  // Worst-first when ascending, so a status sort surfaces problems. Unchecked
  // and non-http links (no result) sort to the end.
  const STATUS_RANK: Record<LinkStatusResult['bucket'], number> = { error: 0, 'server-error': 1, 'client-error': 2, redirect: 3, ok: 4 };
  const UNSCANNED_RANK = 5;
  const statusRank = (l: RawLink) => {
    const b = statuses.get(l.href)?.bucket;
    return b ? STATUS_RANK[b] : UNSCANNED_RANK;
  };

  const summaryItems = $derived(summarizeLinks(filtered, statuses));

  const sorted = $derived.by(() => {
    const dir = sortDir === 'asc' ? 1 : -1;
    return [...filtered].sort((a, b) => {
      let cmp = 0;
      switch (sortKey) {
        case 'url': cmp = a.href.localeCompare(b.href); break;
        case 'follow': cmp = followRank(a) - followRank(b); break;
        case 'type': cmp = KIND_RANK[a.kind] - KIND_RANK[b.kind]; break;
        case 'status': {
          const ra = statusRank(a), rb = statusRank(b);
          // Unscanned / non-http rows have no status: keep them last in both directions.
          if ((ra === UNSCANNED_RANK) !== (rb === UNSCANNED_RANK)) return ra === UNSCANNED_RANK ? 1 : -1;
          cmp = ra - rb;
          break;
        }
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
      sortDir = 'asc';
    }
    trackAction('links_sort', { key, dir: sortDir });
  }

  function displayUrl(link: RawLink): string {
    if (link.kind !== 'internal' && link.kind !== 'external') return link.href;
    try {
      const url = new URL(link.href);
      if (link.kind === 'internal') {
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

  function kindLabel(kind: LinkKind): string {
    switch (kind) {
      case 'internal': return 'Internal';
      case 'external': return 'External';
      case 'mailto': return 'Mailto';
      case 'tel': return 'Tel';
      default: return 'Other';
    }
  }

  function toggleHidden() {
    showHidden = !showHidden;
    trackAction('links_toggle_hidden', { show_hidden: showHidden });
  }

  function toggleHighlight() {
    highlightOn = !highlightOn;
    highlightLinks(highlightOn);
    trackAction('links_highlight', { enabled: highlightOn });
  }

  onDestroy(() => {
    if (highlightOn) highlightLinks(false);
    checkRun++; // stop any in-flight status sweep
  });

  function handleRowClick(e: MouseEvent, index: number) {
    if ((e.target as HTMLElement).closest('a')) return;
    scrollToLink(index);
    trackAction('links_scroll_to', {});
  }

  function exportCsv() {
    const header = 'URL,Anchor Text,Type,Dofollow,Rel,Is Image,Is Hidden,Insecure HTTP,Broken Anchor,Status Code,Status';
    const rows = links.map(l => {
      const st = statuses.get(l.href);
      return [l.href, l.text, l.kind, isDofollow(l), l.rel, l.isImage, l.isHidden, l.isInsecure, l.isBrokenAnchor, st && st.status > 0 ? st.status : '', st?.bucket ?? '']
        .map(csvField)
        .join(',');
    });
    downloadFile(withCsvCredit([header, ...rows].join('\n')), `alfred-links-${siteSlug}.csv`, 'text/csv');
    trackAction('links_export', { format: 'csv', link_count: links.length });
  }

  function exportJson() {
    const data = links.map(l => {
      const st = statuses.get(l.href);
      return {
        url: l.href,
        anchorText: l.text,
        type: l.kind,
        dofollow: isDofollow(l),
        rel: l.rel,
        isImage: l.isImage,
        isHidden: l.isHidden,
        isInsecure: l.isInsecure,
        isBrokenAnchor: l.isBrokenAnchor,
        statusCode: st && st.status > 0 ? st.status : null,
        status: st?.bucket ?? null,
      };
    });
    downloadFile(JSON.stringify(data, null, 2), `alfred-links-${siteSlug}.json`, 'application/json');
    trackAction('links_export', { format: 'json', link_count: links.length });
  }

  function exportText() {
    const text = links.map(l => l.href).join('\n');
    downloadFile(text, `alfred-links-${siteSlug}.txt`, 'text/plain');
    trackAction('links_export', { format: 'text', link_count: links.length });
  }

  async function copyUrls() {
    const text = links.map(l => l.href).join('\n');
    if (await copyFeedback.copy(text)) trackAction('links_copy', { format: 'urls', link_count: links.length });
  }

  const typeOptions = $derived([
    { value: 'all', label: 'All', count: stats.total },
    { value: 'internal', label: 'Internal', count: stats.internal },
    { value: 'external', label: 'External', count: stats.external },
    ...(stats.other > 0 ? [{ value: 'other', label: 'Other', count: stats.other }] : []),
  ]);
  const followOptions = $derived([
    { value: 'all', label: 'All', count: stats.total },
    { value: 'dofollow', label: 'Dofollow', count: stats.dofollow },
    { value: 'nofollow', label: 'Nofollow', count: stats.nofollow },
    ...(stats.sponsored > 0 ? [{ value: 'sponsored', label: 'Sponsored', count: stats.sponsored }] : []),
    ...(stats.ugc > 0 ? [{ value: 'ugc', label: 'UGC', count: stats.ugc }] : []),
  ]);
  const anchorOptions = $derived([
    { value: 'all', label: 'All', count: stats.total },
    { value: 'text', label: 'Text', count: stats.text },
    { value: 'image', label: 'Image', count: stats.image },
    { value: 'none', label: 'None', count: stats.none },
  ]);
  // The Status facet only appears once a check has run, so its counts reflect
  // resolved links rather than dangling zeros.
  const hasChecked = $derived(statuses.size > 0);
  const statusOptions = $derived([
    { value: 'all', label: 'All', count: stats.statusOk + stats.statusRedirect + stats.statusFailing },
    { value: 'ok', label: 'OK', count: stats.statusOk },
    { value: 'redirect', label: 'Redirect', count: stats.statusRedirect },
    { value: 'failing', label: 'Failing', count: stats.statusFailing },
  ]);

  const anyFilterActive = $derived(typeFilter !== 'all' || followFilter !== 'all' || anchorFilter !== 'all' || statusFilter !== 'all' || !showHidden || search.length > 0);

  function setType(v: string) { typeFilter = v; trackAction('links_filter', { facet: 'type', value: v }); }
  function setFollow(v: string) { followFilter = v; trackAction('links_filter', { facet: 'follow', value: v }); }
  function setAnchor(v: string) { anchorFilter = v; trackAction('links_filter', { facet: 'anchor', value: v }); }
  function setStatus(v: string) { statusFilter = v; trackAction('links_filter', { facet: 'status', value: v }); }

  const facets = $derived<Facet[]>([
    { key: 'type', name: 'Type', options: typeOptions, selected: typeFilter, onSelect: setType },
    { key: 'follow', name: 'Follow', options: followOptions, selected: followFilter, onSelect: setFollow },
    { key: 'anchor', name: 'Anchor', options: anchorOptions, selected: anchorFilter, onSelect: setAnchor },
    ...(hasChecked ? [{ key: 'status', name: 'Status', options: statusOptions, selected: statusFilter, onSelect: setStatus }] : []),
  ]);

  const exportItems = $derived<ExportItem[]>([
    { label: 'CSV', desc: 'All fields', onClick: exportCsv },
    { label: 'JSON', desc: 'All fields', onClick: exportJson },
    { label: 'Text', desc: 'URLs only', onClick: exportText },
    { label: copyFeedback.copied ? 'Copied!' : 'Copy', desc: 'URLs only', onClick: copyUrls, keepOpen: true, dividerBefore: true },
  ]);

  function resetFilters() {
    typeFilter = 'all';
    followFilter = 'all';
    anchorFilter = 'all';
    statusFilter = 'all';
    showHidden = true;
    search = '';
    searchOpen = false;
    trackAction('links_filter', { reset: true });
  }
</script>

{#if links.length === 0}
  <div class="empty-state">
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" class="empty-state__icon"><path d="M10 13a5 5 0 007.54.54l3-3a5 5 0 00-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 00-7.54-.54l-3 3a5 5 0 007.07 7.07l1.71-1.71"/></svg>
    <p>No links found on this page</p>
  </div>
{:else}
  <div class="links-tab">
    {#snippet actions()}
      {#if stats.hidden > 0}
        <ToolbarButton active={!showHidden} onclick={toggleHidden} title={showHidden ? `Exclude ${stats.hidden} hidden links` : `Show ${stats.hidden} hidden links`}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round"><path d="M17.94 17.94A10.07 10.07 0 0112 20c-7 0-11-8-11-8a18.45 18.45 0 015.06-5.94M9.9 4.24A9.12 9.12 0 0112 4c7 0 11 8 11 8a18.5 18.5 0 01-2.16 3.19m-6.72-1.07a3 3 0 11-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>
          {stats.hidden}
        </ToolbarButton>
      {/if}
      <ToolbarButton active={highlightOn} onclick={toggleHighlight} ariaLabel="Highlight links on page" title="Highlight links on page">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"><path d="m9 11-6 6v3h9l3-3"/><path d="m22 12-4.6 4.6a2 2 0 0 1-2.8 0l-5.2-5.2a2 2 0 0 1 0-2.8L14 4"/></svg>
      </ToolbarButton>
    {/snippet}

    <TableToolbar
      {facets}
      {anyFilterActive}
      {exportItems}
      {actions}
      onReset={resetFilters}
      exportLabel="Download links"
      searchLabel="Search links"
      searchPlaceholder="Filter URLs or anchor text..."
      bind:search
      bind:searchOpen
    />

    <!-- Table -->
    <div class="table-wrap">
      <table class="table">
        <thead>
          <tr>
            <th class="th th--num"><SortHeader label="#" active={sortKey === 'index'} dir={sortDir} onclick={() => toggleSort('index')} title="Sort by document order" /></th>
            <th class="th th--url"><SortHeader label="Target URL" active={sortKey === 'url'} dir={sortDir} onclick={() => toggleSort('url')} title="Sort by URL" /> <span class="th__count">({filtered.length}/{stats.total})</span></th>
            <th class="th th--follow"><SortHeader label="Dofollow" active={sortKey === 'follow'} dir={sortDir} onclick={() => toggleSort('follow')} title="Sort by dofollow" /></th>
            <th class="th th--type"><SortHeader label="Type" active={sortKey === 'type'} dir={sortDir} onclick={() => toggleSort('type')} title="Sort by type" /></th>
            <th class="th th--status">
              <span class="check-head">
                <SortHeader label="Status" active={sortKey === 'status'} dir={sortDir} onclick={() => toggleSort('status')} title="Sort by status" />
                <button class="check-action" onclick={checkStatuses} disabled={checking} aria-label="Check link status" title={checking ? `Checking ${checkDone}/${checkTotal}…` : hasChecked ? 'Re-check link status' : 'Check link status (HEAD request, advisory)'}>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" class:spin={checking}><path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"/><path d="M21 3v5h-5"/><path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16"/><path d="M3 21v-5h5"/></svg>
                </button>
              </span>
            </th>
          </tr>
        </thead>
        <tbody>
          {#each sorted as link, i (link.index)}
            {@const status = statuses.get(link.href)}
            <tr class="row" class:row--hidden={link.isHidden} onclick={(e) => handleRowClick(e, link.index)} title={link.isHidden ? 'Hidden via CSS' : 'Click to scroll to this link'}>
              <td class="td td--num">{i + 1}</td>
              <td class="td td--url">
                <div class="url-row">
                  {#if isNavigable(link.href)}
                    <a href={link.href} target="_blank" rel="noopener noreferrer" class="url" title={link.href}>{displayUrl(link)}</a>
                  {:else}
                    <span class="url url--inert" title="{link.href}&#10;&#10;Not openable from the popup">{displayUrl(link)}</span>
                  {/if}
                  {#if stats.hrefCounts[link.href]! > 1}
                    <span class="dup-badge">&times;{stats.hrefCounts[link.href]}</span>
                  {/if}
                  {#if link.isInsecure}
                    <span class="flag flag--amber" title="Insecure plain-http link">http</span>
                  {/if}
                  {#if link.isBrokenAnchor}
                    <span class="flag flag--red" title="No element on this page matches the #fragment">broken #</span>
                  {/if}
                  {#if link.isHidden}
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" class="hidden-icon"><path d="M17.94 17.94A10.07 10.07 0 0112 20c-7 0-11-8-11-8a18.45 18.45 0 015.06-5.94M9.9 4.24A9.12 9.12 0 0112 4c7 0 11 8 11 8a18.5 18.5 0 01-2.16 3.19m-6.72-1.07a3 3 0 11-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>
                  {/if}
                </div>
                <div class="anchor-row">
                  {#if link.isImage}
                    <span class="img-tag">img</span>
                  {/if}
                  {#if link.text}
                    <span class="anchor-text">{link.text}</span>
                  {:else if link.isImage}
                    <span class="anchor-text anchor-text--empty">(image without alt text)</span>
                  {:else}
                    <span class="anchor-text anchor-text--empty">(no anchor text)</span>
                  {/if}
                </div>
              </td>
              <td class="td td--follow">
                {#if link.isNofollow}
                  <span class="pill pill--red">No</span>
                {:else if link.isSponsored}
                  <span class="pill pill--amber">Sponsored</span>
                {:else if link.isUgc}
                  <span class="pill pill--amber">UGC</span>
                {:else}
                  <span class="pill pill--green">Yes</span>
                {/if}
              </td>
              <td class="td td--type">{kindLabel(link.kind)}</td>
              <td class="td td--status">
                {#if status}
                  <span class="status-pill status-pill--{status.bucket}" title={statusTitle(status)}>{statusLabel(status)}</span>
                {/if}
              </td>
            </tr>
          {/each}
        </tbody>
      </table>
      {#if filtered.length === 0}
        <div class="no-results">No links match this filter</div>
      {/if}
    </div>

    {#if filtered.length > 0}
      <SummaryBar items={summaryItems} />
    {/if}
  </div>
{/if}

<style>
  .links-tab { display: flex; flex-direction: column; height: 100%; animation: fadeUp 0.4s ease both; }

  /* Empty state */
  .empty-state { display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100%; gap: 8px; color: var(--text-muted); }
  .empty-state__icon { width: 28px; height: 28px; opacity: 0.3; stroke-width: 1.7; }
  .empty-state p { font-size: 13px; margin: 0; }

  .spin { animation: spin 0.7s linear infinite; }
  @keyframes spin { to { transform: rotate(360deg); } }

  /* Status column header: icon-only check trigger sits after the sortable label */
  .check-head { display: inline-flex; align-items: center; gap: 6px; }
  .check-action { display: inline-flex; align-items: center; justify-content: center; width: 22px; height: 22px; padding: 0; border: 1px solid var(--border-strong); background: var(--bg); border-radius: 5px; color: var(--text-muted); cursor: pointer; transition: all 0.12s; }
  .check-action:hover:not(:disabled) { border-color: var(--action-hover-border); color: var(--action-hover-fg); background: var(--action-hover-bg); box-shadow: var(--action-hover-shadow); }
  .check-action:disabled { cursor: default; }
  .check-action svg { width: 12px; height: 12px; stroke-width: 1.9; flex-shrink: 0; }

  /* Table — full-bleed rows: no wrapper side padding, gutter lives on the edge cells */


  /* Edge-cell gutters keep content inset while row/hover background spans full width */

  .th--num { width: 30px; padding-right: 0; }
  .th--follow { width: 76px; }
  .th--type { width: 76px; }
  /* Balanced inset around the centered check button and status pill, replacing
     the shared edge-cell gutter. */
  .th.th--status, .td.td--status { width: 104px; padding-left: 8px; padding-right: 10px; text-align: center; }

  .row { cursor: pointer; }
  .row:hover { background: var(--bg-hover); }
  .row--hidden { opacity: 0.5; }

  .td--num { color: var(--text-muted); font-size: 12px; padding-right: 0; }
  .td--url { overflow: hidden; }

  .url-row { display: flex; align-items: center; gap: 6px; min-width: 0; }
  .url { color: var(--accent); text-decoration: none; font-family: 'SF Mono', ui-monospace, monospace; font-size: 12px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; min-width: 0; }
  a.url:hover { text-decoration: underline; }
  .url--inert { color: var(--text-muted); }
  .dup-badge { flex-shrink: 0; font-size: 10px; font-weight: 600; padding: 0 5px; border-radius: 8px; line-height: 16px; background: var(--warning-bg); color: var(--warning); }
  .flag { flex-shrink: 0; font-size: 10px; font-weight: 600; padding: 0 5px; border-radius: 8px; line-height: 16px; }
  .flag--amber { background: var(--warning-bg); color: var(--warning); }
  .flag--red { background: var(--error-bg); color: var(--error-strong); }
  .hidden-icon { flex-shrink: 0; width: 13px; height: 13px; stroke-width: 1.8; color: var(--text-muted); }

  /* HTTP status pill — monospace digits, color-coded by bucket */
  .status-pill { flex-shrink: 0; font-family: 'SF Mono', ui-monospace, monospace; font-size: 10px; font-weight: 700; padding: 0 5px; border-radius: 8px; line-height: 16px; }
  .status-pill--ok { background: var(--success-bg); color: var(--success-strong); }
  .status-pill--redirect { background: var(--warning-bg); color: var(--warning); }
  .status-pill--client-error, .status-pill--server-error { background: var(--error-bg); color: var(--error-strong); }
  .status-pill--error { background: var(--bg-hover); color: var(--text-muted); }
  /* Dark pill ring (see index.html); this class clashes with Robots' red
     .status-pill--error, so the global rule skips it and each component owns
     its own hue (neutral here: fetch failed, not an HTTP error). */
  @media (prefers-color-scheme: dark) {
    :global(:root:not([data-theme='light'])) .status-pill--error { box-shadow: inset 0 0 0 1px var(--border-strong); }
  }
  :global(:root[data-theme='dark']) .status-pill--error { box-shadow: inset 0 0 0 1px var(--border-strong); }

  .anchor-row { display: flex; align-items: center; gap: 5px; min-width: 0; margin-top: 1px; }
  .img-tag { flex-shrink: 0; font-size: 9px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.03em; padding: 0 4px; border-radius: 4px; line-height: 14px; background: var(--accent-tint); color: var(--accent); }
  .anchor-text { font-size: 11.5px; color: var(--text-secondary); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; min-width: 0; }
  /* Amber like missing alt on the Images tab; red stays reserved for broken things */
  .anchor-text--empty { color: var(--warning); font-style: italic; }

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
