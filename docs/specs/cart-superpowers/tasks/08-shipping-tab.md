# Task 08: Shipping Tab

**Phase**: 1 — UI Skeleton
**Status**: ✅ Complete
**Files to create**:

- `entrypoints/cart-superpowers.content/components/ShippingTab.svelte`
  **Depends on**: Task 03

## Objective

Build the Shipping tab — a form for entering a shipping address (country, province, ZIP code) and calculating available shipping rates. In Phase 1, the calculation is mocked with `MOCK_SHIPPING_RATES`.

## Props

- `cart: CartData` — the full cart object (used to check if cart requires shipping)
- `onCalculateRates: (address: ShippingAddress) => Promise<ShippingRate[]>` — callback to calculate rates (mock: returns MOCK_SHIPPING_RATES after delay)

## Layout

Two sections:

1. **Address Form** — country, province, ZIP inputs + calculate button
2. **Results Table** — shipping rates displayed after calculation

## Section 1: Address Form

### Structure

```svelte
<div class="address-form">
  <h3 class="form-title">Shipping Calculator</h3>
  <p class="form-subtitle">Enter a destination to calculate available shipping rates</p>

  <div class="form-grid">
    <div class="form-field">
      <label class="field-label" for="country">Country</label>
      <input
        class="field-input"
        id="country"
        type="text"
        placeholder="US"
        bind:value={country}
      />
    </div>
    <div class="form-field">
      <label class="field-label" for="province">Province / State</label>
      <input
        class="field-input"
        id="province"
        type="text"
        placeholder="CA"
        bind:value={province}
      />
    </div>
    <div class="form-field">
      <label class="field-label" for="zip">ZIP / Postal Code</label>
      <input
        class="field-input"
        id="zip"
        type="text"
        placeholder="90210"
        bind:value={zip}
        on:keydown={(e) => e.key === 'Enter' && calculateRates()}
      />
    </div>
  </div>

  <button
    class="calculate-btn"
    on:click={calculateRates}
    disabled={isCalculating || !zip.trim() || !country.trim()}
  >
    {isCalculating ? 'Calculating…' : 'Calculate Shipping Rates'}
  </button>

  {#if calculateError}
    <p class="form-error">{calculateError}</p>
  {/if}
</div>
```

### Behavior

- Country defaults to "US", province defaults to empty
- ZIP is required to calculate
- On click or Enter in ZIP field: call `onCalculateRates({ zip, country, province })`
- Show loading state during calculation
- Error state if calculation fails (Phase 2)

## Section 2: Results Table

### Structure

```svelte
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
                  —
                {/if}
              </td>
              <td class="rate-source">{rate.source}</td>
            </tr>
          {/each}
        </tbody>
      </table>
    {:else}
      <div class="rates-empty">
        <p>No shipping rates available for this destination.</p>
        <p class="rates-empty-hint">This may mean the store doesn't ship to this location, or the address is invalid.</p>
      </div>
    {/if}
  </div>
{/if}
```

## Not Eligible State

If `cart.requires_shipping === false` (e.g., all items are digital):

```svelte
{#if !cart.requires_shipping}
  <div class="no-shipping">
    <p class="no-shipping-title">Shipping not required</p>
    <p class="no-shipping-desc">All items in the cart are digital or do not require shipping.</p>
  </div>
{/if}
```

## State

```typescript
let country = 'US';
let province = '';
let zip = '';
let isCalculating = false;
let calculateError: string | null = null;
let rates: ShippingRate[] | null = null;
```

## Styles

```css
.address-form {
  margin-bottom: 24px;
}

.form-title {
  all: unset;
  display: block;
  font-size: 14px;
  font-weight: 600;
  color: var(--cs-text-primary);
  margin-bottom: 4px;
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
  transition: border-color 150ms;
}

.field-input::placeholder {
  color: var(--cs-text-muted);
}

.field-input:focus {
  border-color: var(--cs-accent);
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
  transition: background 150ms;
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

/* Rates Table */
.rates-section {
  padding: 20px;
  background: var(--cs-bg-secondary);
  border-radius: var(--cs-radius);
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
}

.rates-empty p {
  margin: 0;
  font-size: 14px;
}

.rates-empty-hint {
  margin-top: 4px !important;
  font-size: 12px !important;
  color: var(--cs-text-muted);
}

/* No shipping required */
.no-shipping {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 60px 20px;
  gap: 4px;
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
```

## Mock Behavior (Phase 1)

- `onCalculateRates`: after 500ms delay, return `MOCK_SHIPPING_RATES` from mock-data.ts
- The address form values are not validated in Phase 1
- Rates table displays the mock results

## Acceptance Criteria

- Address form has three input fields: Country, Province, ZIP
- Country defaults to "US"
- Calculate button is disabled when ZIP or Country is empty
- Loading state shows during calculation
- Results table displays shipping method name, price, delivery days, source
- Delivery days show singular/plural correctly
- Empty rates show appropriate message
- If cart doesn't require shipping, show "Shipping not required" message instead of form
- Hover highlight on rate rows
- All styling matches the dark theme
