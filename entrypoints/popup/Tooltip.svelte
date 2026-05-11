<script lang="ts">
  let { title = '', text = '' }: { title?: string; text: string } = $props();
  let visible = $state(false);
  let pos = $state({ top: 0, right: 0, arrowRight: 0 });

  function show(e: MouseEvent) {
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const tipRight = window.innerWidth - rect.right - 8;
    const iconCenter = window.innerWidth - rect.left - rect.width / 2;
    pos = { top: rect.top - 8, right: tipRight, arrowRight: iconCenter - tipRight - 5 };
    visible = true;
  }
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<span
  class="trigger"
  onmouseenter={show}
  onmouseleave={() => (visible = false)}
>
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/></svg>
</span>

{#if visible}
  <div class="tip" style="top: {pos.top}px; right: {pos.right}px; transform: translateY(-100%)">
    {#if title}
      <strong class="tip__title">{title}</strong>
    {/if}
    {text}
    <span class="tip__arrow" style="right: {pos.arrowRight}px"></span>
  </div>
{/if}

<style>
  .trigger { position: relative; display: inline-flex; cursor: pointer; }
  .trigger svg { width: 14px; height: 14px; color: var(--text-placeholder); transition: color 0.12s; }
  .trigger:hover svg { color: var(--text-muted); }

  .tip { position: fixed; width: 220px; padding: 10px 12px; font-size: 12px; font-weight: 400; line-height: 1.55; color: var(--text-secondary); background: var(--bg); border: 1px solid var(--border); border-radius: 8px; box-shadow: 0 4px 16px rgba(0, 0, 0, 0.08); pointer-events: none; z-index: 100; }
  .tip__title { display: block; font-size: 12px; font-weight: 600; color: var(--text); margin-bottom: 4px; }
  .tip__arrow { position: absolute; bottom: -6px; width: 10px; height: 10px; background: var(--bg); border-right: 1px solid var(--border); border-bottom: 1px solid var(--border); transform: rotate(45deg); }
</style>
