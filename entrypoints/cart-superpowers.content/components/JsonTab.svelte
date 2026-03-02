<script lang="ts">
  import type { CartData } from '../types';

  let { cart }: { cart: CartData } = $props();

  let jsonString = $derived(JSON.stringify(cart, null, 2));
  let copied = $state(false);
  let copyTimeout: ReturnType<typeof setTimeout>;

  async function copyJson() {
    try {
      await navigator.clipboard.writeText(jsonString);
    } catch {
      const textarea = document.createElement('textarea');
      textarea.value = jsonString;
      textarea.style.position = 'fixed';
      textarea.style.opacity = '0';
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand('copy');
      document.body.removeChild(textarea);
    }
    copied = true;
    clearTimeout(copyTimeout);
    copyTimeout = setTimeout(() => { copied = false; }, 2000);
  }
</script>

<div class="json-tab">
  <div class="json-toolbar">
    <div class="json-meta">
      <span class="json-size">{jsonString.length.toLocaleString()} chars</span>
      <span class="json-items">{cart.items.length} items</span>
    </div>
    <button class="json-copy" onclick={copyJson}>
      {copied ? '\u2713 Copied' : 'Copy JSON'}
    </button>
  </div>

  <pre class="json-pre"><code class="json-code">{jsonString}</code></pre>
</div>

<style>
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
</style>
