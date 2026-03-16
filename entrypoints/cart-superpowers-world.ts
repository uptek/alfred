import type {
  AddItemPayload,
  UpdatePayload,
  ChangePayload,
  ShippingAddress,
  ShippingRate,
  CartData,
  ProductData,
} from './cart-superpowers.content/types';

export default defineUnlistedScript(() => {
  if ((window as any).__alfredCartApiInitialized) return;
  (window as any).__alfredCartApiInitialized = true;

  async function getCart(): Promise<CartData> {
    const res = await fetch('/cart.js');
    if (!res.ok) throw new Error(`Failed to fetch cart: ${res.status}`);
    return res.json();
  }

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
    // /cart/add.js returns added items, not full cart — refetch for consistent state
    return getCart();
  }

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

  async function clearCart(): Promise<CartData> {
    const res = await fetch('/cart/clear.js', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    });
    if (!res.ok) throw new Error(`Failed to clear cart: ${res.status}`);
    return res.json();
  }

  async function getShippingRates(address: ShippingAddress): Promise<ShippingRate[]> {
    const params = new URLSearchParams({
      'shipping_address[zip]': address.zip,
      'shipping_address[country]': address.country,
      'shipping_address[province]': address.province,
    });

    const prepRes = await fetch(`/cart/prepare_shipping_rates.json?${params}`, {
      method: 'POST',
    });
    if (!prepRes.ok) throw new Error(`Failed to prepare shipping rates: ${prepRes.status}`);

    const maxAttempts = 10;
    const pollInterval = 500;

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      await new Promise((resolve) => setTimeout(resolve, pollInterval));

      const ratesRes = await fetch(`/cart/async_shipping_rates.json?${params}`);
      if (ratesRes.status === 202) continue;
      if (!ratesRes.ok) throw new Error(`Failed to fetch shipping rates: ${ratesRes.status}`);

      const data = await ratesRes.json();
      return data.shipping_rates || [];
    }

    throw new Error('Shipping rate calculation timed out');
  }

  async function getProductByUrl(url: string): Promise<ProductData> {
    let pathname: string;

    // If it looks like a URL (contains / or .), parse it; otherwise treat as a plain handle
    if (url.includes('/') || url.includes('.')) {
      const parsed = new URL(url, window.location.origin);
      pathname = parsed.pathname;
    } else {
      pathname = `/products/${url}`;
    }

    if (!pathname.endsWith('.js')) {
      pathname = pathname.replace(/\/$/, '') + '.js';
    }

    const res = await fetch(pathname);
    if (!res.ok) throw new Error(`Failed to fetch product: ${res.status}`);

    const data = await res.json();
    return data.product || data;
  }

  const methodMap: Record<string, (payload: any) => Promise<any>> = {
    getCart: () => getCart(),
    addItem: (payload) => addItem(payload),
    updateCart: (payload) => updateCart(payload),
    changeItem: (payload) => changeItem(payload),
    clearCart: () => clearCart(),
    getShippingRates: (payload) => getShippingRates(payload),
    getProductByUrl: (payload) => getProductByUrl(payload),
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
      }, window.location.origin);
      return;
    }

    try {
      const data = await handler(payload);
      window.postMessage({
        type: 'alfred:cart_response',
        requestId,
        data,
      }, window.location.origin);
    } catch (err) {
      window.postMessage({
        type: 'alfred:cart_response',
        requestId,
        error: err instanceof Error ? err.message : String(err),
      }, window.location.origin);
    }
  });
});
