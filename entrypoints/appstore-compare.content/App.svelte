<script lang="ts">
  import { fetchAppListing } from '~/utils/appListing';
  import { sendTrackEvent } from '@/utils/analytics';
  import { Toast } from '~/utils/toast';
  import { buildComparisonMarkdown } from './markdown';

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

  $effect(() => {
    sendTrackEvent('compare_view', { app_count: handles.length, page_url: window.location.href });

    for (const handle of handles) {
      void loadColumn(handle);
    }
  });

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
  }

  async function copyMarkdown() {
    try {
      await navigator.clipboard.writeText(buildComparisonMarkdown(loadedListings));
      Toast.success('Comparison copied as markdown');
      sendTrackEvent('compare_export_markdown', { app_count: loadedListings.length });
    } catch {
      Toast.error('Could not copy to clipboard');
    }
  }
</script>

<div class="compare">
  <header class="compare-header">
    <h1>Compare apps</h1>
    <button class="compare-export" disabled={loadedListings.length === 0} onclick={copyMarkdown}>
      Copy as markdown
    </button>
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
            <td class="compare-label"></td>
            {#each columns as column (column.handle)}
              <th class="compare-app" scope="col">
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
                    <button class="compare-app-remove" onclick={() => removeColumn(column.handle)}>
                      Remove
                    </button>
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
                    <button onclick={() => loadColumn(column.handle)}>Retry</button>
                    <button onclick={() => removeColumn(column.handle)}>Remove</button>
                  </div>
                {/if}
              </th>
            {/each}
          </tr>
        </thead>
        <tbody>
          <tr>
            <th class="compare-label" scope="row">Rating</th>
            {#each columns as column (column.handle)}
              <td>{column.listing?.rating != null ? `${column.listing.rating} ★` : '—'}</td>
            {/each}
          </tr>
          <tr>
            <th class="compare-label" scope="row">Reviews</th>
            {#each columns as column (column.handle)}
              <td>{column.listing?.reviewCount != null ? column.listing.reviewCount.toLocaleString() : '—'}</td>
            {/each}
          </tr>
          <tr>
            <th class="compare-label" scope="row">Built for Shopify</th>
            {#each columns as column (column.handle)}
              <td>{column.listing ? (column.listing.builtForShopify ? '✓ Yes' : 'No') : '—'}</td>
            {/each}
          </tr>
          <tr>
            <th class="compare-label" scope="row">Pricing</th>
            {#each columns as column (column.handle)}
              <td>{column.listing?.pricingSummary ?? '—'}</td>
            {/each}
          </tr>
          <tr>
            <th class="compare-label" scope="row">Plans</th>
            {#each columns as column (column.handle)}
              <td>
                {#if column.listing && column.listing.plans.length > 0}
                  <ul class="compare-plans">
                    {#each column.listing.plans as plan}
                      <li>
                        <strong>{plan.name ?? 'Plan'}</strong>
                        {#if plan.price}<span class="compare-plan-price">{plan.price}</span>{/if}
                      </li>
                    {/each}
                  </ul>
                {:else}
                  —
                {/if}
              </td>
            {/each}
          </tr>
          <tr>
            <th class="compare-label" scope="row">Free plan</th>
            {#each columns as column (column.handle)}
              <td>{column.listing ? (column.listing.hasFreePlan ? 'Yes' : 'No') : '—'}</td>
            {/each}
          </tr>
          <tr>
            <th class="compare-label" scope="row">Free trial</th>
            {#each columns as column (column.handle)}
              <td>{column.listing ? (column.listing.hasFreeTrial ? 'Yes' : 'No') : '—'}</td>
            {/each}
          </tr>
          <tr>
            <th class="compare-label" scope="row">Works with</th>
            {#each columns as column (column.handle)}
              <td>{column.listing?.worksWith.length ? column.listing.worksWith.join(', ') : '—'}</td>
            {/each}
          </tr>
          <tr>
            <th class="compare-label" scope="row">Launched</th>
            {#each columns as column (column.handle)}
              <td>{column.listing?.launchDate ?? '—'}</td>
            {/each}
          </tr>
          <tr>
            <th class="compare-label" scope="row">Developer</th>
            {#each columns as column (column.handle)}
              <td>
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
          <tr>
            <th class="compare-label" scope="row">Languages</th>
            {#each columns as column (column.handle)}
              <td>{column.listing?.languages ?? '—'}</td>
            {/each}
          </tr>
          <tr>
            <th class="compare-label" scope="row">Categories</th>
            {#each columns as column (column.handle)}
              <td>{column.listing?.categories.length ? column.listing.categories.join(', ') : '—'}</td>
            {/each}
          </tr>
        </tbody>
      </table>
    </div>
  {/if}
</div>

<style>
  .compare {
    max-width: 1200px;
    margin: 0 auto;
    padding: 32px 20px 64px;
    color: #1a1a1a;
    font-family:
      -apple-system, BlinkMacSystemFont, 'San Francisco', 'Segoe UI', Roboto, 'Helvetica Neue', sans-serif;
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

  .compare-export {
    padding: 8px 14px;
    border: 1px solid rgba(26, 26, 26, 0.3);
    border-radius: 8px;
    background: #ffffff;
    font-size: 13px;
    font-weight: 600;
    cursor: pointer;
  }

  .compare-export:hover:not(:disabled) {
    background: #f1f1f1;
  }

  .compare-export:disabled {
    opacity: 0.4;
    cursor: not-allowed;
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

  thead td,
  thead th {
    border-top: none;
  }

  .compare-label {
    min-width: 130px;
    width: 130px;
    font-weight: 600;
    color: #616161;
    white-space: nowrap;
  }

  .compare-app-card {
    display: flex;
    flex-direction: column;
    gap: 8px;
    align-items: flex-start;
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

  .compare-app-tagline {
    margin: 0;
    font-size: 12px;
    font-weight: 450;
    color: #616161;
  }

  .compare-app-remove,
  .compare-app-error button {
    padding: 4px 10px;
    border: 1px solid rgba(26, 26, 26, 0.3);
    border-radius: 6px;
    background: #ffffff;
    font-size: 12px;
    cursor: pointer;
  }

  .compare-app-remove:hover,
  .compare-app-error button:hover {
    background: #f1f1f1;
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
</style>
