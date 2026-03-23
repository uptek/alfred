<script lang="ts">
  import type { CartData, ShippingAddress, ShippingRate } from '../types';

  let {
    cart,
    onCalculateRates,
  }: {
    cart: CartData;
    onCalculateRates: (address: ShippingAddress) => Promise<ShippingRate[]>;
  } = $props();

  let country = $state('US');
  let province = $state('');
  let zip = $state('');
  let isCalculating = $state(false);
  let calculateError: string | null = $state(null);
  let rates: ShippingRate[] | null = $state(null);

  async function calculateRates() {
    if (!zip.trim() || !country.trim()) return;
    isCalculating = true;
    calculateError = null;
    try {
      rates = await onCalculateRates({ zip: zip.trim(), country: country.trim(), province: province.trim() });
    } catch (err) {
      calculateError = err instanceof Error ? err.message : String(err);
      rates = null;
    } finally {
      isCalculating = false;
    }
  }
</script>

{#if !cart.requires_shipping}
  <div class="no-shipping">
    <svg class="no-shipping-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="m7.5 4.27 9 5.15M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><polyline points="3.27 6.96 12 12.01 20.73 6.96"/><line x1="12" y1="22.08" x2="12" y2="12"/></svg>
    <p class="no-shipping-title">Shipping not required</p>
    <p class="no-shipping-desc">All items in the cart are digital or do not require shipping.</p>
  </div>
{:else}
  <div class="address-form">
    <div class="form-title-row">
      <svg class="form-title-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 18V6a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2v11a1 1 0 0 0 1 1h2"/><path d="M15 18H9"/><path d="M19 18h2a1 1 0 0 0 1-1v-3.65a1 1 0 0 0-.22-.624l-3.48-4.35A1 1 0 0 0 17.52 8H14"/><circle cx="17" cy="18" r="2"/><circle cx="7" cy="18" r="2"/></svg>
      <h3 class="form-title">Shipping Calculator</h3>
    </div>
    <p class="form-subtitle">Enter a destination to calculate available shipping rates</p>

    <div class="form-grid">
      <div class="form-field">
        <label class="field-label" for="cs-country">Country</label>
        <input
          class="field-input"
          id="cs-country"
          type="text"
          placeholder="US"
          bind:value={country}
        />
      </div>
      <div class="form-field">
        <label class="field-label" for="cs-province">Province / State</label>
        <input
          class="field-input"
          id="cs-province"
          type="text"
          placeholder="CA"
          bind:value={province}
        />
      </div>
      <div class="form-field">
        <label class="field-label" for="cs-zip">ZIP / Postal Code</label>
        <input
          class="field-input"
          id="cs-zip"
          type="text"
          placeholder="90210"
          bind:value={zip}
          onkeydown={(e) => { if (e.key === 'Enter') calculateRates(); }}
        />
      </div>
    </div>

    <button
      class="calculate-btn"
      onclick={calculateRates}
      disabled={isCalculating || !zip.trim() || !country.trim()}
    >
      {#if isCalculating}
        <svg class="btn-icon spinning" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></svg>
        Calculating&hellip;
      {:else}
        Calculate Shipping Rates
      {/if}
    </button>

    {#if calculateError}
      <p class="form-error">{calculateError}</p>
    {/if}
  </div>

  {#if rates !== null}
    <div class="rates-section">
      <h3 class="rates-title">Available Shipping Rates</h3>

      {#if rates.length > 0}
        <table class="rates-table">
          <thead>
            <tr>
              <th>Method</th>
              <th>Price</th>
              <th>Delivery</th>
              <th>Source</th>
            </tr>
          </thead>
          <tbody>
            {#each rates as rate}
              <tr>
                <td class="rate-name">{rate.name}</td>
                <td class="rate-price">${rate.price}</td>
                <td class="rate-delivery">
                  {#if rate.delivery_days}
                    {rate.delivery_days} day{rate.delivery_days !== 1 ? 's' : ''}
                  {:else if rate.delivery_date}
                    {rate.delivery_date}
                  {:else}
                    &mdash;
                  {/if}
                </td>
                <td class="rate-source">{rate.source}</td>
              </tr>
            {/each}
          </tbody>
        </table>
      {:else}
        <div class="rates-empty">
          <svg class="rates-empty-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"/><circle cx="12" cy="10" r="3"/></svg>
          <p>No shipping rates available for this destination.</p>
          <p class="rates-empty-hint">This may mean the store doesn't ship to this location, or the address is invalid.</p>
        </div>
      {/if}
    </div>
  {/if}
{/if}

<style>
  .address-form {
    margin-bottom: 24px;
  }

  .form-title-row {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-bottom: 4px;
  }

  .form-title-icon {
    width: 16px;
    height: 16px;
    color: var(--cs-text-muted);
    flex-shrink: 0;
  }

  .form-title {
    all: unset;
    display: block;
    font-size: 14px;
    font-weight: 600;
    color: var(--cs-text-primary);
  }

  .form-subtitle {
    font-size: 13px;
    color: var(--cs-text-secondary);
    margin: 0 0 20px;
  }

  .form-grid {
    display: grid;
    grid-template-columns: 1fr 1fr 1fr;
    gap: 12px;
    margin-bottom: 16px;
  }

  .form-field {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .field-label {
    font-size: 12px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    color: var(--cs-text-muted);
  }

  .field-input {
    all: unset;
    padding: 10px 14px;
    background: var(--cs-bg-secondary);
    border: 1px solid var(--cs-border);
    border-radius: var(--cs-radius-sm);
    color: var(--cs-text-primary);
    font-size: 13px;
    font-family: inherit;
    transition: border-color 200ms, box-shadow 200ms;
  }

  .field-input::placeholder {
    color: var(--cs-text-muted);
  }

  .field-input:focus {
    border-color: var(--cs-accent);
    box-shadow: 0 0 0 3px var(--cs-accent-subtle, rgba(124, 106, 246, 0.08));
  }

  .calculate-btn {
    all: unset;
    cursor: pointer;
    padding: 10px 24px;
    background: var(--cs-accent);
    color: white;
    border-radius: var(--cs-radius-sm);
    font-size: 13px;
    font-weight: 600;
    transition: background 200ms;
    display: inline-flex;
    align-items: center;
    gap: 6px;
  }

  .btn-icon {
    width: 15px;
    height: 15px;
    flex-shrink: 0;
  }

  .spinning {
    animation: spin 0.7s linear infinite;
  }

  @keyframes spin {
    to { transform: rotate(360deg); }
  }

  .calculate-btn:hover:not(:disabled) {
    background: var(--cs-accent-hover);
  }

  .calculate-btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .form-error {
    color: var(--cs-danger);
    font-size: 13px;
    margin-top: 8px;
  }

  .rates-section {
    padding: 20px;
    background: var(--cs-bg-secondary);
    border-radius: var(--cs-radius, 12px);
    border: 1px solid var(--cs-border);
  }

  .rates-title {
    all: unset;
    display: block;
    font-size: 14px;
    font-weight: 600;
    color: var(--cs-text-primary);
    margin-bottom: 16px;
  }

  .rates-table {
    width: 100%;
    border-collapse: collapse;
  }

  .rates-table th {
    text-align: left;
    padding: 8px 12px;
    font-size: 11px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    color: var(--cs-text-muted);
    border-bottom: 1px solid var(--cs-border);
  }

  .rates-table td {
    padding: 12px;
    border-bottom: 1px solid var(--cs-border);
    font-size: 13px;
  }

  .rates-table tr:last-child td {
    border-bottom: none;
  }

  .rates-table tr:hover td {
    background: var(--cs-bg-primary);
  }

  .rate-name {
    font-weight: 500;
    color: var(--cs-text-primary);
  }

  .rate-price {
    font-variant-numeric: tabular-nums;
    color: var(--cs-text-primary);
  }

  .rate-delivery {
    color: var(--cs-text-secondary);
  }

  .rate-source {
    color: var(--cs-text-muted);
    font-size: 12px;
  }

  .rates-empty {
    text-align: center;
    padding: 24px;
    color: var(--cs-text-muted);
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 4px;
  }

  .rates-empty-icon {
    width: 32px;
    height: 32px;
    opacity: 0.4;
    margin-bottom: 8px;
  }

  .rates-empty p {
    margin: 0;
    font-size: 14px;
  }

  .rates-empty-hint {
    margin-top: 4px;
    font-size: 12px;
  }

  .no-shipping {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: 60px 20px;
    gap: 8px;
  }

  .no-shipping-icon {
    width: 48px;
    height: 48px;
    color: var(--cs-text-muted);
    opacity: 0.35;
    margin-bottom: 8px;
  }

  .no-shipping-title {
    font-size: 16px;
    font-weight: 500;
    color: var(--cs-text-secondary);
    margin: 0;
  }

  .no-shipping-desc {
    font-size: 13px;
    color: var(--cs-text-muted);
    margin: 0;
  }
</style>
