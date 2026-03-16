# Task 11: Cart API Bridge (Content Script Side)

**Phase**: 2 — Wiring
**Status**: ✅ Complete
**Files to create**:

- `entrypoints/cart-superpowers.content/cartApi.ts`
  **Files to modify**:
- `entrypoints/cart-superpowers.content/mount.ts` (inject world script)
  **Depends on**: Task 03 (mount.ts), Task 10 (world script)

## Objective

Create the content-script-side API client that communicates with the main world script via postMessage. This module wraps the RPC protocol into clean, typed, Promise-based functions that Svelte components can call directly.

## cartApi.ts

A plain TypeScript module — no framework dependency. Importable from any Svelte component or from `App.svelte`.

### Core RPC Function

```typescript
import type {
  CartData,
  AddItemPayload,
  UpdatePayload,
  ChangePayload,
  ShippingAddress,
  ShippingRate,
  ProductData
} from './types';

const TIMEOUT_MS = 10_000;

function generateRequestId(): string {
  return `cart_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function callCartApi<T>(method: string, payload?: any): Promise<T> {
  return new Promise((resolve, reject) => {
    const requestId = generateRequestId();
    let timeoutId: ReturnType<typeof setTimeout>;

    function handler(event: MessageEvent) {
      if (event.source !== window) return;
      if (event.data?.type !== 'alfred:cart_response') return;
      if (event.data.requestId !== requestId) return;

      window.removeEventListener('message', handler);
      clearTimeout(timeoutId);

      if (event.data.error) {
        reject(new Error(event.data.error));
      } else {
        resolve(event.data.data as T);
      }
    }

    window.addEventListener('message', handler);

    timeoutId = setTimeout(() => {
      window.removeEventListener('message', handler);
      reject(new Error(`Cart API timeout: ${method} did not respond within ${TIMEOUT_MS}ms`));
    }, TIMEOUT_MS);

    window.postMessage({
      type: 'alfred:cart_request',
      requestId,
      method,
      payload
    });
  });
}
```

### Typed API Functions

```typescript
export async function getCart(): Promise<CartData> {
  return callCartApi<CartData>('getCart');
}

export async function addItem(payload: AddItemPayload): Promise<CartData> {
  return callCartApi<CartData>('addItem', payload);
}

export async function updateCart(updates: UpdatePayload): Promise<CartData> {
  return callCartApi<CartData>('updateCart', updates);
}

export async function changeItem(change: ChangePayload): Promise<CartData> {
  return callCartApi<CartData>('changeItem', change);
}

export async function clearCart(): Promise<CartData> {
  return callCartApi<CartData>('clearCart');
}

export async function getShippingRates(address: ShippingAddress): Promise<ShippingRate[]> {
  return callCartApi<ShippingRate[]>('getShippingRates', address);
}

export async function getProductByUrl(url: string): Promise<ProductData> {
  return callCartApi<ProductData>('getProductByUrl', url);
}
```

Each function:

1. Sends a postMessage request with a unique `requestId`
2. Waits for the matching response
3. Returns the data or throws an error
4. Times out after 10 seconds

## mount.ts Modifications

Update `mount.ts` to inject the world script before mounting the Svelte app:

```typescript
import { injectScript } from '#imports'; // WXT auto-import

export async function mountCartSuperpowers(ctx: any, onClose: () => void) {
  // Inject cart API world script into the main world
  await injectScript('/cart-superpowers-world.js', { keepInDom: true });

  // Then create and mount the Svelte UI
  // ... existing createIntegratedUi + mount logic
}
```

**Key**: The world script must be injected BEFORE the Svelte app mounts, because `App.svelte`'s `onMount` will immediately call `getCart()` which needs the postMessage handler to be ready.

### `injectScript` usage

WXT provides `injectScript()` which creates a `<script>` tag pointing to the script URL (resolved from `web_accessible_resources`). The `keepInDom: true` option prevents WXT from removing the script tag after injection (some scripts need to persist).

**Alternative**: If `injectScript` doesn't work well for unlisted scripts, use:

```typescript
const script = document.createElement('script');
script.src = browser.runtime.getURL('/cart-superpowers-world.js');
document.documentElement.appendChild(script);
await new Promise((resolve) => script.addEventListener('load', resolve));
```

## Error Handling Patterns

### Timeout

If the world script is not injected or not responding, `callCartApi` times out after 10 seconds with a descriptive error. This prevents the UI from hanging indefinitely.

### Shopify Errors

Shopify Cart Ajax API errors (e.g., invalid variant, out of stock) return HTTP 422 with a JSON body containing `description`. The world script extracts this message, and `cartApi.ts` surfaces it as the Error message.

### Non-Shopify Sites

If the page is not a Shopify store, cart API calls will return 404 errors. The UI should handle these gracefully — show an error message like "This doesn't appear to be a Shopify store" rather than crashing.

## Acceptance Criteria

- `callCartApi` sends postMessage request and resolves/rejects based on response
- Each typed wrapper function passes correct method name and payload
- Requests time out after 10 seconds with descriptive error
- Duplicate requestIds don't interfere (each uses unique ID)
- `mount.ts` injects world script before Svelte app mounts
- World script injection waits for load before proceeding
- Functions can be imported and used from any Svelte component
- Module has no Svelte dependency — it's pure TypeScript
