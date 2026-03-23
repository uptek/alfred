# TODOS

## Cartograph

### Cart Permalinks / Checkout Links
**Priority:** P2

Generate shareable URLs that recreate a specific cart state — items, quantities, variants, properties, selling plans, discount codes, and note. A dev building a checkout flow could snapshot their test cart and share the link with a teammate, paste it into a bug report, or bookmark it for repeated testing.

Shopify's `/cart/<variant_id>:<qty>,<variant_id>:<qty>` permalink format supports items and quantities natively. Properties, selling plans, discount codes, and cart attributes would need to be applied via Cart Ajax API calls after the permalink loads.

**Scope:**
- "Copy Cart Permalink" button in the JSON tab or header
- Build the `/cart/variant:qty,...` URL from current cart state
- For properties/attributes/discounts/note: generate a `?alfred=cart&restore=<encoded>` URL that Cartograph auto-applies on open
- Handle edge cases: 50+ items (URL length limits), unavailable variants, expired discounts

**Context:**
- Shopify cart permalink docs: `https://{store}.myshopify.com/cart/{variant_id}:{quantity},{variant_id}:{quantity}`
- The existing `?alfred=cart` URL param already triggers Cartograph — could extend with a `restore` param
- Similar pattern to collaborator-access hotlinks (`?alfred_preset=<handle>`)

### Cart Snapshots
**Priority:** P2

Save and restore named cart states within Cartograph. A dev testing checkout flows often needs to switch between specific cart configurations — "empty cart," "3 items with discount," "subscription + one-time mix," etc. Today they manually rebuild the cart every time.

Cart snapshots let you name the current cart state, save it to extension storage, and restore it with one click. Think of it like browser bookmarks but for cart configurations.

**Scope:**
- "Save Snapshot" button in the Cartograph header or a dedicated Snapshots tab
- Name the snapshot (auto-suggest from cart contents, e.g. "3 items, $47.50")
- Store snapshots per-store domain in `browser.storage.local`
- "Restore" replaces the current cart by clearing it and re-adding all items via Cart Ajax API
- List/rename/delete saved snapshots
- Snapshot includes: items (variant IDs, quantities, properties, selling plans), discount codes, note, attributes

**Context:**
- Differs from Cart Permalinks: snapshots are local to the extension (private, per-device), permalinks are shareable URLs
- Restoration uses the same Cart Ajax API calls Cartograph already has (`clearCart` → `addItem` for each item → `updateCart` for note/attributes/discount)
- Could share the `restore` encoding format with Cart Permalinks for import/export interop
- Edge cases: variant no longer exists, product unpublished, selling plan expired — show error per-item, restore what's possible

### JSON Explorer (JSON Tab upgrade)
**Priority:** P2

Replace the read-only JSON dump with an interactive query console. Type a dot-path expression like `cart.items[0].properties` and instantly see that slice of the cart object. Autocomplete suggests available keys as you type.

Think of it as a mini DevTools console, but scoped to the cart object and with zero learning curve — you just type a path and see the result.

**Behavior:**
- Input field at the top of the JSON tab with placeholder: `Type a path... e.g. items[0].title`
- The root object is `cart`, but the `cart.` prefix is optional (typing `items` is the same as `cart.items`)
- As the user types, a dropdown shows available properties at the current depth:
  - Type `items[0].` → dropdown shows: `id`, `key`, `title`, `variant_id`, `quantity`, `price`, `properties`, `selling_plan_allocation`, ...
  - Type `dis` → dropdown shows: `discount_codes`, `discounts` (fuzzy match)
- Press Enter or select from dropdown → the JSON view below filters to show only that subtree
- Array results show count badge: `items (3 results)`
- Clear button / Escape returns to full cart view
- Copy button copies the current filtered result (not the full cart)

**Implementation approach:**
- Parse the path expression into segments: split on `.` and `[n]`
- Walk the cart object using `reduce()` over segments
- For autocomplete: at each depth, `Object.keys()` of the current node (or array indices if array)
- Fuzzy matching on the last segment for the dropdown
- No eval, no `new Function()` — pure path traversal for security
- Svelte reactive: `$derived` from the path input + cart object

**Scope:**
- Replace current JSON tab's static `<pre>` with: query input + filtered JSON view + full JSON fallback
- Support dot notation (`items.0.title`), bracket notation (`items[0].title`), and mixed
- Support array expressions: `items` returns the full array, `items[0]` returns first item, `items.length` returns count
- Error state: invalid path shows "No match" with the last valid result still visible
- History: up/down arrows cycle through recent queries (stored in component state, not persisted)

**Context:**
- Current JsonTab.svelte is ~40 lines — this replaces it with ~150-200 lines
- No external dependencies needed — autocomplete is a simple filtered list, not a full editor
- The cart object is already available as a prop — no new API calls
- Similar UX to browser DevTools console autocomplete or jq playground

**Examples of supported expressions:**
```
items                              → full items array
items[0]                           → first item object
items[0].title                     → "Classic T-Shirt"
items[0].properties                → { "Size": "L", "Color": "Blue" }
discount_codes                     → [{ code: "SAVE10", amount: 1000, ... }]
total_price                        → 4750
items.length                       → 3
attributes                         → { "gift_wrap": "true" }
items[0].selling_plan_allocation   → { selling_plan: { ... }, ... }
```

### Product Search in Add Item Tab (Storefront API)
**Priority:** P2

Replace the current "paste a product URL" workflow in the Add Item tab with a live product search. Type a product name, get instant results from the store's Storefront API, select a product, pick a variant, add to cart.

Currently, adding an item requires knowing the product URL or handle upfront. With Storefront API search, you can type "t-shirt" and browse matching products without leaving Cartograph.

**Behavior:**
- Search input replaces (or sits above) the current URL input
- Debounced search (300ms) queries the Storefront API Predictive Search endpoint
- Results show: product image thumbnail, title, price range, variant count
- Click a result → loads the product (same flow as current URL-based fetch)
- Falls back to URL/handle input if Storefront API is unavailable (headless stores, password-protected stores)

**Implementation approach:**
- Use Shopify's Predictive Search API: `GET /search/suggest.json?q={query}&resources[type]=product&resources[limit]=10`
  - This is a public, unauthenticated endpoint available on all Shopify storefronts
  - Returns product titles, handles, images, prices — no API key needed
  - Runs from the main world script (same pattern as existing cart API calls)
- Alternative: Storefront API GraphQL (`/api/{version}/graphql.json`) with the `products` query
  - Requires a Storefront Access Token (available in theme's `<meta>` tag on most stores)
  - More powerful (filters, sorting, metafields) but more complex setup
  - Could extract the token from `meta[name="shopify-storefront-api-token"]` on the page

**Scope:**
- New search input component in AddItemTab with debounced query
- New `searchProducts(query)` method in the cart API bridge (main world)
- Results dropdown with product cards (image, title, price)
- Click result → `onFetchProduct(handle)` (existing flow takes over for variant selection)
- Keep the URL input as a secondary option ("Or paste a product URL")
- Handle empty results, loading state, and API errors gracefully

**Context:**
- Predictive Search is the simplest path — zero auth, works on every store, ~50 lines of new code
- The Storefront API GraphQL route is more powerful but requires extracting the access token from the page DOM
- Could start with Predictive Search and add GraphQL as a v2 enhancement
- The `getProductByUrl()` bridge method already exists — search just feeds handles into it
- MCP integration: if the Shopify Storefront MCP server is available, could use it for richer queries (collections, metafields, inventory levels) — but the extension should work standalone without MCP

## Storefront Inspector

### Metafield Inspector
**Priority:** P1

See all metafields for any resource right on the storefront page. On a product page, right-click > "Inspect Metafields" opens an overlay showing every metafield (namespace, key, type, value) in a clean, searchable table.

Works for products, collections, pages, and shop-level metafields. Uses the Storefront API (publicly accessible) or falls back to the store's `/products/{handle}.json` endpoint which includes metafields exposed to the Storefront API.

**Scope:**
- Right-click > Alfred > Inspect Metafields (or a button in the Cartograph-style overlay)
- Auto-detect resource type from the current URL (product, collection, page, blog/article)
- Table with columns: namespace, key, type, value (truncated with expand)
- Copy individual values, copy all as JSON
- Search/filter by namespace or key
- For shop-level metafields: accessible from any storefront page

**Context:**
- Shopify's Storefront API exposes metafields that the merchant has explicitly made visible — this is the publicly queryable set
- Admin API metafields (private namespaces) require authentication and are out of scope for a content script
- Could reuse the Cartograph overlay pattern (shadow DOM, postMessage bridge to main world)
- The main-world script can query `/products/{handle}.json` which includes visible metafields without any API key

### Liquid X-Ray
**Priority:** P2

Toggle overlay that shows which Liquid template, section, or snippet rendered each part of the page. Like the browser's "Inspect Element" but for the Liquid layer — shows `sections/header.liquid`, `snippets/product-card.liquid`, etc. instead of DOM elements.

Click any overlay label to open that file directly in the theme code editor (reuses the existing "Open Section in Code Editor" pattern).

**Scope:**
- Toggle button in Alfred's context menu or keyboard shortcut
- Parse Shopify's section rendering comments (`<!-- BEGIN section__header -->`) to map DOM regions to Liquid files
- Overlay colored borders + filename labels on each section boundary
- Click-to-open-in-editor for each identified section/snippet
- Nested depth indicator (section > block > snippet)

**Context:**
- Shopify injects HTML comments marking section boundaries in development/preview mode — these are the primary data source
- Shopify's built-in theme inspector does something similar but is unreliable and resets on navigation
- This overlaps with "Open Section in Code Editor" but extends it to show ALL sections at once, not just the right-clicked one
- Challenge: snippet-level granularity depends on theme developer adding comments — section-level is reliable

### Store Health Check
**Priority:** P2

One-click storefront performance audit from the popup or context menu. Runs Shopify-specific checks: Core Web Vitals (LCP, CLS, INP), total page weight, render-blocking scripts, image optimization gaps, third-party script count and impact, unused CSS/JS.

Outputs a clean scorecard — not a generic Lighthouse dump, but a Shopify-aware report that flags known slow apps, heavy theme patterns, and actionable fixes.

**Scope:**
- "Health Check" button in the popup alongside theme detection
- Measure page load metrics using Performance API and PerformanceObserver
- Count and size all loaded scripts, stylesheets, images, fonts
- Flag known heavy Shopify apps by script domain patterns
- Flag common performance anti-patterns (inline CSS > 50KB, render-blocking scripts in head, unoptimized images)
- Output: score (0-100), categorized findings, one-line fix suggestions
- Copy report as markdown

**Context:**
- PerformanceObserver and Resource Timing API are available from content scripts
- CrUX data (field data) requires an API key — out of scope for v1, but could add later
- This is lab data (current page load), not field data (real user metrics)
- Could store historical scores per-store for trend tracking

## Product Tools

### Product Matrix
**Priority:** P3

Visualize all variant combinations for a product in a grid. Rows and columns map to option axes (e.g., Color vs Size). Each cell shows: availability (green/red/gray), price, inventory count, and whether the variant has an image.

Instantly reveals which variant combinations are missing, out of stock, or lacking images — gaps that are tedious to find in the admin.

**Scope:**
- Available on product pages via context menu or keyboard shortcut
- Fetch product data from `/products/{handle}.js` (already done in Cartograph's AddItemTab)
- Render a 2D grid for products with 2 options; list view for 1 or 3 options
- Color coding: green (available), red (out of stock), gray (doesn't exist in Shopify)
- Click a cell to copy variant ID
- Summary: total variants, available count, missing images count
- Reuse Cartograph's overlay pattern (shadow DOM, Svelte)

**Context:**
- Shopify's product JSON includes all variants with `available`, `price`, `featured_image`, and option values
- Products can have 1-3 options with up to 100 variants total
- For 3-option products, render as nested tables or a filterable list
- Could extend to link directly to the variant editor in admin

### Collection Inspector
**Priority:** P4

On a collection page, show the collection's sort order, product count, active filters, and whether it's automatic or manual. Surface which products are included and help debug "why doesn't this product appear in this collection."

**Scope:**
- Available on collection pages via context menu
- Fetch collection data from `/collections/{handle}.json` (if available) or parse the page DOM
- Show: title, sort order (manual/best-selling/alphabetical/etc.), product count, type (automatic rules vs manual)
- List current filters applied via URL params
- Link to collection editor in admin

**Context:**
- Collection JSON is publicly available on most themes at `/collections/{handle}.json`
- Automatic collection rules are only visible in the admin — this feature shows what's observable from the storefront
- Simpler than Metafield Inspector — mostly a structured view of existing public data

## Developer Tools

### Script Injector
**Priority:** P2

Mini code editor overlay for injecting custom JS or CSS on any storefront page. Write a snippet, click "Apply" — it runs immediately. Save named snippets per-store that auto-run on matching URLs.

Like a persistent DevTools console that survives page reloads. Use cases: "hide announcement bar for testing," "log all fetch requests," "force mobile nav breakpoint," "inject custom analytics."

**Scope:**
- Overlay with a code editor (textarea with monospace font, syntax highlighting optional)
- Two modes: JS and CSS
- "Apply" runs the snippet on the current page (JS via script injection, CSS via style tag)
- "Save" stores the snippet with a name, URL pattern (exact/contains/regex), and auto-run toggle
- Snippets stored per-store domain in extension storage
- Snippet manager: list, edit, delete, toggle auto-run
- Import/export snippets as JSON

**Context:**
- JS injection uses the same main-world script pattern as Cartograph (script tag injection)
- CSS injection can be done via shadow DOM or page-level style tag
- Security: snippets are user-authored and run with page-level permissions — same trust model as DevTools console
- Auto-run snippets need a content script that checks URL patterns on page load
- Similar to Tampermonkey/Greasemonkey but scoped to Shopify stores and integrated into Alfred

### Quick Notes
**Priority:** P3

Floating sticky notes attached to a store domain. When you visit a store, your notes for that domain appear in the popup or a small overlay. "This store uses Dawn 12.0," "Client contact: Sarah," "Custom metafield namespace: acme."

**Scope:**
- Notes section in the popup, below theme detection
- Add/edit/delete notes per store domain
- Notes stored in extension storage, keyed by domain
- Optional: pin a note to show as a small floating badge on the storefront
- Optional: rich text or markdown support
- Sync across devices via `browser.storage.sync` (limited to 100KB total)

**Context:**
- Simple feature with high everyday value for agency devs managing 10+ stores
- `browser.storage.sync` allows cross-device syncing within Chrome's 100KB sync limit
- Could group notes by client/project with tags
- Minimal implementation: textarea in popup, 50 lines of code

### Redirect Mapper
**Priority:** P4

Visualize URL redirects for the current store. Shows the current page's redirect chain, detects redirect loops, and lets you quick-add redirects from the storefront.

**Scope:**
- Detect redirects on the current page via `performance.getEntriesByType('navigation')` redirect count
- Show redirect chain for the current URL
- Link to Admin > Online Store > Navigation > URL Redirects for management
- Quick-add: "redirect this URL to..." form in the overlay

**Context:**
- Full redirect management requires Admin API access (authentication barrier)
- v1 can focus on detection and linking to admin, not full CRUD
- `performance.navigation.redirectCount` and `PerformanceNavigationTiming` provide redirect data
- Most valuable for agencies doing migrations with hundreds of redirects

### Customer Session Viewer
**Priority:** P4

See what Shopify knows about the current visitor: customer ID (if logged in), cart token, session token, detected country/currency/language, active market, and B2B company (if applicable).

**Scope:**
- Accessible from context menu or popup
- Read from `window.Shopify` object which exposes: `Shopify.country`, `Shopify.currency`, `Shopify.locale`
- Read customer data from `__st` object or `/cart.js` (which includes `currency`, `attributes`)
- Display in a clean panel (reuse popup or overlay pattern)
- Copy all session data as JSON

**Context:**
- Most session data is already on the page in the `Shopify` and `__st` global objects
- Customer-specific data (name, email, orders) requires authentication — out of scope
- Useful for debugging localization, multi-currency, and market-specific behavior
- Low effort — mainly reading existing globals and presenting them cleanly

### Webhook Monitor
**Priority:** P4

Real-time feed of webhook events for the current store. Filter by topic, view payloads, replay events. Requires a companion server or Shopify app to receive webhooks and relay to the extension.

**Scope:**
- Companion service that receives webhooks and relays via WebSocket to the extension
- Live event feed in an overlay (similar to browser DevTools Network tab)
- Filter by webhook topic (orders/create, products/update, etc.)
- Click to expand payload
- "Replay" button to re-send the event to a configurable endpoint

**Context:**
- This is the most complex feature on this list — requires infrastructure beyond the extension
- Could start with a simple server (Cloudflare Worker + Durable Objects) that stores events temporarily
- Authentication: store owner would need to install a Shopify app or configure webhooks manually
- Consider deferring to a separate product/service rather than building into the extension
- Marked P4 because the infrastructure cost is high relative to the other features

## Cartograph

### Adversarial Review Findings (from /ship 2026-03-23)
**Priority:** P3

Issues identified by 4-pass adversarial review during ship. None are blocking but improve robustness:

- **`applicable` field missing from discount_codes type** — all codes display "Not applicable" even when applied. Fix: add `applicable: boolean` to types.ts
- **Product URL path validation too strict** — `/en/products/` and `/collections/*/products/` paths rejected. Fix: normalize to extract handle
- **Shipping rate polling timeout mismatch** — world script polls 5s but client allows 30s. Fix: increase to ~20 polling attempts
- **replaceItem captures stale originalItem** — should read inside mutate callback, not at enqueue time
- **Mount failure bricks overlay** — if script injection fails, `mounted` flag never resets. Fix: add try/catch around `mountCartograph()`
- **USD-only currency formatting** — prices hardcoded as `$` + `toFixed(2)`, ignores `cart.currency`
- **Quantity input capped at 99** — silent clamp on existing items with qty > 99

## Completed
