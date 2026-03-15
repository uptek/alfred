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
      <span class="json-size">
        <svg class="meta-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M8 3H7a2 2 0 0 0-2 2v5a2 2 0 0 1-2 2 2 2 0 0 1 2 2v5c0 1.1.9 2 2 2h1"/><path d="M16 21h1a2 2 0 0 0 2-2v-5c0-1.1.9-2 2-2a2 2 0 0 1-2-2V5a2 2 0 0 0-2-2h-1"/></svg>
        {jsonString.length.toLocaleString()} chars
      </span>
      <span class="json-items">{cart.items.length} items</span>
    </div>
    <button class="json-copy" onclick={copyJson}>
      {#if copied}
        <svg class="btn-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg>
        Copied
      {:else}
        <svg class="btn-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="14" height="14" x="8" y="8" rx="2" ry="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/></svg>
        Copy JSON
      {/if}
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
    border-radius: var(--cs-radius, 12px) var(--cs-radius, 12px) 0 0;
    flex-shrink: 0;
  }

  .json-meta {
    display: flex;
    gap: 16px;
    font-size: 12px;
    color: var(--cs-text-muted);
  }

  .json-size {
    display: inline-flex;
    align-items: center;
    gap: 5px;
  }

  .meta-icon {
    width: 13px;
    height: 13px;
    opacity: 0.6;
  }

  .json-copy {
    all: unset;
    cursor: pointer;
    padding: 6px 14px;
    background: var(--cs-bg-tertiary);
    color: var(--cs-text-primary);
    border-radius: var(--cs-radius-sm);
    font-size: 12px;
    font-weight: 600;
    transition: background 200ms;
    white-space: nowrap;
    display: inline-flex;
    align-items: center;
    gap: 5px;
  }

  .btn-icon {
    width: 14px;
    height: 14px;
    flex-shrink: 0;
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
    border-radius: 0 0 var(--cs-radius, 12px) var(--cs-radius, 12px);
    overflow: auto;
    font-family: 'SF Mono', 'JetBrains Mono', 'Fira Code', 'Cascadia Code', ui-monospace, Menlo, Monaco, Consolas, monospace;
    font-size: 12px;
    line-height: 1.6;
    color: var(--cs-text-primary);
    tab-size: 2;
    white-space: pre;
    word-break: break-all;
  }

  .json-pre::-webkit-scrollbar {
    width: 6px;
    height: 6px;
  }

  .json-pre::-webkit-scrollbar-track {
    background: transparent;
  }

  .json-pre::-webkit-scrollbar-thumb {
    background: var(--cs-border);
    border-radius: 3px;
  }

  .json-code {
    color: inherit;
    font: inherit;
  }
</style>
