import { createBridgeClient } from '~/utils/mainWorldBridge';
import type {
  CartData,
  CartMethods,
  AddItemPayload,
  UpdatePayload,
  ChangePayload,
  ShippingAddress,
  ShippingRate,
  ProductData
} from './types';

const SHIPPING_TIMEOUT_MS = 30_000;

const cartBridge = createBridgeClient<CartMethods>('cart');

export async function getCart(): Promise<CartData> {
  return cartBridge.call('getCart');
}

export async function addItem(payload: AddItemPayload): Promise<CartData> {
  return cartBridge.call('addItem', payload);
}

export async function updateCart(updates: UpdatePayload): Promise<CartData> {
  return cartBridge.call('updateCart', updates);
}

export async function changeItem(change: ChangePayload): Promise<CartData> {
  return cartBridge.call('changeItem', change);
}

export async function clearCart(): Promise<CartData> {
  return cartBridge.call('clearCart');
}

export async function getShippingRates(address: ShippingAddress): Promise<ShippingRate[]> {
  return cartBridge.call('getShippingRates', address, SHIPPING_TIMEOUT_MS);
}

export async function getProductByUrl(url: string): Promise<ProductData> {
  return cartBridge.call('getProductByUrl', url);
}
