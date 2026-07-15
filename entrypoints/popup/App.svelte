<script lang="ts">
  import { getTheme } from './utils/theme';
  import { getHeadings, analyzeHeadings } from './utils/headings';
  import { getLinks } from './utils/links';
  import { getAssets } from './utils/assets';
  import { getImages, analyzeImages } from './utils/images';
  import { getSchema } from './utils/schema';
  import { getRobots, analyzeRobots } from './utils/robots';
  import { getOverview, getOverviewNetwork, getShopifyContext, analyzeOverview } from './utils/overview';
  import { trackAction } from '@/utils/analytics';
  import Theme from './Theme.svelte';
  import Headings from './Headings.svelte';
  import Links from './Links.svelte';
  import Assets from './Assets.svelte';
  import Images from './Images.svelte';
  import Schema from './Schema.svelte';
  import Robots from './Robots.svelte';
  import Overview from './Overview.svelte';
  import Settings from './Settings.svelte';
  import ReviewPrompt from './ReviewPrompt.svelte';
  import { getTabState, type PopupSection } from './stores/tabState.svelte';
  import type {
    StoreInfo,
    RawHeading,
    RawLink,
    RawAsset,
    RawImage,
    RawSchemaBlock,
    RobotsResponse,
    RawOverview,
    OverviewNetwork,
    ShopifyContext
  } from './utils/types';

  type TabId = PopupSection;
  const tabState = getTabState();
  // Future tabs: 'apps' | 'products' | 'hreflangs' | 'social' | 'sitemaps'

  interface Tab {
    id: TabId;
    label: string;
    icon: string;
    badge?: { count: number; color: 'red' | 'green' };
  }

  const shopifyTabs: Tab[] = [
    { id: 'theme', label: 'Theme', icon: 'theme' },
    // { id: 'apps', label: 'Apps', icon: 'apps' },
    // { id: 'products', label: 'Products', icon: 'products' },
  ];

  const settingsTab: Tab = { id: 'settings', label: 'Settings', icon: 'settings' };

  let activeTab = $state<TabId>('theme');
  let storeInfo = $state<StoreInfo | null>(null);
  let rawHeadings = $state<RawHeading[]>([]);
  let rawLinks = $state<RawLink[]>([]);
  let rawAssets = $state<RawAsset[]>([]);
  let rawImages = $state<RawImage[]>([]);
  let rawSchema = $state<RawSchemaBlock[]>([]);
  let rawRobots = $state<RobotsResponse | null>(null);
  let robotsLoading = $state(true);
  let rawOverview = $state<RawOverview | null>(null);
  let overviewNetwork = $state<OverviewNetwork | null>(null);
  let shopifyContext = $state<ShopifyContext | null>(null);
  let overviewNetworkLoading = $state(true);
  let loading = $state(true);

  const headingIssues = $derived(analyzeHeadings(rawHeadings));
  const imageIssueCount = $derived(analyzeImages(rawImages));
  const robotsErrorCount = $derived(
    analyzeRobots(rawRobots, storeInfo?.isShopify ?? false, storeInfo?.page_url ?? null).errorCount
  );
  const overviewAnalysis = $derived(
    analyzeOverview(rawOverview, overviewNetwork, shopifyContext, rawRobots, rawSchema)
  );

  const seoTabs = $derived<Tab[]>([
    {
      id: 'overview' as TabId,
      label: 'Overview',
      icon: 'overview',
      ...(overviewAnalysis.errorCount > 0 ? { badge: { count: overviewAnalysis.errorCount, color: 'red' as const } } : {})
    },
    {
      id: 'headings' as TabId,
      label: 'Headings',
      icon: 'headings',
      ...(headingIssues.length > 0 ? { badge: { count: headingIssues.length, color: 'red' as const } } : {})
    },
    { id: 'links' as TabId, label: 'Links', icon: 'links' },
    { id: 'assets' as TabId, label: 'Assets', icon: 'assets' },
    {
      id: 'images' as TabId,
      label: 'Images',
      icon: 'images',
      ...(imageIssueCount > 0 ? { badge: { count: imageIssueCount, color: 'red' as const } } : {})
    },
    {
      id: 'robots' as TabId,
      label: 'Robots.txt',
      icon: 'robots',
      ...(robotsErrorCount > 0 ? { badge: { count: robotsErrorCount, color: 'red' as const } } : {})
    },
    // { id: 'hreflangs', label: 'Hreflangs', icon: 'hreflangs' },
    { id: 'schema' as TabId, label: 'Schema', icon: 'schema' },
    // { id: 'social', label: 'Social', icon: 'social' },
    // { id: 'sitemaps', label: 'Sitemaps', icon: 'sitemaps' },
  ]);

  $effect(() => {
    // Robots.txt is a real network fetch (slow origins take seconds, timeout
    // is 8s) — never gate first paint on it. The tab and badge fill in
    // reactively when it lands.
    getRobots().then((robotsData) => {
      rawRobots = robotsData;
      robotsLoading = false;
    });
    getOverviewNetwork().then((networkData) => {
      overviewNetwork = networkData;
      overviewNetworkLoading = false;
    });
    const fetchData = async () => {
      const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
      const [storeData, headingsData, linksData, assetsData, imagesData, schemaData, overviewData, contextData] =
        await Promise.all([
          getTheme(),
          getHeadings(),
          getLinks(),
          getAssets(),
          getImages(),
          getSchema(),
          getOverview(),
          getShopifyContext(),
          tab?.id != null && tab.url ? tabState.hydrate(tab.id, tab.url) : Promise.resolve()
        ]);
      trackAction('popup_open', { is_shopify: storeData?.isShopify ?? false });
      storeInfo = storeData;
      rawHeadings = headingsData;
      rawLinks = linksData;
      rawAssets = assetsData;
      rawImages = imagesData;
      rawSchema = schemaData;
      rawOverview = overviewData;
      shopifyContext = contextData;
      // A restored section wins; otherwise non-Shopify pages land on Overview.
      if (tabState.restoredActiveSection) {
        activeTab = tabState.restoredActiveSection;
      } else if (!storeData?.isShopify) {
        activeTab = 'overview';
      }
      loading = false;
    };
    fetchData();
  });

  // Persist the open section per tab once the initial restore has settled.
  $effect(() => {
    if (!loading) tabState.setActiveSection(activeTab);
  });
</script>

{#snippet tabIcon(icon: string)}
  {#if icon === 'theme'}
    <svg viewBox="0 0 16 16" fill="currentColor" stroke="none"><path fill-rule="evenodd" d="M5.25 1.5a3.75 3.75 0 0 0-3.75 3.75v5.5a3.75 3.75 0 0 0 3.75 3.75h5.5a3.75 3.75 0 0 0 3.75-3.75v-5.5a3.75 3.75 0 0 0-3.75-3.75zm-2.25 3.75a2.25 2.25 0 0 1 2.25-2.25h3.25v3h-5.5zm7-2.25h.75a2.25 2.25 0 0 1 2.25 2.25v3.75h-3zm0 7.5v2.5h.75a2.25 2.25 0 0 0 2.25-2.25v-.25zm-1.5-3v5.5h-3.25a2.25 2.25 0 0 1-2.25-2.25v-3.25z"/></svg>
  {:else if icon === 'settings'}
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z"/></svg>
  {:else if icon === 'headings'}
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round"><path d="M4 6h16M4 12h8m-8 6h16"/></svg>
  {:else if icon === 'links'}
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round"><path d="M10 13a5 5 0 007.54.54l3-3a5 5 0 00-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 00-7.54-.54l-3 3a5 5 0 007.07 7.07l1.71-1.71"/></svg>
  {:else if icon === 'assets'}
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round"><polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/></svg>
  {:else if icon === 'images'}
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="M21 15l-5-5L5 21"/></svg>
  {:else if icon === 'schema'}
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><path d="M14 2v6h6"/></svg>
  {:else if icon === 'robots'}
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round"><rect x="3" y="11" width="18" height="10" rx="2"/><circle cx="8.5" cy="16" r="1.5"/><circle cx="15.5" cy="16" r="1.5"/><path d="M12 2v4M8 5l4 4 4-4"/></svg>
  {:else if icon === 'overview'}
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round"><path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>
  <!-- Future tab icons (uncomment as tabs are enabled)
  {:else if icon === 'apps'}
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round"><rect x="2" y="3" width="20" height="14" rx="2"/><path d="M8 21h8M12 17v4"/></svg>
  {:else if icon === 'products'}
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round"><path d="M6 2L3 6v14a2 2 0 002 2h14a2 2 0 002-2V6l-3-4z"/><path d="M3 6h18M16 10a4 4 0 01-8 0"/></svg>
  {:else if icon === 'hreflangs'}
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round"><circle cx="12" cy="12" r="10"/><path d="M2 12h20M12 2a15.3 15.3 0 014 10 15.3 15.3 0 01-4 10 15.3 15.3 0 01-4-10 15.3 15.3 0 014-10z"/></svg>
  {:else if icon === 'social'}
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></svg>
  {:else if icon === 'sitemaps'}
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round"><path d="M3 6h18M3 12h18M3 18h18"/><circle cx="7" cy="6" r="1.5" fill="currentColor" stroke="none"/><circle cx="7" cy="12" r="1.5" fill="currentColor" stroke="none"/><circle cx="7" cy="18" r="1.5" fill="currentColor" stroke="none"/></svg>
  -->
  {/if}
{/snippet}

{#snippet sidebarTab(tab: Tab)}
  <button
    class="tab"
    class:active={activeTab === tab.id}
    role="tab"
    aria-selected={activeTab === tab.id}
    onclick={() => { activeTab = tab.id; }}
  >
    {@render tabIcon(tab.icon)}
    {tab.label}
    {#if tab.badge}
      <span class="tab__badge" class:tab__badge--red={tab.badge.color === 'red'} class:tab__badge--green={tab.badge.color === 'green'}>
        {tab.badge.count}
      </span>
    {/if}
  </button>
{/snippet}

{#if loading}
  <div class="popup popup--compact">
    <div class="loading">
      <div class="loading__spinner"></div>
      <span>Analyzing page...</span>
    </div>
  </div>
{:else}
  <div class="popup">
    <!-- Brand bar -->
    <div class="brand">
      <div class="brand__left">
        <span class="brand__name">Alfred</span>
      </div>
      <ReviewPrompt variant="compact" />
    </div>

    <div class="layout">
      <!-- Sidebar -->
      <nav class="sidebar" aria-label="Alfred navigation">
        <div class="sidebar__label">
          <svg width="70" height="20" viewBox="0 0 100 28.6" aria-hidden="true">
            <path d="M11.3,1c0.2,0,0.3,0.1,0.5,0.2C10.6,1.7,9.4,3,8.8,5.8L6.6,6.4C7.3,4.4,8.7,1,11.3,1z M12.4,2c0.2,0.6,0.4,1.3,0.4,2.4c0,0.1,0,0.1,0,0.2L9.9,5.4C10.5,3.3,11.5,2.4,12.4,2z M15,3.8l-1.3,0.4c0-0.1,0-0.2,0-0.3c0-0.9-0.1-1.6-0.3-2.2C14.1,1.9,14.7,2.8,15,3.8z M21.5,5.4c0-0.1-0.1-0.2-0.2-0.2C21.1,5.2,19,5,19,5s-1.5-1.5-1.7-1.6c-0.2-0.2-0.5-0.1-0.6-0.1c0,0-0.3,0.1-0.8,0.3c-0.5-1.4-1.4-2.7-2.9-2.7c0,0-0.1,0-0.1,0c-0.4-0.6-1-0.8-1.5-0.8C7.8,0,6.1,4.5,5.5,6.8C4.7,7,3.9,7.3,3,7.6c-0.8,0.2-0.8,0.3-0.9,1C2,9.1,0,24.9,0,24.9l15.9,3l8.6-1.9C24.5,26,21.5,5.6,21.5,5.4z" fill="#95BF47"/>
            <path d="M21.2,5.2C21.1,5.2,19,5,19,5s-1.5-1.5-1.7-1.6c-0.1-0.1-0.1-0.1-0.2-0.1l-1.2,24.6l8.6-1.9c0,0-3-20.4-3-20.6C21.5,5.3,21.3,5.2,21.2,5.2" fill="#5A863E"/>
            <path d="M13,10l-1.1,3.2c0,0-0.9-0.5-2.1-0.5c-1.7,0-1.8,1-1.8,1.3c0,1.4,3.8,2,3.8,5.4c0,2.7-1.7,4.4-4,4.4c-2.7,0-4.1-1.7-4.1-1.7l0.7-2.4c0,0,1.4,1.2,2.6,1.2c0.8,0,1.1-0.6,1.1-1.1c0-1.9-3.1-2-3.1-5.1c0-2.6,1.9-5.1,5.6-5.1C12.3,9.5,13,10,13,10" fill="#FFF"/>
            <path d="M34.6,15.9c-0.9-0.5-1.3-0.9-1.3-1.4c0-0.7,0.6-1.1,1.6-1.1c1.1,0,2.1,0.5,2.1,0.5l0.8-2.4c0,0-0.7-0.6-2.8-0.6c-3,0-5,1.7-5,4.1c0,1.4,1,2.4,2.2,3.1c1,0.6,1.4,1,1.4,1.6c0,0.6-0.5,1.2-1.5,1.2c-1.4,0-2.8-0.7-2.8-0.7l-0.8,2.4c0,0,1.2,0.8,3.3,0.8c3,0,5.2-1.5,5.2-4.2C37,17.7,35.9,16.6,34.6,15.9 M46.7,10.8c-1.5,0-2.7,0.7-3.6,1.8l0,0l1.3-6.8H41l-3.3,17.3h3.4l1.1-5.9c0.4-2.2,1.6-3.6,2.7-3.6c0.8,0,1.1,0.5,1.1,1.3c0,0.5,0,1-0.1,1.5l-1.3,6.8h3.4l1.3-7c0.1-0.7,0.2-1.6,0.2-2.2C49.5,12,48.5,10.8,46.7,10.8 M55.4,20.7c-1.2,0-1.6-1-1.6-2.2c0-1.9,1-5.1,2.8-5.1c1.2,0,1.6,1,1.6,2C58.2,17.6,57.2,20.7,55.4,20.7z M57.1,10.8c-4.1,0-6.8,3.7-6.8,7.8c0,2.6,1.6,4.7,4.7,4.7c4,0,6.7-3.6,6.7-7.8C61.7,13.1,60.3,10.8,57.1,10.8z M67.1,20.8c-0.9,0-1.4-0.5-1.4-0.5l0.6-3.2c0.4-2.1,1.5-3.5,2.7-3.5c1,0,1.4,1,1.4,1.9C70.3,17.7,69,20.8,67.1,20.8z M70.4,10.8c-2.3,0-3.6,2-3.6,2h0l0.2-1.8h-3c-0.1,1.2-0.4,3.1-0.7,4.5l-2.4,12.4h3.4l0.9-5h0.1c0,0,0.7,0.4,2,0.4c4,0,6.6-4.1,6.6-8.2C73.9,12.9,72.9,10.8,70.4,10.8z M78.7,6c-1.1,0-1.9,0.9-1.9,2c0,1,0.6,1.7,1.6,1.7h0c1.1,0,2-0.7,2-2C80.4,6.7,79.7,6,78.7,6 M74,23.1h3.4l2.3-12h-3.4L74,23.1z M88.3,11.1h-2.4l0.1-0.6c0.2-1.2,0.9-2.2,2-2.2c0.6,0,1.1,0.2,1.1,0.2l0.7-2.7c0,0-0.6-0.3-1.8-0.3c-1.2,0-2.4,0.3-3.3,1.1c-1.2,1-1.7,2.4-2,3.8l-0.1,0.6H81l-0.5,2.6h1.6l-1.8,9.5h3.4l1.8-9.5h2.3L88.3,11.1z M96.4,11.1c0,0-2.1,5.3-3.1,8.2h0c-0.1-0.9-0.8-8.2-0.8-8.2h-3.6l2,11c0,0.2,0,0.4-0.1,0.6c-0.4,0.8-1.1,1.5-1.8,2c-0.6,0.5-1.4,0.8-1.9,1l0.9,2.9c0.7-0.1,2.1-0.7,3.3-1.8c1.5-1.4,3-3.7,4.4-6.7l4.1-8.9L96.4,11.1z" fill="var(--logo-wordmark)"/>
          </svg>
        </div>
        <div role="tablist" aria-label="Shopify tabs">
          {#each shopifyTabs as tab}
            {@render sidebarTab(tab)}
          {/each}
        </div>
        <div class="sidebar__divider" role="separator"></div>

        <div class="sidebar__label">SEO</div>
        <div role="tablist" aria-label="SEO tabs">
          {#each seoTabs as tab}
            {@render sidebarTab(tab)}
          {/each}
        </div>

        <!-- Bottom -->
        <div class="sidebar__bottom" role="tablist" aria-label="Utility tabs">
          {@render sidebarTab(settingsTab)}
          <a href="https://github.com/uptek/alfred/issues" target="_blank" class="sidebar__suggest">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round"><path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/></svg>
            Suggest a feature
          </a>
        </div>
      </nav>

      <!-- Content -->
      <div class="content" role="main">
        {#if activeTab === 'theme'}
          {#if storeInfo?.isShopify}
            <Theme {storeInfo} />
          {:else}
            <div class="not-shopify">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" class="not-shopify__icon"><path d="M6 2L3 6v14a2 2 0 002 2h14a2 2 0 002-2V6l-3-4z"/><path d="M3 6h18"/></svg>
              <h3>Not a Shopify store</h3>
              <p>Navigate to a Shopify store to see theme details</p>
            </div>
          {/if}
        {:else if activeTab === 'overview'}
          <Overview
            raw={rawOverview}
            network={overviewNetwork}
            networkLoading={overviewNetworkLoading}
            shopify={shopifyContext}
            analysis={overviewAnalysis}
            links={rawLinks}
            headings={rawHeadings}
            imageCount={rawImages.length}
          />
        {:else if activeTab === 'headings'}
          <Headings headings={rawHeadings} issues={headingIssues} />
        {:else if activeTab === 'links'}
          <Links links={rawLinks} domain={storeInfo?.domain ?? null} />
        {:else if activeTab === 'assets'}
          <Assets assets={rawAssets} domain={storeInfo?.domain ?? null} />
        {:else if activeTab === 'images'}
          <Images images={rawImages} domain={storeInfo?.domain ?? null} />
        {:else if activeTab === 'schema'}
          <Schema schema={rawSchema} domain={storeInfo?.domain ?? null} />
        {:else if activeTab === 'robots'}
          <Robots robots={rawRobots} loading={robotsLoading} pageUrl={storeInfo?.page_url ?? null} isShopify={storeInfo?.isShopify ?? false} />
        {:else if activeTab === 'settings'}
          <div class="content__pad">
            <Settings storeInfo={storeInfo ?? { isShopify: false, shopDomain: null, domain: null, page_url: null, theme: null }} />
          </div>
        {/if}
      </div>
    </div>
  </div>
{/if}

<style>
  /* Popup block */
  .popup { width: 790px; height: 550px; background: var(--bg-canvas); display: flex; flex-direction: column; overflow: hidden; }
  .popup--compact { width: 350px; height: 200px; }

  /* Brand block */
  .brand { padding: 10px 16px; display: flex; align-items: center; justify-content: space-between; border-bottom: 1px solid var(--border); flex-shrink: 0; }
  .brand__left { display: flex; align-items: center; gap: 7px; }
  .brand__name { font-size: 14px; font-weight: 700; color: var(--text); letter-spacing: -0.01em; }

  /* Layout */
  .layout { display: flex; flex: 1; min-height: 0; }

  /* Sidebar block */
  .sidebar { width: 192px; background: var(--bg-raised); border-right: 1px solid var(--border); display: flex; flex-direction: column; padding: 4px 0; flex-shrink: 0; overflow-y: auto; }
  .sidebar::-webkit-scrollbar { width: 3px; }
  .sidebar::-webkit-scrollbar-thumb { background: var(--scrollbar); border-radius: 3px; }
  .sidebar__label { font-size: 10px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.06em; color: var(--text-label); padding: 10px 14px 3px; display: flex; align-items: center; }
  .sidebar__label:first-child { padding-top: 8px; padding-bottom: 6px; }
  .sidebar__divider { height: 1px; background: var(--border-strong); margin: 5px 14px; }
  .sidebar__bottom { margin-top: auto; border-top: 1px solid var(--border); padding-top: 2px; }
  .sidebar__suggest { display: flex; align-items: center; gap: 7px; padding: 6px 10px; margin: 1px 6px; border-radius: 7px; font-size: 12px; font-weight: 500; color: var(--text-link-muted); text-decoration: none; transition: all 0.12s; }
  .sidebar__suggest:hover { color: var(--text-link-muted-hover); background: var(--bg-hover); }
  .sidebar__suggest :global(svg) { width: 14px; height: 14px; opacity: 0.4; stroke-width: 1.7; }

  /* Tab block */
  .tab { display: flex; align-items: center; gap: 7px; padding: 7px 10px; margin: 1px 6px; border-radius: 7px; font-size: 13.5px; font-weight: 500; color: var(--text-link); cursor: pointer; border: none; background: none; width: calc(100% - 12px); text-align: left; transition: all 0.12s ease; font-family: inherit; }
  .tab:hover { background: var(--bg-hover); color: var(--text-link-hover); }
  .tab.active { background: var(--bg); color: var(--text); font-weight: 600; box-shadow: var(--shadow-tab); }
  /* .tab.disabled { color: var(--text-disabled); cursor: default; }
  .tab.disabled:hover { background: none; color: var(--text-disabled); } */
  .tab :global(svg) { width: 15px; height: 15px; flex-shrink: 0; opacity: 0.5; stroke-width: 1.8; }
  .tab.active :global(svg) { opacity: 0.9; }
  .tab__badge { margin-left: auto; font-size: 10px; font-weight: 600; padding: 0px 5px; border-radius: 8px; min-width: 16px; text-align: center; line-height: 16px; }
  .tab__badge--red { background: var(--error-bg); color: var(--error-strong); }
  .tab__badge--green { background: var(--success-bg); color: var(--success-strong); }

  /* Content block */
  .content { flex: 1; overflow-y: auto; overflow-x: hidden; background: var(--bg); scrollbar-gutter: stable; }
  .content::-webkit-scrollbar { width: 3px; }
  .content::-webkit-scrollbar-thumb { background: var(--scrollbar); border-radius: 3px; }
  .content__pad { padding: 24px 28px 28px; }

  /* Coming-soon block (uncomment when disabled tabs are re-enabled)
  .coming-soon { display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100%; color: var(--text-link-muted); gap: 8px; }
  .coming-soon__icon :global(svg) { width: 32px; height: 32px; opacity: 0.2; stroke-width: 1.5; }
  .coming-soon h3 { font-size: 15px; font-weight: 600; color: var(--text-secondary); margin: 0; }
  .coming-soon p { font-size: 13px; color: var(--text-muted); margin: 0; } */

  /* Loading block */
  .loading { display: flex; align-items: center; justify-content: center; gap: 12px; height: 100%; color: var(--text-link-muted); font-size: 14px; }
  .loading__spinner { width: 20px; height: 20px; border: 2px solid var(--border-strong); border-top-color: var(--accent); border-radius: 50%; animation: spin 0.8s linear infinite; }
  @keyframes spin { to { transform: rotate(360deg); } }

  /* Not-Shopify block */
  .not-shopify { display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100%; gap: 8px; text-align: center; }
  .not-shopify__icon { width: 28px; height: 28px; color: var(--text-disabled); stroke-width: 1.7; }
  .not-shopify h3 { font-size: 15px; font-weight: 600; color: var(--text-secondary); margin: 0; }
  .not-shopify p { font-size: 13px; color: var(--text-muted); margin: 0; }
</style>
