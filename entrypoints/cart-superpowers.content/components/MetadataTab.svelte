<script lang="ts">
  import type { CartData } from '../types';
  import KeyValueEditor from './KeyValueEditor.svelte';

  let {
    cart,
    onUpdateNote,
    onUpdateAttributes,
    onApplyDiscount,
    onRemoveDiscount,
  }: {
    cart: CartData;
    onUpdateNote: (note: string) => void;
    onUpdateAttributes: (attributes: Record<string, string>) => void;
    onApplyDiscount: (code: string) => void;
    onRemoveDiscount: () => void;
  } = $props();

  let noteValue = $state(cart.note || '');
  let discountCode = $state('');

  let attributeEntries: Array<{ key: string; value: string }> =
    Object.entries(cart.attributes).map(([key, value]) => ({ key, value }));

  // Track modifications
  let noteModified = $derived(noteValue !== (cart.note || ''));
  let attributesModified = $derived(
    JSON.stringify(entriesToAttributes(attributeEntries)) !== JSON.stringify(cart.attributes),
  );

  function entriesToAttributes(entries: Array<{ key: string; value: string }>): Record<string, string> {
    const result: Record<string, string> = {};
    for (const { key, value } of entries) {
      if (key.trim()) result[key.trim()] = value;
    }
    return result;
  }

  function saveNote() {
    onUpdateNote(noteValue);
  }

  function saveAttributes() {
    onUpdateAttributes(entriesToAttributes(attributeEntries));
  }

  function handleAttributeChange(entries: Array<{ key: string; value: string }>) {
    attributeEntries = entries;
  }

  function applyDiscount() {
    if (!discountCode.trim()) return;
    onApplyDiscount(discountCode.trim().toUpperCase());
    discountCode = '';
  }
</script>

<section class="meta-section">
  <div class="meta-header">
    <h3 class="meta-title">Cart Note</h3>
    {#if noteModified}
      <button class="meta-save" onclick={saveNote}>Save</button>
    {/if}
  </div>
  <textarea
    class="note-input"
    placeholder="Add a note to this order…"
    bind:value={noteValue}
    rows={4}
  ></textarea>
  {#if noteModified}
    <p class="meta-hint">Unsaved changes</p>
  {/if}
</section>

<section class="meta-section">
  <div class="meta-header">
    <h3 class="meta-title">Cart Attributes</h3>
    {#if attributesModified}
      <button class="meta-save" onclick={saveAttributes}>Save</button>
    {/if}
  </div>
  <KeyValueEditor
    bind:entries={attributeEntries}
    keyPlaceholder="Attribute name"
    valuePlaceholder="Attribute value"
    addLabel="Add attribute"
    onchange={handleAttributeChange}
  />
</section>

<section class="meta-section">
  <h3 class="meta-title">Discount Codes</h3>

  <div class="discount-input-row">
    <input
      class="discount-input"
      type="text"
      placeholder="Enter discount code"
      bind:value={discountCode}
      onkeydown={(e) => { if (e.key === 'Enter') applyDiscount(); }}
    />
    <button class="discount-apply" onclick={applyDiscount} disabled={!discountCode.trim()}>
      Apply
    </button>
  </div>

  {#if cart.cart_level_discount_applications.length > 0}
    <div class="discount-active">
      <h4 class="discount-active-title">Active Discounts</h4>
      {#each cart.cart_level_discount_applications as discount}
        <div class="discount-row">
          <div class="discount-info">
            <span class="discount-name">{discount.title}</span>
            <span class="discount-value">
              {discount.value_type === 'percentage' ? `${discount.value}%` : `$${(discount.total_allocated_amount / 100).toFixed(2)}`}
            </span>
          </div>
        </div>
      {/each}
      <button class="discount-remove" onclick={onRemoveDiscount}>
        Remove all discounts
      </button>
    </div>
  {:else}
    <p class="discount-empty">No discount codes applied</p>
  {/if}
</section>

<style>
  .meta-section {
    padding: 20px;
    background: var(--cs-bg-secondary);
    border-radius: var(--cs-radius);
    border: 1px solid var(--cs-border);
    margin-bottom: 16px;
  }

  .meta-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 12px;
  }

  .meta-title {
    all: unset;
    font-size: 14px;
    font-weight: 600;
    color: var(--cs-text-primary);
    margin-bottom: 12px;
  }

  .meta-header .meta-title {
    margin-bottom: 0;
  }

  .meta-save {
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

  .meta-save:hover {
    background: var(--cs-accent-hover);
  }

  .meta-hint {
    font-size: 12px;
    color: var(--cs-text-muted);
    font-style: italic;
    margin: 6px 0 0;
  }

  .note-input {
    all: unset;
    display: block;
    width: 100%;
    padding: 10px 14px;
    background: var(--cs-bg-primary);
    border: 1px solid var(--cs-border);
    border-radius: var(--cs-radius-sm);
    color: var(--cs-text-primary);
    font-size: 13px;
    font-family: inherit;
    line-height: 1.5;
    resize: vertical;
    box-sizing: border-box;
    transition: border-color 150ms;
  }

  .note-input::placeholder {
    color: var(--cs-text-muted);
  }

  .note-input:focus {
    border-color: var(--cs-accent);
  }

  .discount-input-row {
    display: flex;
    gap: 8px;
    margin-bottom: 16px;
  }

  .discount-input {
    all: unset;
    flex: 1;
    padding: 10px 14px;
    background: var(--cs-bg-primary);
    border: 1px solid var(--cs-border);
    border-radius: var(--cs-radius-sm);
    color: var(--cs-text-primary);
    font-size: 13px;
    font-family: monospace;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    transition: border-color 150ms;
  }

  .discount-input::placeholder {
    color: var(--cs-text-muted);
    text-transform: none;
    font-family: inherit;
    letter-spacing: normal;
  }

  .discount-input:focus {
    border-color: var(--cs-accent);
  }

  .discount-apply {
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

  .discount-apply:hover:not(:disabled) {
    background: var(--cs-accent-hover);
  }

  .discount-apply:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .discount-active {
    padding: 12px;
    background: var(--cs-bg-primary);
    border-radius: var(--cs-radius-sm);
    border: 1px solid var(--cs-border);
  }

  .discount-active-title {
    all: unset;
    display: block;
    font-size: 11px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    color: var(--cs-text-muted);
    margin-bottom: 8px;
  }

  .discount-row {
    padding: 8px 0;
    border-bottom: 1px solid var(--cs-border);
  }

  .discount-row:last-of-type {
    border-bottom: none;
  }

  .discount-info {
    display: flex;
    justify-content: space-between;
    align-items: center;
  }

  .discount-name {
    font-size: 13px;
    font-weight: 500;
    color: var(--cs-text-primary);
    font-family: monospace;
  }

  .discount-value {
    font-size: 13px;
    color: var(--cs-success);
    font-variant-numeric: tabular-nums;
  }

  .discount-remove {
    all: unset;
    cursor: pointer;
    margin-top: 12px;
    font-size: 12px;
    font-weight: 500;
    color: var(--cs-danger);
    transition: color 150ms;
  }

  .discount-remove:hover {
    color: var(--cs-danger-hover);
  }

  .discount-empty {
    color: var(--cs-text-muted);
    font-size: 13px;
    font-style: italic;
    margin: 0;
  }
</style>
