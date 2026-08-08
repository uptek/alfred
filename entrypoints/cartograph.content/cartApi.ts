import { createBridgeClient } from '~/utils/mainWorldBridge';
import type {
  CartData,
  AddItemPayload,
  UpdatePayload,
  ChangePayload,
  ShippingAddress,
  ShippingRate,
  ProductData
} from './types';

const SHIPPING_TIMEOUT_MS = 30_000;

type CartMethod =
  | 'getCart'
  | 'addItem'
  | 'updateCart'
  | 'changeItem'
  | 'clearCart'
  | 'getShippingRates'
  | 'getProductByUrl';

const cartBridge = createBridgeClient<CartMethod>('cart');

export async function getCart(): Promise<CartData> {
  return cartBridge.call<CartData>('getCart');
}

export async function addItem(payload: AddItemPayload): Promise<CartData> {
  return cartBridge.call<CartData>('addItem', payload);
}

export async function updateCart(updates: UpdatePayload): Promise<CartData> {
  return cartBridge.call<CartData>('updateCart', updates);
}

export async function changeItem(change: ChangePayload): Promise<CartData> {
  return cartBridge.call<CartData>('changeItem', change);
}

export async function clearCart(): Promise<CartData> {
  return cartBridge.call<CartData>('clearCart');
}

export async function getShippingRates(address: ShippingAddress): Promise<ShippingRate[]> {
  return cartBridge.call<ShippingRate[]>('getShippingRates', address, SHIPPING_TIMEOUT_MS);
}

export async function getProductByUrl(url: string): Promise<ProductData> {
  return cartBridge.call<ProductData>('getProductByUrl', url);
}
