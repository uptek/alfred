# Exit Theme Preview Shortcut — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add a right-click context menu shortcut that exits a Shopify theme preview by navigating to the current URL with an empty `preview_theme_id` param.

**Architecture:** New `exitThemePreview()` method on the `Alfred` global API, registered as a context menu item via the existing shortcut system, toggleable in settings. Detection uses `window.Shopify.theme.role !== 'main'`. Exit mechanism navigates to current URL with `?preview_theme_id=` (empty value) which clears the server-side preview session.

**Tech Stack:** TypeScript, WXT framework, browser.contextMenus API, browser.scripting API

---

### Task 1: Add TypeScript types

**Files:**

- Modify: `global.d.ts:51` (add `exitThemePreview` to shortcuts settings)
- Modify: `global.d.ts:118` (add `exitThemePreview` to WindowWithAlfred)

**Step 1: Add `exitThemePreview` to `AlfredSettings.shortcuts`**

In `global.d.ts`, inside the `shortcuts` interface (around line 51-59), add after `openImageInAdmin`:

```typescript
    exitThemePreview?: boolean;
```

**Step 2: Add `exitThemePreview` to `WindowWithAlfred.Alfred`**

In `global.d.ts`, inside the `Alfred` property of `WindowWithAlfred` (around line 118), add after `openSectionInCodeEditor`:

```typescript
exitThemePreview: () => boolean;
```

**Step 3: Commit**

```
feat: add exitThemePreview types to global declarations
```

---

### Task 2: Implement `exitThemePreview()` in the Alfred main world API

**Files:**

- Modify: `entrypoints/alfred-main-world.ts` (add method after `copyThemePreviewUrl`, before `clearCart`)

**Step 1: Add the `exitThemePreview` method**

Insert this method after the `copyThemePreviewUrl` method's closing `},` (after line 463) and before the `clearCart` method's JSDoc comment:

```typescript
    /**
     * Exit theme preview by navigating to the current URL with an empty preview_theme_id
     * @returns {boolean}
     */
    exitThemePreview: (): boolean => {
      try {
        const win = window as unknown as WindowWithAlfred;
        // Check if this is a Shopify store
        if (!win.Alfred.isShopify()) {
          (win.Alfred.Toast as { error: (msg: string) => void }).error(
            'Not a Shopify store'
          );
          return false;
        }

        // Check if the current theme is not the main/published theme
        const role = win.Shopify?.theme?.role;
        if (role === 'main') {
          (win.Alfred.Toast as { error: (msg: string) => void }).error(
            'Not previewing a theme'
          );
          return false;
        }

        (win.Alfred.Toast as { success: (msg: string) => void }).success(
          'Exiting theme preview...'
        );

        // Track the action before navigation
        window.dispatchEvent(
          new CustomEvent('alfred:track', {
            detail: {
              action: 'exit_theme_preview',
              metadata: {
                page_url: window.location.href,
                page_type: win.__st?.p ?? 'other',
                shop_domain: window.location.hostname,
                theme_role: role,
              },
            },
          })
        );

        // Navigate to the current URL with an empty preview_theme_id to clear the preview
        const url = new URL(window.location.href);
        url.searchParams.set('preview_theme_id', '');
        window.location.href = url.toString();

        return true;
      } catch (error) {
        console.error('Error exiting theme preview:', error);
        const win = window as unknown as WindowWithAlfred;
        (win.Alfred.Toast as { error: (msg: string) => void }).error(
          'Failed to exit theme preview'
        );
        return false;
      }
    },
```

**Step 2: Commit**

```
feat: implement exitThemePreview in Alfred main world API
```

---

### Task 3: Register context menu item

**Files:**

- Modify: `entrypoints/background/shortcuts.ts` (add menu item registration)

**Step 1: Add `exitThemePreview` to the defaults object**

In the `shortcuts` defaults object (around line 14-23), add after `openImageInAdmin: true`:

```typescript
    exitThemePreview: true,
```

**Step 2: Add context menu registration**

Insert after the "Copy Theme Preview URL" block (after line 169) and before the "Clear Cart" block:

```typescript
// Exit Theme Preview
if (shortcuts.exitThemePreview !== false) {
  create(
    {
      id: 'exit-theme-preview',
      title: 'Exit Theme Preview',
      parentId: alfredMenuId
    },
    (_info, tab: Browser.tabs.Tab) => {
      void (async () => {
        try {
          await browser.scripting.executeScript({
            target: { tabId: tab.id! },
            func: () => {
              void (window as unknown as WindowWithAlfred).Alfred.exitThemePreview();
            },
            world: 'MAIN'
          });
        } catch (error) {
          console.error('Error exiting theme preview:', error);
        }
      })();
    }
  );
}
```

**Step 3: Commit**

```
feat: register Exit Theme Preview context menu item
```

---

### Task 4: Add settings toggle

**Files:**

- Modify: `entrypoints/options/components/settings/ShortcutsSettings.tsx` (add item to array)

**Step 1: Add the shortcut item to `shortcutItems` array**

In the `shortcutItems` array, add after the `copyThemePreviewUrl` entry (after line 25) and before `copyCartJson`:

```typescript
  {
    key: 'exitThemePreview',
    label: 'Exit Theme Preview',
    details: 'Exits the current theme preview and loads the live theme',
  },
```

**Step 2: Commit**

```
feat: add Exit Theme Preview toggle to shortcuts settings
```

---

### Task 5: Build and verify

**Step 1: Run type checking**

Run: `bun run typecheck`
Expected: No type errors

**Step 2: Run build**

Run: `bun run build`
Expected: Build succeeds

**Step 3: Final commit (if any fixes needed)**

```
fix: resolve any build issues for exit theme preview
```
