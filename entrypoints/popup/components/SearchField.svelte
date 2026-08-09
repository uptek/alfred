<script lang="ts">
  import type { Snippet } from 'svelte';

  let {
    value = $bindable(''),
    placeholder,
    clearLabel = 'Clear filter',
    autofocus = false,
    trailing
  }: {
    value?: string;
    placeholder: string;
    clearLabel?: string;
    /** For fields revealed by a toggle, where mounting is the moment to focus. */
    autofocus?: boolean;
    /** Extra control pinned after the clear button (Sitemaps' "This page"). */
    trailing?: Snippet;
  } = $props();

  let input = $state<HTMLInputElement | null>(null);

  $effect(() => {
    if (autofocus) input?.focus();
  });
</script>

<div class="search">
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" class="search__icon"><circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/></svg>
  <input class="search__input" type="text" {placeholder} bind:value bind:this={input} />
  {#if value}
    <button class="search__clear" aria-label={clearLabel} title={clearLabel} onclick={() => { value = ''; input?.focus(); }}>
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round"><path d="M18 6L6 18M6 6l12 12"/></svg>
    </button>
  {/if}
  {@render trailing?.()}
</div>

<style>
  .search { display: flex; align-items: center; gap: 6px; margin: 0 20px 10px; padding: 5px 10px; border: 1px solid var(--border-strong); border-radius: 6px; transition: border-color 0.12s; }
  .search:focus-within { border-color: var(--border-hover); }
  .search__icon { width: 14px; height: 14px; flex-shrink: 0; stroke-width: 1.8; color: var(--text-muted); }
  .search__input { flex: 1; border: none; outline: none; background: none; font-family: inherit; font-size: 12px; color: var(--text); }
  .search__input::placeholder { color: var(--text-placeholder); }
  .search__clear { display: flex; align-items: center; justify-content: center; width: 16px; height: 16px; padding: 0; border: none; background: none; cursor: pointer; color: var(--text-muted); border-radius: 3px; transition: all 0.12s; }
  .search__clear:hover { color: var(--text-secondary); background: var(--bg-hover); }
  .search__clear svg { width: 12px; height: 12px; stroke-width: 2; }
</style>
