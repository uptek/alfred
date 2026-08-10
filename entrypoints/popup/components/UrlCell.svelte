<script lang="ts">
  import { isNavigable } from '../utils/url';

  let { href, text }: { href: string; text: string } = $props();
</script>

{#if isNavigable(href)}
  <a {href} target="_blank" rel="noopener noreferrer" class="url" title={href}>{text}</a>
{:else}
  <span class="url url--inert" title="{href}&#10;&#10;Not openable from the popup">{text}</span>
{/if}

<style>
  .url { color: var(--accent); text-decoration: none; font-family: 'SF Mono', ui-monospace, monospace; font-size: 12px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; min-width: 0; }
  a.url:hover { text-decoration: underline; }
  .url--inert { color: var(--text-muted); }
</style>
