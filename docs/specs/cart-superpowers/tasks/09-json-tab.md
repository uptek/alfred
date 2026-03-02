# Task 09: JSON Tab

**Phase**: 1 — UI Skeleton
**Files to create**:
- `entrypoints/cart-superpowers.content/components/JsonTab.svelte`
**Depends on**: Task 03

## Objective

Build the JSON tab — a read-only, syntax-highlighted JSON viewer of the full cart object with a copy-to-clipboard button. This is the simplest tab and serves as a reference view for developers.

## Props

- `cart: CartData` — the full cart object

## Layout

Two parts:

1. **Toolbar** — copy button + metadata
2. **JSON Viewer** — formatted JSON in a scrollable pre block

## Structure

```svelte
<div class="json-tab">
  <div class="json-toolbar">
    <div class="json-meta">
      <span class="json-size">{jsonString.length.toLocaleString()} chars</span>
      <span class="json-items">{cart.items.length} items</span>
    </div>
    <button class="json-copy" on:click={copyJson}>
      {copied ? '✓ Copied' : 'Copy JSON'}
    </button>
  </div>

  <pre class="json-pre"><code class="json-code">{jsonString}</code></pre>
</div>
```

## Behavior

### JSON Formatting

```typescript
$: jsonString = JSON.stringify(cart, null, 2);
```

- Pretty-print the cart object with 2-space indentation
- Show char count and item count in the toolbar

### Copy to Clipboard

```typescript
let copied = false;
let copyTimeout: ReturnType<typeof setTimeout>;

async function copyJson() {
  try {
    await navigator.clipboard.writeText(jsonString);
    copied = true;
    clearTimeout(copyTimeout);
    copyTimeout = setTimeout(() => { copied = false; }, 2000);
  } catch {
    // Fallback: use document.execCommand (for content scripts where clipboard API may not work)
    const textarea = document.createElement('textarea');
    textarea.value = jsonString;
    textarea.style.position = 'fixed';
    textarea.style.opacity = '0';
    document.body.appendChild(textarea);
    textarea.select();
    document.execCommand('copy');
    document.body.removeChild(textarea);
    copied = true;
    clearTimeout(copyTimeout);
    copyTimeout = setTimeout(() => { copied = false; }, 2000);
  }
}
```

- Click "Copy JSON" copies the formatted JSON string to clipboard
- Button text changes to "✓ Copied" for 2 seconds
- Fallback for content script clipboard restrictions

## Styles

```css
.json-tab {
  display: flex;
  flex-direction: column;
  height: 100%;
}

.json-toolbar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px 16px;
  background: var(--cs-bg-secondary);
  border: 1px solid var(--cs-border);
  border-radius: var(--cs-radius) var(--cs-radius) 0 0;
  flex-shrink: 0;
}

.json-meta {
  display: flex;
  gap: 16px;
  font-size: 12px;
  color: var(--cs-text-muted);
}

.json-copy {
  all: unset;
  cursor: pointer;
  padding: 6px 16px;
  background: var(--cs-bg-tertiary);
  color: var(--cs-text-primary);
  border-radius: var(--cs-radius-sm);
  font-size: 12px;
  font-weight: 600;
  transition: background 150ms;
  white-space: nowrap;
}

.json-copy:hover {
  background: var(--cs-bg-hover);
}

.json-pre {
  flex: 1;
  margin: 0;
  padding: 16px;
  background: var(--cs-bg-secondary);
  border: 1px solid var(--cs-border);
  border-top: none;
  border-radius: 0 0 var(--cs-radius) var(--cs-radius);
  overflow: auto;
  font-family: 'SF Mono', 'Fira Code', 'Cascadia Code', Menlo, Monaco, Consolas, monospace;
  font-size: 12px;
  line-height: 1.6;
  color: var(--cs-text-primary);
  tab-size: 2;
  white-space: pre;
  word-break: break-all;
}

.json-code {
  color: inherit;
  font: inherit;
}
```

## Acceptance Criteria

- JSON is displayed with 2-space indentation and monospace font
- Toolbar shows character count and item count
- Copy button copies JSON to clipboard
- After clicking copy, button shows "✓ Copied" for 2 seconds
- JSON viewer is scrollable for long content
- Pre block fills available space in the content area
- Monospace font renders correctly
- All styling matches the dark theme
