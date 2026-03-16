# Task 06: Add Item Tab

**Phase**: 1 — UI Skeleton
**Status**: ✅ Complete
**Files to create**:

- `entrypoints/cart-superpowers.content/components/AddItemTab.svelte`
  **Depends on**: Task 03, Task 04

## Objective

Build the Add Item tab — allows users to paste a product URL (or handle), fetch product data, select a variant, configure quantity/properties/selling plan, and add to cart. In Phase 1, product fetching is mocked with `MOCK_PRODUCT`.

## Props

- `onAddItem: (payload: AddItemPayload) => void` — callback when user clicks "Add to Cart" (mock: pushes item to local cart state)

## Layout

Three sections stacked vertically:

1. **Product Lookup** — URL input + fetch button
2. **Product Preview** — product details + variant picker (shown after fetch)
3. **Item Configuration** — quantity, properties, selling plan, add button

## Section 1: Product Lookup

### Structure

```svelte
<div class="lookup">
  <label class="lookup-label">Product URL or Handle</label>
  <div class="lookup-row">
    <input
      class="lookup-input"
      type="text"
      placeholder="https://store.myshopify.com/products/example or just 'example'"
      bind:value={productUrl}
      on:keydown={(e) => e.key === 'Enter' && fetchProduct()}
      disabled={isFetching}
    />
    <button class="lookup-btn" on:click={fetchProduct} disabled={isFetching || !productUrl.trim()}>
      {isFetching ? 'Fetching…' : 'Fetch'}
    </button>
  </div>
  {#if fetchError}
    <p class="lookup-error">{fetchError}</p>
  {/if}
</div>
```

### Behavior

- User pastes a URL like `https://store.myshopify.com/products/classic-leather-wallet` or just a handle like `classic-leather-wallet`
- On click or Enter: set `isFetching = true`, simulate delay (300ms), then load `MOCK_PRODUCT`
- In Phase 2: extract the pathname, call `getProductByUrl(url)` to fetch real data
- If fetch fails (Phase 2): show error message in red below the input

## Section 2: Product Preview

Shown only after a product is fetched (`product !== null`).

### Structure

```svelte
{#if product}
  <div class="preview">
    <div class="preview-header">
      <img
        class="preview-image"
        src={product.images[0] || ''}
        alt={product.title}
      />
      <div class="preview-info">
        <h3 class="preview-title">{product.title}</h3>
        <p class="preview-vendor">{product.vendor}</p>
        <p class="preview-type">{product.type}</p>
      </div>
    </div>

    <div class="variants">
      <label class="variants-label">Select Variant</label>
      <div class="variant-list">
        {#each product.variants as variant}
          <button
            class="variant-card"
            class:selected={selectedVariant?.id === variant.id}
            class:unavailable={!variant.available}
            on:click={() => selectVariant(variant)}
          >
            <span class="variant-title">{variant.title}</span>
            <span class="variant-price">${(variant.price / 100).toFixed(2)}</span>
            {#if !variant.available}
              <span class="variant-badge out-of-stock">Out of stock</span>
            {/if}
            {#if variant.compare_at_price && variant.compare_at_price > variant.price}
              <span class="variant-badge on-sale">Sale</span>
            {/if}
          </button>
        {/each}
      </div>
    </div>
  </div>
{/if}
```

### Variant Selection

- Each variant is a card/button
- Clicking a variant selects it (highlighted border)
- Out-of-stock variants are visually muted but still selectable (Shopify allows adding OOS items via API)
- Show variant title, price, and availability badge
- If variant has `compare_at_price > price`, show a "Sale" badge
- First available variant is auto-selected after fetch

## Section 3: Item Configuration

Shown only when a variant is selected (`selectedVariant !== null`).

### Structure

```svelte
{#if selectedVariant}
  <div class="config">
    <div class="config-row">
      <div class="config-field">
        <label class="config-label">Quantity</label>
        <QuantityInput bind:value={quantity} min={1} max={99} />
      </div>
    </div>

    {#if product.selling_plan_groups.length > 0}
      <div class="config-row">
        <label class="config-label">Selling Plan (optional)</label>
        <select class="config-select" bind:value={selectedSellingPlan}>
          <option value={null}>One-time purchase</option>
          {#each product.selling_plan_groups as group}
            <optgroup label={group.name}>
              {#each group.selling_plans as plan}
                <option value={plan.id}>{plan.name}</option>
              {/each}
            </optgroup>
          {/each}
        </select>
      </div>
    {/if}

    <div class="config-row">
      <label class="config-label">Line Item Properties (optional)</label>
      <KeyValueEditor
        bind:entries={properties}
        keyPlaceholder="Property name"
        valuePlaceholder="Property value"
        addLabel="Add property"
      />
    </div>

    <div class="config-actions">
      <button class="add-btn" on:click={addToCart} disabled={isAdding}>
        {isAdding ? 'Adding…' : 'Add to Cart'}
      </button>
      <span class="add-summary">
        {quantity}× {selectedVariant.title} — ${((selectedVariant.price * quantity) / 100).toFixed(2)}
      </span>
    </div>
  </div>
{/if}
```

### Add to Cart Behavior

- Build payload: `{ id: selectedVariant.id, quantity, properties: propsObject, selling_plan: selectedSellingPlan }`
- Convert `properties` array `[{key, value}]` to `Record<string, string>` (filter out empty keys)
- Only include `selling_plan` if one is selected
- Call `onAddItem(payload)`
- After add: show brief success state, reset form (or keep product loaded for adding another variant)

## State

```typescript
let productUrl = '';
let isFetching = false;
let fetchError: string | null = null;
let product: ProductData | null = null;
let selectedVariant: ProductVariant | null = null;
let quantity = 1;
let selectedSellingPlan: number | null = null;
let properties: Array<{ key: string; value: string }> = [];
let isAdding = false;
```

## Styles

```css
/* Product Lookup */
.lookup {
  margin-bottom: 24px;
}

.lookup-label {
  display: block;
  font-size: 12px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  color: var(--cs-text-muted);
  margin-bottom: 8px;
}

.lookup-row {
  display: flex;
  gap: 8px;
}

.lookup-input {
  all: unset;
  flex: 1;
  padding: 10px 14px;
  background: var(--cs-bg-secondary);
  border: 1px solid var(--cs-border);
  border-radius: var(--cs-radius-sm);
  color: var(--cs-text-primary);
  font-size: 13px;
  font-family: inherit;
  transition: border-color 150ms;
}

.lookup-input::placeholder {
  color: var(--cs-text-muted);
}

.lookup-input:focus {
  border-color: var(--cs-accent);
}

.lookup-btn {
  all: unset;
  cursor: pointer;
  padding: 10px 20px;
  background: var(--cs-accent);
  color: white;
  border-radius: var(--cs-radius-sm);
  font-size: 13px;
  font-weight: 600;
  transition: background 150ms;
  white-space: nowrap;
}

.lookup-btn:hover:not(:disabled) {
  background: var(--cs-accent-hover);
}

.lookup-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.lookup-error {
  color: var(--cs-danger);
  font-size: 13px;
  margin-top: 8px;
}

/* Product Preview */
.preview {
  margin-bottom: 24px;
  padding: 16px;
  background: var(--cs-bg-secondary);
  border-radius: var(--cs-radius);
  border: 1px solid var(--cs-border);
}

.preview-header {
  display: flex;
  gap: 16px;
  margin-bottom: 20px;
}

.preview-image {
  width: 80px;
  height: 80px;
  border-radius: var(--cs-radius-sm);
  object-fit: cover;
  background: var(--cs-bg-tertiary);
  flex-shrink: 0;
}

.preview-info {
  flex: 1;
  min-width: 0;
}

.preview-title {
  all: unset;
  display: block;
  font-size: 16px;
  font-weight: 600;
  color: var(--cs-text-primary);
  margin-bottom: 4px;
}

.preview-vendor {
  font-size: 13px;
  color: var(--cs-text-secondary);
  margin: 0;
}

.preview-type {
  font-size: 12px;
  color: var(--cs-text-muted);
  margin: 2px 0 0;
}

/* Variant Selection */
.variants {
  margin-top: 16px;
}

.variants-label {
  display: block;
  font-size: 12px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  color: var(--cs-text-muted);
  margin-bottom: 8px;
}

.variant-list {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
  gap: 8px;
}

.variant-card {
  all: unset;
  cursor: pointer;
  padding: 10px 14px;
  background: var(--cs-bg-tertiary);
  border: 2px solid transparent;
  border-radius: var(--cs-radius-sm);
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
  transition:
    border-color 150ms,
    background 150ms;
}

.variant-card:hover {
  background: var(--cs-bg-hover);
}

.variant-card.selected {
  border-color: var(--cs-accent);
}

.variant-card.unavailable {
  opacity: 0.5;
}

.variant-title {
  font-size: 13px;
  font-weight: 500;
  color: var(--cs-text-primary);
  flex: 1;
}

.variant-price {
  font-size: 13px;
  color: var(--cs-text-secondary);
  font-variant-numeric: tabular-nums;
}

.variant-badge {
  font-size: 10px;
  font-weight: 600;
  text-transform: uppercase;
  padding: 2px 6px;
  border-radius: 4px;
}

.variant-badge.out-of-stock {
  background: rgba(239, 68, 68, 0.15);
  color: var(--cs-danger);
}

.variant-badge.on-sale {
  background: rgba(34, 197, 94, 0.15);
  color: var(--cs-success);
}

/* Item Configuration */
.config {
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.config-row {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.config-field {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.config-label {
  font-size: 12px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  color: var(--cs-text-muted);
}

.config-select {
  all: unset;
  padding: 10px 14px;
  background: var(--cs-bg-secondary);
  border: 1px solid var(--cs-border);
  border-radius: var(--cs-radius-sm);
  color: var(--cs-text-primary);
  font-size: 13px;
  font-family: inherit;
  cursor: pointer;
  transition: border-color 150ms;
}

.config-select:focus {
  border-color: var(--cs-accent);
}

.config-actions {
  display: flex;
  align-items: center;
  gap: 16px;
  padding-top: 8px;
  border-top: 1px solid var(--cs-border);
}

.add-btn {
  all: unset;
  cursor: pointer;
  padding: 10px 24px;
  background: var(--cs-accent);
  color: white;
  border-radius: var(--cs-radius-sm);
  font-size: 14px;
  font-weight: 600;
  transition: background 150ms;
}

.add-btn:hover:not(:disabled) {
  background: var(--cs-accent-hover);
}

.add-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.add-summary {
  font-size: 13px;
  color: var(--cs-text-secondary);
  font-variant-numeric: tabular-nums;
}
```

## Mock Behavior (Phase 1)

- Fetching a product: after 300ms delay, load `MOCK_PRODUCT` regardless of URL input
- Adding to cart: call `onAddItem(payload)` which pushes a new `CartItem` to the local cart state in `App.svelte`
- The mock add should create a `CartItem` object from the variant + configuration and append it to `cart.items`

## Acceptance Criteria

- URL input field accepts text, Enter key triggers fetch
- Fetch button shows loading state during mock delay
- After fetch, product preview shows image, title, vendor, type
- Variant cards display with title, price, availability
- Out-of-stock variants are visually muted but selectable
- Sale badge shows for variants with compare_at_price
- First available variant is auto-selected
- Quantity stepper works (uses QuantityInput component)
- Selling plan dropdown appears only when product has selling plan groups
- Properties editor works (uses KeyValueEditor component)
- Add to Cart button builds correct payload and calls callback
- Summary line shows quantity × variant — price
- After adding, form can be reused for another variant
- All elements match the dark theme
