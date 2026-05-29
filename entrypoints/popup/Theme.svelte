<script lang="ts">
  import { trackAction } from '@/utils/analytics';
  import CopyIcon from './CopyIcon.svelte';
  import Tooltip from './Tooltip.svelte';
  import { untrack } from 'svelte';
  import type { StoreInfo } from './types';

  let { storeInfo }: { storeInfo: StoreInfo } = $props();

  let copying = $state(false);
  let disablePreviewBar = $state(false);
  let tracked = false;

  $effect(() => {
    if (tracked) return;
    tracked = true;
    untrack(() => {
      trackAction('detect_theme', {
        is_shopify: storeInfo.isShopify,
        page_url: storeInfo.page_url ?? '',
        shop_domain: storeInfo.shopDomain ?? '',
        theme_name: storeInfo.theme?.schema_name ?? storeInfo.theme?.name ?? '',
        theme_version: storeInfo.theme?.schema_version ?? ''
      });
    });
  });

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
  // const developerThemesUrl = $derived(
  //   developerUrl
  //     ? (developerUrl.startsWith('/') ? `https://themes.shopify.com${developerUrl}` : developerUrl)
  //     : null
  // );
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
        <svg viewBox="0 0 24 24" fill="none" stroke="#929292" stroke-width="1.7" stroke-linecap="round" class="preview__icon"><path d="M10 13a5 5 0 007.54.54l3-3a5 5 0 00-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 00-7.54-.54l-3 3a5 5 0 007.07 7.07l1.71-1.71"/></svg>
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

  <!-- Reviews (enable when review data is available)
  <div class="section">
    <div class="section__title">Reviews</div>
    <div class="reviews__headline">
      <span class="reviews__pct">35% positive</span>
    </div>
    <div class="reviews__meta">
      <span class="reviews__count">272 reviews</span>
      {#if themeStoreUrl}
        <a href={withUtm(themeStoreUrl, 'reviews')} target="_blank" rel="noopener noreferrer" class="reviews__link">View all &rarr;</a>
      {/if}
    </div>
    <div class="reviews__bars">
      <div class="reviews__bar">
        <svg viewBox="0 0 20 20" width="18" height="18" class="reviews__icon reviews__icon--positive"><path fill-rule="evenodd" fill="currentColor" d="M12.539 14.57a9.25 9.25 0 0 1-4.074-.838l-.307-.141a3.751 3.751 0 0 0-1.158-.32v-5.222a1.5 1.5 0 0 0 .15-.099 6.489 6.489 0 0 0 2.475-3.95 1.41 1.41 0 0 1 1.378 1.557l-.133 1.26a1.75 1.75 0 0 0 1.74 1.933h1.595c.758 0 1.342.67 1.239 1.42l-.338 2.449a2.25 2.25 0 0 1-2.176 1.942l-.391.01Zm-7.039-6.32h-1v5h1v-5Zm2.34 6.845a10.75 10.75 0 0 0 4.735.975l.391-.01a3.75 3.75 0 0 0 3.626-3.236l.337-2.448a2.75 2.75 0 0 0-2.724-3.126h-1.594a.25.25 0 0 1-.249-.276l.133-1.26a2.91 2.91 0 0 0-2.894-3.214h-.364c-.5 0-.928.357-1.017.849l-.055.303a4.989 4.989 0 0 1-1.915 3.098h-2c-.69 0-1.25.56-1.25 1.25v5.5c0 .69.56 1.25 1.25 1.25h2.345c.324 0 .644.07.938.205l.307.14Z"/></svg>
        <div class="reviews__track"><div class="reviews__fill" style="width:35%"></div></div>
        <span class="reviews__bar-count">96</span>
      </div>
      <div class="reviews__bar">
        <svg viewBox="0 0 20 20" width="18" height="18" class="reviews__icon reviews__icon--neutral"><path fill="currentColor" d="M10 2c-4.4 0-8 3.6-8 8s3.6 8 8 8 8-3.6 8-8-3.6-8-8-8Zm0 14.4c-3.5 0-6.4-2.9-6.4-6.4S6.5 3.6 10 3.6s6.4 2.9 6.4 6.4-2.9 6.4-6.4 6.4ZM7.6 9.2c.4 0 .8-.4.8-.8s-.4-.8-.8-.8-.8.4-.8.8.4.8.8.8Zm4.8-1.6c-.4 0-.8.4-.8.8s.4.8.8.8.8-.4.8-.8-.4-.8-.8-.8Zm0 4H7.6c-.4 0-.8.4-.8.8s.4.8.8.8h4.8c.4 0 .8-.4.8-.8s-.4-.8-.8-.8Z"/></svg>
        <div class="reviews__track"><div class="reviews__fill" style="width:24%"></div></div>
        <span class="reviews__bar-count">66</span>
      </div>
      <div class="reviews__bar">
        <svg viewBox="0 0 20 20" width="18" height="18" class="reviews__icon reviews__icon--negative"><path fill-rule="evenodd" fill="currentColor" d="M12.16 4.904a10.75 10.75 0 0 0-4.735-.974l-.391.01a3.75 3.75 0 0 0-3.626 3.236l-.337 2.448a2.75 2.75 0 0 0 2.724 3.126h1.594a.25.25 0 0 1 .249.276l-.133 1.26a2.91 2.91 0 0 0 2.894 3.214h.364c.5 0 .928-.358 1.017-.85l.055-.302a4.989 4.989 0 0 1 1.915-3.098h2c.69 0 1.25-.56 1.25-1.25v-5.5c0-.69-.56-1.25-1.25-1.25h-2.345a2.25 2.25 0 0 1-.938-.205l-.307-.14Zm-4.699.525a9.25 9.25 0 0 1 4.074.839l.307.14a3.75 3.75 0 0 0 1.158.32v5.223c-.052.03-.102.062-.15.098a6.49 6.49 0 0 0-2.475 3.95 1.41 1.41 0 0 1-1.378-1.557l.133-1.26a1.75 1.75 0 0 0-1.74-1.932h-1.595a1.25 1.25 0 0 1-1.238-1.421l.337-2.448a2.25 2.25 0 0 1 2.176-1.942l.391-.01Zm7.039 6.32h1v-5h-1v5Z"/></svg>
        <div class="reviews__track"><div class="reviews__fill" style="width:40%"></div></div>
        <span class="reviews__bar-count">110</span>
      </div>
    </div>
  </div>
  -->

  <!-- Quick Links (enable when data sources are wired up)
  {#if themeStoreUrl || developerThemesUrl}
    <div class="section">
      <div class="section__title">Quick Links</div>
      <div class="links">
        {#if themeStoreUrl}
          <a class="links__item" href={withUtm(themeStoreUrl, 'quick_link_docs')} target="_blank" rel="noopener noreferrer">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><path d="M14 2v6h6"/><path d="M16 13H8M16 17H8M10 9H8"/></svg>
            Docs
          </a>
        {/if}
        <a class="links__item" href="https://support.shopify.com/" target="_blank" rel="noopener noreferrer">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"><circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 015.83 1c0 2-3 3-3 3"/><circle cx="12" cy="17" r=".5" fill="currentColor"/></svg>
          Support
        </a>
        {#if developerThemesUrl}
          <a class="links__item" href={withUtm(developerThemesUrl, 'quick_link_developer')} target="_blank" rel="noopener noreferrer">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"><path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
            More by {developer}
          </a>
        {/if}
      </div>
    </div>
  {/if}
  -->

  <!-- Feature Tags (enable when feature data is available)
  <div class="section">
    <div class="section__title">Features</div>
    <div class="features">
      <div class="features__group">
        <span class="features__label">Cart & Checkout</span>
        <div class="features__tags">
          <span class="features__tag">Cart notes</span>
          <span class="features__tag">Quick buy</span>
          <span class="features__tag">Slide-out cart</span>
          <span class="features__tag">Sticky cart</span>
        </div>
      </div>
      <div class="features__group">
        <span class="features__label">Marketing & Conversion</span>
        <div class="features__tags">
          <span class="features__tag">Cross-selling</span>
          <span class="features__tag">EU translations</span>
          <span class="features__tag">Product badges</span>
          <span class="features__tag">Product reviews</span>
          <span class="features__tag">Trust badges</span>
        </div>
      </div>
      <div class="features__group">
        <span class="features__label">Merchandising</span>
        <div class="features__tags">
          <span class="features__tag">Color swatches</span>
          <span class="features__tag">High-res images</span>
          <span class="features__tag">Image galleries</span>
          <span class="features__tag">Lookbooks</span>
          <span class="features__tag">Product tabs</span>
          <span class="features__tag">Product videos</span>
        </div>
      </div>
      <div class="features__group">
        <span class="features__label">Product Discovery</span>
        <div class="features__tags">
          <span class="features__tag">Mega menu</span>
          <span class="features__tag">Product filtering</span>
          <span class="features__tag">Recommended products</span>
          <span class="features__tag">Search</span>
        </div>
      </div>
    </div>
  </div>
  -->

  <!-- Version History (enable when version data is available)
  <div class="section">
    <div class="section__title">Version History</div>
    <div class="versions">
      <div class="versions__row versions__row--current">
        <span class="versions__dot"></span>
        <span class="versions__number">15.0.0</span>
        <span class="versions__date">Mar 2026</span>
        <span class="versions__summary">Major update with new sections architecture</span>
      </div>
      <div class="versions__row">
        <span class="versions__dot"></span>
        <span class="versions__number">14.0.0</span>
        <span class="versions__date">Jan 2026</span>
        <span class="versions__summary">Performance improvements and bug fixes</span>
      </div>
      <div class="versions__row">
        <span class="versions__dot"></span>
        <span class="versions__number">13.0.0</span>
        <span class="versions__date">Oct 2025</span>
        <span class="versions__summary">New color scheme system</span>
      </div>
      <div class="versions__row">
        <span class="versions__dot"></span>
        <span class="versions__number">12.0.0</span>
        <span class="versions__date">Jul 2025</span>
        <span class="versions__summary">Combined listing support</span>
      </div>
      <div class="versions__row">
        <span class="versions__dot"></span>
        <span class="versions__number">11.0.0</span>
        <span class="versions__date">Apr 2025</span>
        <span class="versions__summary">Markets and B2B improvements</span>
      </div>
    </div>
  </div>
  -->

  <!-- Performance (enable when CWV measurement is implemented)
  <div class="section">
    <div class="section__title">Performance</div>
    <div class="perf">
      <div class="perf__card perf__card--good">
        <span class="perf__label">LCP</span>
        <span class="perf__value">1.8s</span>
        <span class="perf__threshold">Good &lt; 2.5s</span>
      </div>
      <div class="perf__card perf__card--good">
        <span class="perf__label">INP</span>
        <span class="perf__value">92ms</span>
        <span class="perf__threshold">Good &lt; 200ms</span>
      </div>
      <div class="perf__card perf__card--needs-work">
        <span class="perf__label">CLS</span>
        <span class="perf__value">0.18</span>
        <span class="perf__threshold">Good &lt; 0.1</span>
      </div>
      <div class="perf__card perf__card--good">
        <span class="perf__label">TTFB</span>
        <span class="perf__value">320ms</span>
        <span class="perf__threshold">Good &lt; 800ms</span>
      </div>
    </div>
  </div>
  -->
</div>

<style>
  /* Hero block */
  .hero { padding: 32px 32px 0; position: relative; }
  .hero::before { content: ''; position: absolute; top: 0; left: 0; right: 0; height: 140px; background: var(--hero-gradient); border-bottom: 1px solid var(--border); }
  .hero__identity { position: relative; display: flex; align-items: flex-end; gap: 20px; padding-bottom: 24px; }
  .hero__meta { flex: 1; min-width: 0; padding-bottom: 2px; }
  .hero__name { font-size: 28px; font-weight: 400; color: var(--text); letter-spacing: -0.02em; line-height: 1.1; margin: 0; }
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
  .btn--ghost:hover { border-color: var(--border-hover); color: var(--text); box-shadow: var(--shadow-sm); }
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

  :global(.copy-trigger) { width: 16px !important; height: 16px !important; color: var(--text-placeholder); cursor: pointer; transition: color 0.12s; }
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

  /* Preview block */
  .preview { border: 1px solid var(--border); border-radius: 10px; overflow: hidden; }
  .preview__url { display: flex; align-items: center; gap: 8px; padding: 10px 14px; }
  .preview__icon { width: 14px; height: 14px; flex-shrink: 0; }
  .preview__input { flex: 1; border: none; background: none; font-family: 'SF Mono', ui-monospace, monospace; font-size: 12px; color: var(--text-secondary); outline: none; min-width: 0; cursor: default; }
  .preview__copy { display: flex; align-items: center; gap: 4px; padding: 0 8px; height: 28px; font-size: 11px; font-weight: 600; flex-shrink: 0; border-radius: 6px; }
  .preview__copy-icon { width: 13px; height: 13px; stroke-width: 1.8; flex-shrink: 0; }
  .preview__footer { display: flex; align-items: center; justify-content: flex-end; padding: 8px 14px; border-top: 1px solid var(--border-subtle); background: var(--bg-raised); }

  /* Toggle block */
  .toggle { display: flex; align-items: center; gap: 8px; cursor: pointer; }
  .toggle__track { width: 28px; height: 16px; background: var(--bg-hover); border-radius: 8px; position: relative; transition: background 0.2s; cursor: pointer; flex-shrink: 0; }
  .toggle__track.on { background: var(--accent); }
  .toggle__knob { width: 12px; height: 12px; background: var(--bg); border-radius: 50%; position: absolute; top: 2px; left: 2px; transition: transform 0.15s; box-shadow: var(--shadow-knob); }
  .toggle__track.on .toggle__knob { transform: translateX(12px); }
  .toggle__text { font-size: 11.5px; color: var(--text-muted); font-weight: 450; }

  /* Reviews block */
  .reviews__headline { display: flex; align-items: baseline; gap: 8px; margin-bottom: 4px; }
  .reviews__pct { font-size: 26px; font-weight: 700; color: var(--text); letter-spacing: -0.03em; }
  .reviews__meta { display: flex; align-items: center; gap: 8px; margin-bottom: 16px; }
  .reviews__count { font-size: 13px; color: var(--text-muted); font-weight: 450; }
  .reviews__link { font-size: 12px; color: var(--accent); text-decoration: none; font-weight: 500; }
  .reviews__bars { display: flex; flex-direction: column; gap: 10px; }
  .reviews__bar { display: flex; align-items: center; gap: 10px; }
  .reviews__icon { flex-shrink: 0; }
  .reviews__icon--positive { color: var(--success-strong); }
  .reviews__icon--neutral { color: var(--text-muted); }
  .reviews__icon--negative { color: var(--error); }
  .reviews__track { flex: 1; height: 7px; border-radius: 4px; background: var(--bg-inset); overflow: hidden; }
  .reviews__fill { height: 100%; border-radius: 4px; background: var(--text); }
  .reviews__bar-count { font-size: 13px; font-weight: 500; color: var(--text-secondary); min-width: 32px; text-align: right; }

  /* Links block */
  .links { display: flex; gap: 6px; flex-wrap: wrap; }
  .links__item { display: inline-flex; align-items: center; gap: 5px; padding: 6px 11px; font-size: 11.5px; font-weight: 500; color: var(--text-secondary); background: var(--bg); border: 1px solid var(--border); border-radius: 6px; text-decoration: none; cursor: pointer; transition: all 0.12s; }
  .links__item:hover { border-color: var(--border-hover); color: var(--text); box-shadow: var(--shadow-sm); }
  .links__item svg { width: 12px; height: 12px; opacity: 0.55; }

  /* Features block */
  .features { display: flex; flex-direction: column; gap: 14px; }
  .features__group { }
  .features__label { font-size: 11px; font-weight: 600; color: var(--text-muted); letter-spacing: 0.02em; }
  .features__tags { display: flex; flex-wrap: wrap; gap: 5px; margin-top: 6px; }
  .features__tag { font-size: 11.5px; font-weight: 500; padding: 3px 9px; border-radius: 20px; background: var(--bg-inset); color: var(--text-secondary); }

  /* Versions block */
  .versions { display: flex; flex-direction: column; }
  .versions__row { display: flex; align-items: center; gap: 10px; padding: 8px 0; border-bottom: 1px solid var(--border-muted); }
  .versions__row:last-child { border-bottom: none; }
  .versions__dot { width: 6px; height: 6px; border-radius: 50%; background: var(--border-hover); flex-shrink: 0; }
  .versions__row--current .versions__dot { background: var(--accent); }
  .versions__number { font-family: 'SF Mono', ui-monospace, monospace; font-size: 12.5px; font-weight: 600; color: var(--text); min-width: 52px; }
  .versions__date { font-size: 12px; color: var(--text-muted); min-width: 68px; }
  .versions__summary { font-size: 12.5px; color: var(--text-secondary); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

  /* Perf block */
  .perf { display: grid; grid-template-columns: 1fr 1fr; gap: 1px; background: var(--border); border-radius: 10px; overflow: hidden; box-shadow: 0 0 0 1px var(--border); }
  .perf__card { background: var(--bg); padding: 14px 16px; display: flex; flex-direction: column; gap: 2px; }
  .perf__label { font-size: 11px; font-weight: 500; color: var(--text-muted); letter-spacing: 0.02em; }
  .perf__value { font-size: 20px; font-weight: 700; color: var(--text); letter-spacing: -0.02em; }
  .perf__card--good .perf__value { color: var(--success-strong); }
  .perf__card--needs-work .perf__value { color: var(--warning); }
  .perf__card--poor .perf__value { color: var(--error); }
  .perf__threshold { font-size: 10.5px; color: var(--text-faint); font-weight: 450; }

  /* Animations */
  @keyframes fadeUp {
    from { opacity: 0; transform: translateY(8px); }
    to { opacity: 1; transform: translateY(0); }
  }

  .hero { animation: fadeUp 0.4s ease both; }
  .stats { animation: fadeUp 0.4s ease 0.1s both; }
  .sections { animation: fadeUp 0.4s ease 0.15s both; }
</style>
