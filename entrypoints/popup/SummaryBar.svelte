<script module lang="ts">
  export type SummaryItem = { text: string; tone?: 'warn' | 'err'; title?: string };
</script>

<script lang="ts">
  let { items }: { items: SummaryItem[] } = $props();
</script>

<div class="summary">
  {#each items as item, i (i)}
    {#if i > 0}<span class="summary__sep">&middot;</span>{/if}
    <span
      class:summary__warn={item.tone === 'warn'}
      class:summary__err={item.tone === 'err'}
      title={item.title}>{item.text}</span>
  {/each}
</div>

<style>
  .summary { display: flex; align-items: center; gap: 6px; padding: 7px 20px; border-top: 1px solid var(--border); flex-shrink: 0; font-size: 11.5px; color: var(--text-muted); font-variant-numeric: tabular-nums; }
  .summary__sep { opacity: 0.5; }
  .summary__warn { color: var(--warning); font-weight: 600; }
  .summary__err { color: var(--error); font-weight: 600; }
</style>
