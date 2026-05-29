<script lang="ts">
  let { title = '', text = '' }: { title?: string; text: string } = $props();
  let visible = $state(false);
</script>

<span
  class="trigger"
  role="button"
  tabindex="0"
  onmouseenter={() => (visible = true)}
  onmouseleave={() => (visible = false)}
  onfocus={() => (visible = true)}
  onblur={() => (visible = false)}
>
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/></svg>
  {#if visible}
    <div class="tip">
      {#if title}
        <strong class="tip__title">{title}</strong>
      {/if}
      {text}
      <span class="tip__arrow"></span>
    </div>
  {/if}
</span>

<style>
  .trigger { position: relative; display: inline-flex; cursor: pointer; }
  .trigger svg { width: 14px; height: 14px; color: var(--text-placeholder); transition: color 0.12s; }
  .trigger:hover svg { color: var(--text-muted); }

  .tip { position: absolute; bottom: calc(100% + 8px); right: -8px; width: 220px; padding: 10px 12px; font-size: 12px; font-weight: 400; line-height: 1.55; color: var(--text-secondary); background: var(--bg); border: 1px solid var(--border); border-radius: 8px; box-shadow: 0 4px 16px rgba(0, 0, 0, 0.08); pointer-events: none; z-index: 100; }
  .tip__title { display: block; font-size: 12px; font-weight: 600; color: var(--text); margin-bottom: 4px; }
  .tip__arrow { position: absolute; bottom: -6px; right: 10px; width: 10px; height: 10px; background: var(--bg); border-right: 1px solid var(--border); border-bottom: 1px solid var(--border); transform: rotate(45deg); }
</style>
