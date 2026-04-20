<script lang="ts">
  let { text, class: className = '' }: { text: string; class?: string } = $props();

  let copied = $state(false);

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(text);
      copied = true;
      setTimeout(() => (copied = false), 1500);
    } catch { /* ignore */ }
  }
</script>

<svg
  class="w-5 h-5 p-0.5 shrink-0 self-center cursor-pointer text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded transition-colors {copied ? 'text-green-600' : ''} {className}"
  fill="none"
  stroke="currentColor"
  viewBox="0 0 24 24"
  onclick={handleCopy}
  title={copied ? 'Copied!' : 'Click to copy'}
  role="button"
  tabindex="0"
  onkeydown={(e) => { if (e.key === 'Enter') e.currentTarget.click(); }}>
  {#if copied}
    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7" />
  {:else}
    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
  {/if}
</svg>
