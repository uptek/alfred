<script lang="ts">
  import { trackAction } from '@/utils/analytics';
  import { CWS_REVIEW_URL } from '@/utils/constants';

  function openReview() {
    trackAction('credit_click', { source: 'options' });
    window.open(CWS_REVIEW_URL, '_blank');
  }
</script>

<s-section padding="none">
  <div class="review-card">
    <div class="review-stars" aria-hidden="true">★★★★★</div>
    <s-heading>Enjoying Alfred?</s-heading>
    <s-text color="subdued">
      Alfred is free and always will be. If it saves you time, please take a minute to leave a
      review. It genuinely helps more merchants and devs find it.
    </s-text>
    <s-button variant="primary" onclick={openReview}>Leave a review</s-button>
  </div>
</s-section>

<style>
  .review-card {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 10px;
    padding: 16px;
    border-top: 3px solid #ffb800;
    border-radius: inherit;
  }

  .review-stars {
    color: #ffb800;
    font-size: 18px;
    letter-spacing: 3px;
    line-height: 1;
  }

  .review-card s-button {
    width: 100%;
  }
</style>
