<script lang="ts">
  let {
    label,
    active,
    dir,
    onclick,
    title
  }: {
    label: string;
    active: boolean;
    dir: 'asc' | 'desc';
    onclick: () => void;
    title?: string;
  } = $props();
</script>

<button class="th-btn" class:th-btn--active={active} {title} {onclick}>
  {label}
  {#if active}
    <svg class="sort-arrow sort-arrow--active" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round">
      {#if dir === 'asc'}<path d="M18 15l-6-6-6 6"/>{:else}<path d="M6 9l6 6 6-6"/>{/if}
    </svg>
  {:else}
    <svg class="sort-arrow sort-arrow--idle" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"><path d="M8 10l4-4 4 4"/><path d="M8 14l4 4 4-4"/></svg>
  {/if}
</button>

<style>
  /* font/color/text-transform inherit from the enclosing .th */
  .th-btn { display: inline-flex; align-items: center; gap: 2px; padding: 0; border: none; background: none; font: inherit; color: inherit; text-transform: inherit; letter-spacing: inherit; cursor: pointer; transition: color 0.12s; }
  .th-btn:hover { color: var(--text-secondary); }
  .th-btn--active { color: var(--text-secondary); }
  .sort-arrow { width: 11px; height: 11px; stroke-width: 2.5; flex-shrink: 0; }
  .sort-arrow--idle { opacity: 0.4; transition: opacity 0.12s; }
  .th-btn:hover .sort-arrow--idle { opacity: 0.75; }
</style>
