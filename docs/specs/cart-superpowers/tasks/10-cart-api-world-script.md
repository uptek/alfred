# Task 10: Cart API World Script

**Phase**: 2 — Wiring
**Status**: ✅ Complete
**Files to create**:
- `entrypoints/cart-superpowers-world.ts`
**Depends on**: Task 01 (types)

## Objective

Create the unlisted main world script that provides all Shopify Cart Ajax API methods and handles postMessage RPC communication with the content script. This script runs in the page's main world (same-origin) so it has access to Shopify's session cookies. It is only injected when Cart Superpowers opens — never loaded globally.

## WXT Configuration

Use `defineUnlistedScript` (WXT pattern for scripts that are NOT auto-loaded but can be injected manually):

```typescript
export default defineUnlistedScript(() => {
  // Cart API methods + postMessage handler
});
```

This compiles to `cart-superpowers-world.js` which is listed in `web_accessible_resources` (added in Task 02) so `injectScript()` can load it.

## Cart API Methods

All methods live on `window.__alfredCartApi` to avoid conflicts with `window.Alfred`:

```typescript
interface CartApi {
  getCart(): Promise<CartData>;
  addItem(items: AddItemPayload | AddItemPayload[]): Promise<CartData>;
  updateCart(updates: UpdatePayload): Promise<CartData>;
  changeItem(change: ChangePayload): Promise<CartData>;
  clearCart(): Promise<CartData>;
  getShippingRates(address: ShippingAddress): Promise<ShippingRate[]>;
  getProductByUrl(url: string): Promise<ProductData>;
}
```

### Method Implementations

#### getCart()

```typescript
async function getCart(): Promise<CartData> {
  const res = await fetch('/cart.js');
  if (!res.ok) throw new Error(`Failed to fetch cart: ${res.status}`);
  return res.json();
}
```

#### addItem(items)

```typescript
async function addItem(items: AddItemPayload | AddItemPayload[]): Promise<CartData> {
  const payload = Array.isArray(items) ? { items } : { items: [items] };
  const res = await fetch('/cart/add.js', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const error = await res.json().catch(() => ({}));
    throw new Error(error.description || `Failed to add item: ${res.status}`);
  }
  // /cart/add.js returns the added items, not the full cart
  // Fetch the full cart to get consistent state
  return getCart();
}
```

**Note**: `/cart/add.js` returns the added item(s), not the full cart. We always fetch the full cart afterward to ensure consistent state. This is important because line item keys change when items are added.

#### updateCart(updates)

```typescript
async function updateCart(updates: UpdatePayload): Promise<CartData> {
  const res = await fetch('/cart/update.js', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(updates),
  });
  if (!res.ok) {
    const error = await res.json().catch(() => ({}));
    throw new Error(error.description || `Failed to update cart: ${res.status}`);
  }
  return res.json();
}
```

Handles: batch quantity updates (`updates` map), note changes, attribute changes, discount code application/removal.

#### changeItem(change)

```typescript
async function changeItem(change: ChangePayload): Promise<CartData> {
  const res = await fetch('/cart/change.js', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(change),
  });
  if (!res.ok) {
    const error = await res.json().catch(() => ({}));
    throw new Error(error.description || `Failed to change item: ${res.status}`);
  }
  return res.json();
}
```

**Important**: Always use `id: item.key` (the line item key), not `variant_id`. The key is the only reliable way to target a specific line item, especially when the same variant appears multiple times with different properties.

#### clearCart()

```typescript
async function clearCart(): Promise<CartData> {
  const res = await fetch('/cart/clear.js', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
  });
  if (!res.ok) throw new Error(`Failed to clear cart: ${res.status}`);
  return res.json();
}
```

#### getShippingRates(address)

```typescript
async function getShippingRates(address: ShippingAddress): Promise<ShippingRate[]> {
  // Step 1: Prepare shipping rates
  const params = new URLSearchParams({
    'shipping_address[zip]': address.zip,
    'shipping_address[country]': address.country,
    'shipping_address[province]': address.province,
  });

  const prepRes = await fetch(`/cart/prepare_shipping_rates.json?${params}`, {
    method: 'POST',
  });
  if (!prepRes.ok) throw new Error(`Failed to prepare shipping rates: ${prepRes.status}`);

  // Step 2: Poll for results (max 10 attempts, 500ms interval)
  const maxAttempts = 10;
  const pollInterval = 500;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    await new Promise((resolve) => setTimeout(resolve, pollInterval));

    const ratesRes = await fetch(`/cart/async_shipping_rates.json?${params}`);
    if (ratesRes.status === 202) continue; // Still calculating
    if (!ratesRes.ok) throw new Error(`Failed to fetch shipping rates: ${ratesRes.status}`);

    const data = await ratesRes.json();
    return data.shipping_rates || [];
  }

  throw new Error('Shipping rate calculation timed out');
}
```

**Polling pattern**: Shopify calculates shipping rates asynchronously. After preparing, we poll `async_shipping_rates.json`. A `202` response means "still calculating" — keep polling. A `200` response contains the rates. If we exceed 10 attempts (~5 seconds), we throw a timeout error.

#### getProductByUrl(url)

```typescript
async function getProductByUrl(url: string): Promise<ProductData> {
  // Extract pathname from full URL or treat as handle
  let pathname: string;
  try {
    const parsed = new URL(url, window.location.origin);
    pathname = parsed.pathname;
  } catch {
    // Assume it's a handle
    pathname = `/products/${url}`;
  }

  // Ensure it ends with .js
  if (!pathname.endsWith('.js')) {
    pathname = pathname.replace(/\/$/, '') + '.js';
  }

  const res = await fetch(pathname);
  if (!res.ok) throw new Error(`Failed to fetch product: ${res.status}`);

  const data = await res.json();
  return data.product || data;
}
```

Handles both full URLs (`https://store.myshopify.com/products/example`) and bare handles (`example`). Appends `.js` to get the JSON product endpoint.

## PostMessage RPC Handler

The world script listens for `alfred:cart_request` messages from the content script and dispatches to the appropriate cart API method:

```typescript
const methodMap: Record<string, (...args: any[]) => Promise<any>> = {
  getCart,
  addItem,
  updateCart,
  changeItem,
  clearCart,
  getShippingRates,
  getProductByUrl,
};

window.addEventListener('message', async (event) => {
  if (event.source !== window) return;
  if (event.data?.type !== 'alfred:cart_request') return;

  const { requestId, method, payload } = event.data;
  const handler = methodMap[method];

  if (!handler) {
    window.postMessage({
      type: 'alfred:cart_response',
      requestId,
      error: `Unknown method: ${method}`,
    });
    return;
  }

  try {
    const data = await handler(payload);
    window.postMessage({
      type: 'alfred:cart_response',
      requestId,
      data,
    });
  } catch (err) {
    window.postMessage({
      type: 'alfred:cart_response',
      requestId,
      error: err instanceof Error ? err.message : String(err),
    });
  }
});
```

### RPC Protocol

**Request** (content script → main world):
```typescript
{
  type: 'alfred:cart_request',
  requestId: string,   // unique ID for correlating response
  method: string,      // e.g., 'getCart', 'addItem'
  payload: any,        // method-specific arguments
}
```

**Response** (main world → content script):
```typescript
{
  type: 'alfred:cart_response',
  requestId: string,   // matches the request
  data?: any,          // success result
  error?: string,      // error message if failed
}
```

## Guard Against Double Init

```typescript
if ((window as any).__alfredCartApiInitialized) return;
(window as any).__alfredCartApiInitialized = true;
```

The script may be injected multiple times if the overlay is opened/closed/opened. Guard against registering duplicate message listeners.

## Error Handling

- All fetch calls check `res.ok` and throw descriptive errors
- Shopify error responses (like `/cart/add.js` returning 422) include a `description` field — use it for user-friendly messages
- The postMessage handler catches all errors and sends them as `error` in the response

## Type Safety

The world script needs the same types as the content script. Since it runs in a separate context:
- **Option A**: Duplicate the interface definitions inline (pragmatic, avoids import complexity)
- **Option B**: Import from `../cart-superpowers.content/types.ts` (may work since it's the same build)

Prefer Option B if the WXT build resolves it correctly. Fall back to Option A if not.

## Acceptance Criteria

- Script compiles as an unlisted WXT script
- `window.__alfredCartApi` is accessible in the main world after injection
- PostMessage listener responds to `alfred:cart_request` messages
- All 7 cart methods work with real Shopify endpoints
- `/cart/add.js` always follows up with `getCart()` for consistent state
- Shipping rates polling works with proper timeout
- Product URL parsing handles full URLs and bare handles
- Error responses include Shopify's `description` field when available
- Double injection doesn't create duplicate listeners
- Script does NOT run unless explicitly injected by `mount.ts`
