<script lang="ts">
  import { trackAction } from '@/utils/analytics';
  import CopyIcon from './CopyIcon.svelte';
  import InsightsCard from './InsightsCard.svelte';
  import { untrack } from 'svelte';
  import type { StoreInfo } from './types';

  let { storeInfo }: { storeInfo: StoreInfo } = $props();

  let copying = $state(false);
  let disablePreviewBar = $state(false);
  let tracked = false;

  // Fire once when storeInfo is available, without creating reactive dependency
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
  const price = $derived(
    storeInfo.themeStoreEntry
      ? storeInfo.themeStoreEntry.price === '0.00' || !storeInfo.themeStoreEntry.price
        ? 'Free'
        : `$${storeInfo.themeStoreEntry.price}`
      : null
  );
</script>

{#snippet infoItem(label: string, value: string | undefined | null, options?: { copyable?: boolean; isLast?: boolean; type?: 'url' | 'text' })}
  <div class="flex justify-between items-center py-3.5 {!options?.isLast ? 'border-b border-slate-100' : ''}">
    <label class="text-sm font-semibold text-slate-500">{label}</label>
    <span class="flex items-center gap-1.5 max-w-[50%] text-right select-text {options?.type === 'url' ? 'text-xs text-indigo-500 font-mono' : 'text-sm text-slate-900 font-medium'}">
      <span class="overflow-x-auto whitespace-nowrap scrollbar-none">{value}</span>
      {#if options?.copyable && value}
        <CopyIcon text={value} />
      {/if}
    </span>
  </div>
{/snippet}

<div class="flex flex-col mt-3">
  <!-- Header -->
  <div class="bg-slate-50 rounded-lg p-4 mb-3 text-center">
    <div class="flex items-center justify-center gap-1.5">
      {#if themeStoreUrl}
        <a
          href={withUtm(themeStoreUrl, 'theme_name')}
          target="_blank"
          rel="noopener noreferrer"
          class="flex items-center gap-1.5 text-lg font-bold text-slate-900 underline decoration-2 decoration-slate-300 hover:decoration-slate-500"
          title="Open theme store listing">
          {themeName}
          <svg class="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
          </svg>
        </a>
      {:else}
        <span class="text-lg font-bold text-slate-900">{themeName}</span>
      {/if}
    </div>
    {#if storeInfo.shopDomain}
      <div class="flex items-center justify-center gap-1 mt-1">
        <a
          href={withUtm(`https://${storeInfo.shopDomain}`, 'store_url')}
          target="_blank"
          rel="noopener noreferrer"
          class="text-xs text-indigo-500 font-mono hover:text-indigo-600">
          {storeInfo.shopDomain}
        </a>
        <CopyIcon text={storeInfo.shopDomain} />
      </div>
    {/if}
    <p class="text-xs text-slate-500 mt-1">
      {#if storeInfo.themeStoreEntry}
        {#if developer}
          by
          {#if storeInfo.themeStoreEntry.developer.url}
            <a
              href={withUtm(
                storeInfo.themeStoreEntry.developer.url.startsWith('/')
                  ? `https://themes.shopify.com${storeInfo.themeStoreEntry.developer.url}`
                  : storeInfo.themeStoreEntry.developer.url,
                'developer'
              )}
              target="_blank"
              rel="noopener noreferrer"
              class="text-slate-500 underline decoration-slate-300 hover:decoration-slate-500">
              {developer}
            </a>
          {:else}
            {developer}
          {/if}
        {/if}
        {#if developer && (price || storeInfo.theme?.schema_version)}{' · '}{/if}
        {#if price}{price}{/if}
        {#if price && storeInfo.theme?.schema_version}{' · '}{/if}
        {#if storeInfo.theme?.schema_version}v{storeInfo.theme.schema_version}{/if}
      {:else}
        {#if storeInfo.theme?.schema_version}v{storeInfo.theme.schema_version} · {/if}
        (Not listed on Shopify)
      {/if}
    </p>
  </div>

  <!-- Details -->
  {@render infoItem('Theme ID:', storeInfo.theme?.id?.toString() ?? 'N/A', { copyable: true })}
  {#if storeInfo.theme?.name && (!storeInfo.theme?.schema_name || storeInfo.theme.name !== storeInfo.theme.schema_name)}
    {@render infoItem('Theme name (internal):', storeInfo.theme.name, { copyable: true })}
  {/if}
  {#if storeInfo.themeStoreEntry}
    {@render infoItem('Latest version available:', storeInfo.themeStoreEntry.version || 'N/A')}
  {/if}

  <div class="py-3.5">
    <div class="flex items-center justify-between mb-3">
      <label class="text-sm font-semibold text-slate-500">Preview URL:</label>
      <label class="flex items-center gap-2 cursor-pointer">
        <input
          type="checkbox"
          bind:checked={disablePreviewBar}
          class="w-4 h-4 text-indigo-500 border-slate-300 rounded focus:ring-2 focus:ring-indigo-500/20 cursor-pointer"
        />
        <span class="text-xs text-slate-600">Disable preview bar</span>
      </label>
    </div>
    <div class="flex gap-2">
      <input
        type="text"
        value={getThemePreviewUrl(storeInfo, disablePreviewBar)}
        readonly
        class="flex-1 px-3 py-2 text-xs font-mono text-slate-600 bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500/20 select-all"
        placeholder={storeInfo.theme?.id ? 'Generating preview URL...' : 'Theme ID not available'}
      />
      <button
        onclick={async () => {
          copying = true;
          const success = await copyThemePreviewUrl(storeInfo, disablePreviewBar);
          setTimeout(() => (copying = false), success ? 1500 : 0);
        }}
        disabled={copying || !storeInfo.theme?.id}
        class="w-[110px] py-2 rounded-lg font-semibold text-sm transition-colors duration-200 flex items-center justify-center gap-2 shrink-0 cursor-pointer {copying ? 'bg-green-500 text-white' : 'bg-indigo-500 text-white hover:bg-indigo-600 active:bg-indigo-700'} disabled:opacity-50 disabled:cursor-not-allowed">
        <span>{copying ? 'Copied' : 'Copy'}</span>
      </button>
    </div>
  </div>

  <InsightsCard />
</div>
