# Alfred Merchant Feature Research

Research completed against the current Alfred codebase and sources available as
of July 24, 2026.

## Research conclusion

The strongest merchant opportunity is an **Alfred Merchant Mode** built around
three promises:

1. **Show me the information Shopify keeps hiding.**
2. **Catch expensive mistakes before customers see them.**
3. **Remember and accelerate the workflows I repeat every day.**

The best acquisition feature is an Admin “Power Mode.” The best long-term
differentiator is a cross-layer preflight system that compares Shopify Admin
configuration with the actual storefront, cart, checkout, Markets, discounts,
and tracking behavior.

That second part fits Alfred unusually well because it already understands both
sides: Shopify Admin plus the rendered storefront.

## What merchants repeatedly complain about

The dominant 2026 complaint is not “Shopify lacks ecommerce functionality.” It
is that common work now takes more clicks and important information is
progressively hidden.

A highly active Reddit discussion describes inventory adjustments, tagging,
product photos, draft-order search, order filters, and purchase orders all
becoming slower. Merchants specifically complain about four or five clicks for
basic inventory changes and having to retrain staff whenever Shopify changes the
interface.
[Recent merchant discussion](https://www.reddit.com/r/shopify/comments/1tjbfun/shopify_keeps_making_small_admin_stuff_way_more/)

Other recurring signals:

- Customer notes, SKUs, line-item properties, inventory settings, HS codes,
  compare-at price, and cost are hidden or collapsed. One merchant reported
  entering a product’s cost into the customer-facing price field after Shopify
  moved the inputs.
  [Hidden-information discussion](https://www.reddit.com/r/shopify/comments/1ry10qu/who_else_is_tired_of_shopify_hiding_things_on_the/)
- Personalized-order merchants must expand every order to see variant and
  production information.
  [Collapsed order details](https://www.reddit.com/r/shopify/comments/1reqjxc/collapsing_order_details_on_the_order_dashboard/)
  and
  [line-item properties request](https://www.reddit.com/r/shopify/comments/1rilj4m/seeking_advice_on_a_custom_order_management/)
- Merchants repeatedly fall back to CSV export/import for bulk product,
  inventory, SEO, and metafield work.
- Shopify’s own documentation confirms that bulk editing was removed for blog
  posts, pages, and URL redirects. It also documents hidden-column validation
  failures and awkward variant grouping in the inventory editor.
  [Shopify bulk-editing documentation](https://help.shopify.com/en/manual/shopify-admin/productivity-tools/bulk-editing)
- Shopify supports saved views, but only certain resource lists permit editable
  columns, and sort order is not retained when merchants navigate away.
  [Shopify views documentation](https://help.shopify.com/en/manual/shopify-admin/productivity-tools/searching-filtering-views)
- Merchants distrust Analytics because date selection changes, attribution
  differences, and funnel numbers make it hard to know what is actionable.
  [Date-range regression](https://www.reddit.com/r/shopify/comments/1rx6637/is_the_date_feature_on_shopify_reports_broken/)
  and
  [analytics confusion](https://www.reddit.com/r/shopify/comments/1s2pjnq/am_i_the_only_one_who_opens_shopify_analytics/)
- App sprawl is expensive and difficult to audit. Merchants report global
  scripts, overlapping apps, and residual code from uninstalled apps.
  [Performance discussion](https://www.reddit.com/r/shopify_growth/comments/1rlivn3/why_do_shopify_apps_always_slow_down_my_store/)
  and
  [Shopify Community cleanup thread](https://community.shopify.com/c/shopify-discussions/how-can-i-remove-unused-code-after-uninstalling-apps/m-p/922000).

X/Twitter produced little reliably indexable merchant discussion, so it was not
assigned meaningful weight. Recent Reddit threads, first-party Shopify
documentation, independent merchant posts, app reviews, and Chrome Web Store
competition were weighted more heavily.

## Prioritized feature opportunities

| Priority | Opportunity                     | What Alfred would do                                                                                                          | Fit                                  |
| -------- | ------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- | ------------------------------------ |
| 1        | Merchant Power Mode             | Auto-expand important fields, restore one-click filters, compact layouts, sticky information, persistent sort and preferences | Excellent, quick wedge               |
| 2        | Sale & Launch Preflight         | Compare Admin setup with storefront, cart, checkout, discounts, Markets, channels, inventory, schema, and tracking            | Best differentiator                  |
| 3        | Bulk Editor Workspaces          | Save column presets, group variants, diagnose hidden errors, snapshot before edits, restore widths and sort                   | Excellent                            |
| 4        | Order Operations Lens           | Surface SKU, variant, properties, notes, risk, tags, and fulfillment without opening every section                            | Excellent for high-volume merchants  |
| 5        | App Footprint Audit             | Attribute scripts and network weight to apps; detect duplicate trackers and suspected ghost code                              | Natural extension of Assets analysis |
| 6        | Catalog Readiness & Clone Guard | Flag missing operational data and stale fields inherited from duplicated products                                             | Strong                               |
| 7        | Discount Lab                    | Test automatic discounts and code combinations against real carts and explain which offer wins                                | Differentiated                       |
| 8        | Analytics Utility Belt          | Restore useful date presets, persist comparisons, annotate changes, explain mismatches                                        | Good UI enhancement                  |
| 9        | Inventory Quick Adjuster        | One-click adjustments with location and reason presets, safeguards, incoming stock context                                    | High demand, crowded                 |
| 10       | Purchase Order Companion        | Supplier-SKU search, receiving/scanning helpers, PO-to-transfer shortcuts, locale validation                                  | Strong retail niche                  |
| 11       | Content/Redirect Bulk Editor    | Restore bulk workflows Shopify removed for pages, posts, and redirects                                                        | Valuable but needs write access      |
| 12       | Media & Alt-Text Manager        | Catalog-wide missing-alt detection, image-aware suggestions, aspect-ratio checks                                              | Valid but competitive                |

## The five strongest opportunities

### 1. Merchant Power Mode

Make Shopify Admin configurable by the merchant instead of accepting Shopify’s
current progressive-disclosure defaults.

Possible controls:

- Always expand customer notes.
- Always show order line-item properties, SKUs, variants, and fulfillment
  details.
- Always expose inventory tracking, “continue selling,” weight, HS code, cost,
  and compare-at price.
- Compact, comfortable, and spacious density modes.
- Full-width product, order, inventory, and bulk-editor tables.
- Sticky order/customer sidebar.
- Pin selected fields to the top of product or order pages.
- Restore favorite order/product filters as one-click chips.
- Remember sort, column order, and collapsed state per store and page.
- Allow presets by role: fulfillment, customer support, merchandising, and
  purchasing.

This is the clearest recurring pain, but it is becoming competitive.
[AdminBoost](https://chromewebstore.google.com/detail/adminboost-full-width-ord/malcedikhelcgnkkbibehiickddilhbo)
already offers full width, filter shortcuts, counts, and a command palette;
[Better Admin for Shopify](https://chromewebstore.google.com/detail/better-admin-for-shopify/kdeaeodkhafnbfdhfdbedpappgboeikn)
adds popovers, bulk presets, and product/order information.

Therefore, Power Mode should be Alfred’s entry feature, not its entire
positioning.

### 2. Sale & Launch Preflight

This is the strongest Alfred-specific idea.

From a product, collection, discount, or theme page, the merchant clicks **Run
Preflight**. Alfred follows the configuration through to what shoppers
experience.

Checks could include:

- Product is active and published to the expected channels and Markets.
- Every sellable variant has price, inventory behavior, image, and required
  identifiers.
- Compare-at price is greater than price and actually appears for the selected
  market.
- Product appears in its expected collection, navigation, and search.
- Product JSON, schema availability, and visible storefront price agree.
- Add-to-cart works for every selected variant.
- Discount eligibility, exclusions, quantity thresholds, and combinations
  behave as intended.
- Free-shipping thresholds behave correctly.
- Automatic discounts do not silently replace a better VIP or loyalty offer.
- Sale messaging on product, cart, and checkout agrees.
- Tracking events fire when product, cart, and checkout actions occur.
- Links, images, and app assets introduced by the campaign work.
- Scheduled times are displayed in both store timezone and the operator’s
  timezone.

Current Shopify documentation explicitly tells merchants to test discount
combinations manually by assembling carts and entering codes. It also documents
plan-dependent combinations, the 25-active-automatic-discount limit, and
“best discount” replacement behavior.
[Current discount rules](https://help.shopify.com/en/manual/discounts/discount-combinations)

Alfred can turn that manual procedure into a repeatable test matrix and produce
a shareable pass/fail report.

### 3. Bulk Editor Workspaces and Safety

The native bulk editor is capable but forgetful and inconsistent.

Alfred could add:

- Named presets such as “Pricing,” “International shipping,” “Google feed,”
  “Inventory,” and “SEO.”
- Fast switching between product and variant editing.
- Fixed identifier columns for title, SKU, and barcode.
- Group variants by parent product regardless of Shopify’s current sort.
- Remember widths, columns, and sort.
- Search the visible grid.
- Highlight edited cells and show a proposed-change summary.
- Diagnose Shopify’s generic “Update invalid values, then save again” error by
  surfacing hidden SKU or metafield-validation columns.
- Export a compact before-state automatically.
- Provide one-session undo or generate a restoration CSV.

This addresses existing demand without trying to become a complete
product-information-management app.

### 4. Order Operations Lens

For fulfillment and custom-product merchants:

- Expand all order products automatically.
- Surface line-item properties, personalization text, uploaded-file links, SKU,
  barcode, and selected options.
- Show customer notes prominently with warning styling.
- Add a configurable order-list preview.
- Copy an order as a production sheet, packing note, or plain-text support
  summary.
- Copy address, email, phone, and tracking values individually.
- Highlight conflicting states such as “paid and unfulfilled but unavailable
  inventory.”
- Provide next/previous order keyboard navigation.
- Let teams define “critical fields” that must never be collapsed.

A later version could create configurable views for embroidery, engraving,
made-to-order, wholesale, or preorder businesses.

### 5. App Footprint and Ghost-Code Audit

Build on Alfred’s existing Assets analyzer and theme-code navigation.

For each storefront page:

- Group third-party scripts, styles, requests, errors, and transferred bytes by
  likely Shopify app.
- Show whether the resource loads globally or only where needed.
- Detect overlapping categories such as multiple review widgets, chat tools, or
  analytics pixels.
- Detect duplicate pixel IDs and multiple copies of libraries.
- Compare observed storefront integrations with the installed-app list.
- Mark resources that appear to belong to an app no longer installed.
- Link suspected theme snippets directly to the code editor.
- Compare the live theme with a clean or preview theme.
- Generate an evidence report for the merchant or app developer.

Alfred should not delete anything automatically. It should identify the likely
owner, show evidence, recommend backing up the theme, and link to the exact code.

## Additional valuable ideas

### Product Clone Guard

When a product is duplicated, flag `copy-of` handles, inherited SEO titles,
duplicate SKUs/barcodes, stale alt text, and publication differences. One
merchant discovered about 2,200 mismatched duplicated handles.
[Duplication problem](https://community.shopify.com/c/shopify-discussions/why-are-my-product-handles-not-matching-titles-after-duplication/td-p/1172933)

### Analytics Utility Belt

Restore “last 365 days,” month-to-date, same period last year, and saved custom
ranges; persist comparison choice; let merchants annotate theme launches,
campaigns, and app installs on reports.

An expanded version could:

- Explain the difference between orders, sessions, checkouts, and attributed
  conversions.
- Show when a metric is delayed or uses a different timezone.
- Compare transaction IDs from an exported GA4 report with Shopify orders
  instead of comparing only totals.
- Save a merchant’s weekly review layout.
- Produce a simple “what changed?” digest rather than another general dashboard.

### Inventory Quick Adjuster

Add configurable `+1`, `-1`, receive, damage, and correction actions, with the
correct location and reason preselected. Require confirmation for large or
negative adjustments.

Useful additions:

- Show incoming inventory next to available inventory.
- Remember the last-used reason per user.
- Warn when an adjustment creates unexpected negative stock.
- Add keyboard-first adjustment flows.
- Display recent adjustments without leaving the product.

### Purchase Order Companion

Recent merchants request supplier-SKU search, PO-to-transfer continuity,
locale-aware decimal handling, and optional product-cost updates.
[Current PO feature request](https://community.shopify.com/t/feature-request-improvements-to-shopify-purchase-orders/630758)

Potential features:

- Search products by supplier SKU or vendor identifier.
- Open or create the corresponding transfer without manually finding it.
- Scan products while receiving.
- Validate comma/period decimal input against store locale.
- Offer an explicit “update product cost from this PO” option.
- Autofill reorder quantities from an imported CSV.

### Media and Alt-Text Manager

Bulk alt-text editing remains a native gap.
[Shopify Community answer](https://community.shopify.com/t/bulk-edit-image-alt-text/404262)

Alfred could differentiate by actually inspecting image content instead of
merely templating the product title:

- Detect missing and repeated alt text.
- Generate literal, accessibility-focused image descriptions.
- Flag inconsistent aspect ratios in a product or collection.
- Find oversized source images.
- Find supplier watermarks or unexpected branding.
- Provide bulk review and approval before any update.

### Bulk Content and Redirect Editor

Shopify officially removed native bulk editing for pages, blog posts, and URL
redirects. This makes the opportunity a documented gap rather than a
speculative feature.

Possible workflow:

- Filter pages/posts/redirects in Shopify Admin.
- Edit selected fields in a spreadsheet-style interface.
- Validate redirects for loops, chains, collisions, and broken destinations.
- Export a before-state.
- Preview proposed URL and SEO changes.
- Generate restoration data for rollback.

### Discount Lab

Discount Lab deserves a distinct workflow inside Cartograph or Merchant Mode:

- Enter multiple discount codes.
- Include active automatic discounts.
- Test combinations across products, quantities, customer eligibility,
  countries, currencies, and shipping destinations.
- Explain calculation order: product, order, then shipping.
- Identify why a code was rejected or replaced.
- Test excluded products and collections.
- Save reusable Black Friday, VIP, wholesale, and free-shipping scenarios.
- Export the test matrix as Markdown or CSV.

### Catalog Readiness

Add a merchant-focused readiness panel to product Admin pages:

- Missing SKU or duplicate SKU.
- Missing or duplicate barcode.
- Missing cost, weight, HS code, country of origin, or vendor.
- Price/compare-at mistakes.
- Inventory not tracked or “continue selling” unexpectedly enabled.
- Missing channel or Market publication.
- Missing image alt text.
- Missing SEO title or description.
- Product active but unavailable from its intended collection.
- Storefront JSON/schema/status disagreement.

The first version can audit the current product. A later API-authorized version
can audit the full catalog.

## What should not be a flagship

Returns, fraud prevention, demand forecasting, complete inventory planning, and
durable product version history are real merchant problems, but they need
webhooks, historical storage, scheduled work, and reliable API access. They are
better suited to a Shopify app or backend service than a browser-only extension.

Likewise, a generic command palette or “open Admin from storefront” feature is
now commodity. Several small Chrome extensions already provide that, and Alfred
already does much of it.

Shopify’s API also cannot reliably tell a browser extension who changed a
product elsewhere. Alfred could journal edits made through the current browser,
but should not promise a complete staff/app audit trail.

## Competitive implications

The current Chrome-extension market validates the demand for Admin
enhancements, but it also shows that simple quality-of-life features are easy to
copy.

Relevant products include:

- [AdminBoost](https://chromewebstore.google.com/detail/adminboost-full-width-ord/malcedikhelcgnkkbibehiickddilhbo):
  full-width layouts, restored filter buttons, counts, sticky headers, and a
  command palette.
- [Better Admin for Shopify](https://chromewebstore.google.com/detail/better-admin-for-shopify/kdeaeodkhafnbfdhfdbedpappgboeikn):
  contextual information popovers, bulk-editor presets, SKU/EAN visibility, and
  order/customer shortcuts.
- [Shopify Poweruser](https://chromewebstore.google.com/detail/shopify-poweruser/emdhjndbgjibfjhjdipgggmbofocblca):
  SKU visibility in product and variant pickers.
- [Shopify Admin Shortcuts](https://chromewebstore.google.com/detail/shopify-admin-shortcuts/hbnfadgdlpopinfkppgkgomkjlhdnijg):
  storefront-to-Admin navigation.
- [Shopify Massive Editor](https://chromewebstore.google.com/detail/shopify-massive-editor/glafgcojhkfkjipkfipmcdnkjaddpmhc):
  bulk product-price changes.
- [Purchase Order & Transfer Autofill](https://chromewebstore.google.com/detail/purchase-order-transfer-a/llcgapdnmjhgfgoeecjhaijplglhchbe):
  autofilling Shopify purchase orders and transfers.

Alfred should offer the obvious quality-of-life improvements, but the product
story should be cross-layer verification and merchant safety. That is harder for
a one-feature Admin extension to reproduce.

## Recommended sequence

### Phase 1: Merchant Mode foundation

1. Add store-scoped and route-scoped settings.
2. Add auto-expand rules for customer notes, order items, variants, and product
   fields.
3. Add compact/full-width modes.
4. Restore favorite filters and persistent sort.
5. Allow users to turn every enhancement on or off.

### Phase 2: Bulk workflows

1. Add bulk-editor column presets.
2. Persist widths, sort, and resource type.
3. Add hidden-validation-error assistance.
4. Add before-state export and restoration CSV generation.

### Phase 3: First cross-layer preflight

Start with one concrete workflow:

1. Merchant opens a product or discount in Admin.
2. Alfred creates a controlled test cart.
3. Alfred verifies product availability, price, compare-at price, inventory,
   schema, cart behavior, and discount result.
4. Alfred reports Admin/storefront disagreements.
5. The merchant exports or copies the results.

### Phase 4: Order Operations Lens

1. Add auto-expansion and critical-field highlighting on individual orders.
2. Add production/support copy formats.
3. Add configurable order-list previews where data access is reliable.
4. Add role-specific presets.

### Phase 5: App Footprint Audit

1. Extend Assets analysis with domain and likely-app attribution.
2. Detect duplicate libraries and trackers.
3. Compare installed apps with storefront-observed resources.
4. Link likely theme code to the editor.
5. Produce evidence and cleanup instructions without automatic deletion.

## Technical guardrails

- Scope settings by Shopify store, not globally.
- Use route-specific adapters because Shopify Admin changes frequently.
- Provide feature flags and kill switches for broken selectors.
- Prefer DOM-only enhancements for the first release.
- Treat Shopify’s private/internal endpoints as unstable.
- Use explicit Admin API authorization when full catalog or order data is
  required.
- Keep order, customer, and fulfillment data local by default.
- Never send PII through Alfred’s usage analytics.
- Preview every mutation and require confirmation.
- Automatically capture a before-state for bulk or destructive changes.
- Do not claim rollback unless Alfred has enough source data to restore every
  affected field.
- Do not auto-delete suspected app code.
- Clearly distinguish a finding from a confirmed problem.

## Recommended positioning

> **Alfred makes Shopify Admin work the way experienced merchants work, and
> catches the mistakes Shopify Admin cannot see because they only appear on the
> storefront.**

Power Mode can attract merchants because it saves time immediately. Preflight,
Discount Lab, Catalog Readiness, and App Footprint can make Alfred meaningfully
different from the growing collection of Shopify Admin shortcut extensions.
