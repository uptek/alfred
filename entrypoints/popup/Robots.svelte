<script lang="ts">
  import type { RobotsResponse } from './types';
  import type { AiBot, LintFinding, ParsedRobots } from './robots';
  import { AI_BOTS, detectShopifyDefault, isAllowed, lintRobots, parseRobots } from './robots';
  import { trackAction } from '@/utils/analytics';
  import { untrack } from 'svelte';

  let {
    robots,
    pageUrl,
    isShopify
  }: { robots: RobotsResponse | null; pageUrl: string | null; isShopify: boolean } = $props();

  const ok = $derived(robots !== null && robots.ok && robots.status >= 200 && robots.status < 300);
  const looksLikeHtml = $derived(ok && /<html|<!doctype/i.test(robots!.content.slice(0, 1024)));

  const parsed = $derived<ParsedRobots | null>(ok ? parseRobots(robots!.content) : null);

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

  const verdict = $derived(parsed ? isAllowed(parsed, currentPath, 'Googlebot') : null);

  const AI_GROUPS: { purpose: AiBot['purpose']; label: string }[] = [
    { purpose: 'training', label: 'Training' },
    { purpose: 'search', label: 'AI Search' },
    { purpose: 'fetch', label: 'User Fetch' }
  ];

  const aiRows = $derived.by(() => {
    if (!parsed) return [];
    const p = parsed;
    return AI_GROUPS.map(({ purpose, label }) => {
      const bots = AI_BOTS.filter((b) => b.purpose === purpose).map((bot) => ({
        bot,
        verdict: isAllowed(p, currentPath, bot.token)
      }));
      const blocked = bots.filter((b) => !b.verdict.allowed).length;
      return {
        label,
        bots,
        summary: blocked === 0 ? 'all allowed' : blocked === bots.length ? 'all blocked' : `${blocked} of ${bots.length} blocked`
      };
    });
  });

  const shopifyDiff = $derived(parsed && isShopify ? detectShopifyDefault(parsed) : null);
  const addedLines = $derived(new Set(shopifyDiff && !shopifyDiff.isDefault ? shopifyDiff.addedLines : []));

  const findings = $derived.by<LintFinding[]>(() => {
    if (!parsed || !robots) return [];
    const all = lintRobots(parsed, { size: robots.size });
    if (looksLikeHtml) {
      all.unshift({
        severity: 'warning',
        code: 'serves-html',
        message: 'robots.txt serves HTML instead of plain text — crawlers may ignore it'
      });
    }
    if (shopifyDiff && !shopifyDiff.isDefault) {
      all.push({
        severity: 'info',
        code: 'shopify-customized',
        message: `Differs from the default Shopify robots.txt — ${shopifyDiff.addedLines.length} added, ${shopifyDiff.removedRules.length} removed (added lines highlighted below)`
      });
    }
    return all;
  });

  const sizeLabel = $derived.by(() => {
    const size = robots?.size ?? 0;
    return size < 1024 ? `${size} B` : `${(size / 1024).toFixed(1)} KB`;
  });

  let tracked = false;
  $effect(() => {
    if (tracked || robots === null) return;
    tracked = true;
    untrack(() => {
      trackAction('robots_view', {
        status: robots.status,
        is_shopify_default: shopifyDiff?.isDefault ?? false,
        error_count: findings.filter((f) => f.severity === 'error').length,
        page_blocked: verdict ? !verdict.allowed : false
      });
    });
  });

  // Source view: click-to-line scroll + flash
  let srcEl: HTMLElement | undefined = $state();
  let flashedLine = $state<number | null>(null);
  let flashTimer: ReturnType<typeof setTimeout> | undefined;

  function goToLine(line: number) {
    srcEl?.querySelector(`[data-line="${line}"]`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    flashedLine = line;
    clearTimeout(flashTimer);
    flashTimer = setTimeout(() => (flashedLine = null), 1600);
    trackAction('robots_goto_line', { line });
  }

  let copyState = $state<'idle' | 'copied'>('idle');
  async function handleCopy() {
    if (!robots) return;
    try {
      await navigator.clipboard.writeText(robots.content);
      copyState = 'copied';
      trackAction('robots_copy', { size: robots.size });
      setTimeout(() => (copyState = 'idle'), 1500);
    } catch {
      // silent fail
    }
  }

  type Segment = { text: string; kind: 'code' | 'directive' | 'comment' | 'link' };

  function segmentLine(raw: string): Segment[] {
    if (raw === '') return [{ text: ' ', kind: 'code' }];
    const segments: Segment[] = [];
    const hash = raw.indexOf('#');
    const code = hash === -1 ? raw : raw.slice(0, hash);
    const comment = hash === -1 ? '' : raw.slice(hash);

    if (code) {
      const sitemap = code.match(/^(\s*sitemap\s*:\s*)(https?:\/\/\S+)(.*)$/i);
      const directive = code.match(/^(\s*[A-Za-z][\w -]*?\s*:)(.*)$/);
      if (sitemap) {
        segments.push({ text: sitemap[1]!, kind: 'directive' });
        segments.push({ text: sitemap[2]!, kind: 'link' });
        if (sitemap[3]) segments.push({ text: sitemap[3], kind: 'code' });
      } else if (directive) {
        segments.push({ text: directive[1]!, kind: 'directive' });
        segments.push({ text: directive[2]!, kind: 'code' });
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

{#if robots === null || !robots.ok}
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
          <a class="action-btn" href={robotsUrl} target="_blank" rel="noopener" onclick={() => trackAction('robots_open', {})}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" class="action-btn__icon"><path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6M15 3h6v6M10 14L21 3"/></svg>
            Open
          </a>
        {/if}
        {#if ok}
          <button class="action-btn" onclick={handleCopy}>
            {#if copyState === 'copied'}
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" class="action-btn__icon"><polyline points="20 6 9 17 4 12"/></svg>
            {:else}
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" class="action-btn__icon"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/></svg>
            {/if}
            Copy
          </button>
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
      <!-- Verdict -->
      {#if verdict}
        <div class="banner" class:banner--ok={verdict.allowed} class:banner--blocked={!verdict.allowed}>
          <div class="banner__icon">
            {#if verdict.allowed}
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round"><path d="M20 6L9 17l-5-5"/></svg>
            {:else}
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round"><circle cx="12" cy="12" r="10"/><path d="M4.93 4.93l14.14 14.14"/></svg>
            {/if}
          </div>
          <div>
            <div class="banner__title">{verdict.allowed ? 'This page is crawlable' : 'This page is blocked'}</div>
            <div class="banner__sub">
              Googlebot {verdict.allowed ? 'can' : 'cannot'} fetch <span class="banner__path" title={currentPath}>{currentPath}</span>
              {#if verdict.rule}
                · matched
                <button class="rule-link" onclick={() => goToLine(verdict.rule!.line)}>
                  {verdict.rule.type === 'allow' ? 'Allow' : 'Disallow'}: {verdict.rule.path} (line {verdict.rule.line})
                </button>
              {:else}
                · no matching rule
              {/if}
            </div>
          </div>
        </div>
      {/if}

      <!-- AI crawler access -->
      <div class="section-heading">AI Crawler Access</div>
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

      <!-- Issues -->
      <div class="section-heading">Issues</div>
      <div class="issues">
        {#if findings.length === 0}
          <div class="issue">
            <span class="issue__dot issue__dot--ok"></span>
            <span class="issue__msg">No issues found</span>
          </div>
        {:else}
          {#each findings as f}
            <div class="issue">
              <span class="issue__dot issue__dot--{f.severity}" title={severityLabel(f)}></span>
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
        {/if}
      </div>

      <!-- Source -->
      <div class="section-heading">Source</div>
      <div class="src" bind:this={srcEl}>
        {#each parsed?.lines ?? [] as raw, i}
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
      </div>
    {/if}
  </div>
{/if}

<style>
  .robots { padding: 20px 24px 24px; animation: fadeUp 0.4s ease both; }

  /* Empty state */
  .empty-state { display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100%; gap: 8px; color: var(--text-muted); }
  .empty-state__icon { width: 28px; height: 28px; opacity: 0.3; stroke-width: 1.7; }
  .empty-state p { font-size: 13px; margin: 0; }

  /* Header */
  .header { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; margin-bottom: 16px; }
  .header__title-row { display: flex; align-items: center; gap: 8px; }
  .header__title { font-size: 15px; font-weight: 600; color: var(--text); }
  .header__url { display: inline-block; margin-top: 2px; font-size: 12px; color: var(--accent); text-decoration: none; font-family: 'SF Mono', ui-monospace, monospace; }
  .header__url:hover { text-decoration: underline; }
  .header__actions { display: flex; gap: 6px; flex-shrink: 0; }

  .status-pill { display: inline-flex; align-items: center; gap: 5px; font-size: 11px; font-weight: 600; font-family: 'SF Mono', ui-monospace, monospace; color: var(--text-secondary); background: var(--bg-inset); padding: 2px 8px; border-radius: 20px; }
  .status-pill__dot { width: 6px; height: 6px; border-radius: 50%; background: var(--success); }
  .status-pill__dot--error { background: var(--error); }

  .pill { display: inline-flex; align-items: center; font-size: 10.5px; font-weight: 600; padding: 2px 8px; border-radius: 20px; white-space: nowrap; }
  .pill--green { background: var(--success-bg); color: var(--success-strong); }
  .pill--purple { background: var(--accent-tint); color: var(--accent); }

  .action-btn { display: inline-flex; align-items: center; gap: 5px; padding: 5px 10px; font-size: 12px; font-weight: 500; color: var(--text-muted); background: var(--bg); border: 1px solid var(--border-strong); border-radius: 6px; cursor: pointer; transition: all 0.12s; font-family: inherit; text-decoration: none; }
  .action-btn:hover { border-color: var(--border-hover); color: var(--text-secondary); }
  .action-btn__icon { width: 13px; height: 13px; stroke-width: 1.8; }

  /* Banner (verdict + fetch states) */
  .banner { display: flex; align-items: center; gap: 12px; padding: 13px 16px; border-radius: 10px; margin-bottom: 18px; }
  .banner--ok { background: var(--success-bg); border: 1px solid color-mix(in srgb, var(--success) 20%, transparent); }
  .banner--blocked { background: var(--error-bg); border: 1px solid color-mix(in srgb, var(--error) 18%, transparent); }
  .banner--info { background: var(--accent-tint); border: 1px solid color-mix(in srgb, var(--accent) 15%, transparent); }
  .banner--warning { background: var(--warning-bg); border: 1px solid color-mix(in srgb, var(--warning) 20%, transparent); }
  .banner__icon { width: 30px; height: 30px; border-radius: 50%; display: flex; align-items: center; justify-content: center; flex-shrink: 0; background: var(--bg); }
  .banner__icon :global(svg) { width: 15px; height: 15px; stroke-width: 2.2; }
  .banner--ok .banner__icon { color: var(--success-strong); }
  .banner--blocked .banner__icon { color: var(--error-strong); }
  .banner--info .banner__icon { color: var(--accent); }
  .banner--warning .banner__icon { color: var(--warning); }
  .banner__title { font-size: 13.5px; font-weight: 600; color: var(--text); }
  .banner__sub { font-size: 12px; color: var(--text-muted); margin-top: 1px; }
  .banner__path { font-family: 'SF Mono', ui-monospace, monospace; font-size: 11.5px; }

  .rule-link { font-family: 'SF Mono', ui-monospace, monospace; font-size: 11.5px; color: var(--accent); cursor: pointer; background: none; border: none; padding: 0; }
  .rule-link:hover { text-decoration: underline; }

  /* Section headings */
  .section-heading { font-size: 11.5px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.05em; color: var(--text-label); padding: 18px 0 8px; }

  /* AI crawler access */
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

  /* Issues */
  .issue { display: flex; align-items: center; gap: 10px; padding: 8px 0; border-bottom: 1px solid var(--border-muted); font-size: 12.5px; color: var(--text-secondary); }
  .issue:last-child { border-bottom: none; }
  .issue__dot { width: 7px; height: 7px; border-radius: 50%; flex-shrink: 0; }
  .issue__dot--error { background: var(--error); }
  .issue__dot--warning { background: var(--warning); }
  .issue__dot--info { background: var(--text-faint); }
  .issue__dot--ok { background: var(--success); }
  .issue__msg { flex: 1; min-width: 0; }
  .issue__msg code { font-family: 'SF Mono', ui-monospace, monospace; font-size: 11.5px; background: var(--bg-inset); padding: 1px 5px; border-radius: 4px; color: var(--text); }

  .line-btn { font-family: 'SF Mono', ui-monospace, monospace; font-size: 11px; font-weight: 600; color: var(--accent); background: var(--accent-tint); border: none; border-radius: 5px; padding: 2px 7px; cursor: pointer; flex-shrink: 0; transition: background 0.12s; }
  .line-btn:hover { background: color-mix(in srgb, var(--accent) 14%, var(--accent-tint)); }

  /* Source view */
  .src { background: var(--bg-raised); border: 1px solid var(--border); border-radius: 10px; font-family: 'SF Mono', ui-monospace, monospace; font-size: 12px; line-height: 1.75; color: var(--text-secondary); max-height: 320px; overflow: auto; padding: 10px 0; }
  .src::-webkit-scrollbar { width: 3px; height: 3px; }
  .src::-webkit-scrollbar-thumb { background: var(--scrollbar); border-radius: 3px; }
  .src__line { display: flex; gap: 12px; padding: 0 14px; white-space: pre; transition: background 0.3s; }
  .src__ln { width: 26px; flex-shrink: 0; text-align: right; color: var(--text-disabled); user-select: none; font-size: 11px; line-height: inherit; }
  .src__line--added { background: var(--success-bg); box-shadow: inset 2px 0 0 var(--success); }
  .src__line--flash { background: var(--warning-bg); }
  .src__seg--comment { color: var(--text-faint); }
  .src__seg--directive { color: var(--text); font-weight: 600; }
  .src__code a { color: var(--accent); text-decoration: none; }
  .src__code a:hover { text-decoration: underline; }

  /* Animation */
  @keyframes fadeUp {
    from { opacity: 0; transform: translateY(8px); }
    to { opacity: 1; transform: translateY(0); }
  }
</style>
