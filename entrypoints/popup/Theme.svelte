<script lang="ts">
  import { trackAction } from '@/utils/analytics';
  import { trackOnce } from './utils/track.svelte';
  import CopyIcon from './CopyIcon.svelte';
  import Tooltip from './Tooltip.svelte';
  import { getTabState } from './stores/tabState.svelte';
  import type { StoreInfo } from './utils/types';

  let { storeInfo }: { storeInfo: StoreInfo } = $props();

  interface ThemePersisted {
    disablePreviewBar: boolean;
  }

  const tabState = getTabState();
  const restored = tabState.getSection<ThemePersisted>('theme');

  let copying = $state(false);
  let disablePreviewBar = $state(restored?.disablePreviewBar ?? false);

  $effect(() => {
    tabState.saveSection('theme', { disablePreviewBar });
  });

  trackOnce(
    () => true,
    () =>
      trackAction('detect_theme', {
        is_shopify: storeInfo.isShopify,
        page_url: storeInfo.page_url ?? '',
        shop_domain: storeInfo.shopDomain ?? '',
        theme_name: storeInfo.theme?.schema_name ?? storeInfo.theme?.name ?? '',
        theme_version: storeInfo.theme?.schema_version ?? ''
      })
  );

  function withUtm(url: string, content: string): string {
    try {
      const u = new URL(url);
      u.searchParams.set('utm_source', 'alfred');
      u.searchParams.set('utm_medium', 'browser_extension');
      u.searchParams.set('utm_campaign', 'theme_detector');
      u.searchParams.set('utm_content', content);
      return u.toString();
    } catch {
      return url;
    }
  }

  function getThemePreviewUrl(info: StoreInfo, noPreviewBar: boolean): string {
    if (!info.theme?.id || !info.page_url) return '';
    const url = new URL(info.page_url);
    url.searchParams.set('preview_theme_id', info.theme.id.toString());
    if (noPreviewBar) url.searchParams.set('pb', '0');
    return url.toString();
  }

  async function copyThemePreviewUrl(info: StoreInfo, noPreviewBar: boolean): Promise<boolean> {
    const url = getThemePreviewUrl(info, noPreviewBar);
    if (!url) return false;
    try {
      await navigator.clipboard.writeText(url);
      return true;
    } catch {
      return false;
    }
  }

  const themeName = $derived(storeInfo.theme?.schema_name ?? storeInfo.theme?.name ?? 'Unknown');
  const themeStoreUrl = $derived(storeInfo.themeStoreEntry?.theme_url);
  const developer = $derived(storeInfo.themeStoreEntry?.developer.name);
  const developerUrl = $derived(storeInfo.themeStoreEntry?.developer.url);
  const price = $derived(
    storeInfo.themeStoreEntry
      ? storeInfo.themeStoreEntry.price === '0.00' || !storeInfo.themeStoreEntry.price
        ? 'Free'
        : `$${storeInfo.themeStoreEntry.price}`
      : null
  );
  const latestVersion = $derived(storeInfo.themeStoreEntry?.version);
  const currentVersion = $derived(storeInfo.theme?.schema_version);
  const hasUpdate = $derived(latestVersion && currentVersion && latestVersion !== currentVersion);
  const themeRole = $derived(storeInfo.theme?.role);
  const roleDescriptions: Record<string, string> = {
    main: 'This is the live theme. Customers see this when they visit the store.',
    unpublished: 'This theme is installed but not live. It\'s not visible to customers.',
    demo: 'The theme is installed on the store as a demo. The theme can\'t be published until the merchant buys the full version.',
    development: 'This is a development theme. It can\'t be published and is temporary.',
  };
  const roleDescription = $derived(themeRole ? roleDescriptions[themeRole] ?? null : null);
  const roleLabels: Record<string, string> = {
    main: 'Published',
    unpublished: 'Unpublished',
    demo: 'Demo',
    development: 'Development',
  };
  const roleColors: Record<string, string> = {
    main: 'var(--success)',
    unpublished: 'var(--text-disabled)',
    demo: 'var(--warning)',
    development: '#3B82F6',
  };
  const statusLabel = $derived(themeRole ? roleLabels[themeRole] ?? themeRole : 'N/A');
  const statusColor = $derived(themeRole ? roleColors[themeRole] ?? 'var(--text-disabled)' : 'var(--text-disabled)');
  const internalName = $derived(
    storeInfo.theme?.name && storeInfo.theme?.schema_name && storeInfo.theme.name !== storeInfo.theme.schema_name
      ? storeInfo.theme.name
      : null
  );
</script>

<!-- Hero -->
<div class="hero">
  <div class="hero__identity">
    <div class="hero__meta">
      <h1 class="hero__name">{themeName}</h1>
      <div class="hero__byline">
        {#if developer}
          <span>by {#if developerUrl}<a
            href={withUtm(
              developerUrl.startsWith('/') ? `https://themes.shopify.com${developerUrl}` : developerUrl,
              'developer'
            )}
            target="_blank"
            rel="noopener noreferrer"
            class="hero__developer-link">{developer}</a>{:else}{developer}{/if}</span>
        {/if}
        {#if developer && price}<span class="hero__byline-dot"></span>{/if}
        {#if price}<span>{price}</span>{/if}
        {#if (developer || price) && currentVersion}<span class="hero__byline-dot"></span>{/if}
        {#if currentVersion}<span>v{currentVersion}</span>{/if}
      </div>
      {#if storeInfo.shopDomain}
        <div class="hero__store-url">
          <span class="hero__store-domain">{storeInfo.shopDomain}</span>
          <CopyIcon text={storeInfo.shopDomain} class="copy-trigger" />
        </div>
      {/if}
    </div>
    <div class="hero__actions">
      {#if themeStoreUrl}
        <a class="btn btn--ghost" href={withUtm(themeStoreUrl, 'theme_store')} target="_blank" rel="noopener noreferrer">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round"><path d="M6 2L3 6v14a2 2 0 002 2h14a2 2 0 002-2V6l-3-4z"/><path d="M3 6h18"/></svg>
          Theme Store
        </a>
      {/if}
      {#if themeStoreUrl}
        <a class="btn btn--primary" href={withUtm(themeStoreUrl, 'demo')} target="_blank" rel="noopener noreferrer">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
          Demo
        </a>
      {/if}
    </div>
  </div>
</div>

<!-- Stats grid -->
<div class="stats">
  <div class="stats__cell">
    <div class="stats__label">Theme ID</div>
    <div class="stats__value">
      <code class="stats__code">{storeInfo.theme?.id ?? 'N/A'}</code>
      {#if storeInfo.theme?.id}
        <CopyIcon text={storeInfo.theme.id.toString()} class="copy-trigger" />
      {/if}
    </div>
  </div>
  <div class="stats__cell">
    <div class="stats__label">Version</div>
    <div class="stats__value">
      {currentVersion ?? 'N/A'}
      {#if hasUpdate}
        <span class="stats__update" title="Update available: {latestVersion}">
          <svg viewBox="0 0 12 12" width="10" height="10" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><path d="M6 10V2M3 5l3-3 3 3"/></svg>
          {latestVersion}
        </span>
      {/if}
    </div>
  </div>
  <div class="stats__cell">
    <div class="stats__label">Status</div>
    <div class="stats__value">
      <span class="stats__status-dot" style="background: {statusColor}"></span>
      {statusLabel}
      {#if roleDescription}
        <Tooltip title={statusLabel} text={roleDescription} />
      {/if}
    </div>
  </div>
</div>

<!-- Sections -->
<div class="sections">
  <!-- Internal Name -->
  {#if internalName}
    <div class="section" style="margin-bottom:20px">
      <div class="internal-name">
        <span class="internal-name__label">Internal Name</span>
        <span class="internal-name__value">{internalName}</span>
        <CopyIcon text={internalName} class="copy-trigger" />
      </div>
    </div>
  {/if}

  <!-- Preview URL -->
  <div class="section">
    <div class="section__title">Preview URL</div>
    <div class="preview">
      <div class="preview__url">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" class="preview__icon"><path d="M10 13a5 5 0 007.54.54l3-3a5 5 0 00-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 00-7.54-.54l-3 3a5 5 0 007.07 7.07l1.71-1.71"/></svg>
        <input
          class="preview__input"
          value={getThemePreviewUrl(storeInfo, disablePreviewBar)}
          readonly
        />
        <button
          class="btn btn--ghost preview__copy"
          onclick={async () => {
            copying = true;
            const success = await copyThemePreviewUrl(storeInfo, disablePreviewBar);
            if (success) trackAction('copy_theme_preview_url', { shop_domain: storeInfo.shopDomain ?? '', source: 'popup' });
            setTimeout(() => (copying = false), success ? 1200 : 0);
          }}
          disabled={copying || !storeInfo.theme?.id}
        >
          {#if copying}
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" class="preview__copy-icon"><polyline points="20 6 9 17 4 12"/></svg>
          {:else}
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" class="preview__copy-icon"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/></svg>
          {/if}
          Copy
        </button>
      </div>
      <div class="preview__footer">
        <!-- svelte-ignore a11y_no_static_element_interactions -->
        <div class="toggle" onclick={() => (disablePreviewBar = !disablePreviewBar)} role="switch" aria-checked={disablePreviewBar} aria-label="Hide preview bar" tabindex="0" onkeydown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); disablePreviewBar = !disablePreviewBar; } }}>
          <span class="toggle__text">Hide preview bar</span>
          <div class="toggle__track" class:on={disablePreviewBar}>
            <div class="toggle__knob"></div>
          </div>
        </div>
      </div>
    </div>
  </div>

</div>

<style>
  /* Hero block */
  .hero { padding: 32px 32px 0; position: relative; }
  .hero::before { content: ''; position: absolute; top: 0; left: 0; right: 0; height: 165px; background: var(--bg-raised); border-bottom: 1px solid var(--border); }
  .hero__identity { position: relative; display: flex; align-items: flex-end; gap: 20px; padding-bottom: 24px; }
  .hero__meta { flex: 1; min-width: 0; padding-bottom: 2px; }
  .hero__name { font-size: 24px; font-weight: 600; color: var(--text); letter-spacing: -0.02em; line-height: 1.15; margin: 0; }
  .hero__byline { display: flex; align-items: center; gap: 6px; margin-top: 5px; font-size: 12.5px; color: var(--text-muted); }
  .hero__byline-dot { width: 3px; height: 3px; border-radius: 50%; background: var(--text-muted); opacity: 0.5; }
  .hero__developer-link { color: var(--text-secondary); text-decoration: underline; text-decoration-color: var(--text-muted); text-underline-offset: 2px; transition: text-decoration-color 0.12s; }
  .hero__developer-link:hover { text-decoration-color: var(--text-secondary); }
  .hero__store-url { display: flex; align-items: center; gap: 4px; margin-top: 4px; }
  .hero__store-domain { font-family: 'SF Mono', ui-monospace, monospace; font-size: 11.5px; color: var(--text-muted); }
  .hero__actions { display: flex; gap: 6px; flex-shrink: 0; padding-bottom: 4px; }

  /* Btn block */
  .btn { display: inline-flex; align-items: center; gap: 5px; border-radius: 6px; cursor: pointer; text-decoration: none; transition: all 0.12s; font-family: inherit; }
  .btn--ghost { padding: 6px 12px; font-size: 12px; font-weight: 500; color: var(--text-secondary); background: var(--bg); border: 1px solid var(--border); }
  .btn--ghost:hover { border-color: var(--action-hover-border); color: var(--action-hover-fg); background: var(--action-hover-bg); box-shadow: var(--action-hover-shadow); }
  .btn--ghost:disabled { opacity: 0.5; cursor: not-allowed; }
  .btn--ghost :global(svg) { width: 13px; height: 13px; stroke-width: 1.7; }
  .btn--primary { padding: 6px 14px; font-size: 12px; font-weight: 600; color: var(--btn-text); background: var(--btn-bg); border: none; }
  .btn--primary:hover { background: var(--btn-bg-hover); }
  .btn--primary :global(svg) { width: 12px; height: 12px; stroke-width: 2; }

  /* Stats block */
  .stats { display: grid; grid-template-columns: repeat(3, 1fr); gap: 1px; background: var(--border); border-radius: 10px; margin: 0 32px; box-shadow: 0 0 0 1px var(--border), var(--shadow-md); }
  .stats__cell { background: var(--bg); padding: 16px 18px; }
  .stats__cell:first-child { border-radius: 10px 0 0 10px; }
  .stats__cell:last-child { border-radius: 0 10px 10px 0; }
  .stats__label { font-size: 11px; font-weight: 500; color: var(--text-muted); letter-spacing: 0.02em; }
  .stats__value { font-size: 17px; font-weight: 600; color: var(--text); margin-top: 3px; letter-spacing: -0.02em; display: flex; align-items: center; gap: 6px; }
  .stats__code { font-family: 'SF Mono', ui-monospace, monospace; font-size: 13px; font-weight: 500; background: none; padding: 0; letter-spacing: 0; }
  .stats__update { display: inline-flex; align-items: center; gap: 3px; font-size: 10.5px; font-weight: 600; padding: 2px 7px; border-radius: 20px; background: var(--success-bg); color: var(--success-strong); white-space: nowrap; }
  .stats__status-dot { width: 7px; height: 7px; border-radius: 50%; flex-shrink: 0; }

  :global(.copy-trigger) { width: 18px !important; height: 18px !important; padding: 3px !important; color: var(--text-placeholder); cursor: pointer; transition: color 0.12s, background-color 0.12s; }
  :global(.copy-trigger:hover) { color: var(--text-muted) !important; }

  /* Sections block */
  .sections { padding: 24px 32px 32px; }

  /* Section block */
  .section { margin-bottom: 24px; }
  .section:last-child { margin-bottom: 0; }
  .section__title { font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.06em; color: var(--text-muted); margin-bottom: 12px; display: flex; align-items: center; gap: 10px; }
  .section__title::after { content: ''; flex: 1; height: 1px; background: var(--border); }

  /* Internal-name block */
  .internal-name { display: flex; align-items: center; gap: 12px; padding: 12px 16px; background: var(--bg-inset); border-radius: 10px; border: 1px dashed var(--border); }
  .internal-name__label { font-size: 10.5px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.06em; color: var(--text-muted); white-space: nowrap; }
  .internal-name__value { font-family: 'SF Mono', ui-monospace, monospace; font-size: 13px; font-weight: 500; color: var(--text); letter-spacing: -0.01em; }
  /* The row itself is --bg-inset, so the icon's default hover wash would vanish. */
  .internal-name :global(.copy-trigger:hover) { background: var(--bg-hover); }

  /* Preview block */
  .preview { border: 1px solid var(--border); border-radius: 10px; overflow: hidden; }
  .preview__url { display: flex; align-items: center; gap: 8px; padding: 10px 14px; }
  .preview__icon { width: 14px; height: 14px; flex-shrink: 0; color: var(--text-muted); }
  .preview__input { flex: 1; border: none; background: none; font-family: 'SF Mono', ui-monospace, monospace; font-size: 12px; color: var(--text-secondary); outline: none; min-width: 0; cursor: default; }
  .preview__copy { display: flex; align-items: center; gap: 4px; padding: 0 8px; height: 28px; font-size: 11px; font-weight: 600; flex-shrink: 0; border-radius: 6px; }
  .preview__copy-icon { width: 13px; height: 13px; stroke-width: 1.8; flex-shrink: 0; }
  .preview__footer { display: flex; align-items: center; justify-content: flex-end; padding: 8px 14px; border-top: 1px solid var(--border-subtle); background: var(--bg-raised); }

  /* Toggle block */
  .toggle { display: flex; align-items: center; gap: 8px; cursor: pointer; }
  .toggle__track { width: 28px; height: 16px; background: var(--border); border-radius: 8px; position: relative; transition: background 0.2s; cursor: pointer; flex-shrink: 0; }
  .toggle__track.on { background: var(--accent); }
  .toggle__knob { width: 12px; height: 12px; background: #fff; border-radius: 50%; position: absolute; top: 2px; left: 2px; transition: transform 0.15s; box-shadow: var(--shadow-knob); }
  .toggle__track.on .toggle__knob { transform: translateX(12px); }
  .toggle__text { font-size: 11.5px; color: var(--text-muted); font-weight: 450; }

  /* Animations */
  @keyframes fadeUp {
    from { opacity: 0; transform: translateY(8px); }
    to { opacity: 1; transform: translateY(0); }
  }

  .hero { animation: fadeUp 0.4s ease both; }
  .stats { animation: fadeUp 0.4s ease 0.1s both; }
  .sections { animation: fadeUp 0.4s ease 0.15s both; }
</style>
