<script lang="ts">
  import { fetchAppData, downloadCSV, getResourceIcon } from './utils';
  import type { App, SortableHeaderProps } from './types';

  import builtForShopifyIcon from '@/assets/icon-built-for-shopify.svg';
  import exportIcon from '@/assets/icon-export.svg';

  let apps = $state.raw<App[]>([]);
  let sortState = $state.raw<{ column: keyof App | null; direction: 'asc' | 'desc' | null }>({ column: null, direction: null });
  let activeSummaryCard = $state<string | null>(null);
  let isLoading = $state(true);
  let error = $state<string | null>(null);

  $effect(() => {
    const fetchApps = async () => {
      try {
        isLoading = true;
        error = null;

        const appCards = document.querySelectorAll(`[data-controller="app-card"]`);
        if (!appCards || appCards.length === 0) {
          error = 'No app cards found on the page';
          return;
        }

        const initialApps: App[] = Array.from(appCards).map((card) => {
          const name = card.getAttribute('data-app-card-name-value') ?? '';
          const handle = card.getAttribute('data-app-card-handle-value') ?? '';
          const iconUrl = card.getAttribute('data-app-card-icon-url-value') ?? '';
          const link = card.getAttribute('data-app-card-app-link-value') ?? '';

          const iconFigure = card.querySelector('figure');
          const infoRow = card.querySelector('div > div > div:nth-child(1) > div:nth-child(2)');
          const descriptionElement = card.querySelector('div > div > div:nth-child(1) > div:nth-child(3)');
          const installedElement = card.querySelector('div > div > div:nth-child(1) > div.tw-text-notifications-success-primary');
          const builtForShopifyElement = card.querySelector('.built-for-shopify-badge');

          let rating = '—';
          let reviewCount = 0;
          let pricing = '—';

          if (infoRow) {
            const spansRow = infoRow.querySelector('div.tw-relative.tw-flex.tw-items-center');
            if (spansRow) {
              const spans = spansRow.querySelectorAll('span');
              if (spans.length > 0 && !spans[0]?.classList.contains('tw-overflow-hidden')) {
                const firstSpan = spans[0];
                const firstTextNode = Array.from(firstSpan?.childNodes ?? []).find(
                  (n): n is Text => n.nodeType === Node.TEXT_NODE
                );
                rating = firstTextNode
                  ? (firstTextNode.textContent?.trim() ?? 'N/A')
                  : (firstSpan?.textContent?.trim() ?? 'N/A');
              }
              for (const span of spans) {
                if (span.classList.contains('tw-overflow-hidden')) {
                  pricing = span?.textContent?.trim() ?? 'N/A';
                } else if (span?.hasAttribute('aria-hidden') && /^\(.*\)$/.test(span?.textContent?.trim() ?? '')) {
                  reviewCount = parseInt((span?.textContent ?? '').replace(/[(),]/g, '').trim().replace(/,/g, ''), 10) || 0;
                }
              }
            }
          }

          return {
            name, handle, iconUrl, link,
            iconFigure: iconFigure ? (iconFigure.cloneNode(true) as HTMLElement) : null,
            rating, reviewCount, pricing,
            description: descriptionElement?.textContent?.trim() ?? '',
            isInstalled: installedElement !== null,
            isBuiltForShopify: builtForShopifyElement !== null,
            launchDate: null, age: null, detailedAge: null,
            developer: { website: null, address: null },
            resources: []
          };
        });

        apps = initialApps;
        isLoading = false;

        browser.runtime.sendMessage({
          type: 'track_action',
          action: 'appstore_partner_table_view',
          metadata: { app_count: initialApps.length, page_url: window.location.href, page_type: 'appstore_partners' }
        });

        const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

        for (const app of initialApps) {
          try {
            const appData = await fetchAppData(app.link);
            apps = apps.map((a) => a.handle === app.handle ? { ...a, ...appData } : a);
            await delay(250);
          } catch (err) {
            console.error(`Error fetching additional data for ${app.name}:`, err);
          }
        }
      } catch (err) {
        error = err instanceof Error ? err.message : 'An error occurred while fetching app data';
        isLoading = false;
      }
    };

    fetchApps();
  });

  function handleSort(column: keyof App, direction: 'asc' | 'desc') {
    sortState = { column, direction };

    browser.runtime.sendMessage({
      type: 'track_action',
      action: 'appstore_partner_table_sort',
      metadata: { app_count: apps.length, sort_by: column, sort_direction: direction, page_url: window.location.href, page_type: 'appstore_partners' }
    });

    apps = [...apps].sort((a, b) => {
      let aValue: string | number;
      let bValue: string | number;

      if (column === 'rating') {
        aValue = parseFloat(a.rating) || 0;
        bValue = parseFloat(b.rating) || 0;
      } else if (column === 'isInstalled' || column === 'isBuiltForShopify') {
        aValue = a[column] ? 1 : 0;
        bValue = b[column] ? 1 : 0;
      } else if (column === 'age') {
        const aDate = a.launchDate ? new Date(a.launchDate) : new Date(0);
        const bDate = b.launchDate ? new Date(b.launchDate) : new Date(0);
        aValue = aDate.getTime();
        bValue = bDate.getTime();
      } else {
        const aVal = a[column];
        const bVal = b[column];
        aValue = typeof aVal === 'string' || typeof aVal === 'number' ? aVal : '';
        bValue = typeof bVal === 'string' || typeof bVal === 'number' ? bVal : '';
      }

      if (aValue < bValue) return direction === 'asc' ? -1 : 1;
      if (aValue > bValue) return direction === 'asc' ? 1 : -1;
      return 0;
    });
  }

  function getSortIconClass(column: keyof App): string {
    if (sortState.column === column) {
      return sortState.direction === 'asc' ? 'sort-icon-asc' : 'sort-icon-desc';
    }
    return 'sort-icon-both';
  }
</script>

{#snippet sortableHeader(label: string, column: keyof App, align?: string)}
  <th
    class="sortable {sortState.column === column ? 'sortable-active' : ''}"
    style="text-align: {align ?? 'left'}"
    onclick={() => handleSort(column, sortState.direction === 'asc' ? 'desc' : 'asc')}>
    <div style="display: inline-flex; align-items: center;">
      <span>{label}</span>
      <span class={getSortIconClass(column)}></span>
    </div>
  </th>
{/snippet}

{#if isLoading}
  <div class="container">Loading...</div>
{:else if error}
  <div class="container">Error: {error}</div>
{:else if apps.length === 0}
  <!-- empty -->
{:else}
  <div class="container">
    <div class="export-button-container">
      <button class="export-button" onclick={() => downloadCSV(apps)}>
        <img src={exportIcon} alt="Export to CSV" />
        Export to CSV
      </button>
    </div>
    <div class="table-container">
      <table class="table">
        <thead>
          <tr>
            <th style="width: 50px"></th>
            {@render sortableHeader('Name', 'name')}
            {@render sortableHeader('Rating', 'rating')}
            {@render sortableHeader('Reviews', 'reviewCount')}
            {@render sortableHeader('Pricing', 'pricing')}
            {@render sortableHeader('Age', 'age')}
            {@render sortableHeader('Installed', 'isInstalled')}
            {@render sortableHeader('Built for Shopify', 'isBuiltForShopify')}
          </tr>
        </thead>
        <tbody>
          {#each apps as app (app.handle)}
            <!-- svelte-ignore a11y_mouse_events_have_key_events -->
            <tr>
              <td>
                {#if app.iconFigure}
                  <span>{@html app.iconFigure.outerHTML}</span>
                {:else}
                  <img src={app.iconUrl} alt="{app.name} icon" class="app-icon" />
                {/if}
              </td>
              <!-- svelte-ignore a11y_no_noninteractive_element_interactions a11y_mouse_events_have_key_events -->
              <td
                onmouseenter={() => (activeSummaryCard = app.handle)}
                onmouseleave={() => (activeSummaryCard = null)}
                style="position: relative">
                <a href={app.link} class="app-name">{app.name}</a>
                <div class="app-description">{app.description}</div>
                <div class="summary-card {activeSummaryCard === app.handle ? 'summary-card-active' : ''}">
                  <div class="summary-header">
                    <img src={app.iconUrl} alt="{app.name} icon" class="summary-icon" />
                    <div class="summary-app-name">{app.name}</div>
                  </div>
                  <div class="summary-section">
                    <div class="summary-section-title">App Details</div>
                    <div class="summary-detail">
                      <div class="summary-detail-label">Launched:</div>
                      <div class="summary-detail-value">{app.launchDate}</div>
                    </div>
                    {#if app.detailedAge}
                      <div class="summary-detail">
                        <div class="summary-detail-label">Age:</div>
                        <div class="summary-detail-value">{app.detailedAge}</div>
                      </div>
                    {/if}
                    {#if app.rating && app.rating !== 'N/A'}
                      <div class="summary-detail">
                        <div class="summary-detail-label">Rating:</div>
                        <div class="summary-detail-value">{app.rating} ({app.reviewCount.toLocaleString()} reviews)</div>
                      </div>
                    {/if}
                    {#if app.pricing}
                      <div class="summary-detail">
                        <div class="summary-detail-label">Pricing:</div>
                        <div class="summary-detail-value">{app.pricing}</div>
                      </div>
                    {/if}
                  </div>
                  {#if app.developer && (app.developer.website ?? app.developer.address)}
                    <div class="summary-section">
                      <div class="summary-section-title">Developer</div>
                      {#if app.developer.website}
                        <div class="summary-detail">
                          <div class="summary-detail-label">Website:</div>
                          <div class="summary-detail-value">
                            <a href={app.developer.website} target="_blank" style="color: rgb(44, 110, 203); text-decoration: none;">
                              {app.developer.website}
                            </a>
                          </div>
                        </div>
                      {/if}
                      {#if app.developer.address}
                        <div class="summary-detail">
                          <div class="summary-detail-label">Address:</div>
                          <div class="summary-detail-value">{app.developer.address}</div>
                        </div>
                      {/if}
                    </div>
                  {/if}
                  <div class="summary-section">
                    <div class="summary-section-title">Resources</div>
                    <div class="summary-resources">
                      {#each app.resources as resource}
                        <a href={resource.url} target="_blank" class="summary-resource-link">
                          <span class="summary-resource-icon">
                            <img src={getResourceIcon(resource)} alt={resource.title} />
                          </span>
                          <span>{resource.title}</span>
                        </a>
                      {/each}
                    </div>
                  </div>
                </div>
              </td>
              <td style="text-align: center">
                <div class="rating-container">{app.rating}</div>
              </td>
              <td style="text-align: center">{app.reviewCount.toLocaleString()}</td>
              <td>{app.pricing}</td>
              <td>
                <span style="margin-bottom: 2px">{app.age}</span>
                <div class="app-description">{app.launchDate}</div>
              </td>
              <td style="text-align: center">
                <span class={app.isInstalled ? 'status-success' : 'status-neutral'}>
                  {app.isInstalled ? '✓' : '—'}
                </span>
              </td>
              <td style="text-align: center">
                <span class={app.isBuiltForShopify ? 'shopify-badge' : 'status-neutral'}>
                  {#if app.isBuiltForShopify}
                    <img src={builtForShopifyIcon} alt="Built for Shopify" />
                  {:else}
                    —
                  {/if}
                </span>
              </td>
            </tr>
          {/each}
        </tbody>
      </table>
    </div>
  </div>
{/if}

<style>
  .container { margin: 20px 0; }
  .export-button-container { display: flex; justify-content: flex-end; margin-bottom: 16px; }
  .export-button { display: inline-flex; align-items: center; justify-content: center; padding: 8px 16px; background-color: #ffffff; border: 1px solid #c9cccf; border-radius: 4px; color: #2c6ecb; font-size: 14px; font-weight: 500; cursor: pointer; transition: background-color 0.2s ease, border-color 0.2s ease; height: 36px; }
  .export-button:hover { background-color: #f6f6f7; border-color: #aeb4b9; }
  .export-button:active { background-color: #ebebeb; }
  .export-button img { margin-right: 8px; fill: #2c6ecb; }
  .table-container { font-family: 'Inter var', Helvetica, Arial, sans-serif; border-radius: 8px; box-shadow: 0 0 0 1px rgba(63, 63, 68, 0.05), 0 1px 3px 0 rgba(63, 63, 68, 0.15); color: #202223; background-color: #ffffff; position: relative; }
  .table { width: 100%; border-collapse: collapse; font-size: 14px; }
  .table thead { background-color: #f6f6f7; border-bottom: 1px solid #e1e3e5; }
  .table th { padding: 16px; font-weight: 600; text-align: left; color: #6d7175; font-size: 12px; text-transform: uppercase; letter-spacing: 0.5px; white-space: nowrap; }
  .table tr { border-bottom: 1px solid #e1e3e5; position: relative; }
  .table tr:last-child { border-bottom: none; }
  .table tr:hover { background-color: #f9fafb; }
  .table td { position: relative; padding: 16px; vertical-align: top; }
  .app-name { color: #2c6ecb; font-weight: 500; text-decoration: none; display: block; margin-bottom: 4px; }
  .app-name:hover { color: #084e8a; text-decoration: underline; }
  .app-description { color: #6d7175; font-size: 13px; line-height: 1.5; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
  .rating-container { display: flex; align-items: center; justify-content: center; }
  .status-success { color: #008060; font-weight: 500; }
  .status-neutral { color: #6d7175; }

  /* Sort indicators */
  .sort-icon-asc, .sort-icon-desc, .sort-icon-both { display: inline-block; width: 0; height: 0; margin-left: 8px; vertical-align: middle; opacity: 0.5; transition: opacity 0.2s ease; }
  .sort-icon-asc { border-left: 4px solid transparent; border-right: 4px solid transparent; border-bottom: 4px solid #6d7175; }
  .sort-icon-desc { border-left: 4px solid transparent; border-right: 4px solid transparent; border-top: 4px solid #6d7175; }
  .sort-icon-both { height: 10px; position: relative; }
  .sort-icon-both::before { content: ''; position: absolute; top: 0; left: 0; border-left: 4px solid transparent; border-right: 4px solid transparent; border-bottom: 4px solid #6d7175; }
  .sort-icon-both::after { content: ''; position: absolute; bottom: 0; left: 0; border-left: 4px solid transparent; border-right: 4px solid transparent; border-top: 4px solid #6d7175; }
  .sortable { cursor: pointer; user-select: none; position: relative; transition: background-color 0.2s ease; }
  .sortable:hover { background-color: #ebebeb; }

  .app-icon { width: 40px; height: 40px; border-radius: 8px; object-fit: cover; }
  .shopify-badge { display: flex; align-items: center; justify-content: center; }
  .shopify-badge img { vertical-align: middle; height: 1em; width: 1em; }

  /* Summary card */
  .summary-card { position: absolute; top: 0; left: 95%; width: 330px; background-color: white; border-radius: 8px; box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15); z-index: 9999; padding: 16px; display: none; margin-left: 20px; font-size: 14px; opacity: 0; transition: opacity 0.3s ease, transform 0.3s ease; transform: translateY(10px); pointer-events: none; }
  .summary-card-active { display: block; opacity: 1; transform: translateY(0); pointer-events: auto; }
  .summary-card-active::before { content: ''; position: absolute; top: 20px; left: -8px; width: 16px; height: 16px; background-color: white; transform: rotate(45deg); box-shadow: -2px 2px 3px rgba(0, 0, 0, 0.05); }
  .summary-header { display: flex; align-items: center; margin-bottom: 12px; }
  .summary-icon { width: 32px; height: 32px; border-radius: 6px; margin-right: 12px; object-fit: cover; }
  .summary-app-name { font-weight: 600; font-size: 16px; color: #202223; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .summary-section { margin-bottom: 12px; }
  .summary-section-title { font-weight: 600; margin-bottom: 4px; color: #202223; border-bottom: 1px solid #e1e3e5; padding-bottom: 4px; }
  .summary-detail { display: flex; margin-bottom: 6px; }
  .summary-detail-label { width: 90px; color: #6d7175; font-size: 13px; }
  .summary-detail-value { flex: 1; color: #202223; word-break: break-word; }
  .summary-resources { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 8px; }
  .summary-resource-link { display: flex; align-items: center; background-color: #f6f6f7; padding: 6px 10px; border-radius: 4px; text-decoration: none; color: #2c6ecb; font-size: 13px; transition: background-color 0.2s ease; }
  .summary-resource-link:hover { background-color: #ebebeb; }
  .summary-resource-icon { width: 16px; height: 16px; margin-right: 6px; fill: #2c6ecb; }
</style>
