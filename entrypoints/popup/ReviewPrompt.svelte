<script lang="ts">
  import { trackAction, markNudgeShown } from '@/utils/analytics';
  import { CWS_REVIEW_URL, FEEDBACK_URL } from '@/utils/constants';

  let { variant = 'default', source = 'review_nudge' }: {
    variant?: 'default' | 'compact';
    source?: string;
  } = $props();

  let hovered = $state(0);

  $effect(() => {
    markNudgeShown().then((firstTime) => {
      if (firstTime) trackAction('review_nudge_show');
    });
  });

  function handleRate(rating: number) {
    trackAction('credit_click', { source, rating });
    browser.tabs.create({ url: rating === 5 ? CWS_REVIEW_URL : FEEDBACK_URL });
  }
</script>

{#if variant === 'compact'}
  <div class="prompt prompt--compact">
    <span class="prompt__label">Enjoying Alfred?</span>
    <!-- svelte-ignore a11y_no_static_element_interactions a11y_mouse_events_have_key_events -->
    <div class="prompt__stars" onmouseleave={() => (hovered = 0)}>
      {#each [1, 2, 3, 4, 5] as star}
        <!-- svelte-ignore a11y_mouse_events_have_key_events -->
        <button
          onclick={() => handleRate(star)}
          onmouseenter={() => (hovered = star)}
          aria-label="Rate {star} star{star > 1 ? 's' : ''}"
          class="prompt__star">
          <svg width="16" height="16" viewBox="0 0 24 24" fill={star <= hovered ? 'var(--star-active)' : 'var(--star-inactive)'} class="prompt__svg">
            <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/>
          </svg>
        </button>
      {/each}
    </div>
  </div>
{:else}
  <div class="prompt prompt--default">
    <p class="prompt__label">Enjoying Alfred?</p>
    <!-- svelte-ignore a11y_no_static_element_interactions a11y_mouse_events_have_key_events -->
    <div class="prompt__stars" onmouseleave={() => (hovered = 0)}>
      {#each [1, 2, 3, 4, 5] as star}
        <!-- svelte-ignore a11y_mouse_events_have_key_events -->
        <button
          onclick={() => handleRate(star)}
          onmouseenter={() => (hovered = star)}
          aria-label="Rate {star} star{star > 1 ? 's' : ''}"
          class="prompt__star">
          <svg width="30" height="30" viewBox="0 0 24 24" fill={star <= hovered ? 'var(--star-active)' : 'var(--star-inactive)'} class="prompt__svg">
            <path d="M12 3.5c.3 0 .6.2.7.5l2.2 4.5 5 .7c.3 0 .5.2.6.5s0 .6-.2.8l-3.6 3.5.9 5c0 .3-.1.6-.3.7-.3.2-.6.2-.8 0L12 17l-4.5 2.3c-.3.1-.6.1-.8 0-.2-.2-.4-.4-.3-.7l.9-5L3.7 10c-.2-.2-.3-.5-.2-.8s.3-.4.6-.5l5-.7 2.2-4.5c.1-.3.4-.5.7-.5z" />
          </svg>
        </button>
      {/each}
    </div>
  </div>
{/if}

<style>
  /* Prompt block */
  .prompt { display: flex; align-items: center; }
  .prompt__label { margin: 0; }
  .prompt__stars { display: flex; }
  .prompt__star { background: none; border: none; cursor: pointer; padding: 0; line-height: 0; border-radius: 3px; }
  .prompt__star:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
  .prompt__svg { transition: fill 0.15s; pointer-events: none; }

  /* Compact modifier */
  .prompt--compact { gap: 8px; }
  .prompt--compact .prompt__label { font-size: 12px; font-weight: 500; color: var(--text-secondary); }
  .prompt--compact .prompt__stars { gap: 2px; }
  .prompt--compact .prompt__star { transition: transform 0.1s; }
  .prompt--compact .prompt__star:hover { transform: scale(1.2); }
  .prompt--compact:hover .prompt__label { color: var(--text); }

  /* Default modifier */
  .prompt--default { padding: 8px 16px; background: var(--bg-raised); border: 1px solid var(--border); border-radius: 8px; justify-content: space-between; margin-top: 12px; }
  .prompt--default .prompt__label { font-size: 14px; font-weight: 600; color: var(--text); }
  .prompt--default .prompt__stars { gap: 4px; }
  .prompt--default .prompt__star { transition: transform 0.1s; border-radius: 4px; }
  .prompt--default .prompt__star:hover { transform: scale(1.15); }
</style>
