# Task 14: Settings Integration

**Phase**: 3 — Integration
**Status**: ✅ Complete
**Files to modify**:
- `global.d.ts` — add `cartSuperpowers` to `AlfredSettings.shortcuts`
- `entrypoints/options/contexts/SettingsContext.tsx` — add default
- `entrypoints/options/components/settings/ShortcutsSettings.tsx` — add toggle
**Depends on**: Task 13 (context menu)

## Objective

Add a settings toggle for Cart Superpowers so users can enable/disable the feature. This follows the exact same pattern as all other shortcuts in the settings page.

## 1. global.d.ts

Add `cartSuperpowers` to the `AlfredSettings.shortcuts` type. Looking at the existing pattern, shortcuts are referenced as `settings?.shortcuts?.cartSuperpowers`, so it needs to be an optional boolean property.

Find the `shortcuts` property in the `AlfredSettings` interface and add:

```typescript
cartSuperpowers?: boolean;
```

This is the **only** change to `global.d.ts` for the entire Cart Superpowers feature.

## 2. SettingsContext.tsx

Add `cartSuperpowers: true` to the `defaultSettings.shortcuts` object:

```typescript
shortcuts: {
  openInAdmin: true,
  openInCustomizer: true,
  copyProductJson: true,
  copyCartJson: true,
  copyThemePreviewUrl: true,
  clearCart: true,
  openSectionInCodeEditor: true,
  openImageInAdmin: true,
  cartSuperpowers: true,        // ← add this
},
```

Default is `true` — Cart Superpowers is enabled by default.

## 3. ShortcutsSettings.tsx

Add a new item to the "Cart" category in the `shortcutCategories` array:

```typescript
{
  label: 'Cart',
  items: [
    {
      key: 'clearCart',
      label: 'Clear Cart',
      details: 'Removes all items from the cart'
    },
    {
      key: 'cartSuperpowers',                              // ← add this
      label: 'Cart Superpowers',
      details: 'Opens a full-featured cart editor overlay'
    }
  ]
}
```

No other changes needed — the existing `ShortcutsSetting` component dynamically renders checkboxes for all items in all categories. Adding the item to the array is sufficient.

## How it Works

The settings flow is already established:

1. `ShortcutsSettings.tsx` renders a checkbox for each item in `shortcutCategories`
2. When toggled, it updates `settings.shortcuts.cartSuperpowers` via `updateSettings()`
3. `settings` is saved to storage via `setItem('settings', ...)`
4. When `shortcuts.ts` registers context menu items, it reads `settings.shortcuts.cartSuperpowers`
5. When `cart-superpowers.content/index.ts` runs, it reads `settings.shortcuts.cartSuperpowers` and returns early if `false`

## Acceptance Criteria

- `cartSuperpowers` is a valid property on `AlfredSettings.shortcuts` (TypeScript compiles)
- Default value is `true` in SettingsContext
- "Cart Superpowers" toggle appears in the Options page under the Cart category
- Toggling it off:
  - Hides the "Cart Superpowers" context menu entry (after re-registering shortcuts)
  - Prevents the `?alfred=cart` URL parameter from opening the overlay
- Toggling it on:
  - Shows the context menu entry
  - Allows the URL parameter to work
- No visual regressions to the existing Settings page
