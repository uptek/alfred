<script lang="ts">
  import type { CartData, CartItem, ProductData } from '../types';
  import QuantityInput from './QuantityInput.svelte';
  import KeyValueEditor from './KeyValueEditor.svelte';

  let {
    cart,
    onUpdateQuantity,
    onRemoveItem,
    onUpdateProperties,
    onClearCart,
    onSwitchTab,
    onSwitchVariant,
    onFetchProduct,
  }: {
    cart: CartData;
    onUpdateQuantity: (key: string, quantity: number) => Promise<void>;
    onRemoveItem: (key: string) => Promise<void>;
    onUpdateProperties: (key: string, quantity: number, properties: Record<string, string>) => Promise<void>;
    onClearCart: () => Promise<void>;
    onSwitchTab: (tab: string) => void;
    onSwitchVariant: (itemKey: string, oldItem: CartItem, newVariantId: number) => Promise<void>;
    onFetchProduct: (url: string) => Promise<ProductData>;
  } = $props();

  let expandedItemKey: string | null = $state(null);

  // Per-item busy state
  let busyKeys: Set<string> = $state(new Set());

  async function withBusy(key: string, fn: () => Promise<void>) {
    busyKeys.add(key);
    busyKeys = new Set(busyKeys); // trigger reactivity
    try {
      await fn();
    } finally {
      busyKeys.delete(key);
      busyKeys = new Set(busyKeys);
    }
  }

  // Variant switching state
  let variantEditKey: string | null = $state(null);
  let variantProductCache: Record<number, ProductData> = $state({});
  let variantLoading: string | null = $state(null);

  async function openVariantPicker(item: CartItem) {
    if (item.product_has_only_default_variant) return;

    // Toggle off if already open
    if (variantEditKey === item.key) {
      variantEditKey = null;
      return;
    }

    variantEditKey = item.key;

    // Fetch product data if not cached
    if (!variantProductCache[item.product_id]) {
      variantLoading = item.key;
      try {
        const product = await onFetchProduct(item.url);
        variantProductCache[item.product_id] = product;
      } catch {
        variantEditKey = null;
      } finally {
        variantLoading = null;
      }
    }
  }

  function handleVariantSelect(item: CartItem, newVariantId: number) {
    if (newVariantId === item.variant_id) {
      variantEditKey = null;
      return;
    }
    variantEditKey = null;
    withBusy(item.key, () => onSwitchVariant(item.key, item, newVariantId));
  }

  function formatPrice(cents: number): string {
    return `$${(cents / 100).toFixed(2)}`;
  }

  function propsCount(properties: Record<string, string> | null): number {
    if (!properties) return 0;
    return Object.keys(properties).length;
  }

  function propsToEntries(properties: Record<string, string> | null): Array<{ key: string; value: string }> {
    if (!properties) return [];
    return Object.entries(properties).map(([key, value]) => ({ key, value }));
  }

  function entriesToProps(entries: Array<{ key: string; value: string }>): Record<string, string> {
    const result: Record<string, string> = {};
    for (const { key, value } of entries) {
      if (key.trim()) result[key.trim()] = value;
    }
    return result;
  }

  // Local entries state for expanded property editors, keyed by item key
  let propertyEntries: Record<string, Array<{ key: string; value: string }>> = $state({});

  function initEntries(itemKey: string, properties: Record<string, string> | null) {
    if (!(itemKey in propertyEntries)) {
      propertyEntries[itemKey] = propsToEntries(properties);
    }
  }

  // When expanding, eagerly init the entries so the template just reads them
  function toggleProperties(key: string, properties: Record<string, string> | null) {
    if (expandedItemKey === key) {
      expandedItemKey = null;
    } else {
      initEntries(key, properties);
      expandedItemKey = key;
    }
  }

  function handlePropertiesChange(itemKey: string, entries: Array<{ key: string; value: string }>) {
    propertyEntries[itemKey] = [...entries];
  }

  function isPropertiesModified(itemKey: string, currentProperties: Record<string, string> | null): boolean {
    if (!(itemKey in propertyEntries)) return false;
    return JSON.stringify(entriesToProps(propertyEntries[itemKey])) !== JSON.stringify(currentProperties || {});
  }

  async function saveProperties(itemKey: string, quantity: number) {
    const entries = propertyEntries[itemKey];
    if (!entries) return;
    await withBusy(itemKey, () => onUpdateProperties(itemKey, quantity, entriesToProps(entries)));
    // Re-sync local entries from the updated cart so dirty detection resets
    const updatedItem = cart.items.find((item) => item.key === itemKey);
    if (updatedItem) {
      propertyEntries[itemKey] = propsToEntries(updatedItem.properties);
    }
  }
</script>

{#if cart.items.length === 0}
  <div class="empty">
    <p class="empty-title">Your cart is empty</p>
    <p>Add items using the Add Item tab</p>
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <!-- svelte-ignore a11y_click_events_have_key_events -->
    <span class="empty-link" onclick={() => onSwitchTab('add')}>Go to Add Item</span>
  </div>
{:else}
  <table class="items-table">
    <thead>
      <tr>
        <th style="width: 40px">#</th>
        <th style="width: 48px">Image</th>
        <th>Product</th>
        <th style="width: 120px">Qty</th>
        <th style="width: 160px">Properties</th>
        <th style="width: 160px">Selling Plan</th>
        <th style="width: 100px; text-align: right">Price</th>
        <th style="width: 40px"></th>
      </tr>
    </thead>
    <tbody>
      {#each cart.items as item, i (item.key)}
        <tr class:row-busy={busyKeys.has(item.key)}>
          <td class="row-num">{i + 1}</td>
          <td>
            {#if item.image}
              <img class="item-image" src={item.image} alt={item.product_title} />
            {:else}
              <div class="item-image item-image-placeholder"></div>
            {/if}
          </td>
          <td>
            <div class="product-title">
              <a href={item.url} target="_blank" rel="noopener noreferrer">{item.product_title}</a>
            </div>
            {#if !item.product_has_only_default_variant}
              <!-- svelte-ignore a11y_click_events_have_key_events -->
              <!-- svelte-ignore a11y_no_static_element_interactions -->
              <div
                class="variant-title variant-switchable"
                class:variant-active={variantEditKey === item.key}
                onclick={() => openVariantPicker(item)}
              >
                {#if variantLoading === item.key}
                  <span class="variant-loading">Loading...</span>
                {:else}
                  <span>{item.variant_title || 'Default'}</span>
                  <span class="variant-switch-icon">{variantEditKey === item.key ? '▾' : '▸'}</span>
                {/if}
              </div>
              {#if variantEditKey === item.key && variantProductCache[item.product_id]}
                <div class="variant-picker">
                  {#each variantProductCache[item.product_id].variants as variant (variant.id)}
                    <!-- svelte-ignore a11y_click_events_have_key_events -->
                    <!-- svelte-ignore a11y_no_static_element_interactions -->
                    <div
                      class="variant-option"
                      class:variant-current={variant.id === item.variant_id}
                      class:variant-unavailable={!variant.available}
                      onclick={() => handleVariantSelect(item, variant.id)}
                    >
                      <span class="variant-option-title">{variant.title}</span>
                      <span class="variant-option-price">{formatPrice(variant.price)}</span>
                      {#if !variant.available}
                        <span class="variant-option-badge">Sold out</span>
                      {/if}
                      {#if variant.id === item.variant_id}
                        <span class="variant-option-badge variant-option-current-badge">Current</span>
                      {/if}
                    </div>
                  {/each}
                </div>
              {/if}
            {:else if item.variant_title}
              <div class="variant-title">{item.variant_title}</div>
            {/if}
            {#if item.sku}
              <div class="item-sku">{item.sku}</div>
            {/if}
          </td>
          <td>
            <QuantityInput
              value={item.quantity}
              min={0}
              max={99}
              disabled={busyKeys.has(item.key)}
              onchange={(qty) => withBusy(item.key, () => onUpdateQuantity(item.key, qty))}
            />
          </td>
          <td>
            {#if propsCount(item.properties) > 0}
              <button class="props-toggle" onclick={() => toggleProperties(item.key, item.properties)}>
                {propsCount(item.properties)} prop{propsCount(item.properties) !== 1 ? 's' : ''}
                <span class="props-chevron">{expandedItemKey === item.key ? '▾' : '▸'}</span>
              </button>
            {:else}
              <button class="props-toggle props-toggle-empty" onclick={() => toggleProperties(item.key, item.properties)}>
                &mdash;
              </button>
            {/if}
          </td>
          <td>
            {#if item.selling_plan_allocation}
              <span class="selling-plan">{item.selling_plan_allocation.selling_plan.name}</span>
            {:else}
              <span class="no-props">&mdash;</span>
            {/if}
          </td>
          <td class="price">
            {#if item.total_discount > 0}
              <div class="price-original">{formatPrice(item.original_line_price)}</div>
              <div class="price-discounted">{formatPrice(item.line_price)}</div>
            {:else}
              <div>{formatPrice(item.line_price)}</div>
            {/if}
          </td>
          <td>
            <button class="remove-btn" disabled={busyKeys.has(item.key)} onclick={() => withBusy(item.key, () => onRemoveItem(item.key))} title="Remove item">
              &#x1D5EB;
            </button>
          </td>
        </tr>
        {#if expandedItemKey === item.key && propertyEntries[item.key]}
          <tr class="expanded-row">
            <td colspan="8">
              <div class="expanded-content">
                <KeyValueEditor
                  bind:entries={propertyEntries[item.key]}
                  keyPlaceholder="Property name"
                  valuePlaceholder="Property value"
                  onchange={(entries) => handlePropertiesChange(item.key, entries)}
                />
                {#if isPropertiesModified(item.key, item.properties)}
                  <div class="props-save-row">
                    <span class="props-hint">Unsaved changes</span>
                    <button class="props-save-btn" onclick={() => saveProperties(item.key, item.quantity)} disabled={busyKeys.has(item.key)}>Save</button>
                  </div>
                {/if}
              </div>
            </td>
          </tr>
        {/if}
      {/each}
    </tbody>
  </table>

  <div class="footer">
    <button class="clear-btn" onclick={onClearCart}>Clear Cart</button>
    <div class="total">
      {#if cart.total_discount > 0}
        <div class="discount-amount">Discount: &minus;{formatPrice(cart.total_discount)}</div>
      {/if}
      <div class="total-amount">Total: {formatPrice(cart.total_price)}</div>
    </div>
  </div>
{/if}

<style>
  .items-table {
    width: 100%;
    border-collapse: collapse;
  }

  .items-table th {
    text-align: left;
    padding: 8px 12px;
    font-size: 11px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    color: var(--cs-text-muted);
    border-bottom: 1px solid var(--cs-border);
    white-space: nowrap;
  }

  .items-table td {
    padding: 12px;
    vertical-align: middle;
    border-bottom: 1px solid var(--cs-border);
  }

  .items-table tbody tr:last-child td {
    border-bottom: none;
  }

  .items-table tbody tr:hover td {
    background: var(--cs-bg-secondary);
  }

  .items-table tbody tr.row-busy td {
    opacity: 0.45;
    pointer-events: none;
    transition: opacity 150ms;
  }

  .row-num {
    color: var(--cs-text-muted);
    font-size: 12px;
    font-variant-numeric: tabular-nums;
  }

  .item-image {
    width: 40px;
    height: 40px;
    border-radius: 4px;
    object-fit: cover;
    background: var(--cs-bg-tertiary);
    display: block;
  }

  .item-image-placeholder {
    background: var(--cs-bg-tertiary);
  }

  .product-title {
    font-weight: 500;
    color: var(--cs-text-primary);
  }

  .product-title a {
    color: var(--cs-text-primary);
    text-decoration: none;
  }

  .product-title a:hover {
    color: var(--cs-accent);
  }

  .variant-title {
    font-size: 12px;
    color: var(--cs-text-secondary);
    margin-top: 2px;
  }

  .variant-switchable {
    cursor: pointer;
    display: inline-flex;
    align-items: center;
    gap: 4px;
    padding: 1px 6px;
    margin: 2px 0 0 -6px;
    border-radius: var(--cs-radius-sm);
    transition: background 150ms, color 150ms;
  }

  .variant-switchable:hover,
  .variant-active {
    background: var(--cs-bg-tertiary);
    color: var(--cs-text-primary);
  }

  .variant-switch-icon {
    font-size: 10px;
    color: var(--cs-text-muted);
  }

  .variant-loading {
    color: var(--cs-text-muted);
    font-style: italic;
  }

  .variant-picker {
    margin-top: 4px;
    background: var(--cs-bg-secondary);
    border: 1px solid var(--cs-border);
    border-radius: var(--cs-radius-sm);
    overflow: hidden;
    max-height: 200px;
    overflow-y: auto;
  }

  .variant-option {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 6px 10px;
    font-size: 12px;
    cursor: pointer;
    transition: background 150ms;
  }

  .variant-option:hover {
    background: var(--cs-bg-hover);
  }

  .variant-current {
    background: var(--cs-bg-tertiary);
  }

  .variant-unavailable {
    opacity: 0.5;
  }

  .variant-option-title {
    color: var(--cs-text-primary);
    flex: 1;
  }

  .variant-option-price {
    color: var(--cs-text-secondary);
    font-variant-numeric: tabular-nums;
  }

  .variant-option-badge {
    font-size: 10px;
    padding: 1px 5px;
    border-radius: 3px;
    background: var(--cs-bg-hover);
    color: var(--cs-text-muted);
    text-transform: uppercase;
    letter-spacing: 0.3px;
  }

  .variant-option-current-badge {
    background: rgba(99, 102, 241, 0.15);
    color: var(--cs-accent);
  }

  .item-sku {
    font-size: 11px;
    color: var(--cs-text-muted);
    font-family: monospace;
    margin-top: 2px;
  }

  .props-toggle {
    all: unset;
    cursor: pointer;
    padding: 3px 8px;
    border-radius: var(--cs-radius-sm);
    font-size: 12px;
    color: var(--cs-text-secondary);
    background: var(--cs-bg-tertiary);
    transition: background 150ms;
    display: inline-flex;
    align-items: center;
    gap: 4px;
  }

  .props-toggle:hover {
    background: var(--cs-bg-hover);
  }

  .props-toggle-empty {
    background: transparent;
    color: var(--cs-text-muted);
  }

  .props-chevron {
    font-size: 10px;
  }

  .no-props {
    color: var(--cs-text-muted);
  }

  .selling-plan {
    font-size: 12px;
    color: var(--cs-text-secondary);
    display: -webkit-box;
    -webkit-line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
  }

  .price {
    text-align: right;
    font-variant-numeric: tabular-nums;
    white-space: nowrap;
  }

  .price-original {
    text-decoration: line-through;
    color: var(--cs-text-muted);
    font-size: 12px;
  }

  .price-discounted {
    color: var(--cs-success);
  }

  .remove-btn {
    all: unset;
    cursor: pointer;
    width: 28px;
    height: 28px;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: var(--cs-radius-sm);
    color: var(--cs-text-muted);
    font-size: 14px;
    transition: color 150ms, background 150ms;
  }

  .remove-btn:hover {
    color: var(--cs-danger);
    background: rgba(239, 68, 68, 0.1);
  }

  .expanded-row td {
    padding: 0 12px 16px 100px;
    border-bottom: 1px solid var(--cs-border);
  }

  .expanded-row:hover td {
    background: transparent;
  }

  .expanded-content {
    max-width: 500px;
  }

  .props-save-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-top: 8px;
  }

  .props-hint {
    font-size: 12px;
    color: var(--cs-text-muted);
    font-style: italic;
  }

  .props-save-btn {
    all: unset;
    cursor: pointer;
    padding: 6px 16px;
    background: var(--cs-accent);
    color: white;
    border-radius: var(--cs-radius-sm);
    font-size: 12px;
    font-weight: 600;
    transition: background 150ms;
  }

  .props-save-btn:hover:not(:disabled) {
    background: var(--cs-accent-hover);
  }

  .props-save-btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .footer {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 16px 12px;
    border-top: 1px solid var(--cs-border);
    margin-top: 8px;
  }

  .clear-btn {
    all: unset;
    cursor: pointer;
    padding: 6px 12px;
    border-radius: var(--cs-radius-sm);
    font-size: 13px;
    font-weight: 500;
    color: var(--cs-danger);
    transition: background 150ms;
  }

  .clear-btn:hover {
    background: rgba(239, 68, 68, 0.1);
  }

  .total {
    text-align: right;
  }

  .total-amount {
    font-size: 18px;
    font-weight: 600;
    color: var(--cs-text-primary);
    font-variant-numeric: tabular-nums;
  }

  .discount-amount {
    font-size: 13px;
    color: var(--cs-success);
  }

  .empty {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: 60px 20px;
    color: var(--cs-text-muted);
    gap: 8px;
  }

  .empty p {
    margin: 0;
  }

  .empty-title {
    font-size: 16px;
    font-weight: 500;
    color: var(--cs-text-secondary);
  }

  .empty-link {
    color: var(--cs-accent);
    cursor: pointer;
    font-size: 13px;
  }

  .empty-link:hover {
    color: var(--cs-accent-hover);
  }
</style>
