# Task 04: Shared Components (QuantityInput + KeyValueEditor)

**Phase**: 1 — UI Skeleton
**Files to create**:
- `entrypoints/cart-superpowers.content/components/QuantityInput.svelte`
- `entrypoints/cart-superpowers.content/components/KeyValueEditor.svelte`
**Depends on**: Task 03

## Objective

Build two reusable components used across multiple tabs: a quantity stepper and a key-value pair editor. Both must follow the dark dev-tools aesthetic and work with Svelte's `bind:` and event dispatching patterns.

---

## 4.1 QuantityInput.svelte

A compact +/- stepper with a numeric input in the middle.

### Props
- `value: number` — the current quantity (bindable)
- `min: number = 0` — minimum allowed value
- `max: number = 99` — maximum allowed value (reasonable default)
- `disabled: boolean = false`

### Events
- `change` — dispatched when the value changes, with `detail: { value: number }`

### Behavior
- Clicking `-` decrements by 1 (clamped to `min`)
- Clicking `+` increments by 1 (clamped to `max`)
- Direct input: typing a number updates the value on blur or Enter
- Invalid input (NaN, negative) resets to previous value
- `-` button is visually muted when `value === min`
- `+` button is visually muted when `value === max`

### Structure

```svelte
<div class="qty">
  <button class="qty-btn" disabled={disabled || value <= min} on:click={decrement}>−</button>
  <input
    class="qty-input"
    type="number"
    bind:value={inputValue}
    on:blur={commit}
    on:keydown={(e) => e.key === 'Enter' && commit()}
    {disabled}
    {min}
    {max}
  />
  <button class="qty-btn" disabled={disabled || value >= max} on:click={increment}>+</button>
</div>
```

### Styles

```css
.qty {
  display: inline-flex;
  align-items: center;
  gap: 0;
  border: 1px solid var(--cs-border);
  border-radius: var(--cs-radius-sm);
  overflow: hidden;
}

.qty-btn {
  all: unset;
  cursor: pointer;
  width: 28px;
  height: 28px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--cs-bg-tertiary);
  color: var(--cs-text-primary);
  font-size: 14px;
  font-weight: 600;
  transition: background 150ms;
  user-select: none;
}

.qty-btn:hover:not(:disabled) {
  background: var(--cs-bg-hover);
}

.qty-btn:disabled {
  opacity: 0.3;
  cursor: not-allowed;
}

.qty-input {
  all: unset;
  width: 40px;
  height: 28px;
  text-align: center;
  font-size: 13px;
  color: var(--cs-text-primary);
  background: var(--cs-bg-secondary);
  border-left: 1px solid var(--cs-border);
  border-right: 1px solid var(--cs-border);
  -moz-appearance: textfield; /* hide spinner in Firefox */
}

.qty-input::-webkit-inner-spin-button,
.qty-input::-webkit-outer-spin-button {
  -webkit-appearance: none;
  margin: 0;
}

.qty-input:focus {
  outline: 2px solid var(--cs-accent);
  outline-offset: -2px;
}
```

---

## 4.2 KeyValueEditor.svelte

An editable list of key-value pairs with add and remove functionality. Used by:
- **ItemsTab**: editing line item properties
- **MetadataTab**: editing cart attributes
- **AddItemTab**: adding properties to new items

### Props
- `entries: Array<{ key: string; value: string }>` — the key-value pairs (bindable)
- `keyPlaceholder: string = "Key"` — placeholder for key inputs
- `valuePlaceholder: string = "Value"` — placeholder for value inputs
- `disabled: boolean = false`
- `addLabel: string = "Add property"` — label for the add button

### Events
- `change` — dispatched when entries change, with `detail: { entries }`

### Behavior
- Each row has: key input, value input, remove (x) button
- "Add" button appends a new empty row `{ key: '', value: '' }`
- Remove button removes the row at that index
- Empty key rows are allowed during editing (validation happens at the consumer level)
- Inputs use `on:input` to update entries reactively

### Structure

```svelte
<div class="kv-editor">
  {#each entries as entry, i (i)}
    <div class="kv-row">
      <input
        class="kv-input"
        type="text"
        placeholder={keyPlaceholder}
        bind:value={entry.key}
        on:input={handleChange}
        {disabled}
      />
      <input
        class="kv-input kv-value"
        type="text"
        placeholder={valuePlaceholder}
        bind:value={entry.value}
        on:input={handleChange}
        {disabled}
      />
      <button class="kv-remove" on:click={() => removeEntry(i)} {disabled} title="Remove">
        ×
      </button>
    </div>
  {/each}

  {#if entries.length === 0}
    <div class="kv-empty">No properties</div>
  {/if}

  <button class="kv-add" on:click={addEntry} {disabled}>
    + {addLabel}
  </button>
</div>
```

### Styles

```css
.kv-editor {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.kv-row {
  display: flex;
  gap: 6px;
  align-items: center;
}

.kv-input {
  all: unset;
  flex: 1;
  padding: 6px 10px;
  background: var(--cs-bg-secondary);
  border: 1px solid var(--cs-border);
  border-radius: var(--cs-radius-sm);
  color: var(--cs-text-primary);
  font-size: 13px;
  font-family: inherit;
  transition: border-color 150ms;
}

.kv-value {
  flex: 2;    /* value column wider than key column */
}

.kv-input::placeholder {
  color: var(--cs-text-muted);
}

.kv-input:focus {
  border-color: var(--cs-accent);
}

.kv-remove {
  all: unset;
  cursor: pointer;
  width: 24px;
  height: 24px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: var(--cs-radius-sm);
  color: var(--cs-text-muted);
  font-size: 16px;
  flex-shrink: 0;
  transition: color 150ms, background 150ms;
}

.kv-remove:hover {
  color: var(--cs-danger);
  background: rgba(239, 68, 68, 0.1);
}

.kv-empty {
  color: var(--cs-text-muted);
  font-size: 13px;
  font-style: italic;
  padding: 6px 0;
}

.kv-add {
  all: unset;
  cursor: pointer;
  color: var(--cs-accent);
  font-size: 13px;
  font-weight: 500;
  padding: 4px 0;
  transition: color 150ms;
  align-self: flex-start;
}

.kv-add:hover {
  color: var(--cs-accent-hover);
}
```

## Acceptance Criteria

### QuantityInput
- Renders a compact +/- stepper with a numeric input
- Clicking +/- changes the value and dispatches `change` event
- Direct input works: typing a number and pressing Enter or blurring updates the value
- Respects min/max bounds
- Disabled state grays everything out
- Matches the dark theme

### KeyValueEditor
- Renders a list of key/value input rows
- "Add property" button appends a new empty row
- Remove (x) button removes the row
- Empty state shows "No properties" message
- All inputs are editable and dispatch change events
- Matches the dark theme
- Both components can be imported and used from other Svelte components
