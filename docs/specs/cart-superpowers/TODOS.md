# Cart Superpowers — TODOs

### Cart Snapshots
**Priority:** P1 | **Effort:** M (2-3 hours)
Save current cart state to extension storage, restore it later. Essential for testing discount rules, shipping thresholds, and cart-dependent logic with repeatable states.
- Add a "Snapshots" dropdown in the header (save/restore/delete)
- Store snapshots in `chrome.storage.local` keyed by store domain
- Restore = clear cart + re-add all items with properties/selling plans
- **Start here:** Add a `CartSnapshot` type to `types.ts`, build save/restore logic in a `snapshots.ts` utility

### Cart Permalink Generator
**Priority:** P2 | **Effort:** S (30-45 min)
Generate a Shopify `/cart/{variant_id:qty,...}` permalink URL from the current cart state. Useful for sharing cart states in Slack, PRs, or bug reports.
- Add a "Copy Permalink" button to the header or footer
- Format: `/cart/{variant_id}:{qty},{variant_id}:{qty}`
- Note: Shopify cart permalinks don't support properties or selling plans — document this limitation
- **Start here:** Add a `generateCartPermalink(cart: CartData): string` function

### Quick Add by Variant ID
**Priority:** P2 | **Effort:** S (30 min)
Small input field (in header or as a compact row above the items table) where you paste a variant ID + quantity and hit enter to add instantly. Skips the full Add Item tab workflow.
- Format: `{variant_id}` or `{variant_id}:qty`
- Power users who know their variant IDs use this constantly
- **Start here:** Add a compact input row at the top of ItemsTab or in the header

### JSON Syntax Highlighting
**Priority:** P3 | **Effort:** S (30-45 min)
Add basic JSON syntax highlighting to the JSON tab — keys in one color, strings in another, numbers/booleans in a third. Pure CSS/JS, no library needed.
- Replace `JSON.stringify` output with highlighted spans
- Use a simple regex-based highlighter (match keys, strings, numbers, booleans, null)
- Colors should use the existing `--cs-*` design tokens
- **Start here:** Add a `highlightJson(json: string): string` function in JsonTab.svelte

### Collapsible Item Details
**Priority:** P3 | **Effort:** M (1-2 hours)
Make each item row in the Items tab expandable to show full details — all properties, selling plan details, discount breakdowns, variant options, SKU, weight, grams, etc. Reduces table column clutter while providing more data when needed.
- Click the row or a "details" chevron to expand
- Show a detail panel below the row (similar to current property editor expansion)
- Include fields not shown in the table: weight, grams, vendor, product type, taxable, requires_shipping, gift_card, discount allocations
- **Start here:** Extend the existing `expandedItemKey` pattern in ItemsTab.svelte
