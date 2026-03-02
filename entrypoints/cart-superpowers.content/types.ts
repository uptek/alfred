export interface CartData {
  token: string;
  note: string | null;
  attributes: Record<string, string>;
  original_total_price: number;
  total_price: number;
  total_discount: number;
  total_weight: number;
  item_count: number;
  items: CartItem[];
  requires_shipping: boolean;
  currency: string;
  items_subtotal_price: number;
  cart_level_discount_applications: DiscountApplication[];
  discount_codes: Array<{ code: string; amount: number; type: string }>;
}

export interface CartItem {
  id: number;
  key: string;
  properties: Record<string, string> | null;
  quantity: number;
  variant_id: number;
  product_id: number;
  title: string;
  product_title: string;
  product_description: string;
  product_type: string;
  vendor: string;
  variant_title: string | null;
  variant_options: string[];
  options_with_values: Array<{ name: string; value: string }>;
  sku: string;
  grams: number;
  taxable: boolean;
  requires_shipping: boolean;
  product_has_only_default_variant: boolean;
  gift_card: boolean;
  url: string;
  image: string;
  featured_image: {
    url: string;
    aspect_ratio: number;
    alt: string;
    height: number;
    width: number;
  } | null;
  handle: string;
  price: number;
  original_price: number;
  presentment_price: number;
  discounted_price: number;
  line_price: number;
  original_line_price: number;
  total_discount: number;
  discounts: Array<{ amount: number; title: string }>;
  final_price: number;
  final_line_price: number;
  line_level_discount_allocations: LineLevelDiscountAllocation[];
  line_level_total_discount: number;
  quantity_rule: {
    min: number;
    max: number | null;
    increment: number;
  };
  has_components: boolean;
  selling_plan_allocation: SellingPlanAllocation | null;
}

export interface LineLevelDiscountAllocation {
  amount: number;
  discount_application: DiscountApplication & {
    key: string;
    created_at: string;
    allocation_method: string;
  };
}

export interface SellingPlanAllocation {
  price: number;
  compare_at_price: number;
  per_delivery_price: number;
  price_adjustments: Array<{ position: number; price: number }>;
  selling_plan: {
    id: number;
    name: string;
    description: string | null;
    options: Array<{ name: string; position: number; value: string }>;
    recurring_deliveries: boolean;
    fixed_selling_plan: boolean;
    price_adjustments: Array<{
      order_count: number | null;
      position: number;
      value_type: string;
      value: number;
    }>;
  };
}

export interface DiscountApplication {
  type: string;
  title: string;
  description: string | null;
  value: string;
  value_type: string;
  total_allocated_amount: number;
  target_type: string;
  target_selection: string;
}

export interface AddItemPayload {
  id: number;
  quantity: number;
  properties?: Record<string, string>;
  selling_plan?: number;
}

export interface UpdatePayload {
  updates?: Record<string, number>;
  note?: string;
  attributes?: Record<string, string>;
  discount?: string;
}

export interface ChangePayload {
  id?: string;
  line?: number;
  quantity: number;
  properties?: Record<string, string>;
  selling_plan?: number | null;
}

export interface ShippingAddress {
  zip: string;
  country: string;
  province: string;
}

export interface ShippingRate {
  name: string;
  code: string;
  price: string;
  source: string;
  delivery_date: string | null;
  delivery_days: number | null;
}

export interface ProductData {
  id: number;
  title: string;
  handle: string;
  description: string;
  vendor: string;
  type: string;
  tags: string[];
  images: string[];
  variants: ProductVariant[];
  options: Array<{ name: string; position: number; values: string[] }>;
  selling_plan_groups: SellingPlanGroup[];
}

export interface ProductVariant {
  id: number;
  title: string;
  option1: string | null;
  option2: string | null;
  option3: string | null;
  price: number;
  compare_at_price: number | null;
  available: boolean;
  sku: string;
  requires_shipping: boolean;
  taxable: boolean;
  featured_image: {
    id: number;
    product_id: number;
    position: number;
    alt: string | null;
    width: number;
    height: number;
    src: string;
    variant_ids: number[];
  } | null;
  requires_selling_plan: boolean;
  selling_plan_allocations: VariantSellingPlanAllocation[];
  quantity_rule: { min: number; max: number | null; increment: number };
}

export interface VariantSellingPlanAllocation {
  price_adjustments: Array<{ position: number; price: number }>;
  price: number;
  compare_at_price: number;
  per_delivery_price: number;
  selling_plan_id: number;
  selling_plan_group_id: string;
}

export interface SellingPlanGroup {
  id: string;
  name: string;
  options: Array<{ name: string; position: number; values: string[] }>;
  selling_plans: Array<{
    id: number;
    name: string;
    description: string | null;
    options: Array<{ name: string; position: number; value: string }>;
    recurring_deliveries: boolean;
    price_adjustments: Array<{
      order_count: number | null;
      position: number;
      value_type: string;
      value: number;
    }>;
  }>;
  app_id?: string;
}

export type TabId = 'items' | 'add' | 'metadata' | 'shipping' | 'json';
