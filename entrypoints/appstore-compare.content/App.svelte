<script lang="ts">
  import { flip } from 'svelte/animate';
  import { fetchAppListing, formatAppAge } from '~/utils/appListing';
  import { removeFromTray } from '~/utils/compareTray';
  import { sendTrackEvent } from '@/utils/analytics';
  import { Toast } from '~/utils/toast';
  import { buildComparisonCsv, buildComparisonJson, buildComparisonMarkdown, COMPARISON_ROWS } from './exporters';

  type Column = {
    handle: string;
    status: 'loading' | 'loaded' | 'error';
    listing?: AppListing;
    error?: string;
  };

  let { handles }: { handles: string[] } = $props();

  let columns = $state.raw<Column[]>(handles.map((handle) => ({ handle, status: 'loading' })));

  const loadedListings = $derived(
    columns.flatMap((column) => (column.status === 'loaded' && column.listing ? [column.listing] : []))
  );

  const ROW_RENDERERS = new Map(COMPARISON_ROWS);

  let differencesOnly = $state(false);

  const loadedColumns = $derived(columns.filter((column) => column.status === 'loaded' && column.listing));

  function rowVisible(label: string): boolean {
    if (!differencesOnly || loadedColumns.length < 2) {
      return true;
    }

    const render = ROW_RENDERERS.get(label);

    if (!render) {
      return true;
    }

    return new Set(loadedColumns.map((column) => render(column.listing as AppListing))).size > 1;
  }

  async function loadColumn(handle: string) {
    columns = columns.map((column) => (column.handle === handle ? { handle, status: 'loading' } : column));

    try {
      const listing = await fetchAppListing(handle);
      columns = columns.map((column) =>
        column.handle === handle ? { handle, status: 'loaded', listing } : column
      );
    } catch (error) {
      columns = columns.map((column) =>
        column.handle === handle
          ? {
              handle,
              status: 'error',
              error: error instanceof Error ? error.message : 'Failed to load listing'
            }
          : column
      );
    }
  }

  function removeColumn(handle: string) {
    columns = columns.filter((column) => column.handle !== handle);
    window.history.replaceState(null, '', `/compare/${columns.map((column) => column.handle).join(',')}`);
    // Keep the tray in sync — no-op if the app was never in it (shared URLs)
    void removeFromTray(handle);
  }

  const flipDuration = window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 300;

  function moveColumn(handle: string, direction: -1 | 1) {
    const index = columns.findIndex((column) => column.handle === handle);
    const target = index + direction;

    if (index === -1 || target < 0 || target >= columns.length) {
      return;
    }

    const next = [...columns];
    const [moved] = next.splice(index, 1);

    if (!moved) {
      return;
    }

    next.splice(target, 0, moved);
    columns = next;
    window.history.replaceState(null, '', `/compare/${columns.map((column) => column.handle).join(',')}`);
  }

  let exportOpen = $state(false);

  function closeExportMenu() {
    exportOpen = false;
  }

  async function copyMarkdown() {
    closeExportMenu();

    try {
      await navigator.clipboard.writeText(buildComparisonMarkdown(loadedListings));
      Toast.success('Comparison copied as markdown');
      sendTrackEvent('compare_export_markdown', { app_count: loadedListings.length });
    } catch {
      Toast.error('Could not copy to clipboard');
    }
  }

  function downloadFile(filename: string, content: string, type: string) {
    const url = URL.createObjectURL(new Blob([content], { type }));
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  }

  function exportFilename(extension: string): string {
    return `shopify-alfred-compare-${new Date().toISOString().split('T')[0]}.${extension}`;
  }

  function downloadCsv() {
    closeExportMenu();
    downloadFile(exportFilename('csv'), buildComparisonCsv(loadedListings), 'text/csv;charset=utf-8;');
    Toast.success('Comparison downloaded as CSV');
    sendTrackEvent('compare_export_csv', { app_count: loadedListings.length });
  }

  function downloadJson() {
    closeExportMenu();
    downloadFile(exportFilename('json'), buildComparisonJson(loadedListings), 'application/json');
    Toast.success('Comparison downloaded as JSON');
    sendTrackEvent('compare_export_json', { app_count: loadedListings.length });
  }

  // The comparison URL works for anyone with Alfred installed. Desktop
  // "share" means copy-the-link; the OS share sheet is a detour here.
  async function shareComparison() {
    try {
      await navigator.clipboard.writeText(window.location.href);
      Toast.success('Comparison link copied');
      sendTrackEvent('compare_share', { app_count: loadedListings.length });
    } catch {
      Toast.error('Could not copy the link');
    }
  }

  sendTrackEvent('compare_view', { app_count: handles.length, page_url: window.location.href });

  // Fetch all listings in parallel but reveal them in a single paint:
  // per-column reveals make the columns reflow each other as they load.
  // Retry still uses loadColumn for a single-column update.
  void (async () => {
    const results = await Promise.allSettled(handles.map((handle) => fetchAppListing(handle)));

    columns = handles.map((handle, index): Column => {
      const result = results[index];

      if (result?.status === 'fulfilled') {
        return { handle, status: 'loaded', listing: result.value };
      }

      const reason = result?.status === 'rejected' ? result.reason : undefined;
      return {
        handle,
        status: 'error',
        error: reason instanceof Error ? reason.message : 'Failed to load listing'
      };
    });
  })();
</script>

<svelte:window
  onclick={() => (exportOpen = false)}
  onkeydown={(event) => {
    if (event.key === 'Escape') {
      exportOpen = false;
    }
  }}
/>

<!-- The App Store's own star icon (listing page rating/review sections) -->
{#snippet starIcon()}
  <svg class="compare-star" viewBox="0 0 16 15" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
    <path
      fill-rule="evenodd"
      clip-rule="evenodd"
      d="M8 0.75C8.14001 0.74991 8.27725 0.789014 8.39619 0.862887C8.51513 0.93676 8.61102 1.04245 8.673 1.168L10.555 4.983L14.765 5.595C14.9035 5.61511 15.0335 5.67355 15.1405 5.76372C15.2475 5.85388 15.3271 5.97218 15.3704 6.10523C15.4137 6.23829 15.4189 6.3808 15.3854 6.51665C15.3519 6.6525 15.2811 6.77628 15.181 6.874L12.135 9.844L12.854 14.036C12.8777 14.1739 12.8624 14.3157 12.8097 14.4454C12.757 14.5751 12.6691 14.6874 12.5559 14.7697C12.4427 14.852 12.3087 14.901 12.1691 14.9111C12.0295 14.9212 11.8899 14.8921 11.766 14.827L8 12.847L4.234 14.827C4.11018 14.892 3.97066 14.9211 3.83119 14.911C3.69171 14.9009 3.55784 14.852 3.44468 14.7699C3.33152 14.6877 3.24359 14.5755 3.19081 14.446C3.13803 14.3165 3.12251 14.1749 3.146 14.037L3.866 9.843L0.817997 6.874C0.717563 6.77632 0.646496 6.65247 0.612848 6.51647C0.579201 6.38047 0.584318 6.23777 0.627621 6.10453C0.670924 5.97129 0.75068 5.85284 0.857852 5.76261C0.965025 5.67238 1.09533 5.61397 1.234 5.594L5.444 4.983L7.327 1.168C7.38898 1.04245 7.48486 0.93676 7.6038 0.862887C7.72274 0.789014 7.85998 0.74991 8 0.75Z"
    />
  </svg>
{/snippet}

<div class="compare">
  <header class="compare-header">
    <div>
      <h1>Compare apps</h1>
      <!-- Polaris components live in the page world; the content script can
           only reach them via attributes and events. Boolean attributes are
           presence-based, so pass undefined (not false) to keep them absent,
           and mirror the checkbox by toggling our own state on change. -->
      <s-checkbox
        label="Differences only"
        checked={differencesOnly || undefined}
        disabled={loadedColumns.length < 2 || undefined}
        onchange={() => (differencesOnly = !differencesOnly)}
      ></s-checkbox>
    </div>
    <div class="compare-actions">
      <s-button icon="link" onclick={shareComparison}>Share</s-button>
      <!-- s-popover can't position itself outside Shopify's own embedding
           (its activator measurement comes up empty), so the trigger is
           Polaris and the panel is ours -->
      <div class="compare-export-wrap">
        <s-button
          icon="chevron-down"
          disabled={loadedListings.length === 0 || undefined}
          onclick={(event: Event) => {
            event.stopPropagation();
            exportOpen = !exportOpen;
          }}
        >
          Export
        </s-button>
        {#if exportOpen}
          <div class="compare-export-menu" role="menu">
            <button role="menuitem" onclick={copyMarkdown}>Copy as Markdown</button>
            <button role="menuitem" onclick={downloadCsv}>Download CSV</button>
            <button role="menuitem" onclick={downloadJson}>Download JSON</button>
          </div>
        {/if}
      </div>
    </div>
  </header>

  {#if columns.length === 0}
    <p class="compare-empty">
      No apps to compare. <a href="https://apps.shopify.com/">Browse the App Store</a> to add some.
    </p>
  {:else}
    <div class="compare-scroll">
      <table class="compare-table">
        <thead>
          <tr>
            <th class="compare-label" scope="col" aria-label="Attribute"></th>
            {#each columns as column, index (column.handle)}
              <th class="compare-app" scope="col" animate:flip={{ duration: flipDuration }}>
                {#if column.status === 'loaded' && column.listing}
                  {@const listing = column.listing}
                  <div class="compare-app-card">
                    {#if listing.iconUrl}
                      <img class="compare-app-icon" src={listing.iconUrl} alt={listing.name ?? column.handle} />
                    {/if}
                    <a class="compare-app-name" href={listing.url}>{listing.name ?? column.handle}</a>
                    {#if listing.tagline}
                      <p class="compare-app-tagline">{listing.tagline}</p>
                    {/if}
                    <div class="compare-app-controls">
                      {#if columns.length > 1}
                        <s-button
                          variant="tertiary"
                          icon="arrow-left"
                          accessibilityLabel={`Move ${listing.name ?? column.handle} left`}
                          disabled={index === 0 || undefined}
                          onclick={() => moveColumn(column.handle, -1)}
                        ></s-button>
                        <s-button
                          variant="tertiary"
                          icon="arrow-right"
                          accessibilityLabel={`Move ${listing.name ?? column.handle} right`}
                          disabled={index === columns.length - 1 || undefined}
                          onclick={() => moveColumn(column.handle, 1)}
                        ></s-button>
                      {/if}
                      <s-button variant="secondary" onclick={() => removeColumn(column.handle)}>Remove</s-button>
                    </div>
                  </div>
                {:else if column.status === 'loading'}
                  <div class="compare-app-card compare-app-loading" aria-busy="true">
                    <span class="compare-skeleton compare-skeleton-icon"></span>
                    <span class="compare-skeleton compare-skeleton-line"></span>
                    <span class="compare-skeleton compare-skeleton-line"></span>
                  </div>
                {:else}
                  <div class="compare-app-card compare-app-error">
                    <p>Couldn't load <strong>{column.handle}</strong></p>
                    <p class="compare-error-detail">{column.error}</p>
                    <div class="compare-app-controls">
                      <s-button variant="secondary" onclick={() => loadColumn(column.handle)}>Retry</s-button>
                      <s-button variant="tertiary" onclick={() => removeColumn(column.handle)}>Remove</s-button>
                    </div>
                  </div>
                {/if}
              </th>
            {/each}
          </tr>
        </thead>
        <tbody>
          {#if rowVisible('Screenshots')}
            <tr>
              <th class="compare-label" scope="row">Screenshots</th>
              {#each columns as column (column.handle)}
                <td animate:flip={{ duration: flipDuration }}>
                  {#if column.listing && column.listing.screenshots.length > 0}
                    <div class="compare-screenshots">
                      {#each column.listing.screenshots as shot (shot)}
                        <a href={shot.split('?')[0]} target="_blank" rel="noopener noreferrer">
                          <img src={shot} alt={`${column.listing.name ?? column.handle} screenshot`} loading="lazy" />
                        </a>
                      {/each}
                    </div>
                  {:else}
                    —
                  {/if}
                </td>
              {/each}
            </tr>
          {/if}
          {#if rowVisible('Built for Shopify')}
            <tr>
              <th class="compare-label" scope="row">Built for Shopify</th>
              {#each columns as column (column.handle)}
                <td animate:flip={{ duration: flipDuration }}>{column.listing ? (column.listing.builtForShopify ? 'Yes' : 'No') : '—'}</td>
              {/each}
            </tr>
          {/if}
          {#if rowVisible('Rating')}
            <tr>
              <th class="compare-label" scope="row">Rating</th>
              {#each columns as column (column.handle)}
                <td animate:flip={{ duration: flipDuration }}>
                  {#if column.listing?.rating != null}
                    <span class="compare-rating">{column.listing.rating}{@render starIcon()}</span>
                  {:else}
                    —
                  {/if}
                </td>
              {/each}
            </tr>
          {/if}
          {#if rowVisible('Reviews')}
            <tr>
              <th class="compare-label" scope="row">Reviews</th>
              {#each columns as column (column.handle)}
                <td animate:flip={{ duration: flipDuration }}>
                  {#if column.listing?.reviewCount != null}
                    <div class="compare-review-total">{column.listing.reviewCount.toLocaleString()}</div>
                    {#if column.listing.ratingDistribution.length > 0}
                      <ul class="compare-distribution">
                        {#each column.listing.ratingDistribution as level (level.stars)}
                          <li>
                            <span class="compare-distribution-stars">{level.stars}{@render starIcon()}</span>
                            <span class="compare-distribution-track">
                              <span class="compare-distribution-fill" style:width={`${level.percent}%`}></span>
                            </span>
                            <a
                              class="compare-distribution-count"
                              href={`${column.listing.url}/reviews?ratings%5B%5D=${level.stars}`}
                              target="_blank"
                              rel="noopener noreferrer"
                            >
                              {level.count}
                            </a>
                          </li>
                        {/each}
                      </ul>
                    {/if}
                  {:else}
                    —
                  {/if}
                </td>
              {/each}
            </tr>
          {/if}
          {#if rowVisible('Pricing')}
            <tr>
              <th class="compare-label" scope="row">Pricing</th>
              {#each columns as column (column.handle)}
                <td animate:flip={{ duration: flipDuration }}>
                  {#if column.listing}
                    {#if column.listing.plans.length > 0}
                      <ul class="compare-plans">
                        {#each column.listing.plans as plan}
                          <li>
                            <strong>{plan.name ?? 'Plan'}</strong>
                            {#if plan.price}<span class="compare-plan-price">{plan.price}</span>{/if}
                          </li>
                        {/each}
                      </ul>
                    {:else}
                      {column.listing.pricingSummary ?? '—'}
                    {/if}
                  {:else}
                    —
                  {/if}
                </td>
              {/each}
            </tr>
          {/if}
          {#if rowVisible('Free plan')}
            <tr>
              <th class="compare-label" scope="row">Free plan</th>
              {#each columns as column (column.handle)}
                <td animate:flip={{ duration: flipDuration }}>{column.listing ? (column.listing.hasFreePlan ? 'Yes' : 'No') : '—'}</td>
              {/each}
            </tr>
          {/if}
          {#if rowVisible('Free trial')}
            <tr>
              <th class="compare-label" scope="row">Free trial</th>
              {#each columns as column (column.handle)}
                <td animate:flip={{ duration: flipDuration }}>
                  {column.listing
                    ? column.listing.hasFreeTrial
                      ? column.listing.freeTrialDays
                        ? `Yes (${column.listing.freeTrialDays} days)`
                        : 'Yes'
                      : 'No'
                    : '—'}
                </td>
              {/each}
            </tr>
          {/if}
          {#if rowVisible('Launched')}
            <tr>
              <th class="compare-label" scope="row">Launched</th>
              {#each columns as column (column.handle)}
                <td animate:flip={{ duration: flipDuration }}>
                  {#if column.listing?.launchDate}
                    {@const age = formatAppAge(column.listing.launchDate)}
                    <div>{column.listing.launchDate}</div>
                    {#if age}<div class="compare-muted">{age}</div>{/if}
                  {:else}
                    —
                  {/if}
                </td>
              {/each}
            </tr>
          {/if}
          {#if rowVisible('Developer')}
            <tr>
              <th class="compare-label" scope="row">Developer</th>
              {#each columns as column (column.handle)}
                <td animate:flip={{ duration: flipDuration }}>
                  {#if column.listing?.developerName}
                    {#if column.listing.developerUrl}
                      <a href={column.listing.developerUrl}>{column.listing.developerName}</a>
                    {:else}
                      {column.listing.developerName}
                    {/if}
                  {:else}
                    —
                  {/if}
                </td>
              {/each}
            </tr>
          {/if}
          {#if rowVisible('Languages')}
            <tr>
              <th class="compare-label" scope="row">Languages</th>
              {#each columns as column (column.handle)}
                <td animate:flip={{ duration: flipDuration }}>
                  {column.listing?.languages ?? '—'}
                </td>
              {/each}
            </tr>
          {/if}
          {#if rowVisible('Links')}
            <tr>
              <th class="compare-label" scope="row">Links</th>
              {#each columns as column (column.handle)}
                <td animate:flip={{ duration: flipDuration }}>
                  {#if column.listing && column.listing.links.length > 0}
                    <ul class="compare-links">
                      {#each column.listing.links as link (link.url)}
                        <li><a href={link.url} target="_blank" rel="noopener noreferrer">{link.label}</a></li>
                      {/each}
                    </ul>
                  {:else}
                    —
                  {/if}
                </td>
              {/each}
            </tr>
          {/if}
          {#if rowVisible('Works with')}
            <tr>
              <th class="compare-label" scope="row">Works with</th>
              {#each columns as column (column.handle)}
                <td animate:flip={{ duration: flipDuration }}>{column.listing?.worksWith.length ? column.listing.worksWith.join(', ') : '—'}</td>
              {/each}
            </tr>
          {/if}
          {#if rowVisible('Categories')}
            <tr>
              <th class="compare-label" scope="row">Categories</th>
              {#each columns as column (column.handle)}
                <td animate:flip={{ duration: flipDuration }}>{column.listing?.categories.length ? column.listing.categories.join(', ') : '—'}</td>
              {/each}
            </tr>
          {/if}
          {#if rowVisible('Data access')}
            <tr>
              <th class="compare-label" scope="row">Data access</th>
              {#each columns as column (column.handle)}
                <td animate:flip={{ duration: flipDuration }}>
                  {#if column.listing && column.listing.dataAccess.length > 0}
                    <ul class="compare-access">
                      {#each column.listing.dataAccess as access (access.group)}
                        <li>
                          <strong>{access.group}</strong>
                          {#if access.items.length > 0}
                            <ul class="compare-access-items">
                              {#each access.items as item (item.name)}
                                <li>
                                  {item.name}
                                  {#if item.details}<div class="compare-muted">{item.details}</div>{/if}
                                </li>
                              {/each}
                            </ul>
                          {:else if access.summary}
                            <div class="compare-muted">{access.summary}</div>
                          {/if}
                        </li>
                      {/each}
                    </ul>
                  {:else}
                    —
                  {/if}
                </td>
              {/each}
            </tr>
          {/if}
        </tbody>
      </table>
    </div>
  {/if}
</div>

<style>
  /* Radius system: page controls 8px, tray container 12px, injected card
     chips 4px (matching the store's own chip radius). Fonts inherit from the
     App Store page so the takeover blends with the host brand. */
  .compare {
    max-width: 1200px;
    margin: 0 auto;
    padding: 32px 20px 64px;
    color: #1a1a1a;
    font-family: inherit;
  }

  .compare :is(button, a):focus-visible {
    outline: 2px solid #1a1a1a;
    outline-offset: 2px;
    border-radius: 4px;
  }

  .compare button:active {
    transform: scale(0.98);
  }

  .compare-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 16px;
    margin-bottom: 24px;
  }

  .compare-header h1 {
    margin: 0;
    font-size: 28px;
    font-weight: 700;
  }

  .compare-actions {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .compare-export-wrap {
    position: relative;
  }

  .compare-export-menu {
    position: absolute;
    top: calc(100% + 4px);
    right: 0;
    z-index: 10;
    min-width: 190px;
    padding: 4px;
    background: #ffffff;
    border: 1px solid rgba(26, 26, 26, 0.15);
    border-radius: 8px;
    box-shadow: 0 8px 24px rgba(26, 26, 26, 0.15);
  }

  .compare-export-menu button {
    display: block;
    width: 100%;
    padding: 8px 12px;
    border: none;
    border-radius: 6px;
    background: none;
    font-size: 13px;
    text-align: left;
    cursor: pointer;
  }

  .compare-export-menu button:hover {
    background: #f1f1f1;
  }











  .compare-empty {
    font-size: 15px;
  }

  .compare-scroll {
    overflow-x: auto;
  }

  .compare-table {
    width: 100%;
    border-collapse: collapse;
    font-size: 14px;
  }

  .compare-table td,
  .compare-table th {
    padding: 12px 16px;
    border-top: 1px solid rgba(26, 26, 26, 0.12);
    text-align: left;
    vertical-align: top;
    min-width: 180px;
  }

  /* Soft alternating bands for scanability across wide tables — the same
     device Shopify's original compare page used */
  .compare-table tbody tr:nth-child(even) :is(td, th) {
    background: rgba(26, 26, 26, 0.022);
  }


  .compare-label {
    min-width: 130px;
    width: 130px;
    font-weight: 600;
    color: #616161;
    white-space: nowrap;
  }

  /* height: 1px on the cell lets the card stretch to the row's full height,
     so the control rows bottom-align across columns with different tagline
     lengths */
  .compare-app {
    height: 1px;
  }

  .compare-app-card {
    display: flex;
    flex-direction: column;
    gap: 8px;
    align-items: flex-start;
    height: 100%;
  }

  .compare-app-icon {
    width: 56px;
    height: 56px;
    border-radius: 12px;
    border: 1px solid rgba(26, 26, 26, 0.12);
  }

  .compare-app-name {
    font-size: 16px;
    font-weight: 650;
    color: #1a1a1a;
  }

  .compare-app-name:hover {
    text-decoration: underline;
    text-underline-offset: 2px;
  }

  /* The App Store's Tailwind preflight strips anchor styling — restore the
     store's own link treatment (underlined, underline drops on hover) */
  .compare-table tbody a {
    color: #1a1a1a;
    text-decoration: underline;
    text-decoration-color: rgba(26, 26, 26, 0.4);
    text-underline-offset: 2px;
  }

  .compare-table tbody a:hover {
    text-decoration: none;
  }

  .compare-app-tagline {
    margin: 0;
    font-size: 12px;
    font-weight: 450;
    color: #616161;
  }

  .compare-app-controls {
    display: flex;
    align-items: center;
    gap: 6px;
    margin-top: auto;
    padding-top: 8px;
  }






  .compare-app-error p {
    margin: 0 0 4px;
    font-weight: 450;
  }

  .compare-error-detail {
    font-size: 12px;
    color: #8a1f11;
  }

  .compare-skeleton {
    display: block;
    border-radius: 8px;
    background: rgba(26, 26, 26, 0.08);
    animation: compare-pulse 1.2s ease-in-out infinite;
  }

  .compare-skeleton-icon {
    width: 56px;
    height: 56px;
  }

  .compare-skeleton-line {
    width: 140px;
    height: 12px;
  }

  @keyframes compare-pulse {
    0%,
    100% {
      opacity: 1;
    }
    50% {
      opacity: 0.5;
    }
  }

  .compare-plans {
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .compare-plans li {
    margin-bottom: 4px;
  }

  .compare-plan-price {
    margin-left: 6px;
    color: #616161;
  }

  .compare-screenshots {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
  }

  .compare-screenshots img {
    width: 96px;
    border-radius: 6px;
    border: 1px solid rgba(26, 26, 26, 0.12);
    display: block;
    transition: opacity 150ms ease;
  }

  .compare-screenshots a:hover img {
    opacity: 0.8;
  }

  .compare-review-total {
    font-weight: 600;
  }

  .compare-star {
    width: 12px;
    height: 11px;
    fill: #1a1a1a;
    flex-shrink: 0;
  }

  .compare-rating {
    display: inline-flex;
    align-items: center;
    gap: 4px;
  }

  .compare-distribution {
    margin: 8px 0 0;
    padding: 0;
    list-style: none;
    font-size: 12px;
    color: #616161;
    min-width: 150px;
  }

  .compare-distribution li {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-bottom: 4px;
  }

  .compare-distribution-stars {
    display: inline-flex;
    align-items: center;
    gap: 3px;
    flex-shrink: 0;
    width: 24px;
    color: #1a1a1a;
    white-space: nowrap;
  }

  .compare-distribution-stars .compare-star {
    width: 10px;
    height: 9px;
  }

  .compare-distribution-track {
    flex: 1;
    height: 6px;
    border-radius: 3px;
    background: rgba(26, 26, 26, 0.08);
    overflow: hidden;
  }

  .compare-distribution-fill {
    display: block;
    height: 100%;
    border-radius: 3px;
    background: #1a1a1a;
  }

  .compare-distribution-count {
    flex-shrink: 0;
    min-width: 30px;
    text-align: right;
    color: #1a1a1a;
    text-decoration: underline;
    text-underline-offset: 2px;
  }

  .compare-distribution-count:hover {
    text-decoration: none;
  }

  .compare-muted {
    font-size: 12px;
    color: #616161;
  }

  .compare-links,
  .compare-access {
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .compare-links li,
  .compare-access li {
    margin-bottom: 4px;
  }

  .compare-access > li {
    margin-bottom: 10px;
  }

  .compare-access-items {
    margin: 4px 0 0;
    padding: 0;
    list-style: none;
  }

  .compare-access-items li {
    margin-bottom: 6px;
  }

</style>
