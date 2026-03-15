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
    const isInitial = !cart;
    if (isInitial) isLoading = true;
    else isUpdating = true;
    error = null;
    try {
      cart = await api.getCart();
    } catch (err) {
      error = err instanceof Error ? err.message : String(err);
    } finally {
      if (isInitial) isLoading = false;
      else isUpdating = false;
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
        <svg class="icon-zap" viewBox="0 0 24 24" fill="currentColor" width="18" height="18"><path d="M13 2 3 14h9l-1 8 10-12h-9l1-8z"/></svg>
        <h1>Cart Superpowers</h1>
        {#if cart}
          <span class="badge">{cart.item_count} items</span>
        {/if}
      </div>
      <div class="header-right">
        <button class="icon-btn" onclick={loadCart} disabled={isLoading || isUpdating} title="Refresh cart">
          <svg class="icon" class:spinning={isLoading} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></svg>
        </button>
        <button class="icon-btn" onclick={() => theme = theme === 'dark' ? 'light' : 'dark'} title="Toggle theme">
          {#if theme === 'dark'}
            <svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="5"/><path d="M12 1v2m0 18v2M4.22 4.22l1.42 1.42m12.72 12.72 1.42 1.42M1 12h2m18 0h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"/></svg>
          {:else}
            <svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>
          {/if}
        </button>
        <button class="icon-btn icon-btn-close" onclick={onClose} title="Close">
          <svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6 6 18M6 6l12 12"/></svg>
        </button>
      </div>
    </header>

    {#if isLoading}
      <div class="state-container">
        <div class="loading-spinner"></div>
        <span class="state-text">Loading cart&hellip;</span>
      </div>
    {:else if error && !cart}
      <div class="state-container">
        <svg class="state-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M12 8v4"/><path d="M12 16h.01"/></svg>
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
          <button class="error-dismiss" onclick={() => error = null}>
            <svg class="icon-xs" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6 6 18M6 6l12 12"/></svg>
          </button>
        </div>
      {/if}

      <nav class="tabs">
        {#each tabs as tab}
          <button
            class="tab"
            class:active={activeTab === tab.id}
            onclick={() => activeTab = tab.id}
          >
            {#if tab.id === 'items'}
              <svg class="tab-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z"/><path d="M3 6h18"/><path d="M16 10a4 4 0 0 1-8 0"/></svg>
            {:else if tab.id === 'add'}
              <svg class="tab-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M8 12h8"/><path d="M12 8v8"/></svg>
            {:else if tab.id === 'metadata'}
              <svg class="tab-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2H2v10l9.29 9.29c.94.94 2.48.94 3.42 0l6.58-6.58c.94-.94.94-2.48 0-3.42z"/><path d="M7 7h.01"/></svg>
            {:else if tab.id === 'shipping'}
              <svg class="tab-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 18V6a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2v11a1 1 0 0 0 1 1h2"/><path d="M15 18H9"/><path d="M19 18h2a1 1 0 0 0 1-1v-3.65a1 1 0 0 0-.22-.624l-3.48-4.35A1 1 0 0 0 17.52 8H14"/><circle cx="17" cy="18" r="2"/><circle cx="7" cy="18" r="2"/></svg>
            {:else if tab.id === 'json'}
              <svg class="tab-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M8 3H7a2 2 0 0 0-2 2v5a2 2 0 0 1-2 2 2 2 0 0 1 2 2v5c0 1.1.9 2 2 2h1"/><path d="M16 21h1a2 2 0 0 0 2-2v-5c0-1.1.9-2 2-2a2 2 0 0 1-2-2V5a2 2 0 0 0-2-2h-1"/></svg>
            {/if}
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
    background: rgba(0, 0, 0, 0.65);
    display: flex;
    align-items: center;
    justify-content: center;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, "Noto Sans", Helvetica, Arial, sans-serif;
    font-size: 14px;
    line-height: 1.5;
    color: var(--cs-text-primary);
    animation: overlayIn 200ms ease-out;
    -webkit-font-smoothing: antialiased;
    -moz-osx-font-smoothing: grayscale;

    /* Design tokens — dark theme */
    --cs-bg-primary: #111116;
    --cs-bg-secondary: #1a1a22;
    --cs-bg-tertiary: #242430;
    --cs-bg-hover: #2d2d3a;
    --cs-text-primary: #ededf2;
    --cs-text-secondary: #8b8ba0;
    --cs-text-muted: #555570;
    --cs-accent: #7c6af6;
    --cs-accent-hover: #8f7fff;
    --cs-accent-subtle: rgba(124, 106, 246, 0.08);
    --cs-border: #2a2a38;
    --cs-danger: #ef4444;
    --cs-danger-hover: #f87171;
    --cs-success: #22c55e;
    --cs-radius: 12px;
    --cs-radius-sm: 6px;
  }

  .overlay.light {
    background: rgba(0, 0, 0, 0.25);

    --cs-bg-primary: #ffffff;
    --cs-bg-secondary: #f6f6f9;
    --cs-bg-tertiary: #eeeef3;
    --cs-bg-hover: #e4e4ec;
    --cs-text-primary: #111116;
    --cs-text-secondary: #5a5a72;
    --cs-text-muted: #9a9ab0;
    --cs-accent: #6855e0;
    --cs-accent-hover: #7c6af6;
    --cs-accent-subtle: rgba(104, 85, 224, 0.06);
    --cs-border: #e2e2ea;
    --cs-danger: #dc2626;
    --cs-danger-hover: #ef4444;
    --cs-success: #16a34a;
  }

  @keyframes overlayIn {
    from { opacity: 0; }
  }

  @keyframes panelIn {
    from {
      opacity: 0;
      transform: translateY(12px) scale(0.98);
    }
  }

  .panel {
    position: relative;
    background: var(--cs-bg-primary);
    border: 1px solid var(--cs-border);
    border-radius: var(--cs-radius);
    box-shadow:
      0 25px 60px -12px rgba(0, 0, 0, 0.6),
      0 0 80px -20px rgba(124, 106, 246, 0.1);
    width: 95vw;
    max-width: 1200px;
    height: 85vh;
    display: flex;
    flex-direction: column;
    overflow: hidden;
    animation: panelIn 300ms cubic-bezier(0.16, 1, 0.3, 1);
  }

  .panel::before {
    content: '';
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    height: 1px;
    background: linear-gradient(90deg, transparent, var(--cs-accent), transparent);
    opacity: 0.5;
    z-index: 2;
    border-radius: var(--cs-radius) var(--cs-radius) 0 0;
  }

  .light .panel {
    box-shadow:
      0 25px 60px -12px rgba(0, 0, 0, 0.12),
      0 0 80px -20px rgba(104, 85, 224, 0.06);
  }

  .header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 14px 20px;
    border-bottom: 1px solid var(--cs-border);
    flex-shrink: 0;
  }

  .header-left {
    display: flex;
    align-items: center;
    gap: 10px;
  }

  .icon-zap {
    width: 18px;
    height: 18px;
    color: #fbbf24;
    filter: drop-shadow(0 0 4px rgba(251, 191, 36, 0.35));
    flex-shrink: 0;
  }

  .header h1 {
    all: unset;
    font-size: 15px;
    font-weight: 650;
    color: var(--cs-text-primary);
    letter-spacing: -0.01em;
  }

  .badge {
    background: var(--cs-accent-subtle);
    color: var(--cs-accent);
    padding: 2px 10px;
    border-radius: 10px;
    font-size: 12px;
    font-weight: 550;
  }

  .header-right {
    display: flex;
    align-items: center;
    gap: 2px;
  }

  .icon {
    width: 16px;
    height: 16px;
    flex-shrink: 0;
  }

  .icon-xs {
    width: 14px;
    height: 14px;
    flex-shrink: 0;
  }

  .icon-btn {
    all: unset;
    cursor: pointer;
    width: 32px;
    height: 32px;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: var(--cs-radius-sm);
    color: var(--cs-text-secondary);
    transition: background 200ms, color 200ms;
  }

  .icon-btn:hover:not(:disabled) {
    background: var(--cs-bg-tertiary);
    color: var(--cs-text-primary);
  }

  .icon-btn:disabled {
    opacity: 0.35;
    cursor: not-allowed;
  }

  .icon-btn-close:hover {
    background: rgba(239, 68, 68, 0.1);
    color: var(--cs-danger);
  }

  .spinning {
    animation: spin 0.7s linear infinite;
  }

  .tabs {
    display: flex;
    gap: 0;
    padding: 0 16px;
    border-bottom: 1px solid var(--cs-border);
    flex-shrink: 0;
  }

  .tab {
    all: unset;
    cursor: pointer;
    padding: 10px 14px;
    font-size: 13px;
    font-weight: 500;
    color: var(--cs-text-muted);
    border-bottom: 2px solid transparent;
    transition: color 200ms, border-color 200ms, background 200ms;
    display: flex;
    align-items: center;
    gap: 7px;
  }

  .tab:hover {
    color: var(--cs-text-secondary);
  }

  .tab.active {
    color: var(--cs-accent);
    border-bottom-color: var(--cs-accent);
    background: var(--cs-accent-subtle);
  }

  .tab-icon {
    width: 14px;
    height: 14px;
    flex-shrink: 0;
    opacity: 0.6;
  }

  .tab.active .tab-icon {
    opacity: 1;
  }

  .tab-count {
    background: var(--cs-bg-tertiary);
    color: var(--cs-text-secondary);
    padding: 1px 7px;
    border-radius: 8px;
    font-size: 11px;
    font-weight: 550;
    font-variant-numeric: tabular-nums;
  }

  .tab.active .tab-count {
    background: var(--cs-accent-subtle);
    color: var(--cs-accent);
  }

  .content {
    flex: 1;
    overflow-y: auto;
    padding: 20px;
  }

  .content::-webkit-scrollbar {
    width: 6px;
  }

  .content::-webkit-scrollbar-track {
    background: transparent;
  }

  .content::-webkit-scrollbar-thumb {
    background: var(--cs-border);
    border-radius: 3px;
  }

  .content::-webkit-scrollbar-thumb:hover {
    background: var(--cs-bg-hover);
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

  .state-icon {
    width: 36px;
    height: 36px;
    color: var(--cs-text-muted);
    opacity: 0.5;
  }

  .state-text {
    font-size: 14px;
  }

  .loading-spinner {
    width: 28px;
    height: 28px;
    border: 2.5px solid var(--cs-border);
    border-top-color: var(--cs-accent);
    border-radius: 50%;
    animation: spin 0.7s linear infinite;
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
    transition: background 200ms;
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
    animation: progress 1.2s ease-in-out infinite;
    z-index: 3;
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
    padding: 10px 20px;
    background: color-mix(in srgb, var(--cs-danger) 8%, transparent);
    border-bottom: 1px solid color-mix(in srgb, var(--cs-danger) 15%, transparent);
    color: var(--cs-danger);
    font-size: 13px;
    flex-shrink: 0;
  }

  .error-dismiss {
    all: unset;
    cursor: pointer;
    width: 24px;
    height: 24px;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: var(--cs-radius-sm);
    color: var(--cs-danger);
    transition: background 200ms;
  }

  .error-dismiss:hover {
    background: rgba(239, 68, 68, 0.12);
  }
</style>
