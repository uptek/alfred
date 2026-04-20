<script lang="ts">
  import { getTheme } from './utils';
  import Theme from './Theme.svelte';
  import Settings from './Settings.svelte';
  import type { StoreInfo } from './types';
  import '@/assets/tailwind.css';

  let activeTab = $state<string>('theme');
  let hoveredTab = $state<string | null>(null);
  let storeInfo = $state<StoreInfo | null>(null);
  let loading = $state(true);

  const tabs = [
    { handle: 'theme', name: 'Theme' },
    { handle: 'settings', name: 'Settings' }
  ];

  $effect(() => {
    const fetchStoreInfo = async () => {
      const storeData = await getTheme();
      storeInfo = storeData;
      loading = false;
    };
    fetchStoreInfo();
  });

  function activeOrHoveredIndex() {
    const target = hoveredTab ?? activeTab;
    const idx = tabs.findIndex((t) => t.handle === target);
    return idx >= 0 ? idx : 0;
  }
</script>

{#if loading}
  <div class="bg-white min-h-[200px] p-4">
    <div class="flex items-center justify-center gap-3 min-h-[200px]">
      <div class="w-5 h-5 border-2 border-slate-200 border-t-indigo-500 rounded-full animate-spin"></div>
      <span class="text-slate-500 text-sm">Detecting theme...</span>
    </div>
  </div>
{:else if !storeInfo?.isShopify}
  <div class="bg-white max-w-[400px] min-h-[200px] p-4 m-auto">
    <div class="flex flex-col items-center justify-center min-h-[200px] px-15">
      <h3 class="text-base font-semibold text-slate-900 mb-2">Not a Shopify store</h3>
      <p class="text-sm text-slate-500 leading-relaxed text-center">
        Navigate to a Shopify store to see Alfred's magic ✨
      </p>
    </div>
  </div>
{:else}
  <div class="bg-white min-h-[200px] p-4">
    <!-- svelte-ignore a11y_mouse_events_have_key_events -->
    <div
      class="relative flex p-[3px] bg-[#f7f7f7] border border-[#e3e3e3] rounded-xl"
      onmouseleave={() => (hoveredTab = null)}>
      <div
        class="absolute inset-[3px] rounded-[10px] bg-white shadow-[0_1px_2px_rgba(0,0,0,0.06),0_1px_3px_rgba(0,0,0,0.1)] transition-transform duration-300 ease-[cubic-bezier(0.4,0,0.2,1)] pointer-events-none"
        style="width: calc((100% - 6px) / {tabs.length}); transform: translateX({activeOrHoveredIndex() * 100}%)"
      ></div>
      {#each tabs as tab}
        <!-- svelte-ignore a11y_mouse_events_have_key_events -->
        <button
          class="relative z-10 flex-1 inline-flex items-center justify-center px-6 py-2 text-[13px] leading-snug bg-transparent border-none rounded-[10px] cursor-pointer transition-[color,font-weight] duration-200 ease-out {activeTab === tab.handle ? 'text-slate-900 font-semibold' : 'text-slate-500 font-medium'} {hoveredTab === tab.handle ? 'text-slate-900' : ''}"
          onclick={() => (activeTab = tab.handle)}
          onmouseenter={() => (hoveredTab = tab.handle)}>
          {tab.name}
        </button>
      {/each}
    </div>

    <div>
      {#if activeTab === 'theme'}
        <Theme {storeInfo} />
      {:else if activeTab === 'settings'}
        <Settings {storeInfo} />
      {/if}
    </div>
  </div>
{/if}
