<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import * as api from './cartApi';
  import { trackAction } from '@/utils/analytics';
  import type { AddItemPayload, CartData, CartItem, TabId } from './types';
  import ItemsTab from './components/ItemsTab.svelte';
  import AddItemTab from './components/AddItemTab.svelte';
  import MetadataTab from './components/MetadataTab.svelte';
  import ShippingTab from './components/ShippingTab.svelte';
  import JsonTab from './components/JsonTab.svelte';

  let { onClose }: { onClose: () => void } = $props();

  type Theme = 'light' | 'dark';
  let theme: Theme = $state(
    window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
  );

  let cart: CartData | null = $state(null);
  let activeTab: TabId = $state('items');
  let isLoading = $state(true);
  let isUpdating = $state(false);
  let pendingMutations = $state(0);
  let error: string | null = $state(null);
  let mutateQueue: Promise<void> = Promise.resolve();

  const tabs: Array<{ id: TabId; label: string }> = [
    { id: 'items', label: 'Items' },
    { id: 'add', label: 'Add Item' },
    { id: 'metadata', label: 'Metadata' },
    { id: 'shipping', label: 'Shipping' },
    { id: 'json', label: 'JSON' },
  ];

  async function loadCart() {
    isLoading = true;
    error = null;
    try {
      cart = await api.getCart();
    } catch (err) {
      error = err instanceof Error ? err.message : String(err);
    } finally {
      isLoading = false;
    }
  }

  function mutate(fn: () => Promise<CartData>): Promise<void> {
    pendingMutations++;
    isUpdating = true;

    const run = async () => {
      error = null;
      try {
        cart = await fn();
      } catch (err) {
        error = err instanceof Error ? err.message : String(err);
      } finally {
        pendingMutations--;
        if (pendingMutations === 0) isUpdating = false;
      }
    };

    mutateQueue = mutateQueue.then(run);
    return mutateQueue;
  }

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === 'Escape') onClose();
  }

  onMount(() => {
    document.addEventListener('keydown', handleKeydown);
    loadCart();
  });

  onDestroy(() => {
    document.removeEventListener('keydown', handleKeydown);
  });
</script>

<!-- svelte-ignore a11y_click_events_have_key_events -->
<!-- svelte-ignore a11y_no_static_element_interactions -->
<div class="overlay" class:light={theme === 'light'} onclick={(e: MouseEvent) => { if (e.target === e.currentTarget) onClose(); }}>
  <div class="panel">
    <header class="header">
      <div class="header-left">
        <h1>Cart Superpowers</h1>
        {#if cart}
          <span class="badge">{cart.item_count} items</span>
        {/if}
      </div>
      <div class="header-right">
        <button class="theme-toggle" onclick={() => theme = theme === 'dark' ? 'light' : 'dark'} title="Toggle theme">
          {#if theme === 'dark'}&#x2600;{:else}&#x263E;{/if}
        </button>
        <button class="close-btn" onclick={onClose}>&#x2715;</button>
      </div>
    </header>

    {#if isLoading}
      <div class="state-container">
        <div class="loading-spinner"></div>
        <span class="state-text">Loading cart&hellip;</span>
      </div>
    {:else if error && !cart}
      <div class="state-container">
        <p class="error-title">Failed to load cart</p>
        <p class="error-message">{error}</p>
        <button class="retry-btn" onclick={loadCart}>Retry</button>
      </div>
    {:else if cart}
      {#if isUpdating}
        <div class="updating-bar"></div>
      {/if}

      {#if error}
        <div class="error-banner">
          <span>{error}</span>
          <button class="error-dismiss" onclick={() => error = null}>&#x2715;</button>
        </div>
      {/if}

      <nav class="tabs">
        {#each tabs as tab}
          <button
            class="tab"
            class:active={activeTab === tab.id}
            onclick={() => activeTab = tab.id}
          >
            {tab.label}
            {#if tab.id === 'items'}
              <span class="tab-count">{cart.items.length}</span>
            {/if}
          </button>
        {/each}
      </nav>

      <main class="content">
        {#if activeTab === 'items'}
          <ItemsTab
            {cart}
            onUpdateQuantity={async (key, qty) => { await mutate(() => api.changeItem({ id: key, quantity: qty })); trackAction('cart_superpowers_update_quantity'); }}
            onRemoveItem={async (key) => { await mutate(() => api.changeItem({ id: key, quantity: 0 })); trackAction('cart_superpowers_remove_item'); }}
            onUpdateProperties={(key, qty, props) => mutate(() => api.changeItem({ id: key, quantity: qty, properties: props }))}
            onClearCart={async () => { await mutate(() => api.clearCart()); trackAction('cart_superpowers_clear'); }}
            onSwitchTab={(tab) => activeTab = tab as TabId}
            onSwitchVariant={(key, oldItem, newVariantId) => {
              return mutate(async () => {
                await api.changeItem({ id: key, quantity: 0 });
                return api.addItem({
                  id: newVariantId,
                  quantity: oldItem.quantity,
                  ...(oldItem.properties && Object.keys(oldItem.properties).length > 0 ? { properties: oldItem.properties } : {}),
                  ...(oldItem.selling_plan_allocation ? { selling_plan: oldItem.selling_plan_allocation.selling_plan.id } : {}),
                });
              });
            }}
            onFetchProduct={(url) => api.getProductByUrl(url)}
          />
        {:else if activeTab === 'add'}
          <AddItemTab
            onAddItem={(payload: AddItemPayload) => { mutate(() => api.addItem(payload)); activeTab = 'items'; trackAction('cart_superpowers_add_item'); }}
            onFetchProduct={(url: string) => api.getProductByUrl(url)}
          />
        {:else if activeTab === 'metadata'}
          <MetadataTab
            {cart}
            onUpdateNote={(note) => { mutate(() => api.updateCart({ note })); trackAction('cart_superpowers_update_note'); }}
            onUpdateAttributes={(attrs) => mutate(() => api.updateCart({ attributes: attrs }))}
            onApplyDiscount={(code) => { mutate(() => api.updateCart({ discount: code })); trackAction('cart_superpowers_apply_discount'); }}
            onRemoveDiscount={() => mutate(() => api.updateCart({ discount: '' }))}
          />
        {:else if activeTab === 'shipping'}
          <ShippingTab {cart} onCalculateRates={(addr) => { trackAction('cart_superpowers_calculate_shipping'); return api.getShippingRates(addr); }} />
        {:else if activeTab === 'json'}
          <JsonTab {cart} />
        {/if}
      </main>
    {/if}
  </div>
</div>

<style>
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
    --cs-accent: #6366f1;
    --cs-accent-hover: #818cf8;
    --cs-border: #3c3c3c;
    --cs-danger: #ef4444;
    --cs-danger-hover: #f87171;
    --cs-success: #22c55e;
    --cs-radius: 8px;
    --cs-radius-sm: 4px;
  }

  .overlay.light {
    background: rgba(0, 0, 0, 0.3);
    color: #1a1a1a;

    --cs-bg-primary: #ffffff;
    --cs-bg-secondary: #f5f5f5;
    --cs-bg-tertiary: #ebebeb;
    --cs-bg-hover: #e0e0e0;
    --cs-text-primary: #1a1a1a;
    --cs-text-secondary: #555555;
    --cs-text-muted: #999999;
    --cs-accent: #4f46e5;
    --cs-accent-hover: #6366f1;
    --cs-border: #e0e0e0;
    --cs-danger: #dc2626;
    --cs-danger-hover: #ef4444;
    --cs-success: #16a34a;
  }

  .panel {
    position: relative;
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

  .light .panel {
    box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.15);
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

  .header-right {
    display: flex;
    align-items: center;
    gap: 4px;
  }

  .theme-toggle {
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

  .theme-toggle:hover {
    background: var(--cs-bg-tertiary);
    color: var(--cs-text-primary);
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

  .content p {
    margin: 0;
    color: var(--cs-text-muted);
  }

  .state-container {
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 12px;
    color: var(--cs-text-muted);
  }

  .state-text {
    font-size: 14px;
  }

  .loading-spinner {
    width: 24px;
    height: 24px;
    border: 2px solid var(--cs-border);
    border-top-color: var(--cs-accent);
    border-radius: 50%;
    animation: spin 0.6s linear infinite;
  }

  @keyframes spin {
    to { transform: rotate(360deg); }
  }

  .error-title {
    font-size: 16px;
    font-weight: 500;
    color: var(--cs-text-secondary);
    margin: 0;
  }

  .error-message {
    font-size: 13px;
    color: var(--cs-text-muted);
    margin: 0;
    max-width: 400px;
    text-align: center;
  }

  .retry-btn {
    all: unset;
    cursor: pointer;
    padding: 8px 20px;
    background: var(--cs-accent);
    color: white;
    border-radius: var(--cs-radius-sm);
    font-size: 13px;
    font-weight: 600;
    transition: background 150ms;
  }

  .retry-btn:hover {
    background: var(--cs-accent-hover);
  }

  .updating-bar {
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    height: 2px;
    background: var(--cs-accent);
    animation: progress 1s ease-in-out infinite;
    z-index: 1;
  }

  @keyframes progress {
    0% { transform: scaleX(0); transform-origin: left; }
    50% { transform: scaleX(1); transform-origin: left; }
    50.1% { transform: scaleX(1); transform-origin: right; }
    100% { transform: scaleX(0); transform-origin: right; }
  }

  .error-banner {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 8px 20px;
    background: color-mix(in srgb, var(--cs-danger) 10%, transparent);
    border-bottom: 1px solid color-mix(in srgb, var(--cs-danger) 20%, transparent);
    color: var(--cs-danger);
    font-size: 13px;
    flex-shrink: 0;
  }

  .error-dismiss {
    all: unset;
    cursor: pointer;
    padding: 2px 6px;
    border-radius: var(--cs-radius-sm);
    color: var(--cs-danger);
    font-size: 14px;
    transition: background 150ms;
  }

  .error-dismiss:hover {
    background: rgba(239, 68, 68, 0.15);
  }
</style>
