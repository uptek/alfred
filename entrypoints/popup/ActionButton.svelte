<script lang="ts">
  import type { Snippet } from 'svelte';

  let {
    href,
    onclick,
    children
  }: { href?: string; onclick?: () => void; children: Snippet } = $props();
</script>

{#if href !== undefined}
  <a class="action-btn" {href} target="_blank" rel="noopener" {onclick}>
    {@render children()}
  </a>
{:else}
  <button class="action-btn" {onclick}>
    {@render children()}
  </button>
{/if}

<style>
  .action-btn { display: inline-flex; align-items: center; gap: 5px; padding: 5px 10px; font-size: 12px; font-weight: 500; color: var(--text-muted); background: var(--bg); border: 1px solid var(--border-strong); border-radius: 6px; cursor: pointer; transition: all 0.12s; font-family: inherit; text-decoration: none; }
  .action-btn:hover { border-color: var(--action-hover-border); color: var(--action-hover-fg); background: var(--action-hover-bg); box-shadow: var(--action-hover-shadow); }
  .action-btn:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
  .action-btn :global(svg) { width: 13px; height: 13px; flex-shrink: 0; stroke-width: 1.8; }
</style>
