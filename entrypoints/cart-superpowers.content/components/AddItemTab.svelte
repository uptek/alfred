<script lang="ts">
  import type { AddItemPayload, ProductData, ProductVariant } from '../types';
  import QuantityInput from './QuantityInput.svelte';
  import KeyValueEditor from './KeyValueEditor.svelte';

  let {
    onAddItem,
    onFetchProduct,
  }: {
    onAddItem: (payload: AddItemPayload) => void;
    onFetchProduct: (url: string) => Promise<ProductData>;
  } = $props();

  let productUrl = $state('');
  let isFetching = $state(false);
  let fetchError: string | null = $state(null);
  let product: ProductData | null = $state(null);
  let selectedVariant: ProductVariant | null = $state(null);
  let quantity = $state(1);
  let selectedSellingPlan: number | null = $state(null);
  let properties: Array<{ key: string; value: string }> = $state([]);
  let isAdding = $state(false);
  let addedSuccess = $state(false);

  async function fetchProduct() {
    if (!productUrl.trim()) return;
    isFetching = true;
    fetchError = null;
    try {
      product = await onFetchProduct(productUrl.trim());
      selectedVariant = product.variants.find((v) => v.available) ?? product.variants[0] ?? null;
      quantity = 1;
      selectedSellingPlan = selectedVariant?.requires_selling_plan && selectedVariant.selling_plan_allocations.length > 0
        ? selectedVariant.selling_plan_allocations[0].selling_plan_id
        : null;
      properties = [];
    } catch (err) {
      fetchError = err instanceof Error ? err.message : String(err);
      product = null;
    } finally {
      isFetching = false;
    }
  }

  function selectVariant(variant: ProductVariant) {
    selectedVariant = variant;
    selectedSellingPlan = variant.requires_selling_plan && variant.selling_plan_allocations.length > 0
      ? variant.selling_plan_allocations[0].selling_plan_id
      : null;
  }

  async function addToCart() {
    if (!selectedVariant) return;
    isAdding = true;
    try {
      const propsObject: Record<string, string> = {};
      for (const { key, value } of properties) {
        if (key.trim()) propsObject[key.trim()] = value;
      }

      const payload: AddItemPayload = {
        id: selectedVariant.id,
        quantity,
      };
      if (Object.keys(propsObject).length > 0) {
        payload.properties = propsObject;
      }
      if (selectedSellingPlan !== null) {
        payload.selling_plan = selectedSellingPlan;
      }

      onAddItem(payload);
      addedSuccess = true;
      setTimeout(() => { addedSuccess = false; }, 2000);
    } finally {
      isAdding = false;
    }
  }
</script>

<div class="lookup">
  <label class="lookup-label">Product URL or Handle</label>
  <div class="lookup-row">
    <input
      class="lookup-input"
      type="text"
      placeholder="https://store.myshopify.com/products/example or just 'example'"
      bind:value={productUrl}
      onkeydown={(e) => { if (e.key === 'Enter') fetchProduct(); }}
      disabled={isFetching}
    />
    <button class="lookup-btn" onclick={fetchProduct} disabled={isFetching || !productUrl.trim()}>
      {#if isFetching}
        <svg class="btn-icon spinning" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></svg>
        Fetching&hellip;
      {:else}
        <svg class="btn-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg>
        Fetch
      {/if}
    </button>
  </div>
  {#if fetchError}
    <p class="lookup-error">{fetchError}</p>
  {/if}
</div>

{#if product}
  <div class="preview">
    <div class="preview-header">
      {#if product.images.length > 0}
        <img class="preview-image" src={product.images[0]} alt={product.title} />
      {:else}
        <div class="preview-image preview-image-placeholder">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect width="18" height="18" x="3" y="3" rx="2" ry="2"/><circle cx="9" cy="9" r="2"/><path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21"/></svg>
        </div>
      {/if}
      <div class="preview-info">
        <h3 class="preview-title">{product.title}</h3>
        <p class="preview-vendor">{product.vendor}</p>
        <p class="preview-type">{product.type}</p>
      </div>
    </div>

    <div class="variants">
      <label class="variants-label">Select Variant</label>
      <div class="variant-list">
        {#each product.variants as variant (variant.id)}
          <button
            class="variant-card"
            class:selected={selectedVariant?.id === variant.id}
            class:unavailable={!variant.available}
            onclick={() => selectVariant(variant)}
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

{#if selectedVariant && product}
  <div class="config">
    <div class="config-row">
      <div class="config-field">
        <label class="config-label">Quantity</label>
        <QuantityInput bind:value={quantity} min={1} max={99} />
      </div>
    </div>

    {#if selectedVariant && selectedVariant.selling_plan_allocations.length > 0}
      {@const allocatedPlanIds = new Set(selectedVariant.selling_plan_allocations.map(a => a.selling_plan_id))}
      <div class="config-row">
        <label class="config-label">Selling Plan {selectedVariant.requires_selling_plan ? '' : '(optional)'}</label>
        <select class="config-select" bind:value={selectedSellingPlan}>
          {#if !selectedVariant.requires_selling_plan}
            <option value={null}>One-time purchase</option>
          {/if}
          {#each product.selling_plan_groups as group}
            {@const availablePlans = group.selling_plans.filter(p => allocatedPlanIds.has(p.id))}
            {#if availablePlans.length > 0}
              <optgroup label={group.name}>
                {#each availablePlans as plan}
                  {@const allocation = selectedVariant.selling_plan_allocations.find(a => a.selling_plan_id === plan.id)}
                  <option value={plan.id}>
                    {plan.name}{allocation ? ` — $${(allocation.price / 100).toFixed(2)}` : ''}
                  </option>
                {/each}
              </optgroup>
            {/if}
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
      <button class="add-btn" onclick={addToCart} disabled={isAdding}>
        {#if addedSuccess}
          <svg class="btn-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg>
          Added!
        {:else if isAdding}
          Adding&hellip;
        {:else}
          <svg class="btn-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 5v14M5 12h14"/></svg>
          Add to Cart
        {/if}
      </button>
      <span class="add-summary">
        {quantity}&times; {selectedVariant.title} &mdash; ${((selectedVariant.price * quantity) / 100).toFixed(2)}
      </span>
    </div>
  </div>
{/if}

<style>
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
    transition: border-color 200ms, box-shadow 200ms;
  }

  .lookup-input::placeholder {
    color: var(--cs-text-muted);
  }

  .lookup-input:focus {
    border-color: var(--cs-accent);
    box-shadow: 0 0 0 3px var(--cs-accent-subtle, rgba(124, 106, 246, 0.08));
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
    transition: background 200ms;
    white-space: nowrap;
    display: inline-flex;
    align-items: center;
    gap: 6px;
  }

  .lookup-btn:hover:not(:disabled) {
    background: var(--cs-accent-hover);
  }

  .lookup-btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
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

  .lookup-error {
    color: var(--cs-danger);
    font-size: 13px;
    margin-top: 8px;
  }

  .preview {
    margin-bottom: 24px;
    padding: 16px;
    background: var(--cs-bg-secondary);
    border-radius: var(--cs-radius, 12px);
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

  .preview-image-placeholder {
    display: flex;
    align-items: center;
    justify-content: center;
    color: var(--cs-text-muted);
  }

  .preview-image-placeholder svg {
    width: 28px;
    height: 28px;
    opacity: 0.35;
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
    transition: border-color 200ms, background 200ms;
  }

  .variant-card:hover {
    background: var(--cs-bg-hover);
  }

  .variant-card.selected {
    border-color: var(--cs-accent);
    background: var(--cs-accent-subtle, rgba(124, 106, 246, 0.08));
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
    background: rgba(239, 68, 68, 0.12);
    color: var(--cs-danger);
  }

  .variant-badge.on-sale {
    background: rgba(34, 197, 94, 0.12);
    color: var(--cs-success);
  }

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
    transition: border-color 200ms, box-shadow 200ms;
  }

  .config-select:focus {
    border-color: var(--cs-accent);
    box-shadow: 0 0 0 3px var(--cs-accent-subtle, rgba(124, 106, 246, 0.08));
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
    transition: background 200ms;
    min-width: 120px;
    text-align: center;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
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
</style>
