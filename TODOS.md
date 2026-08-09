# TODOS

## Background

### Remove MV3 keep-alive (fix context menu first-click race properly)

**Priority:** P2 — do as a standalone change, single commit, nothing else mixed in, so it can be reverted cleanly if regressions show up.

The background service worker runs a `setInterval` keep-alive (`entrypoints/background/index.ts:57-65`) that pings `getPlatformInfo()` every 20s so the worker never idles out. It exists because context menu shortcuts didn't fire on the first click after the worker went inactive. That first-click failure is a fixable listener-registration race, not something that needs keep-alive, and Chrome keeps tightening the keep-alive loophole anyway.

**Root cause of the first-click bug:**

- Chrome persists the context menu _items_ across worker shutdowns, but the click _handlers_ live in the in-memory `menus` Map in `utils/contextMenu.ts`.
- The `contextMenus.onClicked` listener is registered lazily inside `initialize()`, which only runs when `create()` is first called, and `create()` is only reached in `registerShortcuts()` after `await getSettings()` (`entrypoints/background/shortcuts.ts:144`). MV3 requires listeners to be registered synchronously in the worker's first turn; a listener added after an `await` can miss the click event that woke the worker.
- Even when the listener wins the race, the `menus` Map can still be empty because `registerShortcuts()` hasn't finished rebuilding it, so `menus.get(...)` misses and the click is silently dropped.

**Fix plan (in order):**

1. Register `browser.contextMenus.onClicked` synchronously at module top level in `utils/contextMenu.ts` (import time), removing the lazy `initialize()` path.
2. Expose the in-flight startup promise from `registerShortcuts()` (it already runs unconditionally at `background/index.ts:73`); in the click listener, `await` that promise before looking up the handler in the Map. Awaiting inside an already-registered listener is fine in MV3; only late listener _registration_ is forbidden.
3. Keep the startup `removeAll()` + rebuild as is: idempotent, and the handler Map must be rebuilt on every cold start regardless.
4. Audit `pendingNavigations` (the password-redirect Map in `background/index.ts`): once the worker can die mid-navigation, in-memory state is lost. If the /password redirect flow matters across an idle gap, move it to `storage.session`.
5. Delete the `keepAlive` function and its `setInterval`.

**Verification (the real repro, not just a smoke test):**

- Load the extension, wait for the worker to show "inactive" on chrome://extensions (or force-stop it via chrome://serviceworker-internals).
- Right-click once on a Shopify page and confirm the shortcut fires on that _first_ click.
- Repeat for: popup open, changing a shortcut setting (menus re-register), and the password-store redirect flow from a cold worker.

**Revert story:** one commit, e.g. `fix(background): register menu click listener eagerly, drop keep-alive`. Reverting that commit restores keep-alive and the lazy listener wholesale.

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

- JsonTab.svelte is ~155 lines today, but almost all of it is a static `<pre>` dump plus a copy button and its styles — the query console is entirely unbuilt
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

### Adversarial Review Findings (from /ship 2026-03-23)

**Priority:** P3

Issues identified by 4-pass adversarial review during ship. None are blocking but improve robustness:

- **`applicable` field missing from discount_codes type** — `MetadataTab.svelte` reads `dc.applicable` but `types.ts:15` declares only `{ code, amount, type }`, so every code displays "Not applicable". Fix: add `applicable: boolean`
- **Product URL path validation too strict** — `getProductByUrl` in `cartograph-world.ts` requires `pathname.startsWith('/products/')`, rejecting `/en/products/` and `/collections/*/products/`. Fix: normalize to extract the handle
- **Shipping rate polling timeout mismatch** — `cartograph-world.ts` polls 10 × 500ms = 5s while the client allows 30s (`SHIPPING_TIMEOUT_MS`). Fix: raise `maxAttempts` to ~20
- **Mount failure bricks overlay** — `open()` in `cartograph.content/index.ts` sets `mounted = true` before awaiting the dynamic import, so a failed import leaves it stuck true and the overlay never opens again. Fix: try/catch that resets the flag
- **USD-only currency formatting** — prices hardcoded as `$` + `toFixed(2)`, ignores `cart.currency`
- **Quantity input capped at 99** — silent clamp on existing items with qty > 99

## Storefront Inspector

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

## Popup

### Theme Tab — Performance Widget

**Priority:** P3

Inline Core Web Vitals summary in the Theme tab. Show LCP, FID/INP, CLS, and TTFB as compact metric cards with color-coded status (good/needs-work/poor) based on Google's thresholds. Gives theme developers instant signal on whether the current theme is performant without leaving the popup.

**Scope:**

- 2x2 grid of metric cards below the theme details section
- Measure via PerformanceObserver and Performance API from the content script
- Color coding: green (good), yellow (needs improvement), red (poor) per Web Vitals thresholds
- Show benchmark text (e.g. "Good < 2.5s") for context
- Optional: store historical readings per-store for trend sparklines

**Context:**

- No mockup in the repo any more; `designs/` holds only `popup-preview.html`, so this needs a fresh design pass
- Overlaps with Store Health Check but this is a lightweight, always-visible summary vs. a full audit
- PerformanceObserver is available in content scripts — no main-world injection needed for CWV
- INP replaces FID as of March 2024 — use INP as the responsiveness metric

### Robots.txt Tab — Matcher Edge Cases

**Priority:** P3

Refinements flagged by the v2026.06.10 adversarial review as INVESTIGATE (correct enough to ship, worth revisiting):

- Percent-encoding normalization: `Disallow: /café` doesn't match the already-encoded `URL.pathname` `/caf%C3%A9`; Google normalizes both sides, some crawlers don't
- Versioned user-agent tokens: a group declared as `User-agent: Googlebot/2.1` never prefix-matches the bot token `Googlebot`
- Empty `User-agent:` value is silently unmatched and unlinted (could be an info-level lint)
- Decide what `robots_view` means long-term: currently once per popup session (module flag); per-render would overcount the 90s time-saved credit

**Context:**

- All in `entrypoints/popup/utils/robots.ts` / `Robots.svelte`; matcher has full test coverage in `entrypoints/popup/tests/robots.test.ts` to refactor against
