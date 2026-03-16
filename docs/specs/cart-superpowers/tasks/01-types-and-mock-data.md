# Task 01: Types and Mock Data

**Phase**: 1 — UI Skeleton
**Status**: ✅ Complete
**Files to create**:

- `entrypoints/cart-superpowers.content/types.ts`
- `entrypoints/cart-superpowers.content/mock-data.ts`

## Objective

Define all TypeScript types for the Cart Superpowers feature and create realistic mock data that will be used to develop and test the UI before wiring to real APIs.

## Types to Define (`types.ts`)

### CartData

The full cart object returned by `GET /cart.js`:

```typescript
interface CartData {
  token: string;
  note: string | null;
  attributes: Record<string, string>;
  original_total_price: number; // in subunits (cents)
  total_price: number; // in subunits
  total_discount: number; // in subunits
  total_weight: number; // in grams
  item_count: number;
  items: CartItem[];
  requires_shipping: boolean;
  currency: string; // ISO 4217 (e.g., "USD")
  items_subtotal_price: number; // in subunits
  cart_level_discount_applications: DiscountApplication[];
}
```

### CartItem

A single line item in the cart:

```typescript
interface CartItem {
  id: number; // variant ID
  key: string; // line item key (variant_id:hash) — use this for change/update
  properties: Record<string, string> | null;
  quantity: number;
  variant_id: number;
  product_id: number;
  title: string; // "Product Title - Variant Title"
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
  gift_card: boolean;
  url: string; // product page URL
  image: string; // image URL
  featured_image: {
    url: string;
    aspect_ratio: number;
    alt: string;
  } | null;
  handle: string;
  price: number; // unit price in subunits
  original_price: number;
  discounted_price: number;
  line_price: number; // quantity * price
  original_line_price: number;
  total_discount: number;
  discounts: Array<{ amount: number; title: string }>;
  selling_plan_allocation: SellingPlanAllocation | null;
}
```

### SellingPlanAllocation

```typescript
interface SellingPlanAllocation {
  price: number;
  compare_at_price: number;
  per_delivery_price: number;
  selling_plan: {
    id: number;
    name: string;
    description: string;
    options: Array<{ name: string; position: number; value: string }>;
    recurring_deliveries: boolean;
  };
}
```

### DiscountApplication

```typescript
interface DiscountApplication {
  type: string;
  title: string;
  description: string | null;
  value: string;
  value_type: string;
  total_allocated_amount: number;
  target_type: string;
  target_selection: string;
}
```

### API Payloads

```typescript
interface AddItemPayload {
  id: number; // variant_id
  quantity: number;
  properties?: Record<string, string>;
  selling_plan?: number;
}

interface UpdatePayload {
  updates?: Record<string, number>; // key -> quantity
  note?: string;
  attributes?: Record<string, string>;
  discount?: string; // code or "" to clear
}

interface ChangePayload {
  id?: string; // line item key (preferred)
  line?: number; // 1-based index (alternative)
  quantity: number;
  properties?: Record<string, string>;
  selling_plan?: number | null;
}
```

### Shipping Types

```typescript
interface ShippingAddress {
  zip: string;
  country: string;
  province: string;
}

interface ShippingRate {
  name: string;
  code: string;
  price: string; // formatted price string
  source: string;
  delivery_date: string | null;
  delivery_days: number | null;
}
```

### Product Data (for Add Item)

```typescript
interface ProductData {
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

interface ProductVariant {
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
  featured_image: { url: string } | null;
}

interface SellingPlanGroup {
  id: string;
  name: string;
  options: Array<{ name: string; values: string[] }>;
  selling_plans: Array<{
    id: number;
    name: string;
    description: string;
    price_adjustments: Array<{ value: number; value_type: string }>;
  }>;
}
```

### Tab ID

```typescript
type TabId = 'items' | 'add' | 'metadata' | 'shipping' | 'json';
```

## Mock Data (`mock-data.ts`)

### MOCK_CART

Create a `CartData` object with:

- `token`: any string
- `note`: `"Please gift wrap the blue t-shirt"`
- `attributes`: `{ "Gift wrap": "Yes", "Delivery instructions": "Leave at door" }`
- `currency`: `"USD"`
- `total_price`: sum of line items
- `item_count`: sum of quantities
- 4 line items covering different scenarios:

**Item 1 — Simple product, no properties**:

- T-Shirt, Blue / Medium, quantity 2, $29.99 each
- Image: use `https://cdn.shopify.com/s/files/1/0533/2089/files/placeholder-images-product-1_large.png`
- No properties, no selling plan, no discounts

**Item 2 — Product with line item properties**:

- Custom Engraved Bracelet, Gold, quantity 1, $49.99
- Properties: `{ "Engraving": "To my love", "Font": "Script" }`
- No selling plan

**Item 3 — Product with selling plan (subscription)**:

- Organic Coffee Beans, 1kg, quantity 1, $24.99
- Selling plan: monthly delivery, save 15%
- `selling_plan_allocation` with plan name "Deliver every month — save 15%"

**Item 4 — Product with discount applied**:

- Wireless Headphones, Black, quantity 1, $89.99, discounted to $71.99
- `total_discount`: 1800 (i.e., $18.00)
- `discounts`: `[{ amount: 1800, title: "SUMMER20" }]`

Set `cart_level_discount_applications` to include `SUMMER20` discount.

### MOCK_PRODUCT

Create a `ProductData` object for testing the Add Item tab:

- Title: "Classic Leather Wallet"
- 3 variants: Brown/$39.99/available, Black/$39.99/available, Tan/$44.99/out of stock
- 2 options: Color (Brown, Black, Tan)
- 1 selling plan group: "Subscribe & Save" with monthly plan
- 2 product images

### MOCK_SHIPPING_RATES

```typescript
const MOCK_SHIPPING_RATES: ShippingRate[] = [
  {
    name: 'Standard Shipping',
    code: 'standard',
    price: '5.99',
    source: 'shopify',
    delivery_date: null,
    delivery_days: 7
  },
  {
    name: 'Express Shipping',
    code: 'express',
    price: '12.99',
    source: 'shopify',
    delivery_date: null,
    delivery_days: 3
  },
  { name: 'Overnight', code: 'overnight', price: '24.99', source: 'shopify', delivery_date: null, delivery_days: 1 }
];
```

## Acceptance Criteria

- All types are exported and importable from `types.ts`
- Mock data is exported and importable from `mock-data.ts`
- Mock data is realistic — varied scenarios (properties, selling plans, discounts, out-of-stock variants)
- Prices are in subunits (cents) to match Shopify's API format
- `MOCK_CART` totals are mathematically consistent (total_price = sum of line_prices - total_discount)
- No dependencies on any existing Alfred code — fully self-contained
