# Task 13: Context Menu Integration

**Phase**: 3 — Integration
**Status**: ✅ Complete
**Files to modify**:
- `entrypoints/background/shortcuts.ts`
**Depends on**: Task 03 (content script entry), Task 12 (wired app)

## Objective

Add a "Cart Superpowers" context menu entry under the Cart separator in Alfred's context menu. Unlike other context menu actions that execute main world functions directly, this one sends a message to the content script to open the overlay.

## Implementation

### Add to shortcuts.ts

After the existing "Clear Cart" entry (line 295), add the Cart Superpowers entry:

```typescript
// Cart Superpowers
if (shortcuts.cartSuperpowers !== false) {
  create(
    {
      id: 'cart-superpowers',
      title: 'Cart Superpowers',
      parentId: alfredMenuId
    },
    (_info, tab: Browser.tabs.Tab) => {
      void (async () => {
        try {
          await browser.tabs.sendMessage(tab.id!, {
            action: 'open_cart_superpowers'
          });
          trackAction('cart_superpowers_open');
        } catch (error) {
          console.error('Error opening Cart Superpowers:', error);
        }
      })();
    }
  );
}
```

### Key Difference from Other Shortcuts

Most existing shortcuts use `browser.scripting.executeScript` with `world: 'MAIN'` to call `window.Alfred` methods directly. Cart Superpowers is different:

- It uses `browser.tabs.sendMessage` to send a message to the **content script**
- The content script (`cart-superpowers.content/index.ts`) listens for `{ action: 'open_cart_superpowers' }` messages
- The content script then dynamically imports the Svelte bundle and mounts the overlay

This is because Cart Superpowers' UI lives in the content script (not the main world), and the overlay mount logic is in the content script.

### Update defaults object

In the same file, add `cartSuperpowers: true` to the defaults object at the top:

```typescript
const shortcuts = settings?.shortcuts ?? {
  openInAdmin: true,
  openInCustomizer: true,
  openSectionInCodeEditor: true,
  openImageInAdmin: true,
  copyThemePreviewUrl: true,
  exitThemePreview: true,
  copyProductJson: true,
  copyCartJson: true,
  clearCart: true,
  cartSuperpowers: true,  // ← add this
};
```

## Placement

The entry goes under the `── Cart ──` separator, after "Clear Cart":

```
Alfred
├── Navigation
│   ├── Open in Admin
│   ├── Open in Customizer
│   ├── Open Section in Code Editor
│   └── Open Image in Admin > Files
├── Theme
│   ├── Copy Theme Preview URL
│   └── Exit Theme Preview
├── Data
│   ├── Copy Product JSON
│   └── Copy Cart JSON
└── Cart
    ├── Clear Cart
    └── Cart Superpowers    ← NEW
```

## Error Handling

`browser.tabs.sendMessage` will throw if:
- The tab doesn't have the content script loaded (e.g., non-http pages, browser internal pages)
- The tab ID is invalid

The `try/catch` handles these gracefully by logging to console.

## Acceptance Criteria

- "Cart Superpowers" appears in the Alfred context menu under the Cart section
- Clicking it sends `open_cart_superpowers` message to the active tab
- The content script receives the message and opens the overlay
- If the content script isn't loaded (e.g., on a chrome:// page), the error is caught silently
- The entry respects the `cartSuperpowers` setting (hidden when disabled)
- Analytics event `cart_superpowers_open` is tracked on click
