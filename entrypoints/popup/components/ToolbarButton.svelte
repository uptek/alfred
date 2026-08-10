<script lang="ts">
  import type { Snippet } from 'svelte';

  let {
    onclick,
    children,
    active = false,
    title,
    ariaLabel,
    ariaHasPopup,
    ariaExpanded
  }: {
    onclick: () => void;
    children: Snippet;
    active?: boolean;
    title?: string;
    ariaLabel?: string;
    ariaHasPopup?: 'menu';
    ariaExpanded?: boolean;
  } = $props();
</script>

<button
  class="toolbar-btn"
  class:toolbar-btn--active={active}
  {title}
  aria-label={ariaLabel}
  aria-haspopup={ariaHasPopup}
  aria-expanded={ariaExpanded}
  {onclick}
>
  {@render children()}
</button>

<style>
  .toolbar-btn { box-sizing: border-box; display: flex; align-items: center; gap: 4px; padding: 0 8px; height: 28px; border-radius: 6px; border: 1px solid var(--border-strong); background: var(--bg); font-family: inherit; font-size: 11px; font-weight: 600; color: var(--text-muted); cursor: pointer; transition: all 0.12s; white-space: nowrap; flex-shrink: 0; }
  .toolbar-btn:hover { border-color: var(--action-hover-border); color: var(--action-hover-fg); background: var(--action-hover-bg); box-shadow: var(--action-hover-shadow); }
  .toolbar-btn--active { background: var(--btn-bg); color: var(--btn-text); border-color: var(--btn-bg); }
  .toolbar-btn--active:hover { background: var(--btn-bg-hover); border-color: var(--btn-bg-hover); color: var(--btn-text); }
  /* Icons come in as a caller-declared snippet, so they carry the caller's
     style scope, not this component's — :global is the only way to size them. */
  .toolbar-btn :global(svg) { width: 13px; height: 13px; stroke-width: 1.8; flex-shrink: 0; }
</style>
