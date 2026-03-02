# Task 15: Analytics Tracking

**Phase**: 3 — Integration
**Status**: ✅ Complete
**Files to modify**:
- `entrypoints/cart-superpowers.content/App.svelte` (or wherever mutation callbacks live)
**Depends on**: Task 12 (wired app), Task 13 (context menu)

## Objective

Add analytics tracking for key Cart Superpowers actions using the existing `trackAction` utility from `@/utils/analytics`. This gives visibility into which features are being used and how frequently.

## Events to Track

| Event Name | Trigger | Location |
|---|---|---|
| `cart_superpowers_open` | Feature is opened (via URL param or context menu) | `index.ts` (content script entry) or `shortcuts.ts` (context menu callback) |
| `cart_superpowers_add_item` | Item is added to cart | `App.svelte` add item callback |
| `cart_superpowers_update_quantity` | Quantity is changed on a line item | `App.svelte` quantity update callback |
| `cart_superpowers_remove_item` | Item is removed from cart | `App.svelte` remove item callback |
| `cart_superpowers_clear` | Cart is cleared | `App.svelte` clear cart callback |
| `cart_superpowers_apply_discount` | Discount code is applied | `App.svelte` apply discount callback |
| `cart_superpowers_update_note` | Cart note is updated | `App.svelte` update note callback |
| `cart_superpowers_calculate_shipping` | Shipping rates are calculated | `ShippingTab.svelte` or `App.svelte` |

## Implementation

### In App.svelte mutation callbacks

Add `trackAction` calls after successful mutations:

```typescript
import { trackAction } from '@/utils/analytics';

// In mutation callbacks:
onUpdateQuantity={(key, quantity) => {
  mutate(() => api.changeItem({ id: key, quantity }));
  trackAction('cart_superpowers_update_quantity');
}}

onRemoveItem={(key) => {
  mutate(() => api.changeItem({ id: key, quantity: 0 }));
  trackAction('cart_superpowers_remove_item');
}}

onClearCart={() => {
  mutate(() => api.clearCart());
  trackAction('cart_superpowers_clear');
}}

onAddItem={(payload) => {
  mutate(() => api.addItem(payload));
  trackAction('cart_superpowers_add_item');
}}

onApplyDiscount={(code) => {
  mutate(() => api.updateCart({ discount: code }));
  trackAction('cart_superpowers_apply_discount');
}}

onUpdateNote={(note) => {
  mutate(() => api.updateCart({ note }));
  trackAction('cart_superpowers_update_note');
}}
```

### In content script entry or context menu

The `cart_superpowers_open` event is already tracked in the context menu callback (`shortcuts.ts`, Task 13). For URL parameter opens, add tracking in `index.ts`:

```typescript
const open = async () => {
  if (mounted) return;
  mounted = true;
  trackAction('cart_superpowers_open');
  const { mountCartSuperpowers } = await import('./mount');
  mountCartSuperpowers(ctx, () => { mounted = false; });
};
```

### Content Script Import

Since `trackAction` uses `browser.runtime.sendMessage` internally, it works from content scripts. Import from `@/utils/analytics` (WXT resolves the `@` alias).

## Notes

- `trackAction` is fire-and-forget — it doesn't return a promise and never blocks the UI
- Track events on action initiation, not on completion (we want to know intent, not just success)
- Don't track high-frequency events (e.g., every keystroke in the note field) — only track the save/submit action

## Acceptance Criteria

- All 8 events are tracked when their corresponding actions occur
- Analytics calls don't block or delay UI interactions
- `trackAction` import resolves correctly from the content script context
- No analytics events fire when the feature is disabled
- Events fire once per action (no duplicates)
