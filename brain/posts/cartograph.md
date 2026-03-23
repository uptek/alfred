Introducing Cartograph — a full cart editor for Shopify, right on the storefront.

I've spent far too much time writing fetch calls to /cart/change.js just to do things the theme doesn't expose. So I built the interface I kept wishing existed.

Cartograph is a new feature in Alfred for Shopify. It wraps everything the Cart AJAX API offers in a clean UI — and adds a few things the API doesn't offer at all.

What it does:

- Add items by product URL or handle
- Change quantities, switch variants, manage selling plans
- Apply discount codes and see which ones are actually working
- Edit cart notes and attributes
- Calculate shipping rates for the current cart
- View the full cart JSON payload for debugging

One example: variant switching. The Cart API doesn't support it. Cartograph handles it behind the scenes with a remove-and-re-add pattern with recovery if anything fails.

Open it via right-click > Alfred > Cartograph, or just add ?alfred=cart to any store URL.

It supports light and dark mode, and runs in full isolation so it never conflicts with the theme's styles.

If you work with Shopify storefronts — whether you're building themes, debugging checkout flows, or testing apps — this is the tool I wish I'd had years ago.

---

## Twitter

Introducing Cartograph — a full cart editor for Shopify, right on the storefront.

Add items, switch variants, apply discounts, calculate shipping, view the raw JSON — everything the Cart API offers and then some.

No more fetch calls. Just buttons.
