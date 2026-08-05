<script lang="ts">
  import type {
    IndexabilityStatus,
    OverviewAnalysis,
    OverviewNetwork,
    OverviewFinding,
    RawLink,
    RawOverview,
    ShopifyContext
  } from './utils/types';
  import { socialProfiles, TITLE_MIN, TITLE_MAX, DESC_MIN, DESC_MAX } from './utils/overview';
  import { titleWidthPx, TITLE_MAX_PX } from './utils/text-width';
  import SerpPreview from './SerpPreview.svelte';
  import { trackAction } from '@/utils/analytics';
  import { untrack } from 'svelte';

  let {
    raw,
    network,
    networkLoading,
    shopify,
    analysis,
    links
  }: {
    raw: RawOverview | null;
    network: OverviewNetwork | null;
    networkLoading: boolean;
    shopify: ShopifyContext | null;
    analysis: OverviewAnalysis;
    links: RawLink[];
  } = $props();

  let tracked = false;
  $effect(() => {
    if (tracked || !raw) return;
    tracked = true;
    untrack(() => {
      trackAction('overview_view', {
        indexability: analysis.indexability.status,
        error_count: analysis.errorCount,
        finding_count: analysis.findings.length,
        is_shopify: shopify?.isShopify ?? false
      });
    });
  });

  const profiles = $derived(socialProfiles(links));
  const origin = $derived.by(() => {
    try {
      return raw ? new URL(raw.url).origin : null;
    } catch {
      return null;
    }
  });

  // Preview/password findings surface as a banner instead of a plain finding row.
  const previewFinding = $derived(
    analysis.findings.find((f) => f.code === 'preview-mode' || f.code === 'password-page')
  );
  const listedFindings = $derived(analysis.findings.filter((f) => f !== previewFinding));
  // Findings list is hidden for now; flip to bring it back.
  const showFindings = false;

  const verdictLabel: Record<IndexabilityStatus, string> = {
    indexable: 'Indexable',
    'not-indexable': 'Not indexable',
    canonicalized: 'Canonicalized',
    unknown: 'Unknown'
  };
  const verdictVariant: Record<IndexabilityStatus, 'ok' | 'warn' | 'bad' | 'neutral'> = {
    indexable: 'ok',
    canonicalized: 'warn',
    'not-indexable': 'bad',
    unknown: 'neutral'
  };
  const variant = $derived(verdictVariant[analysis.indexability.status]);
  const reasonLine = $derived(analysis.indexability.reasons.join(' · '));

  const PAGE_TYPE_LABELS: Record<string, string> = {
    home: 'Home page',
    product: 'Product',
    collection: 'Collection',
    'list-collections': 'Collections',
    article: 'Article',
    blog: 'Blog',
    page: 'Page',
    cart: 'Cart',
    searchresults: 'Search results',
    password: 'Password'
  };
  const pageTypeLabel = $derived.by(() => {
    const t = analysis.pageType;
    if (!t) return null;
    return PAGE_TYPE_LABELS[t] ?? t.charAt(0).toUpperCase() + t.slice(1);
  });

  type PillTone = 'green' | 'yellow' | 'red' | 'gray';
  const rangeTone = (len: number, min: number, max: number, overMax = false): PillTone =>
    len < min ? 'yellow' : len > max || overMax ? 'red' : 'green';

  const titlePx = $derived(analysis.title.text ? Math.round(titleWidthPx(analysis.title.text)) : 0);
  const titleTone = $derived<PillTone>(
    analysis.title.text ? rangeTone(analysis.title.length, TITLE_MIN, TITLE_MAX, titlePx > TITLE_MAX_PX) : 'red'
  );
  const descTone = $derived<PillTone>(
    analysis.description.text ? rangeTone(analysis.description.length, DESC_MIN, DESC_MAX) : 'red'
  );

  const canonicalPill: Record<OverviewAnalysis['canonical']['kind'], { label: string; tone: PillTone }> = {
    self: { label: 'Self-referencing', tone: 'green' },
    elsewhere: { label: 'Elsewhere', tone: 'yellow' },
    'cross-domain': { label: 'Cross-domain', tone: 'red' },
    multiple: { label: 'Conflicting', tone: 'red' },
    missing: { label: 'Missing', tone: 'gray' }
  };

  const directiveLabel = (d: { name: string; value: string | null }) =>
    `${d.name}${d.value !== null ? `:${d.value}` : ''}`;
  const metaDirectives = $derived(analysis.directives.filter((d) => d.source !== 'header'));
  const robotsTagText = $derived(metaDirectives.map(directiveLabel).join(', '));

  // Lint messages mark code with backticks; odd-indexed parts render as <code>.
  const messageParts = (message: string): { text: string; code: boolean }[] =>
    message.split('`').map((text, i) => ({ text, code: i % 2 === 1 }));

  const severityVariant: Record<OverviewFinding['severity'], string> = {
    error: 'error',
    warning: 'warning',
    info: 'info'
  };

  let copiedKey = $state<string | null>(null);
  async function copy(key: string, value: string) {
    try {
      await navigator.clipboard.writeText(value);
      copiedKey = key;
      trackAction('overview_copy', { field: key });
      setTimeout(() => (copiedKey = null), 1500);
    } catch {
      // clipboard denied: leave the row unchanged
    }
  }

  function quickLink(name: string, url: string) {
    trackAction('overview_quick_link', { link: name });
    window.open(url, '_blank');
  }

  // Bordered pill icons for the known networks socialProfiles() reports; others
  // fall back to a generic globe.
  const SOCIAL_ICONS: Record<string, string> = {
    Facebook: 'M18 2h-3a5 5 0 00-5 5v3H7v4h3v8h4v-8h3l1-4h-4V7a1 1 0 011-1h3z',
    'X (Twitter)':
      'M23 3a10.9 10.9 0 01-3.14 1.53 4.48 4.48 0 00-7.86 3v1A10.66 10.66 0 013 4s-4 9 5 13a11.64 11.64 0 01-7 2c9 5 20 0 20-11.5 0-.28-.03-.56-.08-.83A7.72 7.72 0 0023 3z',
    Instagram:
      'M16 4H8a4 4 0 00-4 4v8a4 4 0 004 4h8a4 4 0 004-4V8a4 4 0 00-4-4zm-4 11a3 3 0 110-6 3 3 0 010 6zm4.5-7.5a1 1 0 110-2 1 1 0 010 2z',
    YouTube:
      'M22.54 6.42a2.78 2.78 0 00-1.94-2C18.88 4 12 4 12 4s-6.88 0-8.6.46a2.78 2.78 0 00-1.94 2A29 29 0 001 11.75a29 29 0 00.46 5.33A2.78 2.78 0 003.4 19.1c1.72.46 8.6.46 8.6.46s6.88 0 8.6-.46a2.78 2.78 0 001.94-2 29 29 0 00.46-5.25 29 29 0 00-.46-5.43zM9.75 15.02V8.48l5.75 3.27-5.75 3.27z',
    TikTok:
      'M19.59 6.69a4.83 4.83 0 01-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 01-2.88 2.5 2.89 2.89 0 01-2.89-2.89 2.89 2.89 0 012.89-2.89c.28 0 .54.04.79.11V9.02a6.27 6.27 0 00-.79-.05 6.34 6.34 0 00-6.34 6.34 6.34 6.34 0 006.34 6.34 6.34 6.34 0 006.34-6.34V8.75a8.18 8.18 0 004.76 1.52V6.82a4.83 4.83 0 01-1-.13z'
  };
</script>

{#if !raw}
  <div class="empty-state">
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" class="empty-state__icon">
      <path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z" />
      <polyline points="9 22 9 12 15 12 15 22" />
    </svg>
    <p>Page data unavailable. Reload the page and reopen Alfred.</p>
  </div>
{:else}
  <div class="ovw">
    {#if previewFinding}
      <div class="banner banner--{previewFinding.severity}">
        <span class="banner__dot"></span>{previewFinding.message}
      </div>
    {/if}

    <!-- Verdict hero -->
    <div class="ovw-verdict ovw-verdict--{variant}">
      <div class="ovw-verdict-icon">
        {#if variant === 'ok'}
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" aria-hidden="true"><path d="M20 6L9 17l-5-5" /></svg>
        {:else if variant === 'bad'}
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" aria-hidden="true"><path d="M18 6L6 18M6 6l12 12" /></svg>
        {:else if variant === 'warn'}
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" aria-hidden="true"><path d="M12 8v5" /><path d="M12 16h.01" /></svg>
        {:else}
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" aria-hidden="true"><path d="M9.5 9a2.5 2.5 0 015 .3c0 1.7-2.5 2-2.5 3.7" /><path d="M12 17h.01" /></svg>
        {/if}
      </div>
      <div class="ovw-verdict-body">
        <div class="ovw-verdict-title">{verdictLabel[analysis.indexability.status]}</div>
        <div class="ovw-verdict-sub">
          {reasonLine}{#if networkLoading}<span class="ovw-verdict-pending"> · checking headers</span>{/if}
        </div>
      </div>
      {#if pageTypeLabel}
        <span class="pill pill-gray ovw-verdict-type">{pageTypeLabel}</span>
      {/if}
    </div>

    <!-- Meta -->
    <div class="section-heading">Meta</div>
    <div class="ovw-meta-item">
      <div class="ovw-meta-head">
        <span class="ovw-meta-label">Title</span>
        {#if analysis.title.text}
          <span class="pill pill-{titleTone}">{analysis.title.length} / {TITLE_MAX} chars · {titlePx} / {TITLE_MAX_PX} px</span>
        {:else}
          <span class="pill pill-red">Missing</span>
        {/if}
      </div>
      <div class="ovw-meta-value">
        {#if analysis.title.text}
          <span class="ovw-meta-text">{analysis.title.text}</span>
          <button class="copy-btn" onclick={() => copy('title', analysis.title.text ?? '')} aria-label="Copy title">
            {#if copiedKey === 'title'}
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round"><polyline points="20 6 9 17 4 12" /></svg>
            {:else}
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round"><rect x="9" y="9" width="13" height="13" rx="2" /><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" /></svg>
            {/if}
          </button>
        {:else}
          <span class="missing">Not specified</span>
        {/if}
      </div>
    </div>
    <div class="ovw-meta-item">
      <div class="ovw-meta-head">
        <span class="ovw-meta-label">Description</span>
        {#if analysis.description.text}
          <span class="pill pill-{descTone}">{analysis.description.length} / {DESC_MAX} chars</span>
        {:else}
          <span class="pill pill-red">Missing</span>
        {/if}
      </div>
      <div class="ovw-meta-value">
        {#if analysis.description.text}
          {analysis.description.text}
        {:else}
          <span class="missing">Not specified</span>
        {/if}
      </div>
    </div>
    <div class="ovw-meta-item">
      <div class="ovw-meta-head">
        <span class="ovw-meta-label">Canonical</span>
        <span class="pill pill-{canonicalPill[analysis.canonical.kind].tone}">{canonicalPill[analysis.canonical.kind].label}</span>
      </div>
      <div class="ovw-meta-value">
        {#if analysis.canonical.href}
          <a href={analysis.canonical.href} target="_blank" rel="noopener">{analysis.canonical.href}</a>
          <button class="copy-btn" onclick={() => copy('canonical', analysis.canonical.href ?? '')} aria-label="Copy canonical URL">
            {#if copiedKey === 'canonical'}
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round"><polyline points="20 6 9 17 4 12" /></svg>
            {:else}
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round"><rect x="9" y="9" width="13" height="13" rx="2" /><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" /></svg>
            {/if}
          </button>
        {:else}
          <span class="missing">Not specified</span>
        {/if}
      </div>
    </div>

    <!-- Search Preview -->
    <div class="section-heading">Search Preview</div>
    <SerpPreview
      title={analysis.title.text ?? ''}
      description={analysis.description.text ?? ''}
      url={raw.url}
      favicon={raw.faviconHref}
      siteName={raw.ogSiteName}
    />
    <div class="serp-note">Based on the page's meta tags. Google often rewrites titles and descriptions, so the live result may differ.</div>

    <!-- Technical -->
    <div class="section-heading">Technical</div>
    <div class="row">
      <span class="row-label">Robots Tag</span>
      {#if robotsTagText}
        <span class="row-value">{robotsTagText}</span>
      {:else}
        <span class="row-value muted">Missing</span>
      {/if}
    </div>
    <div class="row">
      <span class="row-label">X-Robots-Tag</span>
      {#if network?.xRobotsTag}
        <span class="row-value">{network.xRobotsTag}</span>
      {:else}
        <span class="row-value muted">{networkLoading ? 'Checking' : 'Missing'}</span>
      {/if}
    </div>
    <div class="row">
      <span class="row-label">Word Count</span>
      <span class="row-value">
        {#if raw.wordCount < 300}<span class="pill pill-yellow">Thin</span>{/if}
        {raw.wordCount.toLocaleString()}
      </span>
    </div>
    <div class="row">
      <button class="row-label row-label-link" onclick={() => quickLink('llms-txt', `${origin}/llms.txt`)}>
        llms.txt
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6M15 3h6v6M10 14L21 3" /></svg>
      </button>
      {#if network?.llmsTxt}
        <span class="row-value"><span class="pill pill-green">Present</span></span>
      {:else}
        <span class="row-value muted">{networkLoading ? 'Checking' : 'Missing'}</span>
      {/if}
    </div>

    <!-- Quick Links -->
    <div class="section-heading">Quick Links</div>
    <div class="quick-links-v2">
      {#if origin}
        <button class="quick-link-v2" onclick={() => quickLink('robots', `${origin}/robots.txt`)}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6M15 3h6v6M10 14L21 3" /></svg>
          Robots.txt
        </button>
        <button class="quick-link-v2" onclick={() => quickLink('sitemap', `${origin}/sitemap.xml`)}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6M15 3h6v6M10 14L21 3" /></svg>
          Sitemap.xml
        </button>
      {/if}
      <button class="quick-link-v2" onclick={() => quickLink('rich-results', `https://search.google.com/test/rich-results?url=${encodeURIComponent(raw.url)}`)}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6M15 3h6v6M10 14L21 3" /></svg>
        Rich Results Test
      </button>
      <button class="quick-link-v2" onclick={() => quickLink('pagespeed', `https://pagespeed.web.dev/analysis?url=${encodeURIComponent(raw.url)}`)}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6M15 3h6v6M10 14L21 3" /></svg>
        PageSpeed Insights
      </button>
    </div>

    <!-- Findings (hidden for now, kept for a future toggle) -->
    {#if showFindings && listedFindings.length > 0}
      <div class="section-heading">Findings</div>
      {#each listedFindings as finding}
        <div class="rbt-issue rbt-issue--{severityVariant[finding.severity]}">
          <span class="dot" aria-hidden="true"></span>
          <span class="rbt-issue-msg">
            {#each messageParts(finding.message) as part}
              {#if part.code}<code>{part.text}</code>{:else}{part.text}{/if}
            {/each}
          </span>
        </div>
      {/each}
    {/if}

    <!-- Social Profiles -->
    {#if profiles.length > 0}
      <div class="section-heading">Social Profiles</div>
      <div class="social-row">
        {#each profiles as profile}
          <a
            class="social-link"
            href={profile.url}
            target="_blank"
            rel="noopener"
            onclick={() => trackAction('overview_social_profile', { network: profile.network })}
          >
            {#if SOCIAL_ICONS[profile.network]}
              <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d={SOCIAL_ICONS[profile.network]} /></svg>
            {:else}
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="12" r="10" /><path d="M2 12h20M12 2a15.3 15.3 0 014 10 15.3 15.3 0 01-4 10 15.3 15.3 0 01-4-10 15.3 15.3 0 014-10z" /></svg>
            {/if}
            {profile.network}
          </a>
        {/each}
      </div>
    {/if}
  </div>
{/if}

<style>
  .ovw {
    padding: 24px 28px 28px;
    animation: fadeUp 0.4s ease both;
  }

  /* Preview/password banner */
  .banner {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 9px 14px;
    border-radius: 10px;
    font-size: 12.5px;
    font-weight: 500;
    margin-bottom: 16px;
    background: var(--warning-bg);
    color: var(--warning);
  }
  .banner--error {
    background: var(--error-bg);
    color: var(--error-strong);
  }
  .banner__dot {
    width: 7px;
    height: 7px;
    border-radius: 50%;
    background: currentColor;
    flex-shrink: 0;
  }

  /* Verdict hero */
  .ovw-verdict {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 9px 12px;
    border-radius: 10px;
    margin-bottom: 16px;
  }
  .ovw-verdict--ok {
    background: var(--success-bg);
    border: 1px solid color-mix(in srgb, var(--success) 22%, transparent);
  }
  .ovw-verdict--warn {
    background: var(--warning-bg);
    border: 1px solid color-mix(in srgb, var(--warning) 22%, transparent);
  }
  .ovw-verdict--bad {
    background: var(--error-bg);
    border: 1px solid color-mix(in srgb, var(--error) 22%, transparent);
  }
  .ovw-verdict--neutral {
    background: var(--bg-inset);
    border: 1px solid var(--border);
  }
  .ovw-verdict-icon {
    width: 22px;
    height: 22px;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
    color: #fff;
  }
  .ovw-verdict--ok .ovw-verdict-icon {
    background: var(--success);
  }
  .ovw-verdict--warn .ovw-verdict-icon {
    background: var(--warning);
  }
  .ovw-verdict--bad .ovw-verdict-icon {
    background: var(--error);
  }
  .ovw-verdict--neutral .ovw-verdict-icon {
    background: var(--text-muted);
  }
  .ovw-verdict-icon svg {
    width: 12px;
    height: 12px;
    stroke-width: 2.6;
  }
  .ovw-verdict-body {
    min-width: 0;
  }
  .ovw-verdict-title {
    font-size: 13px;
    font-weight: 700;
    letter-spacing: -0.01em;
    color: var(--text);
  }
  .ovw-verdict--ok .ovw-verdict-title {
    color: var(--success-strong);
  }
  .ovw-verdict--warn .ovw-verdict-title {
    color: var(--warning);
  }
  .ovw-verdict--bad .ovw-verdict-title {
    color: var(--error-strong);
  }
  .ovw-verdict-sub {
    font-size: 11.5px;
    color: var(--text-muted);
    margin-top: 0;
  }
  .ovw-verdict-pending {
    font-style: italic;
  }
  .ovw-verdict-type {
    margin-left: auto;
    flex-shrink: 0;
  }

  /* Section heading */
  .section-heading {
    font-size: 12px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: var(--text-primary);
    padding: 22px 0 10px;
    border-bottom: 1px solid var(--border-soft);
    margin-bottom: 6px;
  }

  /* Meta items */
  .ovw-meta-item {
    padding: 11px 0;
    border-bottom: 1px solid var(--border-muted);
  }
  .ovw-meta-item:last-of-type {
    border-bottom: none;
  }
  .ovw-meta-head {
    display: flex;
    align-items: center;
    gap: 8px;
  }
  .ovw-meta-label {
    font-size: 13.5px;
    font-weight: 500;
    color: var(--text-muted);
  }
  .ovw-meta-head .pill {
    margin-left: auto;
  }
  .ovw-meta-value {
    display: flex;
    align-items: center;
    gap: 7px;
    font-size: 13.5px;
    font-weight: 500;
    line-height: 1.5;
    color: var(--text);
    margin-top: 4px;
    overflow-wrap: anywhere;
    min-width: 0;
  }
  .ovw-meta-text {
    min-width: 0;
  }
  .ovw-meta-value a {
    color: var(--accent);
    text-decoration: none;
    font-family: ui-monospace, monospace;
    font-size: 12.5px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .ovw-meta-value a:hover {
    text-decoration: underline;
  }

  /* Technical rows */
  .row {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 12px 0;
    border-bottom: 1px solid var(--border-muted);
    gap: 16px;
  }
  .row:last-of-type {
    border-bottom: none;
  }
  .row-label {
    font-size: 13.5px;
    font-weight: 500;
    color: var(--text-muted);
    flex-shrink: 0;
  }
  .row-value {
    display: flex;
    align-items: center;
    gap: 7px;
    justify-content: flex-end;
    font-size: 13.5px;
    color: var(--text);
    font-weight: 500;
    text-align: right;
    overflow: hidden;
    min-width: 0;
  }
  .row-value.muted {
    color: var(--text-muted);
    font-weight: 400;
  }
  .serp-note {
    margin-top: 7px;
    font-size: 11.5px;
    line-height: 1.5;
    color: var(--text-muted);
  }
  .row-value a {
    color: var(--accent);
    text-decoration: none;
    font-size: 12.5px;
    font-family: ui-monospace, monospace;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .row-value a:hover {
    text-decoration: underline;
  }

  /* Copy button */
  .copy-btn {
    background: none;
    border: none;
    cursor: pointer;
    color: var(--text-muted);
    padding: 2px;
    border-radius: 3px;
    line-height: 0;
    flex-shrink: 0;
    transition: color 0.12s;
  }
  .copy-btn:hover {
    color: var(--text);
  }
  .copy-btn svg {
    width: 13px;
    height: 13px;
  }

  /* Pills */
  .pill {
    display: inline-flex;
    align-items: center;
    font-size: 11.5px;
    font-weight: 600;
    padding: 2px 8px;
    border-radius: 20px;
    white-space: nowrap;
  }
  .pill-red {
    background: var(--error-bg);
    color: var(--error-strong);
  }
  .pill-green {
    background: var(--success-bg);
    color: var(--success-strong);
  }
  .pill-yellow {
    background: var(--warning-bg);
    color: var(--warning);
  }
  .pill-gray {
    background: var(--bg-inset);
    color: var(--text-secondary);
  }
  .row-label-link {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    background: none;
    border: none;
    padding: 0;
    font-family: inherit;
    cursor: pointer;
  }
  .row-label-link svg {
    width: 12px;
    height: 12px;
  }
  .row-label-link:hover {
    color: var(--text);
    text-decoration: underline;
  }

  .missing {
    color: var(--error-strong);
    font-weight: 500;
  }

  /* Quick links */
  .quick-links-v2 {
    display: flex;
    gap: 6px;
    flex-wrap: wrap;
  }
  .quick-link-v2 {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    padding: 6px 11px;
    font-size: 11.5px;
    font-weight: 500;
    color: var(--text-secondary);
    background: var(--bg);
    border: 1px solid var(--border);
    border-radius: 6px;
    text-decoration: none;
    cursor: pointer;
    font-family: inherit;
    transition: all 0.12s;
  }
  .quick-link-v2:hover {
    border-color: var(--border-hover);
    color: var(--text);
    box-shadow: var(--shadow-sm);
  }
  .quick-link-v2 svg {
    width: 12px;
    height: 12px;
    opacity: 0.55;
  }

  /* Findings */
  .rbt-issue {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 8px 0;
    border-bottom: 1px solid var(--border-muted);
    font-size: 12.5px;
    color: var(--text-secondary);
  }
  .rbt-issue:last-of-type {
    border-bottom: none;
  }
  .rbt-issue .dot {
    width: 7px;
    height: 7px;
    border-radius: 50%;
    flex-shrink: 0;
  }
  .rbt-issue--error .dot {
    background: var(--error);
  }
  .rbt-issue--warning .dot {
    background: var(--warning);
  }
  .rbt-issue--info .dot {
    background: var(--text-faint);
  }
  .rbt-issue-msg {
    flex: 1;
  }
  .rbt-issue-msg code {
    font-family: ui-monospace, monospace;
    font-size: 11.5px;
    background: var(--bg-inset);
    padding: 1px 5px;
    border-radius: 4px;
    color: var(--text);
  }

  /* Social profiles */
  .social-row {
    display: flex;
    gap: 7px;
    flex-wrap: wrap;
    padding-top: 4px;
  }
  .social-link {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 6px 12px;
    border: 1px solid var(--border);
    border-radius: 8px;
    font-size: 13px;
    font-weight: 500;
    color: var(--text-muted);
    text-decoration: none;
  }
  .social-link:hover {
    border-color: var(--border-hover);
    color: var(--text);
  }
  .social-link svg {
    width: 14px;
    height: 14px;
  }

  /* Empty state */
  .empty-state {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    height: 100%;
    gap: 8px;
    color: var(--text-muted);
    font-size: 13px;
  }
  .empty-state__icon {
    width: 32px;
    height: 32px;
    opacity: 0.3;
    stroke-width: 1.5;
  }
  .empty-state p {
    margin: 0;
  }

  @keyframes fadeUp {
    from {
      opacity: 0;
      transform: translateY(8px);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }
</style>
