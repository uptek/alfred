<script lang="ts">
  import { getTray, removeFromTray, clearTray, watchTray } from '~/utils/compareTray';

  let items = $state.raw<CompareTrayItem[]>([]);

  $effect(() => {
    getTray().then((stored) => {
      items = stored;
    });

    return watchTray((stored) => {
      items = stored;
    });
  });

  function openComparison() {
    const handles = items.map((item) => item.handle).join(',');
    window.location.href = `https://apps.shopify.com/compare/${handles}`;
  }
</script>

{#if items.length > 0}
  <aside class="tray" aria-label="Compare apps tray">
    <ul class="tray-items">
      {#each items as item (item.handle)}
        <li class="tray-item" title={item.name}>
          {#if item.iconUrl}
            <img class="tray-icon" src={item.iconUrl} alt={item.name} />
          {:else}
            <span class="tray-icon tray-icon-placeholder">{item.name.slice(0, 1).toUpperCase()}</span>
          {/if}
          <button
            class="tray-remove"
            aria-label={`Remove ${item.name} from comparison`}
            onclick={() => removeFromTray(item.handle)}
          >
            ×
          </button>
        </li>
      {/each}
    </ul>
    <button class="tray-compare" disabled={items.length < 2} onclick={openComparison}>
      Compare ({items.length})
    </button>
    <button class="tray-clear" onclick={() => clearTray()}>Clear</button>
  </aside>
{/if}

<style>
  .tray {
    position: fixed;
    right: 20px;
    bottom: 20px;
    z-index: 2147483000;
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 10px 12px;
    background: #ffffff;
    border: 1px solid rgba(26, 26, 26, 0.15);
    border-radius: 12px;
    box-shadow: 0 8px 24px rgba(26, 26, 26, 0.2);
    font-family:
      -apple-system, BlinkMacSystemFont, 'San Francisco', 'Segoe UI', Roboto, 'Helvetica Neue', sans-serif;
  }

  .tray-items {
    display: flex;
    gap: 8px;
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .tray-item {
    position: relative;
  }

  .tray-icon {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 36px;
    height: 36px;
    border-radius: 8px;
    border: 1px solid rgba(26, 26, 26, 0.15);
    object-fit: cover;
  }

  .tray-icon-placeholder {
    background: #f1f1f1;
    color: #1a1a1a;
    font-size: 16px;
    font-weight: 600;
  }

  .tray-remove {
    position: absolute;
    top: -6px;
    right: -6px;
    display: none;
    align-items: center;
    justify-content: center;
    width: 16px;
    height: 16px;
    padding: 0;
    border: none;
    border-radius: 50%;
    background: #1a1a1a;
    color: #ffffff;
    font-size: 11px;
    line-height: 1;
    cursor: pointer;
  }

  .tray-item:hover .tray-remove {
    display: flex;
  }

  .tray-compare {
    padding: 8px 14px;
    border: none;
    border-radius: 8px;
    background: #1a1a1a;
    color: #ffffff;
    font-size: 13px;
    font-weight: 600;
    cursor: pointer;
  }

  .tray-compare:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }

  .tray-clear {
    padding: 8px 4px;
    border: none;
    background: none;
    color: #616161;
    font-size: 12px;
    cursor: pointer;
    text-decoration: underline;
  }
</style>
