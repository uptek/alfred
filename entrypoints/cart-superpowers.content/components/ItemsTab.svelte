<script lang="ts">
  import type { CartData, CartItem, ProductData } from '../types';
  import { entriesToRecord, recordToEntries } from '../utils';
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

  async function withBusy(key: string, fn: () => Promise<void>): Promise<boolean> {
    busyKeys.add(key);
    busyKeys = new Set(busyKeys); // trigger reactivity
    try {
      await fn();
      return true;
    } catch {
      return false;
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

  const propsToEntries = recordToEntries;
  const entriesToProps = entriesToRecord;

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

    // Shopify's change.js overwrites the entire properties object, so sending
    // only the remaining keys drops any removed ones. However, setting properties
    // to {} is a no-op — the parent handler deals with that via remove+re-add.
    const newProps = entriesToProps(entries);

    const didSave = await withBusy(itemKey, () => onUpdateProperties(itemKey, quantity, newProps));
    if (!didSave) return;

    // Re-sync local entries from the updated cart so dirty detection resets.
    // Note: if replaceItem was used (props cleared to empty), the item key changes —
    // clean up orphaned state and collapse the editor.
    const updatedItem = cart.items.find((item) => item.key === itemKey);
    if (updatedItem) {
      propertyEntries[itemKey] = propsToEntries(updatedItem.properties);
    } else {
      // Item key changed after replaceItem — clean up stale state
      delete propertyEntries[itemKey];
      if (expandedItemKey === itemKey) expandedItemKey = null;
    }
  }

  async function clearCart() {
    try {
      await onClearCart();
    } catch {
      // Parent handles error presentation.
    }
  }
</script>

{#if cart.items.length === 0}
  <div class="empty">
    <svg class="empty-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="8" cy="21" r="1"/><circle cx="19" cy="21" r="1"/><path d="M2.05 2.05h2l2.66 12.42a2 2 0 0 0 2 1.58h9.78a2 2 0 0 0 1.95-1.57l1.65-7.43H5.12"/></svg>
    <p class="empty-title">Your cart is empty</p>
    <p>Add items using the Add Item tab</p>
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <!-- svelte-ignore a11y_click_events_have_key_events -->
    <span class="empty-link" onclick={() => onSwitchTab('add')}>Go to Add Item &rarr;</span>
  </div>
{:else}
  <table class="items-table">
    <thead>
      <tr>
        <th style="width: 40px">#</th>
        <th style="width: 52px">Image</th>
        <th>Product</th>
        <th style="width: 120px">Qty</th>
        <th style="width: 160px">Properties</th>
        <th style="width: 160px">Selling Plan</th>
        <th style="width: 100px; text-align: right">Price</th>
        <th style="width: 44px"></th>
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
              <div class="item-image item-image-placeholder">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect width="18" height="18" x="3" y="3" rx="2" ry="2"/><circle cx="9" cy="9" r="2"/><path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21"/></svg>
              </div>
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
                  <svg class="chevron" class:chevron-open={variantEditKey === item.key} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m9 18 6-6-6-6"/></svg>
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
                      onclick={() => variant.available && handleVariantSelect(item, variant.id)}
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
                <svg class="chevron-sm" class:chevron-open={expandedItemKey === item.key} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m9 18 6-6-6-6"/></svg>
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
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/></svg>
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
    <button class="clear-btn" onclick={clearCart}>
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/></svg>
      Clear Cart
    </button>
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
    transition: opacity 200ms;
  }

  .row-num {
    color: var(--cs-text-muted);
    font-size: 12px;
    font-variant-numeric: tabular-nums;
  }

  .item-image {
    width: 44px;
    height: 44px;
    border-radius: var(--cs-radius-sm);
    object-fit: cover;
    background: var(--cs-bg-tertiary);
    display: block;
  }

  .item-image-placeholder {
    display: flex;
    align-items: center;
    justify-content: center;
    background: var(--cs-bg-tertiary);
    color: var(--cs-text-muted);
  }

  .item-image-placeholder svg {
    width: 20px;
    height: 20px;
    opacity: 0.4;
  }

  .product-title {
    font-weight: 500;
    color: var(--cs-text-primary);
  }

  .product-title a {
    color: var(--cs-text-primary);
    text-decoration: none;
    transition: color 200ms;
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
    padding: 2px 6px;
    margin: 2px 0 0 -6px;
    border-radius: var(--cs-radius-sm);
    transition: background 200ms, color 200ms;
  }

  .variant-switchable:hover,
  .variant-active {
    background: var(--cs-bg-tertiary);
    color: var(--cs-text-primary);
  }

  .chevron {
    width: 12px;
    height: 12px;
    color: var(--cs-text-muted);
    transition: transform 200ms ease;
    flex-shrink: 0;
  }

  .chevron-open {
    transform: rotate(90deg);
  }

  .chevron-sm {
    width: 10px;
    height: 10px;
    color: var(--cs-text-muted);
    transition: transform 200ms ease;
    flex-shrink: 0;
  }

  .chevron-sm.chevron-open {
    transform: rotate(90deg);
  }

  .variant-loading {
    color: var(--cs-text-muted);
    font-style: italic;
  }

  .variant-picker {
    margin-top: 6px;
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
    padding: 8px 10px;
    font-size: 12px;
    cursor: pointer;
    transition: background 200ms;
  }

  .variant-option:hover {
    background: var(--cs-bg-hover);
  }

  .variant-current {
    background: var(--cs-bg-tertiary);
  }

  .variant-unavailable {
    opacity: 0.5;
    pointer-events: none;
    cursor: default;
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
    padding: 1px 6px;
    border-radius: 4px;
    background: var(--cs-bg-hover);
    color: var(--cs-text-muted);
    text-transform: uppercase;
    letter-spacing: 0.3px;
    font-weight: 550;
  }

  .variant-option-current-badge {
    background: var(--cs-accent-subtle, rgba(124, 106, 246, 0.08));
    color: var(--cs-accent);
  }

  .item-sku {
    font-size: 11px;
    color: var(--cs-text-muted);
    font-family: 'SF Mono', 'Fira Code', ui-monospace, Menlo, Monaco, Consolas, monospace;
    margin-top: 2px;
  }

  .props-toggle {
    all: unset;
    cursor: pointer;
    padding: 4px 8px;
    border-radius: var(--cs-radius-sm);
    font-size: 12px;
    color: var(--cs-text-secondary);
    background: var(--cs-bg-tertiary);
    transition: background 200ms;
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
    color: var(--cs-text-primary);
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
    width: 30px;
    height: 30px;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: var(--cs-radius-sm);
    color: var(--cs-text-muted);
    transition: color 200ms, background 200ms;
  }

  .remove-btn svg {
    width: 15px;
    height: 15px;
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
    transition: background 200ms;
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
    padding: 7px 14px;
    border-radius: var(--cs-radius-sm);
    font-size: 13px;
    font-weight: 500;
    color: var(--cs-danger);
    transition: background 200ms;
    display: inline-flex;
    align-items: center;
    gap: 6px;
  }

  .clear-btn svg {
    width: 14px;
    height: 14px;
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

  .empty-icon {
    width: 48px;
    height: 48px;
    color: var(--cs-text-muted);
    opacity: 0.35;
    margin-bottom: 8px;
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
    transition: color 200ms;
  }

  .empty-link:hover {
    color: var(--cs-accent-hover);
  }
</style>
