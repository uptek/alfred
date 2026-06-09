<script lang="ts">
  import { fetchAppListing, formatAppAge } from '~/utils/appListing';
  import { removeFromTray } from '~/utils/compareTray';
  import { sendTrackEvent } from '@/utils/analytics';
  import { Toast } from '~/utils/toast';
  import { buildComparisonMarkdown, COMPARISON_ROWS } from './markdown';

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

  function strictWinner(values: { handle: string; value: number | undefined }[], prefer: 'max' | 'min') {
    const present = values.filter((entry): entry is { handle: string; value: number } => entry.value !== undefined);

    if (present.length < 2) {
      return undefined;
    }

    const sorted = [...present].sort((a, b) => (prefer === 'max' ? b.value - a.value : a.value - b.value));
    return sorted[0] && sorted[1] && sorted[0].value !== sorted[1].value ? sorted[0].handle : undefined;
  }

  function entryPrice(listing: AppListing): number | undefined {
    if (listing.plans.length === 0) {
      return listing.pricingSummary?.toLowerCase() === 'free' ? 0 : undefined;
    }

    const prices = listing.plans
      .map((plan) => {
        const price = plan.price?.toLowerCase() ?? '';
        if (price === 'free') {
          return 0;
        }
        const match = price.match(/\$([\d,]+(?:\.\d+)?)/);
        return match?.[1] ? parseFloat(match[1].replace(/,/g, '')) : undefined;
      })
      .filter((value): value is number => value !== undefined);

    return prices.length > 0 ? Math.min(...prices) : undefined;
  }

  function languageCount(listing: AppListing): number | undefined {
    if (!listing.languages) {
      return undefined;
    }

    return listing.languages
      .replace(/,? and /g, ',')
      .split(',')
      .map((language) => language.trim())
      .filter(Boolean).length;
  }

  const winners = $derived({
    rating: strictWinner(
      loadedColumns.map((column) => ({ handle: column.handle, value: column.listing?.rating })),
      'max'
    ),
    reviews: strictWinner(
      loadedColumns.map((column) => ({ handle: column.handle, value: column.listing?.reviewCount })),
      'max'
    ),
    price: strictWinner(
      loadedColumns.map((column) => ({
        handle: column.handle,
        value: column.listing ? entryPrice(column.listing) : undefined
      })),
      'min'
    ),
    languages: strictWinner(
      loadedColumns.map((column) => ({
        handle: column.handle,
        value: column.listing ? languageCount(column.listing) : undefined
      })),
      'max'
    )
  });

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

  async function copyMarkdown() {
    try {
      await navigator.clipboard.writeText(buildComparisonMarkdown(loadedListings));
      Toast.success('Comparison copied as markdown');
      sendTrackEvent('compare_export_markdown', { app_count: loadedListings.length });
    } catch {
      Toast.error('Could not copy to clipboard');
    }
  }

  sendTrackEvent('compare_view', { app_count: handles.length, page_url: window.location.href });

  for (const handle of handles) {
    void loadColumn(handle);
  }
</script>

<div class="compare">
  <header class="compare-header">
    <h1>Compare apps</h1>
    <div class="compare-actions">
      <label class="compare-toggle">
        <input type="checkbox" bind:checked={differencesOnly} disabled={loadedColumns.length < 2} />
        Differences only
      </label>
      <button class="compare-export" disabled={loadedListings.length === 0} onclick={copyMarkdown}>
        Copy as markdown
      </button>
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
          {#if rowVisible('Screenshots')}
            <tr>
              <th class="compare-label" scope="row">Screenshots</th>
              {#each columns as column (column.handle)}
                <td>
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
                <td>{column.listing ? (column.listing.builtForShopify ? '✓ Yes' : 'No') : '—'}</td>
              {/each}
            </tr>
          {/if}
          {#if rowVisible('Rating')}
            <tr>
              <th class="compare-label" scope="row">Rating</th>
              {#each columns as column (column.handle)}
                <td class:compare-winner={winners.rating === column.handle}>
                  {column.listing?.rating != null ? `${column.listing.rating} ★` : '—'}
                </td>
              {/each}
            </tr>
          {/if}
          {#if rowVisible('Reviews')}
            <tr>
              <th class="compare-label" scope="row">Reviews</th>
              {#each columns as column (column.handle)}
                <td class:compare-winner={winners.reviews === column.handle}>
                  {#if column.listing?.reviewCount != null}
                    <div class="compare-review-total">{column.listing.reviewCount.toLocaleString()}</div>
                    {#if column.listing.ratingDistribution.length > 0}
                      <ul class="compare-distribution">
                        {#each column.listing.ratingDistribution as level (level.stars)}
                          <li><span class="compare-distribution-stars">{level.stars}★</span>{level.count}</li>
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
                <td class:compare-winner={winners.price === column.handle}>
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
                <td>{column.listing ? (column.listing.hasFreePlan ? 'Yes' : 'No') : '—'}</td>
              {/each}
            </tr>
          {/if}
          {#if rowVisible('Free trial')}
            <tr>
              <th class="compare-label" scope="row">Free trial</th>
              {#each columns as column (column.handle)}
                <td>
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
                <td>
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
          {/if}
          {#if rowVisible('Languages')}
            <tr>
              <th class="compare-label" scope="row">Languages</th>
              {#each columns as column (column.handle)}
                <td class:compare-winner={winners.languages === column.handle}>
                  {column.listing?.languages ?? '—'}
                </td>
              {/each}
            </tr>
          {/if}
          {#if rowVisible('Links')}
            <tr>
              <th class="compare-label" scope="row">Links</th>
              {#each columns as column (column.handle)}
                <td>
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
                <td>{column.listing?.worksWith.length ? column.listing.worksWith.join(', ') : '—'}</td>
              {/each}
            </tr>
          {/if}
          {#if rowVisible('Categories')}
            <tr>
              <th class="compare-label" scope="row">Categories</th>
              {#each columns as column (column.handle)}
                <td>{column.listing?.categories.length ? column.listing.categories.join(', ') : '—'}</td>
              {/each}
            </tr>
          {/if}
          {#if rowVisible('Data access')}
            <tr>
              <th class="compare-label" scope="row">Data access</th>
              {#each columns as column (column.handle)}
                <td>
                  {#if column.listing && column.listing.dataAccess.length > 0}
                    <ul class="compare-access">
                      {#each column.listing.dataAccess as access (access.group)}
                        <li>
                          <strong>{access.group}</strong>
                          {#if access.summary}<div class="compare-muted">{access.summary}</div>{/if}
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

  .compare-actions {
    display: flex;
    align-items: center;
    gap: 16px;
  }

  .compare-toggle {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    font-size: 13px;
    font-weight: 550;
    cursor: pointer;
    user-select: none;
  }

  .compare-toggle input {
    accent-color: #1a1a1a;
  }

  .compare-toggle:has(input:disabled) {
    opacity: 0.4;
    cursor: not-allowed;
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

  .compare-distribution {
    margin: 6px 0 0;
    padding: 0;
    list-style: none;
    font-size: 12px;
    color: #616161;
  }

  .compare-distribution-stars {
    display: inline-block;
    width: 28px;
    color: #1a1a1a;
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

  .compare-winner {
    position: relative;
    background: rgba(0, 122, 92, 0.07);
  }

  .compare-winner::after {
    content: 'Best';
    position: absolute;
    top: 6px;
    right: 8px;
    font-size: 10px;
    font-weight: 650;
    letter-spacing: 0.3px;
    text-transform: uppercase;
    color: #007a5c;
  }
</style>
