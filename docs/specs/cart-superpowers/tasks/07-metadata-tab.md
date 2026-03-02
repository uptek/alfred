# Task 07: Metadata Tab

**Phase**: 1 — UI Skeleton
**Status**: ✅ Complete
**Files to create**:
- `entrypoints/cart-superpowers.content/components/MetadataTab.svelte`
**Depends on**: Task 03, Task 04

## Objective

Build the Metadata tab — a three-section form for editing the cart note, cart attributes (key-value pairs), and discount codes. These are the non-line-item properties of the cart.

## Props

- `cart: CartData` — the full cart object
- `onUpdateNote: (note: string) => void` — callback when note changes
- `onUpdateAttributes: (attributes: Record<string, string>) => void` — callback when attributes change
- `onApplyDiscount: (code: string) => void` — callback to apply a discount code
- `onRemoveDiscount: () => void` — callback to remove all discount codes

## Layout

Three vertically stacked sections, each in a card-like container:

1. **Cart Note** — textarea
2. **Cart Attributes** — KeyValueEditor
3. **Discount Codes** — input + apply + active discounts list

---

## Section 1: Cart Note

### Structure

```svelte
<section class="meta-section">
  <div class="meta-header">
    <h3 class="meta-title">Cart Note</h3>
    {#if noteModified}
      <button class="meta-save" on:click={saveNote}>Save</button>
    {/if}
  </div>
  <textarea
    class="note-input"
    placeholder="Add a note to this order…"
    bind:value={noteValue}
    rows="4"
  />
  {#if cart.note && cart.note !== noteValue}
    <p class="meta-hint">Unsaved changes</p>
  {/if}
</section>
```

### Behavior

- Pre-filled with `cart.note` (or empty if null)
- Track local `noteValue` state, compare with `cart.note` to detect changes
- Show "Save" button only when modified (`noteModified = noteValue !== (cart.note || '')`)
- On save: call `onUpdateNote(noteValue)`
- In Phase 2: this triggers `updateCart({ note: noteValue })` and refreshes cart state

---

## Section 2: Cart Attributes

### Structure

```svelte
<section class="meta-section">
  <div class="meta-header">
    <h3 class="meta-title">Cart Attributes</h3>
    {#if attributesModified}
      <button class="meta-save" on:click={saveAttributes}>Save</button>
    {/if}
  </div>
  <KeyValueEditor
    bind:entries={attributeEntries}
    keyPlaceholder="Attribute name"
    valuePlaceholder="Attribute value"
    addLabel="Add attribute"
    on:change={handleAttributeChange}
  />
</section>
```

### Behavior

- Initialize `attributeEntries` from `cart.attributes`: convert `Record<string, string>` to `Array<{ key: string; value: string }>`
- Track whether entries differ from original to show "Save" button
- On save: convert entries back to `Record<string, string>` (filter out entries with empty keys), call `onUpdateAttributes(newAttributes)`
- In Phase 2: triggers `updateCart({ attributes: newAttributes })`

### Conversion Logic

```typescript
// Cart attributes → entries (on mount / cart change)
function attributesToEntries(attrs: Record<string, string>): Array<{ key: string; value: string }> {
  return Object.entries(attrs).map(([key, value]) => ({ key, value }));
}

// Entries → cart attributes (on save)
function entriesToAttributes(entries: Array<{ key: string; value: string }>): Record<string, string> {
  const result: Record<string, string> = {};
  for (const { key, value } of entries) {
    if (key.trim()) result[key.trim()] = value;
  }
  return result;
}
```

---

## Section 3: Discount Codes

### Structure

```svelte
<section class="meta-section">
  <h3 class="meta-title">Discount Codes</h3>

  <div class="discount-input-row">
    <input
      class="discount-input"
      type="text"
      placeholder="Enter discount code"
      bind:value={discountCode}
      on:keydown={(e) => e.key === 'Enter' && applyDiscount()}
    />
    <button class="discount-apply" on:click={applyDiscount} disabled={!discountCode.trim()}>
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
      <button class="discount-remove" on:click={onRemoveDiscount}>
        Remove all discounts
      </button>
    </div>
  {:else}
    <p class="discount-empty">No discount codes applied</p>
  {/if}
</section>
```

### Behavior

- Input field for entering a discount code
- Apply button calls `onApplyDiscount(discountCode)` and clears the input
- Active discounts are shown from `cart.cart_level_discount_applications`
- Each discount shows its title and value (percentage or fixed amount)
- "Remove all discounts" button calls `onRemoveDiscount()`
- In Phase 2: apply calls `updateCart({ discount: code })`, remove calls `updateCart({ discount: '' })`

## State

```typescript
let noteValue = cart.note || '';
let attributeEntries = attributesToEntries(cart.attributes);
let discountCode = '';

$: noteModified = noteValue !== (cart.note || '');
$: attributesModified = JSON.stringify(entriesToAttributes(attributeEntries)) !== JSON.stringify(cart.attributes);
```

## Styles

```css
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
  margin-top: 6px;
}

/* Cart Note */
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

/* Discount Codes */
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
}
```

## Mock Behavior (Phase 1)

- `onUpdateNote`: updates `cart.note` in local state
- `onUpdateAttributes`: updates `cart.attributes` in local state
- `onApplyDiscount`: adds a mock discount to `cart.cart_level_discount_applications` and clears input
- `onRemoveDiscount`: clears `cart.cart_level_discount_applications` and resets `cart.total_discount`

## Acceptance Criteria

- Cart note textarea is pre-filled with existing note
- Save button appears only when note has been modified
- Saving note calls the callback
- Cart attributes render as editable key-value pairs
- Adding/removing attributes works via KeyValueEditor
- Save button for attributes appears when modified
- Discount code input accepts text, Enter triggers apply
- Apply button calls callback with uppercase code
- Active discounts display with name and value
- "Remove all discounts" button calls remove callback
- Empty state shows "No discount codes applied"
- All three sections have card-like styling
- Everything matches the dark theme
