# Task 12: Wire App and All Tabs to Real API

**Phase**: 2 — Wiring
**Files to modify**:
- `entrypoints/cart-superpowers.content/App.svelte`
- `entrypoints/cart-superpowers.content/components/ItemsTab.svelte`
- `entrypoints/cart-superpowers.content/components/AddItemTab.svelte`
- `entrypoints/cart-superpowers.content/components/MetadataTab.svelte`
- `entrypoints/cart-superpowers.content/components/ShippingTab.svelte`
**Depends on**: Task 10, Task 11, Tasks 05–09

## Objective

Replace all mock data and mock callbacks with real API calls via `cartApi.ts`. After this task, every user action in the UI triggers a real Shopify Cart Ajax API call and the UI reflects the live cart state.

## App.svelte Changes

### Replace Mock Data with API Fetch

**Before** (Phase 1):
```svelte
<script>
  import { MOCK_CART } from './mock-data';
  let cart = MOCK_CART;
</script>
```

**After** (Phase 2):
```svelte
<script>
  import { onMount } from 'svelte';
  import * as api from './cartApi';

  let cart = null;
  let isLoading = true;
  let isUpdating = false;
  let error = null;

  onMount(async () => {
    try {
      cart = await api.getCart();
    } catch (err) {
      error = err.message;
    } finally {
      isLoading = false;
    }
  });
</script>
```

### Mutation Wrapper

Every cart mutation follows the same pattern: set updating state, call API, update cart, handle errors.

```typescript
async function mutate(fn: () => Promise<CartData>) {
  isUpdating = true;
  error = null;
  try {
    cart = await fn();
  } catch (err) {
    error = err instanceof Error ? err.message : String(err);
  } finally {
    isUpdating = false;
  }
}
```

### Callback Props for Tabs

Instead of each tab calling the API directly, App.svelte provides callback props. This keeps API calls centralized and ensures cart state is always updated in one place.

```svelte
<!-- Items Tab -->
<ItemsTab
  {cart}
  {isUpdating}
  onUpdateQuantity={(key, quantity) => mutate(() => api.changeItem({ id: key, quantity }))}
  onRemoveItem={(key) => mutate(() => api.changeItem({ id: key, quantity: 0 }))}
  onUpdateProperties={(key, quantity, properties) => mutate(() => api.changeItem({ id: key, quantity, properties }))}
  onClearCart={() => mutate(() => api.clearCart())}
/>

<!-- Add Item Tab -->
<AddItemTab
  onAddItem={(payload) => mutate(() => api.addItem(payload))}
  onFetchProduct={(url) => api.getProductByUrl(url)}
/>

<!-- Metadata Tab -->
<MetadataTab
  {cart}
  {isUpdating}
  onUpdateNote={(note) => mutate(() => api.updateCart({ note }))}
  onUpdateAttributes={(attributes) => mutate(() => api.updateCart({ attributes }))}
  onApplyDiscount={(code) => mutate(() => api.updateCart({ discount: code }))}
  onRemoveDiscount={() => mutate(() => api.updateCart({ discount: '' }))}
/>

<!-- Shipping Tab -->
<ShippingTab
  {cart}
  onCalculateRates={(address) => api.getShippingRates(address)}
/>

<!-- JSON Tab (read-only, no changes needed) -->
<JsonTab {cart} />
```

### Loading and Error States

```svelte
{#if isLoading}
  <div class="loading">
    <span class="loading-spinner"></span>
    <span>Loading cart…</span>
  </div>
{:else if error && !cart}
  <div class="error-state">
    <p class="error-title">Failed to load cart</p>
    <p class="error-message">{error}</p>
    <button class="error-retry" on:click={loadCart}>Retry</button>
  </div>
{:else if cart}
  <!-- Tab content -->
{/if}
```

### Updating Indicator

When `isUpdating` is true, show a subtle indicator (e.g., a thin progress bar at the top of the panel or a loading overlay on the content area) so the user knows an API call is in progress.

```svelte
{#if isUpdating}
  <div class="updating-bar"></div>
{/if}
```

```css
.updating-bar {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  height: 2px;
  background: var(--cs-accent);
  animation: progress 1s ease-in-out infinite;
}

@keyframes progress {
  0% { transform: scaleX(0); transform-origin: left; }
  50% { transform: scaleX(1); transform-origin: left; }
  50.1% { transform: scaleX(1); transform-origin: right; }
  100% { transform: scaleX(0); transform-origin: right; }
}
```

### Toast Notifications for Errors

When a mutation fails, show the error message inline (near the action that failed) or as a brief toast. Don't use modal dialogs — they're disruptive in a dev-tools context.

---

## ItemsTab.svelte Changes

### Quantity Updates

**Before**: `onUpdateQuantity` updates local state
**After**: `onUpdateQuantity` triggers `changeItem({ id: key, quantity })` via App

The `isUpdating` prop can be used to disable inputs during API calls to prevent conflicting mutations.

### Remove Item

Uses `changeItem({ id: key, quantity: 0 })` — setting quantity to 0 removes the item from the cart.

### Properties Updates

`changeItem({ id: key, quantity: item.quantity, properties: newProps })` — must include current quantity when changing properties.

### Important: Line Item Keys

After every mutation, the cart is refetched. Line item keys can change (Shopify recalculates them based on variant + properties). The UI must re-render from the new cart state — never cache keys across mutations.

---

## AddItemTab.svelte Changes

### Product Fetching

**Before**: mock delay + MOCK_PRODUCT
**After**: `onFetchProduct(url)` calls `api.getProductByUrl(url)` and returns real product data

```svelte
async function fetchProduct() {
  isFetching = true;
  fetchError = null;
  try {
    product = await onFetchProduct(productUrl);
    selectedVariant = product.variants.find(v => v.available) || product.variants[0] || null;
  } catch (err) {
    fetchError = err.message;
    product = null;
  } finally {
    isFetching = false;
  }
}
```

### Add to Cart

**Before**: mock push to local items array
**After**: `onAddItem(payload)` calls `api.addItem(payload)` which adds to real cart

After successful add:
- Cart state in App.svelte updates automatically (mutation wrapper handles it)
- Switch to Items tab to show the new item (optional — could stay on Add tab)
- Clear the form or keep product loaded for adding another variant

---

## MetadataTab.svelte Changes

### Cart Note

**Before**: updates `cart.note` locally
**After**: `onUpdateNote(noteValue)` calls `updateCart({ note })`. After success, `cart` updates in App.svelte which re-renders MetadataTab with the new note.

### Cart Attributes

**Before**: updates `cart.attributes` locally
**After**: `onUpdateAttributes(attrs)` calls `updateCart({ attributes })`. The entire attributes object is replaced.

### Discount Codes

**Before**: mock discount added to local array
**After**:
- Apply: `onApplyDiscount(code)` calls `updateCart({ discount: code })`. Shopify applies the code and returns updated cart with `cart_level_discount_applications`.
- Remove: `onRemoveDiscount()` calls `updateCart({ discount: '' })`. Passing empty string clears all discount codes.

**Note**: Shopify only supports one discount code at a time (unless the store has an app that enables stacking). The API will error if a second code is applied while one is active.

---

## ShippingTab.svelte Changes

### Calculate Rates

**Before**: mock delay + MOCK_SHIPPING_RATES
**After**: `onCalculateRates(address)` calls `api.getShippingRates(address)` which uses the prepare + poll pattern

```svelte
async function calculateRates() {
  isCalculating = true;
  calculateError = null;
  try {
    rates = await onCalculateRates({ zip, country, province });
  } catch (err) {
    calculateError = err.message;
    rates = null;
  } finally {
    isCalculating = false;
  }
}
```

The polling happens inside the world script (`getShippingRates`), so from the content script's perspective it's a single async call that resolves when rates are available or rejects on timeout.

---

## Reactivity Considerations

### Svelte Reactivity

When `cart` is reassigned in App.svelte (`cart = await fn()`), Svelte automatically re-renders all child components that receive `cart` as a prop. No manual update mechanism needed.

### Stale State Prevention

After every mutation, the cart is refetched (either from the API response or via an explicit `getCart()` call). This ensures:
- Line item keys are always current
- Totals, discounts, and counts are accurate
- No stale state from optimistic updates

### Concurrent Mutation Prevention

While `isUpdating` is true, disable UI controls that trigger mutations. This prevents race conditions where two mutations fire simultaneously. Implementation:
- Pass `isUpdating` prop to tabs that have mutation controls
- Disable quantity steppers, remove buttons, save buttons, add button during updates
- The updating bar provides visual feedback

---

## Acceptance Criteria

- Opening Cart Superpowers fetches the real cart (no mock data)
- Loading state shown while cart is being fetched
- Error state shown if cart fetch fails (e.g., not a Shopify store)
- Retry button on error state re-fetches cart
- Quantity changes update the real cart via `/cart/change.js`
- Removing an item removes it from the real cart
- Properties changes update via `/cart/change.js` with properties payload
- Clear cart clears the real cart via `/cart/clear.js`
- Add item adds to the real cart via `/cart/add.js`
- Product URLs fetch real product data via `/{handle}.js`
- Note, attributes, and discount changes update via `/cart/update.js`
- Shipping rates are calculated via the prepare + poll endpoints
- All mutations show an updating indicator
- Errors from mutations are displayed to the user
- UI controls are disabled during mutations to prevent conflicts
- Cart state is always consistent with the server after mutations
- JSON tab always shows the current real cart data
