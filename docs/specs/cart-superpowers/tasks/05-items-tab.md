# Task 05: Items Tab

**Phase**: 1 — UI Skeleton
**Status**: ✅ Complete
**Files to create**:
- `entrypoints/cart-superpowers.content/components/ItemsTab.svelte`
**Depends on**: Task 03, Task 04

## Objective

Build the core Items tab — a data table displaying all cart line items with inline editing for quantities, expandable line item properties, and remove actions. This is the primary view users will interact with.

## Props

- `cart: CartData` — the full cart object
- `onUpdateQuantity: (key: string, quantity: number) => void` — callback when quantity changes (mock: updates local state)
- `onRemoveItem: (key: string) => void` — callback to remove an item (mock: filters it from local state)
- `onUpdateProperties: (key: string, quantity: number, properties: Record<string, string>) => void` — callback when properties change
- `onClearCart: () => void` — callback to clear all items

## Table Layout

| Column | Width | Content |
|---|---|---|
| # | 40px | Row number (1-indexed) |
| Image | 48px | Product image thumbnail |
| Product | flex | Product title, variant title, SKU |
| Qty | 120px | `<QuantityInput>` component |
| Properties | 160px | Collapsed summary / expandable editor |
| Selling Plan | 160px | Plan name or "—" |
| Price | 100px | Formatted line price |
| Actions | 40px | Remove button (trash icon) |

## Detailed Column Specs

### Image Column
- 40x40 rounded thumbnail from `item.image`
- Fallback: gray placeholder square if `item.image` is empty
- `object-fit: cover`, `border-radius: 4px`

### Product Column
- **Line 1**: `item.product_title` — primary text, font-weight 500
- **Line 2**: `item.variant_title` — secondary text, smaller, muted color. Show only if not null/empty
- **Line 3**: `item.sku` — monospace, very small, muted. Show only if not empty
- Product title links to `item.url` (opens in new tab)

### Quantity Column
- Renders `<QuantityInput>` with `bind:value={item.quantity}`
- On change: calls `onUpdateQuantity(item.key, newQuantity)`
- Setting quantity to 0 is equivalent to removing the item

### Properties Column
- **Collapsed state**: Shows property count badge (e.g., "2 props") or "—" if none
- **Expanded state**: Click to toggle, shows inline `<KeyValueEditor>` below the row
- On change: calls `onUpdateProperties(item.key, item.quantity, newProperties)`
- Use a toggle button/icon to expand/collapse

### Selling Plan Column
- If `item.selling_plan_allocation` exists: show `item.selling_plan_allocation.selling_plan.name`
- Truncate long names with ellipsis
- If no selling plan: show "—" in muted color

### Price Column
- Format: `$XX.XX` using `item.line_price / 100` with `cart.currency`
- If `item.total_discount > 0`: show original price struck through above the discounted price
- Right-aligned

### Actions Column
- Trash/remove icon button
- On click: calls `onRemoveItem(item.key)`
- Hover: icon turns red (`--cs-danger`)
- Consider a brief confirmation or just immediate removal (for mock phase, immediate is fine)

## Expandable Properties Row

When a user clicks the properties toggle on a row, an additional row spans the full table width below that item. It contains a `<KeyValueEditor>` pre-filled with the item's properties. Changes are local until the user clicks away or triggers a save.

Implementation approach:
- Track `expandedItemKey: string | null` in component state
- When expanded, render a `<tr>` with `colspan` spanning all columns, containing the `<KeyValueEditor>`
- Only one item can be expanded at a time

## Footer

Below the table, a footer bar with:
- **Left side**: "Clear Cart" button (danger style — red text, hover red background)
- **Right side**: Total price display: "Total: $XXX.XX" with `cart.total_price / 100`
  - If `cart.total_discount > 0`: show "Discount: -$XX.XX" in green above the total

## Empty State

When `cart.items.length === 0`:
- Hide the table entirely
- Show a centered empty state with:
  - A subtle icon or illustration (optional, can be text-only)
  - "Your cart is empty"
  - "Add items using the Add Item tab"
  - Link/button that switches to the Add Item tab

## Styles

```css
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

.items-table tr:last-child td {
  border-bottom: none;
}

.items-table tr:hover td {
  background: var(--cs-bg-secondary);
}

/* Product image */
.item-image {
  width: 40px;
  height: 40px;
  border-radius: 4px;
  object-fit: cover;
  background: var(--cs-bg-tertiary);
}

/* Product info */
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

.item-sku {
  font-size: 11px;
  color: var(--cs-text-muted);
  font-family: monospace;
  margin-top: 2px;
}

/* Properties toggle */
.props-toggle {
  all: unset;
  cursor: pointer;
  padding: 3px 8px;
  border-radius: var(--cs-radius-sm);
  font-size: 12px;
  color: var(--cs-text-secondary);
  background: var(--cs-bg-tertiary);
  transition: background 150ms;
}

.props-toggle:hover {
  background: var(--cs-bg-hover);
}

/* Price */
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

/* Remove button */
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
  transition: color 150ms, background 150ms;
}

.remove-btn:hover {
  color: var(--cs-danger);
  background: rgba(239, 68, 68, 0.1);
}

/* Footer */
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

/* Empty state */
.empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 60px 20px;
  color: var(--cs-text-muted);
  gap: 8px;
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
```

## Mock Behavior (Phase 1)

For now, the callbacks update the local `cart` state in `App.svelte`:
- `onUpdateQuantity`: update `cart.items` quantity for matching key, recalculate totals
- `onRemoveItem`: filter out item from `cart.items`, recalculate totals
- `onUpdateProperties`: update properties for matching key
- `onClearCart`: set `cart.items = []`, reset totals

## Acceptance Criteria

- Table renders all mock cart items with correct data in each column
- Images display as rounded thumbnails
- Product title links to product URL (opens new tab)
- Variant title and SKU show below product title when present
- Quantity stepper works: +/- changes value, direct input works
- Properties column shows count badge, clicking expands inline editor
- KeyValueEditor inside expanded row is functional (add/remove/edit pairs)
- Selling plan name displays for items that have one, "—" for others
- Prices are formatted correctly with currency symbol
- Discounted items show strikethrough original price + green discounted price
- Remove button removes the item from the table
- Clear Cart button empties the table and shows empty state
- Empty state shows message and link to Add Item tab
- Footer shows total price, and discount amount when applicable
- Table rows have hover highlight
- All interactions feel responsive and match the dark theme
