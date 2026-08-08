<script lang="ts">
  import { trackAction } from '@/utils/analytics';
  import { CWS_REVIEW_URL } from '@/utils/constants';

  function openReview() {
    trackAction('credit_click', { source: 'options' });
    window.open(CWS_REVIEW_URL, '_blank');
  }
</script>

<s-section>
  <s-stack direction="inline" alignItems="center" justifyContent="space-between" gap="base">
    <s-stack gap="small-300">
      <s-heading>Enjoying Alfred?</s-heading>
      <s-text color="subdued">
        Alfred is free and always will be. If it saves you time, please take a minute to leave a
        review. It genuinely helps more merchants and devs find it.
      </s-text>
    </s-stack>
    <s-button variant="primary" onclick={openReview}>Leave a review</s-button>
  </s-stack>
</s-section>
