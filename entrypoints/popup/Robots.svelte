<script lang="ts">
  import type { RobotsResponse } from './utils/types';
  import type { AiBot, LintFinding, RobotsAnalysis } from './utils/robots';
  import { AI_BOTS, isAllowed } from './utils/robots';
  import { trackAction } from '@/utils/analytics';
  import { createCopyFeedback } from './utils/copy.svelte';
  import { trackViewOnce } from './utils/track.svelte';
  import { tick } from 'svelte';
  import ActionButton from './components/ActionButton.svelte';

  let {
    robots,
    analysis,
    loading = false,
    pageUrl
  }: { robots: RobotsResponse | null; analysis: RobotsAnalysis; loading?: boolean; pageUrl: string | null } = $props();

  const ok = $derived(analysis.ok);
  const isHtml = $derived(analysis.isHtml);
  const parsed = $derived(analysis.parsed);
  const shopifyDiff = $derived(analysis.shopifyDiff);
  const findings = $derived(analysis.findings);

  const currentPath = $derived.by(() => {
    if (!pageUrl) return '/';
    try {
      const u = new URL(pageUrl);
      return u.pathname + u.search;
    } catch {
      return '/';
    }
  });

  const robotsUrl = $derived.by(() => {
    if (robots?.finalUrl) return robots.finalUrl;
    if (!pageUrl) return null;
    try {
      return `${new URL(pageUrl).origin}/robots.txt`;
    } catch {
      return null;
    }
  });

  const displayUrl = $derived(robotsUrl ? robotsUrl.replace(/^https?:\/\//, '') : 'robots.txt');

  const AI_GROUPS: { purpose: AiBot['purpose']; label: string }[] = [
    { purpose: 'training', label: 'Training' },
    { purpose: 'search', label: 'AI Search' },
    { purpose: 'fetch', label: 'User Fetch' }
  ];

  function summarizeBlocked(blocked: number, total: number, spellOutTotal = false): string {
    if (blocked === 0) return spellOutTotal ? `all ${total} allowed` : 'all allowed';
    if (blocked === total) return 'all blocked';
    return `${blocked} of ${total} blocked`;
  }

  const aiRows = $derived.by(() => {
    if (!parsed) return [];
    const p = parsed;
    return AI_GROUPS.map(({ purpose, label }) => {
      const bots = AI_BOTS.filter((b) => b.purpose === purpose).map((bot) => ({
        bot,
        verdict: isAllowed(p, currentPath, bot.token)
      }));
      const blocked = bots.filter((b) => !b.verdict.allowed).length;
      return { label, bots, summary: summarizeBlocked(blocked, bots.length) };
    });
  });

  const BLOCKED_PREVIEW_COUNT = 3;
  let aiExpanded = $state(false);
  const blockedBots = $derived(aiRows.flatMap((r) => r.bots).filter((b) => !b.verdict.allowed));
  const aiSummary = $derived(summarizeBlocked(blockedBots.length, AI_BOTS.length, true));
  const blockedPreview = $derived(blockedBots.slice(0, BLOCKED_PREVIEW_COUNT));
  const blockedOverflow = $derived(blockedBots.length - blockedPreview.length);

  const addedLines = $derived(new Set(shopifyDiff && !shopifyDiff.isDefault ? shopifyDiff.addedLines : []));

  // Bound worst-case DOM size — a near-limit file is ~15k lines. goToLine
  // raises the limit when a finding targets a line past it.
  const MAX_RENDER_LINES = 2000;
  let renderLimit = $state(MAX_RENDER_LINES);
  const visibleLines = $derived((parsed?.lines ?? []).slice(0, renderLimit));
  const hiddenLineCount = $derived(Math.max(0, (parsed?.lines.length ?? 0) - renderLimit));

  const sizeLabel = $derived.by(() => {
    const size = robots?.size ?? 0;
    return size < 1024 ? `${size} B` : `${(size / 1024).toFixed(1)} KB`;
  });

  trackViewOnce('robots_view', () => robots !== null, () => ({
    status: robots!.status,
    is_shopify_default: shopifyDiff?.isDefault ?? false,
    error_count: analysis.errorCount
  }));

  // Source view: click-to-line scroll + flash
  let srcEl: HTMLElement | undefined = $state();
  let flashedLine = $state<number | null>(null);
  let flashTimer: ReturnType<typeof setTimeout> | undefined;

  async function goToLine(line: number) {
    if (line > renderLimit) {
      renderLimit = line + 50;
      await tick(); // target line must exist in the DOM before scrolling
    }
    const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
    srcEl
      ?.querySelector(`[data-line="${line}"]`)
      ?.scrollIntoView({ behavior: reducedMotion ? 'auto' : 'smooth', block: 'center' });
    flashedLine = line;
    clearTimeout(flashTimer);
    flashTimer = setTimeout(() => (flashedLine = null), 1600);
    trackAction('robots_goto_line', { line });
  }

  let wrapLines = $state(false);

  const copyFeedback = createCopyFeedback();
  async function handleCopy() {
    if (!robots) return;
    if (await copyFeedback.copy(robots.content)) trackAction('robots_copy', { size: robots.size });
  }

  type Segment = { text: string; kind: 'code' | 'directive' | 'comment' | 'link' };

  // indexOf-based on purpose: a lazy-quantifier regex here was measured
  // quadratic on long colon-free lines (robots.txt content is untrusted).
  function segmentLine(raw: string): Segment[] {
    if (raw === '') return [{ text: ' ', kind: 'code' }];
    const segments: Segment[] = [];
    const hash = raw.indexOf('#');
    const code = hash === -1 ? raw : raw.slice(0, hash);
    const comment = hash === -1 ? '' : raw.slice(hash);

    if (code) {
      const colon = code.indexOf(':');
      const name = colon === -1 ? '' : code.slice(0, colon).trim();
      if (colon !== -1 && name !== '' && /^[A-Za-z][\w -]*$/.test(name)) {
        const head = code.slice(0, colon + 1);
        const rest = code.slice(colon + 1);
        const value = rest.trim();
        const lead = rest.slice(0, rest.indexOf(value));
        const trail = rest.slice(lead.length + value.length);
        if (name.toLowerCase() === 'sitemap' && /^https?:\/\//i.test(value) && !value.includes(' ')) {
          segments.push({ text: head + lead, kind: 'directive' });
          segments.push({ text: value, kind: 'link' });
          if (trail) segments.push({ text: trail, kind: 'code' });
        } else {
          segments.push({ text: head, kind: 'directive' });
          segments.push({ text: rest, kind: 'code' });
        }
      } else {
        segments.push({ text: code, kind: 'code' });
      }
    }
    if (comment) segments.push({ text: comment, kind: 'comment' });
    return segments;
  }

  function severityLabel(f: LintFinding): string {
    return f.severity === 'error' ? 'Error' : f.severity === 'warning' ? 'Warning' : 'Info';
  }

  // Lint messages mark code with backticks; odd-indexed parts render as <code>.
  function messageParts(message: string): { text: string; code: boolean }[] {
    return message.split('`').map((text, i) => ({ text, code: i % 2 === 1 }));
  }
</script>

{#if loading}
  <div class="empty-state">
    <div class="empty-state__spinner"></div>
    <p>Loading robots.txt…</p>
  </div>
{:else if robots === null || !robots.ok}
  <div class="empty-state">
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" class="empty-state__icon"><rect x="3" y="11" width="18" height="10" rx="2"/><circle cx="8.5" cy="16" r="1.5"/><circle cx="15.5" cy="16" r="1.5"/><path d="M12 2v4M8 5l4 4 4-4"/></svg>
    <p>Couldn't load robots.txt for this page</p>
  </div>
{:else}
  <div class="robots">
    <!-- Header -->
    <div class="header">
      <div class="header__meta">
        <div class="header__title-row">
          <span class="header__title">robots.txt</span>
          <span class="status-pill" class:status-pill--error={!ok}>
            <span class="status-pill__dot" class:status-pill__dot--error={!ok}></span>
            {robots.status}{#if ok}&nbsp;· {sizeLabel}{/if}
          </span>
          {#if ok && shopifyDiff}
            {#if shopifyDiff.isDefault}
              <span class="pill pill--green">Default Shopify</span>
            {:else}
              <span class="pill pill--purple">Customized</span>
            {/if}
          {/if}
        </div>
        {#if robotsUrl}
          <a class="header__url" href={robotsUrl} target="_blank" rel="noopener">{displayUrl}</a>
        {/if}
      </div>
      <div class="header__actions">
        {#if robotsUrl}
          <ActionButton href={robotsUrl} onclick={() => trackAction('robots_open', {})}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round"><path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6M15 3h6v6M10 14L21 3"/></svg>
            Open
          </ActionButton>
        {/if}
        {#if ok}
          <ActionButton onclick={handleCopy}>
            {#if copyFeedback.copied}
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round"><polyline points="20 6 9 17 4 12"/></svg>
            {:else}
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/></svg>
            {/if}
            Copy
          </ActionButton>
        {/if}
      </div>
    </div>

    {#if !ok}
      <!-- 4xx / 5xx states -->
      {#if robots.status >= 500}
        <div class="banner banner--warning">
          <div class="banner__icon">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round"><path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/><path d="M12 9v4m0 4h.01"/></svg>
          </div>
          <div>
            <div class="banner__title">robots.txt returns a server error (HTTP {robots.status})</div>
            <div class="banner__sub">When this persists, Google pauses crawling and may use a cached copy for up to 30 days.</div>
          </div>
        </div>
      {:else}
        <div class="banner banner--info">
          <div class="banner__icon">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4m0-4h.01"/></svg>
          </div>
          <div>
            <div class="banner__title">No robots.txt found (HTTP {robots.status})</div>
            <div class="banner__sub">Crawlers treat a missing robots.txt as permission to crawl everything.</div>
          </div>
        </div>
      {/if}
    {:else}
      <!-- Issues (only when there is something to say) -->
      {#if findings.length > 0}
        <div class="section-heading">Issues</div>
        <div class="issues">
          {#each findings as f}
            <div class="issue">
              <span class="issue__dot issue__dot--{f.severity}" role="img" aria-label={severityLabel(f)} title={severityLabel(f)}></span>
              <span class="issue__msg">
                {#each messageParts(f.message) as part}
                  {#if part.code}<code>{part.text}</code>{:else}{part.text}{/if}
                {/each}
              </span>
              {#if f.line}
                <button class="line-btn" onclick={() => goToLine(f.line!)}>L{f.line}</button>
              {/if}
            </div>
          {/each}
        </div>
      {/if}

      <!-- AI crawler access: collapsed summary strip, expandable matrix.
           Hidden for HTML bodies — "all allowed" would be a verdict on markup, not rules. -->
      {#if !isHtml}
      <button
        class="ai-strip"
        class:ai-strip--open={aiExpanded}
        aria-expanded={aiExpanded}
        onclick={() => {
          aiExpanded = !aiExpanded;
          trackAction('robots_ai_toggle', { expanded: aiExpanded });
        }}
      >
        <span class="ai-strip__label">AI Crawlers</span>
        <span class="ai-strip__sum">{aiSummary}</span>
        {#if !aiExpanded}
          {#each blockedPreview as { bot }}
            <span class="bot bot--blocked bot--mini"><span class="bot__dot"></span>{bot.token}</span>
          {/each}
          {#if blockedOverflow > 0}
            <span class="ai-strip__more">+{blockedOverflow} more</span>
          {/if}
        {/if}
        <svg class="ai-strip__chev" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" aria-hidden="true"><path d="M6 9l6 6 6-6"/></svg>
      </button>
      {#if aiExpanded}
        <div class="ai">
          {#each aiRows as row}
            <div class="ai__row">
              <div class="ai__label">
                {row.label}
                <small>{row.summary}</small>
              </div>
              <div class="ai__chips">
                {#each row.bots as { bot, verdict: v }}
                  {#if v.rule}
                    <button
                      class="bot"
                      class:bot--blocked={!v.allowed}
                      title="{bot.vendor} · {v.allowed ? 'allowed' : 'blocked'} by line {v.rule.line}"
                      onclick={() => goToLine(v.rule!.line)}
                    >
                      <span class="bot__dot"></span>{bot.token}
                    </button>
                  {:else}
                    <span class="bot bot--static" title="{bot.vendor} · no matching rule">
                      <span class="bot__dot"></span>{bot.token}
                    </span>
                  {/if}
                {/each}
              </div>
            </div>
          {/each}
        </div>
      {/if}
      {/if}

      <!-- Source -->
      <div class="section-heading section-heading--row">
        Source
        <button
          class="wrap-btn"
          class:wrap-btn--active={wrapLines}
          title="Wrap long lines"
          onclick={() => {
            wrapLines = !wrapLines;
            trackAction('robots_wrap_toggle', { wrap: wrapLines });
          }}
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" class="wrap-btn__icon"><path d="M3 6h18M3 12h13a3 3 0 010 6h-4"/><path d="M14 16l-2 2 2 2"/><path d="M3 18h6"/></svg>
          Wrap
        </button>
      </div>
      <div class="src" class:src--wrap={wrapLines} bind:this={srcEl}>
        {#each visibleLines as raw, i}
          {@const line = i + 1}
          <div
            class="src__line"
            class:src__line--added={addedLines.has(line)}
            class:src__line--flash={flashedLine === line}
            data-line={line}
          >
            <span class="src__ln">{line}</span>
            <span class="src__code">
              {#each segmentLine(raw) as seg}
                {#if seg.kind === 'link'}
                  <a href={seg.text} target="_blank" rel="noopener">{seg.text}</a>
                {:else}
                  <span class="src__seg--{seg.kind}">{seg.text}</span>
                {/if}
              {/each}
            </span>
          </div>
        {/each}
        {#if hiddenLineCount > 0}
          <div class="src__line src__line--more">… {hiddenLineCount} more lines not shown</div>
        {/if}
      </div>
    {/if}
  </div>
{/if}

<style>
  .robots { padding: 20px 24px 24px; animation: fadeUp 0.4s ease both; }

  /* Empty state */
  .empty-state { display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100%; gap: 8px; color: var(--text-muted); }
  .empty-state__icon { width: 28px; height: 28px; opacity: 0.3; stroke-width: 1.7; }
  .empty-state__spinner { width: 20px; height: 20px; border: 2px solid var(--border-strong); border-top-color: var(--accent); border-radius: 50%; animation: spin 0.8s linear infinite; }
  .empty-state p { font-size: 13px; margin: 0; }

  /* Header */
  .header { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; margin-bottom: 16px; }
  .header__title-row { display: flex; align-items: center; gap: 8px; }
  .header__title { font-size: 15px; font-weight: 600; color: var(--text); }
  .header__url { display: inline-block; margin-top: 2px; font-size: 12px; color: var(--accent); text-decoration: none; font-family: 'SF Mono', ui-monospace, monospace; }
  .header__url:hover { text-decoration: underline; }
  .header__actions { display: flex; gap: 6px; flex-shrink: 0; }

  .status-pill { display: inline-flex; align-items: center; gap: 5px; font-size: 11px; font-weight: 600; font-family: 'SF Mono', ui-monospace, monospace; color: var(--text-secondary); background: var(--bg-inset); padding: 2px 8px; border-radius: 20px; }
  .status-pill--error { background: var(--error-bg); color: var(--error-strong); }
  /* Dark pill ring (see index.html); this class clashes with Links' neutral
     .status-pill--error, so the global rule skips it and each component owns
     its own hue. */
  @media (prefers-color-scheme: dark) {
    :global(:root:not([data-theme='light'])) .status-pill--error { box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--error) 35%, transparent); }
  }
  :global(:root[data-theme='dark']) .status-pill--error { box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--error) 35%, transparent); }
  .status-pill__dot { width: 6px; height: 6px; border-radius: 50%; background: var(--success); }
  .status-pill__dot--error { background: var(--error); }

  .pill { display: inline-flex; align-items: center; font-size: 10.5px; font-weight: 600; padding: 2px 8px; border-radius: 20px; white-space: nowrap; }
  .pill--green { background: var(--success-bg); color: var(--success-strong); }
  .pill--purple { background: var(--accent-tint); color: var(--accent); }


  /* Banner (4xx/5xx fetch states) */
  .banner { display: flex; align-items: center; gap: 12px; padding: 13px 16px; border-radius: 10px; margin-bottom: 18px; }
  .banner--info { background: var(--accent-tint); border: 1px solid color-mix(in srgb, var(--accent) 15%, transparent); }
  .banner--warning { background: var(--warning-bg); border: 1px solid color-mix(in srgb, var(--warning) 20%, transparent); }
  .banner__icon { width: 30px; height: 30px; border-radius: 50%; display: flex; align-items: center; justify-content: center; flex-shrink: 0; background: var(--bg); }
  .banner__icon :global(svg) { width: 15px; height: 15px; stroke-width: 2.2; }
  .banner--info .banner__icon { color: var(--accent); }
  .banner--warning .banner__icon { color: var(--warning); }
  .banner__title { font-size: 13.5px; font-weight: 600; color: var(--text); }
  .banner__sub { font-size: 12px; color: var(--text-muted); margin-top: 1px; }

  /* Section headings */
  .section-heading { font-size: 11.5px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.05em; color: var(--text-label); padding: 18px 0 8px; }
  .header + .section-heading { padding-top: 6px; }
  .section-heading--row { display: flex; align-items: center; justify-content: space-between; }

  /* Wrap toggle */
  .wrap-btn { display: inline-flex; align-items: center; gap: 4px; padding: 2px 8px; font-size: 11px; font-weight: 600; letter-spacing: normal; text-transform: none; color: var(--text-muted); background: var(--bg); border: 1px solid var(--border-strong); border-radius: 6px; cursor: pointer; font-family: inherit; transition: all 0.12s; }
  .wrap-btn:hover { border-color: var(--action-hover-border); color: var(--action-hover-fg); background: var(--action-hover-bg); box-shadow: var(--action-hover-shadow); }
  .wrap-btn--active { background: var(--btn-bg); color: var(--btn-text); border-color: var(--btn-bg); }
  .wrap-btn--active:hover { background: var(--btn-bg-hover); border-color: var(--btn-bg-hover); color: var(--btn-text); }
  .wrap-btn__icon { width: 12px; height: 12px; stroke-width: 1.8; }

  /* AI crawler access */
  .ai-strip { display: flex; align-items: center; gap: 8px; width: 100%; margin-top: 14px; padding: 9px 14px; background: var(--bg); border: 1px solid var(--border-strong); border-radius: 10px; cursor: pointer; font-family: inherit; text-align: left; transition: border-color 0.12s; }
  .ai-strip:hover { border-color: var(--border-hover); }
  .ai-strip__label { font-size: 12.5px; font-weight: 600; color: var(--text-secondary); flex-shrink: 0; }
  .ai-strip__sum { font-size: 12px; color: var(--text-muted); flex-shrink: 0; }
  .ai-strip__more { font-size: 11px; color: var(--text-faint); }
  .ai-strip__chev { width: 14px; height: 14px; margin-left: auto; color: var(--text-muted); stroke-width: 2; transition: transform 0.15s; flex-shrink: 0; }
  .ai-strip--open .ai-strip__chev { transform: rotate(180deg); }

  .ai { padding: 4px 2px 0; }
  .ai__row { display: flex; align-items: baseline; gap: 12px; padding: 8px 0; border-bottom: 1px solid var(--border-muted); }
  .ai__row:last-child { border-bottom: none; }
  .ai__label { width: 92px; flex-shrink: 0; font-size: 12.5px; font-weight: 500; color: var(--text-muted); }
  .ai__label small { display: block; font-size: 10.5px; font-weight: 500; color: var(--text-faint); margin-top: 1px; }
  .ai__chips { display: flex; flex-wrap: wrap; gap: 5px; flex: 1; }

  .bot { display: inline-flex; align-items: center; gap: 5px; font-size: 11.5px; font-weight: 500; font-family: 'SF Mono', ui-monospace, monospace; padding: 3px 9px; border-radius: 20px; border: 1px solid var(--border-strong); background: var(--bg); color: var(--text-secondary); cursor: pointer; transition: all 0.12s; }
  .bot:hover { border-color: var(--border-hover); }
  .bot--static { cursor: default; }
  .bot__dot { width: 6px; height: 6px; border-radius: 50%; flex-shrink: 0; background: var(--success); }
  .bot--blocked { background: var(--error-bg); border-color: color-mix(in srgb, var(--error) 18%, transparent); color: var(--error-strong); }
  .bot--blocked .bot__dot { background: var(--error); }
  .bot--mini { font-size: 10.5px; padding: 2px 7px; cursor: pointer; }

  /* Issues */
  .issue { display: flex; align-items: center; gap: 10px; padding: 8px 0; border-bottom: 1px solid var(--border-muted); font-size: 12.5px; color: var(--text-secondary); }
  .issue:last-child { border-bottom: none; }
  .issue__dot { width: 7px; height: 7px; border-radius: 50%; flex-shrink: 0; }
  .issue__dot--error { background: var(--error); }
  .issue__dot--warning { background: var(--warning); }
  .issue__dot--info { background: var(--text-faint); }
  .issue__msg { flex: 1; min-width: 0; }
  .issue__msg code { font-family: 'SF Mono', ui-monospace, monospace; font-size: 11.5px; background: var(--bg-inset); padding: 1px 5px; border-radius: 4px; color: var(--text); }

  .line-btn { font-family: 'SF Mono', ui-monospace, monospace; font-size: 11px; font-weight: 600; color: var(--accent); background: var(--accent-tint); border: none; border-radius: 5px; padding: 2px 7px; cursor: pointer; flex-shrink: 0; transition: background 0.12s; }
  .line-btn:hover { background: color-mix(in srgb, var(--accent) 14%, var(--accent-tint)); }

  /* Source view */
  .src { background: var(--bg-raised); border: 1px solid var(--border); border-radius: 10px; font-family: 'SF Mono', ui-monospace, monospace; font-size: 12px; line-height: 1.75; color: var(--text-secondary); max-height: 320px; overflow: auto; padding: 10px 0; }
  .src::-webkit-scrollbar { width: 3px; height: 3px; }
  .src::-webkit-scrollbar-thumb { background: var(--scrollbar); border-radius: 3px; }
  .src__line { display: flex; gap: 12px; padding: 0 14px; white-space: pre; transition: background 0.3s; }
  .src--wrap .src__line { white-space: pre-wrap; }
  .src--wrap .src__code { min-width: 0; overflow-wrap: anywhere; }
  .src__ln { width: 26px; flex-shrink: 0; text-align: right; color: var(--text-disabled); user-select: none; font-size: 11px; line-height: inherit; }
  .src__line--added { background: var(--success-bg); box-shadow: inset 2px 0 0 var(--success); }
  .src__line--flash { background: var(--warning-bg); }
  .src__line--more { color: var(--text-faint); font-style: italic; }
  .src__seg--comment { color: var(--text-faint); }
  .src__seg--directive { color: var(--text); font-weight: 600; }
  .src__code a { color: var(--accent); text-decoration: none; }
  .src__code a:hover { text-decoration: underline; }

  /* Animation */
  @keyframes fadeUp {
    from { opacity: 0; transform: translateY(8px); }
    to { opacity: 1; transform: translateY(0); }
  }
  @keyframes spin { to { transform: rotate(360deg); } }
</style>
