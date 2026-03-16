import type {
  CartData,
  AddItemPayload,
  UpdatePayload,
  ChangePayload,
  ShippingAddress,
  ShippingRate,
  ProductData,
} from './types';

const TIMEOUT_MS = 10_000;

function generateRequestId(): string {
  return `cart_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function callCartApi<T>(method: string, payload?: unknown): Promise<T> {
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
      payload,
    }, window.location.origin);
  });
}

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
