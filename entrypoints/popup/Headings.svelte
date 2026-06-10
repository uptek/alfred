<script lang="ts">
  import type { RawHeading, HeadingIssue } from './types';
  import { scrollToHeading } from './utils';
  import { trackAction } from '@/utils/analytics';
  import { untrack } from 'svelte';

  let { headings, issues }: { headings: RawHeading[]; issues: HeadingIssue[] } = $props();

  let tracked = false;
  $effect(() => {
    if (tracked || headings.length === 0) return;
    tracked = true;
    untrack(() => {
      trackAction('headings_view', { heading_count: headings.length, issue_count: issues.length, hidden_count: headings.filter(h => h.isHidden).length });
    });
  });

  let showHidden = $state(true);

  const hiddenCount = $derived(headings.filter(h => h.isHidden).length);

  const filteredHeadings = $derived(
    headings
      .map((h, i) => ({ heading: h, originalIndex: i }))
      .filter(({ heading }) => showHidden || !heading.isHidden)
  );

  const counts = $derived({
    h1: headings.filter(h => h.level === 1).length,
    h2: headings.filter(h => h.level === 2).length,
    h3: headings.filter(h => h.level === 3).length,
    h4: headings.filter(h => h.level === 4).length,
    h5: headings.filter(h => h.level === 5).length,
    h6: headings.filter(h => h.level === 6).length,
  });

  const issuesByIndex = $derived(
    issues.reduce<Record<number, HeadingIssue[]>>((acc, issue) => {
      const indexes = issue.indexes ?? (issue.index != null ? [issue.index] : []);
      for (const index of indexes) {
        (acc[index] ??= []).push(issue);
      }
      return acc;
    }, {})
  );

  function issueLabel(issue: HeadingIssue): string {
    switch (issue.type) {
      case 'missing-h1': return 'No H1 tag found';
      case 'multiple-h1': return issue.details ?? 'Multiple H1 tags';
      case 'skipped-level': return issue.details ?? 'Skipped heading level';
      case 'empty': return issue.details ?? 'Empty heading';
      case 'h1-not-first': return issue.details ?? 'H1 is not the first heading';
    }
  }

  let copyState = $state<'idle' | 'copied'>('idle');

  function handleClick(index: number) {
    scrollToHeading(index);
    trackAction('headings_scroll_to', { heading_level: headings[index]?.level });
  }

  async function handleCopy() {
    const source = showHidden ? headings : headings.filter(h => !h.isHidden);
    const text = source
      .map(h => `${'  '.repeat(h.level - 1)}H${h.level}: ${h.text || '(empty)'}${h.isHidden ? ' [hidden]' : ''}`)
      .join('\n');
    try {
      await navigator.clipboard.writeText(text);
      copyState = 'copied';
      trackAction('headings_copy', { heading_count: headings.length, issue_count: issues.length });
      setTimeout(() => (copyState = 'idle'), 1500);
    } catch {
      // silent fail
    }
  }
</script>

{#if headings.length === 0}
  <div class="empty-state">
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" class="empty-state__icon"><path d="M4 6h16M4 12h8m-8 6h16"/></svg>
    <p>No headings found on this page</p>
  </div>
{:else}
  <div class="headings">
    <!-- Status bar -->
    <div class="statusbar">
      <div class="counts">
        {#each [1, 2, 3, 4, 5, 6] as level}
          <span class="counts__item" class:counts__item--zero={counts[`h${level}` as keyof typeof counts] === 0}>
            <span class="counts__label">H{level}</span>
            <span class="counts__value">{counts[`h${level}` as keyof typeof counts]}</span>
          </span>
        {/each}
      </div>
      <div class="statusbar__actions">
        {#if hiddenCount > 0}
          <button class="filter" class:filter--active={!showHidden} onclick={() => { showHidden = !showHidden; trackAction('headings_toggle_hidden', { show_hidden: showHidden }); }}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" class="filter__icon"><path d="M17.94 17.94A10.07 10.07 0 0112 20c-7 0-11-8-11-8a18.45 18.45 0 015.06-5.94M9.9 4.24A9.12 9.12 0 0112 4c7 0 11 8 11 8a18.5 18.5 0 01-2.16 3.19m-6.72-1.07a3 3 0 11-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>
            {hiddenCount} hidden
          </button>
        {/if}
        <button class="copy-btn" onclick={handleCopy} title="Copy headings to clipboard">
          {#if copyState === 'copied'}
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" class="copy-btn__icon"><polyline points="20 6 9 17 4 12"/></svg>
          {:else}
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" class="copy-btn__icon"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/></svg>
          {/if}
          Copy
        </button>
      </div>
    </div>

    <!-- Heading tree -->
    <div class="tree">
      <!-- Issue summary -->
      {#if issues.length > 0}
        <div class="issues">
          <div class="issues__header">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" class="issues__icon"><circle cx="12" cy="12" r="10"/><path d="M12 8v4m0 4h.01"/></svg>
            <span class="issues__count">{issues.length} {issues.length === 1 ? 'issue' : 'issues'}</span>
          </div>
          {#each issues as issue}
            <div class="issues__item">{issueLabel(issue)}</div>
          {/each}
        </div>
      {/if}
      {#each filteredHeadings as { heading, originalIndex }}
        {#if heading.isHidden}
          <div
            class="tree__row tree__row--hidden"
            class:tree__row--has-issue={issuesByIndex[originalIndex]}
            style="padding-left: {(heading.level - 1) * 16 + 12}px"
            title="Hidden via CSS"
          >
            <span class="tree__badge tree__badge--h{heading.level}">H{heading.level}</span>
            {#if heading.text}
              <span class="tree__text">{heading.text}</span>
            {:else}
              <span class="tree__text tree__text--empty">(empty)</span>
            {/if}
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" class="tree__hidden-icon" title="Hidden"><path d="M17.94 17.94A10.07 10.07 0 0112 20c-7 0-11-8-11-8a18.45 18.45 0 015.06-5.94M9.9 4.24A9.12 9.12 0 0112 4c7 0 11 8 11 8a18.5 18.5 0 01-2.16 3.19m-6.72-1.07a3 3 0 11-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>
            {#if issuesByIndex[originalIndex]}
              <span class="tree__issue-dot"></span>
            {/if}
          </div>
        {:else}
          <button
            class="tree__row"
            class:tree__row--has-issue={issuesByIndex[originalIndex]}
            style="padding-left: {(heading.level - 1) * 16 + 12}px"
            onclick={() => handleClick(originalIndex)}
            title="Click to scroll to this heading"
          >
            <span class="tree__badge tree__badge--h{heading.level}">H{heading.level}</span>
            {#if heading.text}
              <span class="tree__text">{heading.text}</span>
            {:else}
              <span class="tree__text tree__text--empty">(empty)</span>
            {/if}
            {#if issuesByIndex[originalIndex]}
              <span class="tree__issue-dot"></span>
            {/if}
          </button>
        {/if}
      {/each}
    </div>

  </div>
{/if}

<style>
  .headings { display: flex; flex-direction: column; height: 100%; }

  /* Empty state */
  .empty-state { display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100%; gap: 8px; color: var(--text-muted); }
  .empty-state__icon { width: 28px; height: 28px; opacity: 0.3; stroke-width: 1.7; }
  .empty-state p { font-size: 13px; margin: 0; }

  /* Issues */
  .issues { margin: 4px 12px 8px; padding: 10px 14px; background: var(--error-bg); border-radius: 8px; border: 1px solid color-mix(in srgb, var(--error) 15%, transparent); }
  .issues__header { display: flex; align-items: center; gap: 6px; margin-bottom: 8px; }
  .issues__icon { width: 14px; height: 14px; color: var(--error-strong); stroke-width: 2; }
  .issues__count { font-size: 12px; font-weight: 600; color: var(--error-strong); }
  .issues__item { font-size: 12px; font-weight: 500; color: var(--error-strong); padding: 2px 0 2px 10px; border-left: 2px solid var(--error); margin-left: 2px; margin-bottom: 6px; }
  .issues__item:last-child { margin-bottom: 0; }

  /* Tree */
  .tree { flex: 1; overflow-y: auto; overflow-x: hidden; padding: 8px 0; }
  .tree::-webkit-scrollbar { width: 3px; }
  .tree::-webkit-scrollbar-thumb { background: var(--scrollbar); border-radius: 3px; }

  .tree__row { display: flex; align-items: center; gap: 8px; width: 100%; padding: 5px 12px; border: none; background: none; cursor: pointer; font-family: inherit; text-align: left; transition: background 0.1s; border-radius: 0; overflow: hidden; box-sizing: border-box; }
  .tree__row:hover { background: var(--bg-hover); }
  .tree__row--has-issue { background: color-mix(in srgb, var(--error-bg) 50%, transparent); }
  .tree__row--has-issue:hover { background: var(--error-bg); }

  /* Uniform indigo pill for all levels; depth is shown by indentation (per mockup) */
  .tree__badge { font-family: inherit; font-size: 11px; font-weight: 700; padding: 2px 8px; border-radius: 6px; flex-shrink: 0; line-height: 16px; background: var(--accent-tint); color: var(--accent); }

  .tree__text { font-size: 12.5px; color: var(--text-secondary); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; min-width: 0; }
  .tree__text--empty { font-style: italic; color: var(--text-disabled); }

  .tree__row--hidden { opacity: 0.45; cursor: default; }
  .tree__row--hidden:hover { background: none; }
  .tree__hidden-icon { width: 13px; height: 13px; stroke-width: 1.8; color: var(--text-muted); flex-shrink: 0; margin-left: auto; }
  .tree__row--hidden .tree__hidden-icon + .tree__issue-dot { margin-left: 4px; }

  .tree__issue-dot { width: 6px; height: 6px; border-radius: 50%; background: var(--error); flex-shrink: 0; margin-left: auto; }

  /* Status bar */
  .statusbar { display: flex; align-items: center; justify-content: space-between; padding: 10px 20px; border-bottom: 1px solid var(--border); flex-shrink: 0; }

  /* Counts */
  .counts { display: flex; gap: 2px; }
  .counts__item { display: flex; align-items: center; gap: 3px; padding: 0 8px; height: 28px; border-radius: 6px; background: var(--bg-inset); }
  .counts__item--zero { opacity: 0.4; }
  .counts__label { font-family: 'SF Mono', ui-monospace, monospace; font-size: 10px; font-weight: 600; color: var(--text-muted); }
  .counts__value { font-size: 11px; font-weight: 600; color: var(--text); }
  .counts__item--zero .counts__value { color: var(--text-muted); }

  /* Filter */
  .filter { display: flex; align-items: center; gap: 4px; padding: 0 8px; height: 28px; border-radius: 6px; border: 1px solid var(--border-strong); background: var(--bg); font-family: inherit; font-size: 11px; font-weight: 600; color: var(--text-muted); cursor: pointer; transition: all 0.12s; }
  .filter:hover { border-color: var(--border-hover); color: var(--text-secondary); }
  .filter--active { background: var(--btn-bg); color: var(--btn-text); border-color: var(--btn-bg); }
  .filter--active:hover { background: var(--btn-bg-hover); border-color: var(--btn-bg-hover); color: var(--btn-text); }
  .filter__icon { width: 13px; height: 13px; stroke-width: 1.8; }

  /* Actions */
  .statusbar__actions { display: flex; align-items: center; gap: 6px; }

  /* Copy button */
  .copy-btn { display: flex; align-items: center; justify-content: center; gap: 4px; padding: 0 8px; height: 28px; border-radius: 6px; border: 1px solid var(--border-strong); background: var(--bg); font-family: inherit; font-size: 11px; font-weight: 600; color: var(--text-muted); cursor: pointer; transition: all 0.12s; }
  .copy-btn:hover { border-color: var(--border-hover); color: var(--text-secondary); }
  .copy-btn__icon { width: 13px; height: 13px; flex-shrink: 0; stroke-width: 1.8; }

  /* Animation */
  .headings { animation: fadeUp 0.4s ease both; }
  @keyframes fadeUp {
    from { opacity: 0; transform: translateY(8px); }
    to { opacity: 1; transform: translateY(0); }
  }
</style>
