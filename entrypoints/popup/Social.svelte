<script lang="ts" module>
  // Module scope: once per popup load, not per tab-switch remount — the
  // component remounts on every tab change and would re-fire social_view
  // (and its time-saved credit) each time.
  const viewState = { done: false };
</script>

<script lang="ts">
  import type { RawSocial } from './utils/types';
  import type { ResolvedSocial, SocialPlatform, SocialSeverity } from './utils/social';
  import { lintSocial, previewModel, probeTargetUrl } from './utils/social';
  import type { SocialProbeResult } from './utils/social';
  import { probeImage } from './utils/social-probe';
  import { createKeyedCopyFeedback } from './utils/copy.svelte';
  import { trackOnce } from './utils/track.svelte';
  import SocialCard from './SocialCard.svelte';
  import ActionButton from './ActionButton.svelte';
  import SegmentedControl from './SegmentedControl.svelte';
  import { trackAction } from '@/utils/analytics';
  import { withCredit } from '@/utils/credit';
  import { getTabState } from './stores/tabState.svelte';

  let {
    raw,
    resolved,
    loading = false
  }: { raw: RawSocial | null; resolved: ResolvedSocial | null; loading?: boolean } = $props();

  let probe = $state<SocialProbeResult | null>(null);
  let probeLoading = $state(false);
  let lastProbedUrl: string | null = null;

  // Never gate the preview on the probe — render resolved tags immediately,
  // then reconcile the image findings when the probe lands.
  $effect(() => {
    const target = resolved ? probeTargetUrl(resolved) : null;
    if (!target) {
      probe = null;
      probeLoading = false;
      lastProbedUrl = null;
      return;
    }
    if (target === lastProbedUrl) return;
    lastProbedUrl = target;
    probe = null;
    probeLoading = true;
    probeImage(target).then((result) => {
      if (lastProbedUrl !== target) return; // page navigated mid-probe
      probe = result;
      probeLoading = false;
    });
  });

  const findings = $derived(resolved ? lintSocial(resolved, probe) : []);

  interface SocialPersisted {
    platform: SocialPlatform;
  }

  const tabState = getTabState();
  const restored = tabState.getSection<SocialPersisted>('social');

  let platform = $state<SocialPlatform>(restored?.platform ?? 'facebook');

  $effect(() => {
    tabState.saveSection('social', { platform });
  });

  trackOnce(
    () => raw !== null,
    () =>
      trackAction('social_view', {
        error_count: findings.filter((f) => f.severity === 'error').length,
        warning_count: findings.filter((f) => f.severity === 'warning').length,
        platform
      }),
    viewState
  );

  const PLATFORMS: { id: SocialPlatform; label: string }[] = [
    { id: 'facebook', label: 'Facebook' },
    { id: 'x', label: 'X' },
    { id: 'linkedin', label: 'LinkedIn' }
  ];

  function selectPlatform(p: SocialPlatform) {
    if (p === platform) return;
    platform = p;
    trackAction('social_platform_click', { platform: p });
  }

  const preview = $derived(resolved ? previewModel(resolved, platform) : null);

  const severityRank: Record<SocialSeverity, number> = { error: 0, warning: 1, info: 2 };
  const platformFindings = $derived(
    [...findings]
      .filter((f) => f.platforms.includes(platform))
      .sort((a, b) => severityRank[a.severity] - severityRank[b.severity])
  );

  function severityLabel(s: SocialSeverity): string {
    return s === 'error' ? 'Error' : s === 'warning' ? 'Warning' : 'Info';
  }

  const tagRows = $derived.by(() => {
    if (!resolved) return [];
    const rows: { key: string; value: string }[] = [];
    if (resolved.og.title !== undefined) rows.push({ key: 'og:title', value: resolved.og.title });
    if (resolved.og.description !== undefined) rows.push({ key: 'og:description', value: resolved.og.description });
    if (resolved.og.url !== undefined) rows.push({ key: 'og:url', value: resolved.og.url });
    if (resolved.og.type !== undefined) rows.push({ key: 'og:type', value: resolved.og.type });
    if (resolved.og.siteName !== undefined) rows.push({ key: 'og:site_name', value: resolved.og.siteName });
    resolved.images.forEach((img, i) => {
      const label = resolved.images.length > 1 ? `og:image[${i}]` : 'og:image';
      rows.push({ key: label, value: img.secureUrl ?? img.url });
    });
    if (resolved.fbAppId !== undefined) rows.push({ key: 'fb:app_id', value: resolved.fbAppId });
    if (resolved.twitter.card !== undefined) rows.push({ key: 'twitter:card', value: resolved.twitter.card });
    if (resolved.twitter.title !== undefined) rows.push({ key: 'twitter:title', value: resolved.twitter.title });
    if (resolved.twitter.description !== undefined)
      rows.push({ key: 'twitter:description', value: resolved.twitter.description });
    if (resolved.twitter.image !== undefined) rows.push({ key: 'twitter:image', value: resolved.twitter.image });
    return rows;
  });

  // X reads twitter:* with og:* fallbacks, so it gets every row; FB/LinkedIn ignore twitter:*.
  const copyRows = $derived(
    platform === 'x' ? tagRows : tagRows.filter((r) => !r.key.startsWith('twitter:'))
  );

  function escapeAttr(value: string): string {
    return value.replaceAll('&', '&amp;').replaceAll('"', '&quot;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
  }

  function tagsAsHtml(): string {
    return copyRows
      .map((r) => {
        const key = r.key.replace(/\[\d+\]$/, '');
        const attr = key.startsWith('twitter:') ? 'name' : 'property';
        return `<meta ${attr}="${key}" content="${escapeAttr(r.value)}">`;
      })
      .join('\n');
  }

  function tagsAsText(): string {
    return copyRows.map((r) => `${r.key}: ${r.value}`).join('\n');
  }

  const copyFeedback = createKeyedCopyFeedback<'html' | 'text'>();

  async function copyTags(format: 'html' | 'text') {
    const text = format === 'html' ? tagsAsHtml() : withCredit(tagsAsText());
    if (await copyFeedback.copy(text, format)) trackAction('social_copy_tags', { platform, format });
  }

  const duplicateNotes = $derived(
    resolved ? Object.entries(resolved.duplicateCounts).map(([key, count]) => `${key} appears ${count} times`) : []
  );
</script>

{#if loading}
  <div class="empty-state">
    <div class="empty-state__spinner"></div>
    <p>Loading social tags…</p>
  </div>
{:else if resolved === null || preview === null}
  <div class="empty-state">
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" class="empty-state__icon"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></svg>
    <p>Couldn't read social tags for this page</p>
  </div>
{:else}
  <div class="social">
    <div class="switcher-row">
      <SegmentedControl
        tablist
        options={PLATFORMS.map((p) => ({ value: p.id, label: p.label }))}
        value={platform}
        label="Preview platform"
        onSelect={(v) => selectPlatform(v as SocialPlatform)} />
    </div>

    <div class="preview">
      <SocialCard {preview} {platform} />
      {#if probeLoading}
        <div class="probe-hint">Verifying image…</div>
      {/if}
    </div>

    {#if platformFindings.length > 0}
      <div class="section-heading">Issues</div>
      <div class="issues">
        {#each platformFindings as f}
          <div class="issue">
            <span class="issue__dot issue__dot--{f.severity}" role="img" aria-label={severityLabel(f.severity)} title={severityLabel(f.severity)}></span>
            <span class="issue__msg">{f.message}</span>
          </div>
        {/each}
      </div>
    {/if}

    {#if tagRows.length > 0}
      <div class="section-heading section-heading--row">
        <span>Tags</span>
        <span class="copy-actions">
          {#each [{ format: 'html', label: 'Copy HTML' }, { format: 'text', label: 'Copy text' }] as const as btn}
            <ActionButton onclick={() => copyTags(btn.format)}>
              {#if copyFeedback.key === btn.format}
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" class="icon-copied"><polyline points="20 6 9 17 4 12"/></svg>
              {:else}
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/></svg>
              {/if}
              {btn.label}
            </ActionButton>
          {/each}
        </span>
      </div>
      <div class="tags">
        {#each tagRows as row}
          <div class="tag-row">
            <span class="tag-row__key">{row.key}</span>
            <span class="tag-row__value">{row.value}</span>
          </div>
        {/each}
      </div>
      {#if duplicateNotes.length > 0}
        <div class="dup-notes">
          {#each duplicateNotes as note}
            <div class="dup-notes__item">{note}</div>
          {/each}
        </div>
      {/if}
    {/if}
  </div>
{/if}

<style>
  .social { padding: 20px 24px 24px; animation: fadeUp 0.4s ease both; }

  .empty-state { display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100%; gap: 8px; color: var(--text-muted); }
  .empty-state__icon { width: 28px; height: 28px; opacity: 0.3; stroke-width: 1.7; }
  .empty-state__spinner { width: 20px; height: 20px; border: 2px solid var(--border-strong); border-top-color: var(--accent); border-radius: 50%; animation: spin 0.8s linear infinite; }
  .empty-state p { font-size: 13px; margin: 0; }

  /* Platform switcher */
  .switcher-row { margin-bottom: 16px; }

  /* Preview */
  .preview { max-width: 380px; }
  .probe-hint { margin-top: 6px; font-size: 11.5px; color: var(--text-faint); }

  /* Section headings (matches Robots.svelte) */
  .section-heading { font-size: 11.5px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.05em; color: var(--text-label); padding: 18px 0 8px; }
  .section-heading--row { display: flex; align-items: center; justify-content: space-between; }
  .copy-actions { display: inline-flex; gap: 6px; }
  .icon-copied { color: var(--success-strong); }

  /* Issues */
  .issue { display: flex; align-items: center; gap: 10px; padding: 8px 0; border-bottom: 1px solid var(--border-muted); font-size: 12.5px; color: var(--text-secondary); }
  .issue:last-child { border-bottom: none; }
  .issue__dot { width: 7px; height: 7px; border-radius: 50%; flex-shrink: 0; }
  .issue__dot--error { background: var(--error); }
  .issue__dot--warning { background: var(--warning); }
  .issue__dot--info { background: var(--text-faint); }
  .issue__msg { flex: 1; min-width: 0; }

  /* Tags table */
  .tags { display: flex; flex-direction: column; }
  .tag-row { display: flex; gap: 12px; padding: 6px 0; border-bottom: 1px solid var(--border-muted); font-size: 12px; }
  .tag-row:last-child { border-bottom: none; }
  .tag-row__key { flex-shrink: 0; width: 140px; font-family: 'SF Mono', ui-monospace, monospace; color: var(--text-muted); }
  .tag-row__value { flex: 1; min-width: 0; color: var(--text-secondary); overflow-wrap: anywhere; }

  .dup-notes { margin-top: 6px; }
  .dup-notes__item { font-size: 11.5px; color: var(--text-faint); padding: 2px 0; }

  @keyframes fadeUp {
    from { opacity: 0; transform: translateY(8px); }
    to { opacity: 1; transform: translateY(0); }
  }
  @keyframes spin { to { transform: rotate(360deg); } }
</style>
