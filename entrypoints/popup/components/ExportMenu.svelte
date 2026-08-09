<script module lang="ts">
  export type ExportItem = {
    label: string;
    desc: string;
    onClick: () => void;
    /** Copy actions swap their label to feedback in place, so the menu stays open. */
    keepOpen?: boolean;
    dividerBefore?: boolean;
  };
</script>

<script lang="ts">
  import ToolbarButton from './ToolbarButton.svelte';

  let {
    items,
    label,
    open,
    onToggle,
    onClose
  }: {
    items: ExportItem[];
    label: string;
    open: boolean;
    onToggle: () => void;
    onClose: () => void;
  } = $props();

  function run(item: ExportItem) {
    if (!item.keepOpen) onClose();
    item.onClick();
  }
</script>

<div class="export menu">
  <ToolbarButton onclick={onToggle} ariaLabel={label} title={label} ariaHasPopup="menu" ariaExpanded={open}>
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
  </ToolbarButton>
  {#if open}
    <div class="export__menu" role="menu">
      {#each items as item, i (i)}
        {#if item.dividerBefore}<div class="export__divider"></div>{/if}
        <button class="export__item" role="menuitem" onclick={() => run(item)}>
          <span class="export__item-label">{item.label}</span>
          <span class="export__item-desc">{item.desc}</span>
        </button>
      {/each}
    </div>
  {/if}
</div>

<style>
  .export { position: relative; }
  .export__menu { position: absolute; top: calc(100% + 4px); right: 0; background: var(--bg); border: 1px solid var(--border-strong); border-radius: 8px; box-shadow: var(--shadow-pop); z-index: 10; min-width: 150px; padding: 4px; }
  .export__item { display: flex; align-items: center; justify-content: space-between; width: 100%; padding: 6px 10px; border: none; background: none; font-family: inherit; font-size: 12px; cursor: pointer; border-radius: 5px; transition: background 0.1s; }
  .export__item:hover { background: var(--bg-hover); }
  .export__item-label { font-weight: 600; color: var(--text); }
  .export__item-desc { font-size: 11px; color: var(--text-muted); }
  .export__divider { height: 1px; margin: 4px 6px; background: var(--border); }
</style>
