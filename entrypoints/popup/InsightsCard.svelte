<script lang="ts">
  import { trackAction } from '@/utils/analytics';

  const CWS_REVIEW_URL = 'https://chromewebstore.google.com/detail/jbdcmokdibodbplhjcajgcbmnflcchbi/reviews';
  const FEEDBACK_URL = 'https://tally.so/r/nPgYx0';

  let hovered = $state(0);

  function handleRate(rating: number) {
    if (rating === 5) {
      trackAction('review_nudge_clicked');
      browser.tabs.create({ url: CWS_REVIEW_URL });
    } else {
      trackAction('review_nudge_dismissed');
      browser.tabs.create({ url: FEEDBACK_URL });
    }
  }
</script>

<div class="mt-3 py-2 px-4 bg-slate-50 border border-slate-200 rounded-lg flex items-center justify-between">
  <p class="text-sm font-semibold text-slate-700">Enjoying Alfred?</p>
  <!-- svelte-ignore a11y_no_static_element_interactions a11y_mouse_events_have_key_events -->
  <div class="flex gap-1" onmouseleave={() => (hovered = 0)}>
    {#each [1, 2, 3, 4, 5] as star}
      <!-- svelte-ignore a11y_mouse_events_have_key_events -->
      <button
        onclick={() => handleRate(star)}
        onmouseenter={() => (hovered = star)}
        aria-label="Rate {star} star{star > 1 ? 's' : ''}"
        class="bg-transparent border-none cursor-pointer p-0 leading-none transition-transform hover:scale-115 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 rounded">
        <svg width="30" height="30" viewBox="0 0 24 24" fill={star <= hovered ? '#F59E0B' : '#D1D5DB'} class="transition-colors duration-150 pointer-events-none">
          <path d="M12 3.5c.3 0 .6.2.7.5l2.2 4.5 5 .7c.3 0 .5.2.6.5s0 .6-.2.8l-3.6 3.5.9 5c0 .3-.1.6-.3.7-.3.2-.6.2-.8 0L12 17l-4.5 2.3c-.3.1-.6.1-.8 0-.2-.2-.4-.4-.3-.7l.9-5L3.7 10c-.2-.2-.3-.5-.2-.8s.3-.4.6-.5l5-.7 2.2-4.5c.1-.3.4-.5.7-.5z" />
        </svg>
      </button>
    {/each}
  </div>
</div>
