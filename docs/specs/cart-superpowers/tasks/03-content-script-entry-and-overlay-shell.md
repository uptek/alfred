# Task 03: Content Script Entry and Overlay Shell

**Phase**: 1 — UI Skeleton
**Status**: ✅ Complete
**Files to create**:
- `entrypoints/cart-superpowers.content/index.ts`
- `entrypoints/cart-superpowers.content/mount.ts`
- `entrypoints/cart-superpowers.content/App.svelte`
**Depends on**: Task 01, Task 02

## Objective

Create the content script entry point that detects the `?alfred=cart` URL parameter, lazily loads the Svelte UI bundle, and renders a full-page dark overlay with a header bar and tab navigation. This is the shell that all tab components will render inside.

## 3.1 Content Script Entry (`index.ts`)

```
entrypoints/cart-superpowers.content/index.ts
```

- Define content script with `matches: ['<all_urls>']`, `runAt: 'document_idle'`
- On load, check if URL has `?alfred=cart` parameter: `new URLSearchParams(window.location.search).get('alfred') === 'cart'`
- Also listen for `browser.runtime.onMessage` with `{ action: 'open_cart_superpowers' }` (for context menu trigger, wired in Phase 3)
- When triggered, dynamically `import('./mount')` to lazy-load the Svelte bundle — this keeps the content script lightweight on pages where it's not triggered
- Check settings before mounting: `getItem<AlfredSettings>('settings')` — if `shortcuts.cartSuperpowers === false`, return early
- Guard against double-mounting: track whether the UI is already open

**Reference pattern**: `appstore-partners.content/index.tsx` for the content script structure.

```typescript
export default defineContentScript({
  matches: ['<all_urls>'],
  runAt: 'document_idle',
  async main(ctx) {
    const settings = await getItem<AlfredSettings>('settings');
    if (settings?.shortcuts?.cartSuperpowers === false) return;

    let mounted = false;

    const open = async () => {
      if (mounted) return;
      mounted = true;
      const { mountCartSuperpowers } = await import('./mount');
      mountCartSuperpowers(ctx, () => { mounted = false; });
    };

    // URL parameter trigger
    if (new URLSearchParams(window.location.search).get('alfred') === 'cart') {
      await open();
    }

    // Context menu trigger (via background script message)
    browser.runtime.onMessage.addListener((msg) => {
      if (msg.action === 'open_cart_superpowers') {
        open();
      }
      return false;
    });
  }
});
```

## 3.2 Mount Module (`mount.ts`)

```
entrypoints/cart-superpowers.content/mount.ts
```

- Uses WXT's `createIntegratedUi` to create a DOM container
- Position: `'overlay'` or `'inline'` anchored to `body` (test which works best for a full-page overlay)
- On mount: create a container div, use Svelte's `mount()` to render `App.svelte` into it
- On remove: use Svelte's `unmount()` to clean up
- Accept an `onClose` callback to tell `index.ts` when the overlay is dismissed (so `mounted` flag resets)

**Svelte 5 mounting pattern**:
```typescript
import { mount, unmount } from 'svelte';
import App from './App.svelte';

const app = mount(App, {
  target: container,
  props: { onClose: () => { /* cleanup */ } }
});

// Later: unmount(app);
```

**Reference pattern**: `appstore-partners.content/index.tsx` lines 17-48 for `createIntegratedUi` usage.

## 3.3 App Shell (`App.svelte`)

```
entrypoints/cart-superpowers.content/App.svelte
```

The root Svelte component. Contains the overlay backdrop, header, tab bar, and content area.

### Props
- `onClose: () => void` — callback to unmount the overlay

### State
- `let cart: CartData = MOCK_CART` — imported from mock-data.ts (replaced with real data in Phase 2)
- `let activeTab: TabId = 'items'`

### Structure

```
<div class="overlay">                    <!-- fixed fullscreen backdrop -->
  <div class="panel">                    <!-- centered panel (max-width ~1200px) -->
    <header class="header">
      <div class="header-left">
        <h1>Cart Superpowers</h1>
        <span class="badge">{cart.item_count} items</span>
      </div>
      <button class="close-btn" on:click={onClose}>✕</button>
    </header>

    <nav class="tabs">
      {#each tabs as tab}
        <button
          class="tab"
          class:active={activeTab === tab.id}
          on:click={() => activeTab = tab.id}
        >
          {tab.label}
          {#if tab.id === 'items'}
            <span class="tab-count">{cart.items.length}</span>
          {/if}
        </button>
      {/each}
    </nav>

    <main class="content">
      <!-- Tab content renders here (later tasks) -->
      <!-- For now, show a placeholder per tab -->
      {#if activeTab === 'items'}
        <p>Items tab placeholder</p>
      {:else if activeTab === 'add'}
        <p>Add item tab placeholder</p>
      {:else if activeTab === 'metadata'}
        <p>Metadata tab placeholder</p>
      {:else if activeTab === 'shipping'}
        <p>Shipping tab placeholder</p>
      {:else if activeTab === 'json'}
        <p>JSON tab placeholder</p>
      {/if}
    </main>
  </div>
</div>
```

### Tabs Definition

```typescript
const tabs: Array<{ id: TabId; label: string }> = [
  { id: 'items', label: 'Items' },
  { id: 'add', label: 'Add Item' },
  { id: 'metadata', label: 'Metadata' },
  { id: 'shipping', label: 'Shipping' },
  { id: 'json', label: 'JSON' },
];
```

### Escape Key Handler

```typescript
import { onMount, onDestroy } from 'svelte';

let handleKeydown: (e: KeyboardEvent) => void;

onMount(() => {
  handleKeydown = (e: KeyboardEvent) => {
    if (e.key === 'Escape') onClose();
  };
  document.addEventListener('keydown', handleKeydown);
});

onDestroy(() => {
  document.removeEventListener('keydown', handleKeydown);
});
```

### Backdrop Click

Clicking the semi-transparent overlay area (outside the panel) should also close:
```svelte
<div class="overlay" on:click|self={onClose}>
```

### Scoped Styles (`<style>`)

Dark dev-tools aesthetic with CSS custom properties for design tokens:

```css
.overlay {
  all: initial;
  position: fixed;
  inset: 0;
  z-index: 2147483647;
  background: rgba(0, 0, 0, 0.6);
  display: flex;
  align-items: center;
  justify-content: center;
  font-family: -apple-system, BlinkMacSystemFont, "San Francisco", "Segoe UI", Roboto, "Helvetica Neue", sans-serif;
  font-size: 14px;
  line-height: 1.5;
  color: #e3e3e3;

  /* Design tokens — inherited by child components */
  --cs-bg-primary: #1a1a1a;
  --cs-bg-secondary: #242424;
  --cs-bg-tertiary: #303030;
  --cs-bg-hover: #383838;
  --cs-text-primary: #e3e3e3;
  --cs-text-secondary: #a0a0a0;
  --cs-text-muted: #707070;
  --cs-accent: #6366f1;        /* indigo-500 */
  --cs-accent-hover: #818cf8;  /* indigo-400 */
  --cs-border: #3c3c3c;
  --cs-danger: #ef4444;
  --cs-danger-hover: #f87171;
  --cs-success: #22c55e;
  --cs-radius: 8px;
  --cs-radius-sm: 4px;
}

.panel {
  background: var(--cs-bg-primary);
  border-radius: var(--cs-radius);
  box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.5);
  width: 95vw;
  max-width: 1200px;
  height: 85vh;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 20px;
  border-bottom: 1px solid var(--cs-border);
  flex-shrink: 0;
}

.header-left {
  display: flex;
  align-items: center;
  gap: 12px;
}

.header h1 {
  all: unset;
  font-size: 16px;
  font-weight: 600;
  color: var(--cs-text-primary);
}

.badge {
  background: var(--cs-bg-tertiary);
  color: var(--cs-text-secondary);
  padding: 2px 8px;
  border-radius: 10px;
  font-size: 12px;
  font-weight: 500;
}

.close-btn {
  all: unset;
  cursor: pointer;
  width: 28px;
  height: 28px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: var(--cs-radius-sm);
  color: var(--cs-text-secondary);
  font-size: 16px;
  transition: background 150ms, color 150ms;
}

.close-btn:hover {
  background: var(--cs-bg-tertiary);
  color: var(--cs-text-primary);
}

.tabs {
  display: flex;
  gap: 0;
  padding: 0 20px;
  border-bottom: 1px solid var(--cs-border);
  flex-shrink: 0;
}

.tab {
  all: unset;
  cursor: pointer;
  padding: 10px 16px;
  font-size: 13px;
  font-weight: 500;
  color: var(--cs-text-secondary);
  border-bottom: 2px solid transparent;
  transition: color 150ms, border-color 150ms;
  display: flex;
  align-items: center;
  gap: 6px;
}

.tab:hover {
  color: var(--cs-text-primary);
}

.tab.active {
  color: var(--cs-accent);
  border-bottom-color: var(--cs-accent);
}

.tab-count {
  background: var(--cs-bg-tertiary);
  color: var(--cs-text-secondary);
  padding: 1px 6px;
  border-radius: 8px;
  font-size: 11px;
}

.content {
  flex: 1;
  overflow-y: auto;
  padding: 20px;
}
```

## Acceptance Criteria

- Navigating to any page with `?alfred=cart` in the URL shows the overlay
- Overlay has a dark semi-transparent backdrop covering the full viewport
- Centered panel with header showing "Cart Superpowers" title and item count badge
- Close button (X) dismisses the overlay and removes it from DOM
- Escape key dismisses the overlay
- Clicking the backdrop (outside the panel) dismisses the overlay
- Tab bar shows 5 tabs: Items, Add Item, Metadata, Shipping, JSON
- Clicking tabs switches the active tab (visual indicator + placeholder content changes)
- Items tab is selected by default
- Items tab shows item count in a small badge
- No flash of unstyled content — styles are scoped and don't leak to the host page
- The overlay doesn't affect the host page's scrolling or layout when open
- After dismissal, the page returns to its normal state with no leftover DOM elements
- Double-triggering (e.g., navigating to `?alfred=cart` twice) doesn't create duplicate overlays

## Testing

1. Run `bun run dev`
2. Navigate to `https://junaid-workspace.myshopify.com/?alfred=cart`
3. Verify overlay appears with header, tabs, and placeholder content
4. Click through tabs — verify active state changes
5. Press Escape — verify overlay closes
6. Re-add `?alfred=cart` and verify it opens again
7. Click X button — verify overlay closes
8. Click backdrop — verify overlay closes
