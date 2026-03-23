<script lang="ts">
  import { untrack } from 'svelte';
  import type { CartData } from '../types';
  import { entriesToRecord, recordToEntries } from '../utils';
  import KeyValueEditor from './KeyValueEditor.svelte';

  let {
    cart,
    onUpdateNote,
    onUpdateAttributes,
    onApplyDiscount,
    onRemoveDiscount,
  }: {
    cart: CartData;
    onUpdateNote: (note: string) => Promise<void>;
    onUpdateAttributes: (attributes: Record<string, string>) => Promise<void>;
    onApplyDiscount: (code: string) => Promise<void>;
    onRemoveDiscount: () => Promise<void>;
  } = $props();

  let noteValue = $state(cart.note || '');
  let discountCode = $state('');

  function attributesToEntries(attributes: Record<string, string>): Array<{ key: string; value: string }> {
    const entries = recordToEntries(attributes);
    return entries.length > 0 ? entries : [{ key: '', value: '' }];
  }

  function serializeEntries(entries: Array<{ key: string; value: string }>): string {
    return JSON.stringify(entriesToRecord(entries));
  }

  let attributeEntries = $state<Array<{ key: string; value: string }>>(attributesToEntries(cart.attributes));
  let lastSyncedNote = $state(cart.note || '');
  let lastSyncedAttributes = $state(serializeEntries(attributesToEntries(cart.attributes)));

  const entriesToAttributes = entriesToRecord;

  // Track modifications
  let noteModified = $derived(noteValue !== (cart.note || ''));
  let attributesModified = $derived(
    JSON.stringify(entriesToAttributes(attributeEntries)) !== JSON.stringify(cart.attributes),
  );

  // Sync note from cart prop when it changes externally (not locally edited).
  // untrack() prevents reading noteValue/lastSyncedNote from becoming dependencies,
  // so this effect only re-runs when cart.note changes.
  $effect(() => {
    const nextNote = cart.note || '';
    const currentNote = untrack(() => noteValue);
    const synced = untrack(() => lastSyncedNote);
    if (currentNote === synced) {
      noteValue = nextNote;
    }
    lastSyncedNote = nextNote;
  });

  // Sync attributes from cart prop when they change externally.
  $effect(() => {
    const nextEntries = attributesToEntries(cart.attributes);
    const nextSerialized = serializeEntries(nextEntries);
    const currentSerialized = untrack(() => serializeEntries(attributeEntries));
    const synced = untrack(() => lastSyncedAttributes);
    if (currentSerialized === synced) {
      attributeEntries = nextEntries;
    }
    lastSyncedAttributes = nextSerialized;
  });

  async function saveNote() {
    try {
      await onUpdateNote(noteValue);
    } catch {
      // Parent handles error presentation.
    }
  }

  async function saveAttributes() {
    try {
      await onUpdateAttributes(entriesToAttributes(attributeEntries));
    } catch {
      // Parent handles error presentation.
    }
  }

  function handleAttributeChange(entries: Array<{ key: string; value: string }>) {
    attributeEntries = entries;
  }

  async function applyDiscount() {
    if (!discountCode.trim()) return;
    try {
      await onApplyDiscount(discountCode.trim().toUpperCase());
      discountCode = '';
    } catch {
      // Parent handles error presentation.
    }
  }

  async function removeDiscount() {
    try {
      await onRemoveDiscount();
    } catch {
      // Parent handles error presentation.
    }
  }
</script>

<section class="meta-section">
  <div class="meta-header">
    <div class="meta-header-left">
      <svg class="section-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>
      <h3 class="meta-title">Cart Note</h3>
    </div>
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
    <div class="meta-header-left">
      <svg class="section-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="4" y1="21" x2="4" y2="14"/><line x1="4" y1="10" x2="4" y2="3"/><line x1="12" y1="21" x2="12" y2="12"/><line x1="12" y1="8" x2="12" y2="3"/><line x1="20" y1="21" x2="20" y2="16"/><line x1="20" y1="12" x2="20" y2="3"/><line x1="1" y1="14" x2="7" y2="14"/><line x1="9" y1="8" x2="15" y2="8"/><line x1="17" y1="16" x2="23" y2="16"/></svg>
      <h3 class="meta-title">Cart Attributes</h3>
    </div>
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
  <div class="meta-header">
    <div class="meta-header-left">
      <svg class="section-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="19" y1="5" x2="5" y2="19"/><circle cx="6.5" cy="6.5" r="2.5"/><circle cx="17.5" cy="17.5" r="2.5"/></svg>
      <h3 class="meta-title">Discount Codes</h3>
    </div>
  </div>

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

  {#if cart.discount_codes.length > 0}
    <div class="discount-active">
      <h4 class="discount-active-title">Discount Codes</h4>
      {#each cart.discount_codes as dc}
        <div class="discount-row">
          <div class="discount-info">
            <span class="discount-name">{dc.code}</span>
            <span class="discount-status" class:applicable={dc.applicable} class:not-applicable={!dc.applicable}>
              {#if dc.applicable}
                -${(dc.amount / 100).toFixed(2)}
              {:else}
                Not applicable
              {/if}
            </span>
          </div>
        </div>
      {/each}
      <button class="discount-remove" onclick={removeDiscount}>
        <svg class="btn-icon-sm" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/></svg>
        Remove all discounts
      </button>
    </div>
  {/if}

  {#if cart.cart_level_discount_applications.length > 0}
    <div class="discount-active" style="margin-top: 12px;">
      <h4 class="discount-active-title">Cart-Level Discounts</h4>
      {#each cart.cart_level_discount_applications as discount}
        <div class="discount-row">
          <div class="discount-info">
            <span class="discount-name">{discount.title}</span>
            <span class="discount-status applicable">
              {discount.value_type === 'percentage' ? `${discount.value}%` : `$${(discount.total_allocated_amount / 100).toFixed(2)}`}
            </span>
          </div>
        </div>
      {/each}
    </div>
  {/if}

  {#if cart.discount_codes.length === 0 && cart.cart_level_discount_applications.length === 0}
    <p class="discount-empty">No discount codes applied</p>
  {/if}
</section>

<style>
  .meta-section {
    padding: 20px;
    background: var(--cs-bg-secondary);
    border-radius: var(--cs-radius, 12px);
    border: 1px solid var(--cs-border);
    margin-bottom: 16px;
  }

  .meta-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 12px;
  }

  .meta-header-left {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .section-icon {
    width: 16px;
    height: 16px;
    color: var(--cs-text-muted);
    flex-shrink: 0;
  }

  .meta-title {
    all: unset;
    font-size: 14px;
    font-weight: 600;
    color: var(--cs-text-primary);
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
    transition: background 200ms;
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
    transition: border-color 200ms, box-shadow 200ms;
  }

  .note-input::placeholder {
    color: var(--cs-text-muted);
  }

  .note-input:focus {
    border-color: var(--cs-accent);
    box-shadow: 0 0 0 3px var(--cs-accent-subtle, rgba(124, 106, 246, 0.08));
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
    font-family: 'SF Mono', 'Fira Code', ui-monospace, Menlo, Monaco, Consolas, monospace;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    transition: border-color 200ms, box-shadow 200ms;
  }

  .discount-input::placeholder {
    color: var(--cs-text-muted);
    text-transform: none;
    font-family: inherit;
    letter-spacing: normal;
  }

  .discount-input:focus {
    border-color: var(--cs-accent);
    box-shadow: 0 0 0 3px var(--cs-accent-subtle, rgba(124, 106, 246, 0.08));
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
    transition: background 200ms;
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
    font-family: 'SF Mono', 'Fira Code', ui-monospace, Menlo, Monaco, Consolas, monospace;
  }

  .discount-status {
    font-size: 13px;
    font-variant-numeric: tabular-nums;
  }

  .discount-status.applicable {
    color: var(--cs-success);
  }

  .discount-status.not-applicable {
    color: var(--cs-danger);
    font-size: 11px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.3px;
  }

  .discount-remove {
    all: unset;
    cursor: pointer;
    margin-top: 12px;
    font-size: 12px;
    font-weight: 500;
    color: var(--cs-danger);
    transition: color 200ms;
    display: inline-flex;
    align-items: center;
    gap: 5px;
  }

  .btn-icon-sm {
    width: 13px;
    height: 13px;
    flex-shrink: 0;
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
