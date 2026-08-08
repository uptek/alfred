<script lang="ts">
  import type { RawHreflang } from './utils/types';
  import { analyzeHreflangs } from './utils/hreflang';
  import SummaryBar from './SummaryBar.svelte';
  import type { SummaryItem } from './SummaryBar.svelte';
  import { trackAction } from '@/utils/analytics';
  import { untrack, onDestroy } from 'svelte';

  let { tags, pageUrl, domain }: { tags: RawHreflang[]; pageUrl: string | null; domain: string | null } = $props();

  const siteSlug = $derived(domain?.replace(/^www\./, '').replace(/[^a-z0-9]+/gi, '-').replace(/-+$/, '') ?? 'site');
  const analysis = $derived(analyzeHreflangs(tags, pageUrl));

  let tracked = false;
  $effect(() => {
    const { entries, issues } = analysis;
    if (tracked || entries.length === 0) return;
    tracked = true;
    untrack(() => {
      trackAction('hreflangs_view', { tags: entries.length, issues: issues.length });
    });
  });

  const summaryItems = $derived.by(() => {
    const n = analysis.entries.length;
    const items: SummaryItem[] = [{ text: `${n} ${n === 1 ? 'alternate' : 'alternates'}` }];
    items.push(
      analysis.hasXDefault
        ? { text: 'x-default' }
        : { text: 'no x-default', tone: 'warn', title: 'No fallback page for unmatched languages' }
    );
    if (pageUrl) {
      items.push(
        analysis.hasSelf
          ? { text: 'self-referencing' }
          : { text: 'no self-reference', tone: 'err', title: 'The set does not include this page\'s own URL' }
      );
    }
    if (analysis.errorCount > 0) {
      items.push({ text: `${analysis.errorCount} ${analysis.errorCount === 1 ? 'error' : 'errors'}`, tone: 'err' });
    }
    return items;
  });

  let copied = $state(false);
  let copyTimer: ReturnType<typeof setTimeout> | null = null;
  async function copyAll() {
    const text = tags.map((t) => `${t.hreflang}\t${t.href || t.rawHref}`).join('\n');
    try {
      await navigator.clipboard.writeText(text);
      copied = true;
      if (copyTimer) clearTimeout(copyTimer);
      copyTimer = setTimeout(() => { copied = false; }, 1500);
      trackAction('hreflangs_copy', { tags: tags.length });
    } catch {
      // ignore clipboard errors
    }
  }
  function exportCsv() {
    const csvField = (v: string) => (/[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
    const rows = analysis.entries.map((e) =>
      [e.hreflang, e.href || e.rawHref, e.isSelf, e.invalidCode, e.relativeHref, e.inHead].map(String).map(csvField).join(',')
    );
    const content = ['Hreflang,URL,Self,Invalid Code,Relative URL,In Head', ...rows].join('\n');
    const blob = new Blob([content], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `alfred-hreflangs-${siteSlug}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    trackAction('hreflangs_export', { tags: tags.length });
  }

  onDestroy(() => {
    if (copyTimer) clearTimeout(copyTimer);
  });
</script>

{#if tags.length === 0}
  <div class="empty-state">
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" class="empty-state__icon"><circle cx="12" cy="12" r="10"/><path d="M2 12h20M12 2a15.3 15.3 0 014 10 15.3 15.3 0 01-4 10 15.3 15.3 0 01-4-10 15.3 15.3 0 014-10z"/></svg>
    <p>No hreflang tags found on this page</p>
    <p class="empty-state__hint">Single-language sites don't need them</p>
  </div>
{:else}
  <div class="hreflangs-tab">
    <div class="toolbar">
      <span class="toolbar__hint">Language &amp; region alternates</span>
      <div class="toolbar__actions">
        <button class="toolbar-btn" onclick={copyAll} aria-label="Copy all hreflang tags" title={copied ? 'Copied!' : 'Copy as tab-separated list'}>
          {#if copied}
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round"><polyline points="20 6 9 17 4 12"/></svg>
          {:else}
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/></svg>
          {/if}
        </button>
        <button class="toolbar-btn" onclick={exportCsv} aria-label="Download as CSV" title="Download as CSV">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
        </button>
      </div>
    </div>

    <div class="scroll">
      {#if analysis.issues.length > 0}
        <div class="issues">
          {#each analysis.issues as issue (issue.id + issue.message)}
            <div class="issue issue--{issue.severity}">
              <span class="issue__tag">{issue.severity === 'error' ? 'Error' : 'Warn'}</span>
              <span class="issue__msg">{issue.message}</span>
            </div>
          {/each}
        </div>
      {/if}

      <table class="table">
        <thead>
          <tr>
            <th class="th th--num">#</th>
            <th class="th th--code">Hreflang</th>
            <th class="th th--url">URL</th>
          </tr>
        </thead>
        <tbody>
          {#each analysis.entries as entry (entry.index)}
            <tr class="row">
              <td class="td td--num">{entry.index + 1}</td>
              <td class="td td--code">
                <span
                  class="pill"
                  class:pill--purple={!entry.invalidCode}
                  class:pill--red={entry.invalidCode}
                  title={entry.invalidCode ? 'Not a valid language-script-region code' : null}
                >{entry.hreflang || '(empty)'}</span>
              </td>
              <td class="td td--url">
                <div class="url-row">
                  {#if entry.href}
                    <a href={entry.href} target="_blank" rel="noopener noreferrer" class="url" title={entry.href}>{entry.href}</a>
                  {:else}
                    <span class="url url--dead" title="Could not be resolved to a URL">{entry.rawHref || '(empty)'}</span>
                  {/if}
                  {#if entry.isSelf}
                    <span class="flag flag--green" title="References the page you're on">self</span>
                  {/if}
                  {#if entry.relativeHref}
                    <span class="flag flag--red" title="hreflang URLs must be fully qualified">relative</span>
                  {/if}
                  {#if entry.conflictingCode}
                    <span class="flag flag--red" title="This code points at different URLs elsewhere in the set">conflict</span>
                  {:else if entry.duplicateCode}
                    <span class="flag flag--amber" title="This code is declared more than once">duplicate</span>
                  {/if}
                  {#if !entry.inHead}
                    <span class="flag flag--red" title="Search engines ignore hreflang outside <head>">body</span>
                  {/if}
                </div>
              </td>
            </tr>
          {/each}
        </tbody>
      </table>
    </div>

    <SummaryBar items={summaryItems} />
  </div>
{/if}

<style>
  .hreflangs-tab { display: flex; flex-direction: column; height: 100%; animation: fadeUp 0.4s ease both; }

  /* Empty state */
  .empty-state { display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100%; gap: 8px; color: var(--text-muted); }
  .empty-state__icon { width: 28px; height: 28px; opacity: 0.3; stroke-width: 1.7; }
  .empty-state p { font-size: 13px; margin: 0; }
  .empty-state__hint { font-size: 11.5px; color: var(--text-faint); }

  /* Toolbar */
  .toolbar { display: flex; align-items: center; justify-content: space-between; gap: 10px; padding: 10px 20px; border-bottom: 1px solid var(--border); flex-shrink: 0; }
  .toolbar__hint { font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.04em; color: var(--text-label); }
  .toolbar__actions { display: flex; align-items: center; gap: 6px; }
  .toolbar-btn { display: flex; align-items: center; gap: 4px; padding: 0 8px; height: 28px; border-radius: 6px; border: 1px solid var(--border-strong); background: var(--bg); font-family: inherit; font-size: 11px; font-weight: 600; color: var(--text-muted); cursor: pointer; transition: all 0.12s; }
  .toolbar-btn:hover { border-color: var(--action-hover-border); color: var(--action-hover-fg); background: var(--action-hover-bg); box-shadow: var(--action-hover-shadow); }
  .toolbar-btn svg { width: 13px; height: 13px; stroke-width: 1.8; flex-shrink: 0; }

  .scroll { flex: 1; overflow-y: auto; overflow-x: hidden; }
  .scroll::-webkit-scrollbar { width: 3px; }
  .scroll::-webkit-scrollbar-thumb { background: var(--scrollbar); border-radius: 3px; }

  /* Issue callouts */
  .issues { display: flex; flex-direction: column; border-bottom: 1px solid var(--border); }
  .issue { display: flex; align-items: baseline; gap: 9px; padding: 7px 20px; font-size: 12.5px; border-top: 1px solid var(--border-subtle); }
  .issue:first-child { border-top: none; }
  .issue--error { background: var(--error-bg); }
  .issue--warning { background: var(--warning-bg); }
  .issue__tag { flex-shrink: 0; font-size: 9.5px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em; padding-top: 1px; }
  .issue--error .issue__tag { color: var(--error-strong); }
  .issue--warning .issue__tag { color: var(--warning); }
  .issue__msg { color: var(--text-secondary); }

  /* Table — full-bleed rows: gutter lives on the edge cells */
  .table { width: 100%; border-collapse: collapse; font-size: 13px; table-layout: fixed; }
  .th:first-child, .td:first-child { padding-left: 20px; }
  .th:last-child, .td:last-child { padding-right: 20px; }

  .th { text-align: left; font-size: 10.5px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.04em; color: var(--text-label); padding: 8px 8px 8px 0; border-bottom: 1px solid var(--border); position: sticky; top: 0; background: var(--bg-canvas); z-index: 1; }
  .th--num { width: 30px; padding-right: 0; }
  .th--code { width: 110px; }

  .row { transition: background 0.1s; }
  .row:hover { background: var(--bg-hover); }

  .td { padding: 9px 8px 9px 0; color: var(--text-secondary); border-bottom: 1px solid var(--border-muted); vertical-align: middle; }
  .td--num { color: var(--text-muted); font-size: 12px; padding-right: 0; }
  .td--url { overflow: hidden; }

  .url-row { display: flex; align-items: center; gap: 6px; min-width: 0; }
  .url { color: var(--accent); text-decoration: none; font-family: 'SF Mono', ui-monospace, monospace; font-size: 12px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; min-width: 0; }
  .url:hover { text-decoration: underline; }
  .url--dead { color: var(--text-muted); }

  .flag { flex-shrink: 0; font-size: 10px; font-weight: 600; padding: 0 5px; border-radius: 8px; line-height: 16px; }
  .flag--green { background: var(--success-bg); color: var(--success-strong); }
  .flag--amber { background: var(--warning-bg); color: var(--warning); }
  .flag--red { background: var(--error-bg); color: var(--error-strong); }

  .pill { display: inline-flex; align-items: center; font-size: 10.5px; font-weight: 600; padding: 1px 8px; border-radius: 20px; font-family: 'SF Mono', ui-monospace, monospace; }
  .pill--purple { background: var(--accent-tint); color: var(--accent); }
  .pill--red { background: var(--error-bg); color: var(--error-strong); }

  @keyframes fadeUp {
    from { opacity: 0; transform: translateY(8px); }
    to { opacity: 1; transform: translateY(0); }
  }
</style>
