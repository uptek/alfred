<script lang="ts">
  import PageHeader from '../PageHeader.svelte';
  import TokenGenerator from '../access-tokens/TokenGenerator.svelte';
  import TokenVault from '../access-tokens/TokenVault.svelte';
  import { Toast } from '@/utils/toast';
  import { OAUTH_ERROR_MESSAGES, type OAuthResult } from '@/utils/oauth';

  let flowError = $state('');

  // The background redirects the OAuth tab here with ?oauth=<result>
  $effect(() => {
    const params = new URLSearchParams(window.location.search);
    const result = params.get('oauth');
    if (!result) return;

    if (result === 'success') {
      Toast.success('Access token generated');
    } else {
      flowError =
        OAUTH_ERROR_MESSAGES[result as Exclude<OAuthResult, 'success'>] ??
        'Something went wrong during authorization.';
    }

    history.replaceState({ page: 'access-tokens' }, '', '?page=access-tokens');
  });
</script>

<s-grid gap="base">
  <PageHeader title="Access Tokens" icon="key" />

  {#if flowError}
    <s-banner tone="critical">{flowError}</s-banner>
  {/if}

  <TokenGenerator />
  <TokenVault />
</s-grid>
