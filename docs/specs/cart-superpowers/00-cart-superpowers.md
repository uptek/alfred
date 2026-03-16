# Cart Superpowers - Implementation Plan

## Context

Alfred's existing cart features are limited to "Copy Cart JSON" and "Clear Cart" — both fire-and-forget actions. Shopify developers and theme builders need full cart control to test cart-dependent logic (shipping rules, discount behavior, line item properties, selling plans, etc.) without manually navigating the storefront. Cart Superpowers provides a dark, dev-tools-style overlay that exposes the **complete Shopify Cart Ajax API** through an editable GUI.

## Design Decisions

- **Trigger**: `?alfred=cart` URL parameter + context menu under Alfred > "Cart Superpowers"
- **UI Surface**: Full-page dark overlay (dismissable via X / Escape)
- **Visual Style**: Dark dev-tools aesthetic (rgb(26,26,26) bg, rgb(227,227,227) text, indigo accent)
- **Add Items**: Paste product/variant URL, fetch product data, pick variant, add to cart
- **Scope**: Full Cart Ajax API — items, properties, selling plans, note, attributes, discounts, shipping rates, raw JSON
- **UI Framework**: Svelte (not Preact) — this feature is fully isolated, so we use Svelte for smaller bundles, scoped styles without CSS Modules, and simpler reactivity. Rest of the extension remains Preact. WXT supports mixing frameworks across entrypoints.

## Architecture

### Isolation Principle

All Cart Superpowers code is **fully self-contained**. No modifications to `alfred-main-world.ts`, `global.d.ts`, or any existing extension files (except minimal integration points: context menu entry, settings toggle). All types, API logic, UI, and styles live within `cart-superpowers.content/`. Nothing loads until the feature is triggered.

### Communication Flow

Cart API calls must run in the **main world** (same-origin with Shopify so session cookies are included). The UI runs in a content script. A dedicated unlisted main world script (`cart-superpowers-world.ts`) is injected on-demand — separate from `alfred-main-world.ts`.

```
Trigger (?alfred=cart or context menu)
  └→ Content script (index.ts) — lightweight, always loaded
       └→ Dynamic import('./mount') — lazy loads Svelte bundle
            ├→ injectScript('/cart-superpowers-world.js') — injects cart API into main world
            └→ mount(App, { target }) — mounts Svelte overlay UI
                 └→ postMessage bridge ↔ cart-superpowers-world.js (main world)
```

**Protocol**: RPC-style request/response with `requestId` correlation:

- Request: `{ type: 'alfred:cart_request', requestId, method, payload }`
- Response: `{ type: 'alfred:cart_response', requestId, data, error? }`

The main world script (`cart-superpowers-world.ts`) exposes cart API methods on `window.__alfredCartApi` (namespaced to avoid conflicts with `window.Alfred`) and handles the postMessage listener. It is only injected when Cart Superpowers is opened.

### Cart Ajax API Endpoints Used

| Endpoint                            | Method | Purpose                                                          |
| ----------------------------------- | ------ | ---------------------------------------------------------------- |
| `/cart.js`                          | GET    | Fetch full cart state                                            |
| `/cart/add.js`                      | POST   | Add items (variant ID, qty, properties, selling_plan)            |
| `/cart/update.js`                   | POST   | Batch update quantities, note, attributes, discount codes        |
| `/cart/change.js`                   | POST   | Precise single line item changes (qty, properties, selling_plan) |
| `/cart/clear.js`                    | POST   | Clear all items                                                  |
| `/cart/prepare_shipping_rates.json` | POST   | Initiate shipping rate calculation                               |
| `/cart/async_shipping_rates.json`   | GET    | Poll for calculated shipping rates                               |
| `{product_url}.js`                  | GET    | Fetch product data for Add Items feature                         |

## File Structure

### New Files

```
entrypoints/
  cart-superpowers-world.ts    # Unlisted main world script — cart API fetch wrappers + postMessage handler
                               # Injected on-demand only when Cart Superpowers opens (NOT loaded globally)
  cart-superpowers.content/
    index.ts                   # Content script entry — URL detection, message listener, dynamic import
    mount.ts                   # Dynamic import target — injects world script, mounts Svelte app
    App.svelte                 # Root component — overlay shell, cart state, tab router, postMessage bridge
    types.ts                   # All types (CartData, CartItem, ProductData, etc.) — self-contained
    mock-data.ts               # Mock cart/product data for Phase 1 UI development
    components/
      ItemsTab.svelte          # Line items table with inline quantity editing, properties, remove
      AddItemTab.svelte        # Paste product URL -> variant picker -> add to cart
      MetadataTab.svelte       # Cart note, cart attributes, discount codes
      ShippingTab.svelte       # Shipping rate calculator (ZIP/country/province)
      JsonTab.svelte           # Raw JSON viewer with copy button
      KeyValueEditor.svelte    # Reusable key-value pair editor (used by Items, Metadata, Add)
      QuantityInput.svelte     # Reusable +/- quantity stepper
```

**No `App.module.css`** — Svelte components have scoped `<style>` blocks built-in. Shared design tokens (CSS custom properties) are defined in `App.svelte`'s style block on the overlay root element and inherited by child components.

### Modified Files (minimal — integration only)

| File                                                            | Change                                                                                |
| --------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| `wxt.config.ts`                                                 | Add `cart-superpowers-world.js` to `web_accessible_resources`, add Svelte Vite plugin |
| `package.json`                                                  | Add `svelte` and `@sveltejs/vite-plugin-svelte` as dev dependencies                   |
| `global.d.ts`                                                   | Add `cartSuperpowers?: boolean` to `AlfredSettings.shortcuts` (1 line)                |
| `entrypoints/background/shortcuts.ts`                           | Add "Cart Superpowers" context menu entry under the Cart separator                    |
| `entrypoints/options/components/settings/ShortcutsSettings.tsx` | Add toggle for Cart Superpowers shortcut                                              |
| `entrypoints/options/contexts/SettingsContext.tsx`              | Add `cartSuperpowers: true` default                                                   |

### NOT Modified (isolation boundary)

| File                               | Why unchanged                                                          |
| ---------------------------------- | ---------------------------------------------------------------------- |
| `entrypoints/alfred-main-world.ts` | Cart API lives in its own `cart-superpowers-world.ts`, not here        |
| `global.d.ts` (cart types)         | All cart types live in `cart-superpowers.content/types.ts`, not global |
| `entrypoints/main.content.ts`      | No bridge code added here; cart superpowers has its own content script |

## Implementation Phases

### Phase 1: UI Skeleton (Mock Data)

Build the complete visual interface with hardcoded mock data. No API calls, no postMessage bridge — just the UI components rendered with realistic fake cart data. This lets us iterate on layout, interactions, and visual polish before wiring anything.

**1.1 Types + mock data** in `cart-superpowers.content/types.ts` and `cart-superpowers.content/mock-data.ts`:

- Define all types: `CartData`, `CartItem`, `AddItemPayload`, `UpdatePayload`, `ChangePayload`, `ShippingAddress`, `ShippingRate`, `ProductData`
- Create a `MOCK_CART` constant with 3-4 realistic line items (varied images, properties, selling plans, discounts)
- Create a `MOCK_PRODUCT` constant for the Add Item tab preview

**1.2 Svelte setup**:

- Install `svelte` and `@sveltejs/vite-plugin-svelte` as dev dependencies
- Add Svelte plugin to `wxt.config.ts` Vite config (alongside existing Preact plugin — both coexist, each entrypoint uses one framework)

**1.3 Content script entry + overlay shell**:

- `cart-superpowers.content/index.ts` — content script with URL param detection (`?alfred=cart`), dynamic `import('./mount')`
- `cart-superpowers.content/mount.ts` — `createIntegratedUi` + Svelte `mount()`, follows `appstore-partners.content/index.tsx` pattern but uses Svelte mounting instead of Preact render
- `App.svelte` — overlay container, header bar (title + item count badge + close button), tab navigation, Escape key dismiss. Scoped `<style>` block with dark theme design tokens as CSS custom properties on the overlay root, fixed overlay (`position: fixed; inset: 0; z-index: 2147483647`), backdrop, style reset (`all: initial`)
- State: `let cart = MOCK_CART`, `let activeTab = 'items'` — Svelte reactive variables, no hooks needed

**1.4 Items tab** — the core experience:

- `ItemsTab.svelte` — table with columns: #, Image (40x40 thumbnail), Title/Variant, Quantity, Properties, Selling Plan, Price, Actions
- `QuantityInput.svelte` — +/- stepper with `bind:value`, dispatches `change` event
- Properties column: collapsed summary showing key count, expandable inline `KeyValueEditor`
- `KeyValueEditor.svelte` — `{#each}` over key-value rows with add/remove buttons, `bind:value` on inputs
- Remove button per row (trash icon)
- Footer: Clear cart button (left), total price formatted with currency (right)
- Empty state with `{#if}` when no items

**1.5 Add Item tab**:

- `AddItemTab.svelte` — URL input field + "Fetch" button
- On "fetch": show mock product preview (image, title, description)
- Variant `<select>` populated from mock product data
- Quantity input via `QuantityInput`
- Optional properties via `KeyValueEditor`
- Selling plan selector (`{#if}` shown only when mock product has selling plans)
- "Add to Cart" button

**1.6 Metadata tab**:

- `MetadataTab.svelte`:
- **Cart Note** section: `<textarea bind:value>` with mock note text
- **Cart Attributes** section: `KeyValueEditor` with 2-3 mock attributes
- **Discount Codes** section: input field + "Apply" button, `{#each}` list of applied mock discounts with remove (x) buttons

**1.7 Shipping tab**:

- `ShippingTab.svelte`:
- Country, province, ZIP text inputs with `bind:value`
- "Calculate Rates" button
- Mock results table: 2-3 shipping methods with name, price, delivery estimate

**1.8 JSON tab**:

- `JsonTab.svelte`:
- `<pre>` block with `JSON.stringify(cart, null, 2)` in monospace font
- "Copy to Clipboard" button (top-right)

### Phase 2: Wiring (Cart API + PostMessage Bridge)

Replace mock data with real Shopify Cart Ajax API calls. All cart API logic is self-contained — no modifications to `alfred-main-world.ts`.

**2.1 Create `entrypoints/cart-superpowers-world.ts`** (unlisted main world script):

- `defineUnlistedScript` — only injected by `mount.ts` when feature opens
- Exposes `window.__alfredCartApi` with all cart methods:
  - `getCart()` — `GET /cart.js`
  - `addItem(items)` — `POST /cart/add.js` with `Content-Type: application/json`
  - `updateCart(updates)` — `POST /cart/update.js` (quantities, note, attributes, discount)
  - `changeItem(change)` — `POST /cart/change.js` (single item: properties, selling_plan)
  - `clearCart()` — `POST /cart/clear.js`
  - `getShippingRates(address)` — POST prepare + poll async (max 10 attempts, 500ms interval)
  - `getProductByUrl(url)` — extract pathname, fetch `{path}.js`
- Listens for `alfred:cart_request` postMessages, dispatches to the appropriate method, sends `alfred:cart_response`
- Add `cart-superpowers-world.js` to `web_accessible_resources` in `wxt.config.ts`

**2.2 Update `mount.ts`** to inject the world script:

- Call `injectScript('/cart-superpowers-world.js')` before mounting Svelte app
- The world script is now available for postMessage communication

**2.3 Create `cartApi.ts`** utility module (in `cart-superpowers.content/`):

- Exports a `callCartApi(method, payload)` function wrapping the postMessage bridge (request/response with requestId correlation, 10s timeout)
- Exports typed wrappers: `getCart()`, `addItem()`, `updateCart()`, `changeItem()`, `clearCart()`, `getShippingRates()`, `getProductByUrl()`
- Plain TypeScript module — no framework dependency, importable from any Svelte component

**2.4 Wire `App.svelte`**:

- Replace `MOCK_CART` with `onMount` → `getCart()` call
- Reactive: `let cart`, `let isLoading = true`, `let isUpdating = false`, `let error = null`
- Every mutation returns updated cart → `cart = response` triggers Svelte reactivity
- Pass mutation callbacks to child tabs as props or use Svelte's `createEventDispatcher`
- **Important**: Always use `item.key` (not `variant_id`) for `changeItem` calls. Refetch cart after each mutation since keys can change.

**2.5 Wire all tabs** to use real API calls instead of mock state mutations

**2.5 Minimal integration touches**:

- `global.d.ts` — add `cartSuperpowers?: boolean` to `AlfredSettings.shortcuts` (1 line)

### Phase 3: Integration

**3.1 Context menu entry** in `shortcuts.ts`:

- Add under the Cart separator, after "Clear Cart"
- Uses `browser.tabs.sendMessage(tab.id!, { action: 'open_cart_superpowers' })`

**3.2 Settings** in options page:

- Add `cartSuperpowers` toggle to ShortcutsSettings under Cart category
- Add default `cartSuperpowers: true` in SettingsContext

**3.3 Analytics tracking**:

- Track: `cart_superpowers_open`, `cart_superpowers_add_item`, `cart_superpowers_update_quantity`, `cart_superpowers_clear`, `cart_superpowers_apply_discount`

## Key Patterns to Reuse

| Pattern                                              | Source File                                | Reuse For                                                                  |
| ---------------------------------------------------- | ------------------------------------------ | -------------------------------------------------------------------------- |
| Content script + `createIntegratedUi`                | `appstore-partners.content/index.tsx`      | Reference for content script mounting (adapt for Svelte instead of Preact) |
| Unlisted script + `injectScript()`                   | `alfred-main-world.ts` + `main.content.ts` | Reference pattern for `cart-superpowers-world.ts` injection                |
| PostMessage bridge (request/response with requestId) | `main.content.ts` lines 52-65              | Reference for the cart RPC protocol                                        |
| Context menu registration                            | `background/shortcuts.ts`                  | Adding "Cart Superpowers" entry                                            |
| `getItem<AlfredSettings>('settings')`                | `utils/storage.ts`                         | Checking if feature is enabled                                             |

### Svelte-specific notes

- **No CSS Modules** — use Svelte's built-in `<style>` scoping instead
- **No hooks** — use `let` for reactive state, `onMount` for lifecycle, `$:` for derived values
- **Mounting**: `mount(App, { target: container })` (Svelte 5) instead of Preact's `render(<App />, container)`
- **WXT coexistence**: The Svelte Vite plugin is added alongside the Preact plugin in `wxt.config.ts`. Vite routes `.svelte` files through the Svelte compiler and `.tsx` files through Preact — no conflicts.

## Verification

1. **URL trigger**: Navigate to any Shopify store, add `?alfred=cart` to URL → overlay opens, shows current cart
2. **Context menu trigger**: Right-click on any Shopify store → Alfred → Cart Superpowers → overlay opens
3. **Items tab**: Verify quantities can be edited inline, items can be removed, table reflects live cart state
4. **Add item**: Paste a product URL from the store → variant picker appears → add item → Items tab shows it
5. **Metadata tab**: Edit cart note, add/remove attributes, apply/remove discount codes
6. **Shipping tab**: Enter address → rates calculate and display
7. **JSON tab**: Shows formatted JSON, copy button works
8. **Non-Shopify**: On a non-Shopify site, API calls fail gracefully with error messages
9. **Settings**: Toggle Cart Superpowers off in settings → context menu entry disappears, URL param is ignored
10. **Close**: X button and Escape key dismiss the overlay cleanly
