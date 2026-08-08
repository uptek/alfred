<script lang="ts">
  import { sendTrackEvent } from '@/utils/analytics';
  import { CWS_REVIEW_URL } from '@/utils/constants';
  import alfredIcon from '@/assets/icon.png';

  let { source, variant = 'chip' }: { source: string; variant?: 'chip' | 'plain' } = $props();
</script>

<a
  class="credit-chip"
  class:plain={variant === 'plain'}
  href={CWS_REVIEW_URL}
  target="_blank"
  rel="noopener"
  onclick={() => sendTrackEvent('credit_click', { source })}>
  <img src={alfredIcon} alt="" class="credit-chip-icon" />
  <span class="credit-chip-muted">Powered by</span>
  <span class="credit-chip-name">Alfred</span>
</a>

<style>
  .credit-chip {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 6px 12px 6px 8px;
    background-color: #ffffff;
    border: 1px solid rgba(26, 26, 26, 0.15);
    border-radius: 999px;
    text-decoration: none;
    font-size: 12px;
    font-family: 'Inter var', Helvetica, Arial, sans-serif;
    box-shadow: 0 4px 12px rgba(26, 26, 26, 0.12);
    transition: box-shadow 0.15s ease, border-color 0.15s ease, transform 0.15s ease;
  }

  .credit-chip:hover {
    border-color: rgba(26, 26, 26, 0.3);
    box-shadow: 0 6px 16px rgba(26, 26, 26, 0.16);
    transform: translateY(-1px);
  }

  /* Bare variant: no chrome, inherits the host page's text color */
  .credit-chip.plain,
  .credit-chip.plain:hover {
    padding: 0;
    background: none;
    border: none;
    box-shadow: none;
    color: inherit;
  }

  .credit-chip.plain:hover {
    transform: translateY(-1px);
  }


  .credit-chip.plain .credit-chip-icon {
    background: none;
    width: 14px;
    height: 14px;
    border-radius: 3px;
  }

  .credit-chip.plain .credit-chip-muted {
    color: inherit;
    opacity: 0.65;
  }

  .credit-chip.plain .credit-chip-name {
    color: inherit;
    text-decoration: underline;
    text-underline-offset: 2px;
  }

  .credit-chip-icon {
    width: 16px;
    height: 16px;
    border-radius: 4px;
    background-color: #ffffff;
  }

  .credit-chip-muted {
    color: #6d7175;
  }

  .credit-chip-name {
    color: #202223;
    font-weight: 600;
  }
</style>
