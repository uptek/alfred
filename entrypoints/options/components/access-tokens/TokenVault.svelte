<script lang="ts">
  import { storage } from '#imports';
  import {
    ACCESS_TOKENS_KEY,
    clearAllStoredTokens,
    deleteStoredToken,
    getStoredTokens,
    type StoredAccessToken
  } from '@/utils/oauth';
  import { trackAction } from '@/utils/analytics';
  import { formatTimeAgo } from '@/utils/helpers';
  import { Toast } from '@/utils/toast';

  let tokens = $state<StoredAccessToken[]>([]);
  let loading = $state(true);

  $effect(() => {
    let alive = true;

    getStoredTokens().then((stored) => {
      if (!alive) return;
      tokens = stored;
      loading = false;
    });

    // The background writes new tokens after the OAuth exchange completes
    const unwatch = storage.watch<StoredAccessToken[]>(ACCESS_TOKENS_KEY, (newTokens) => {
      tokens = newTokens ?? [];
    });

    return () => {
      alive = false;
      unwatch();
    };
  });

  function maskToken(token: string): string {
    return `${token.slice(0, 10)}…${token.slice(-4)}`;
  }

  async function handleCopy(token: StoredAccessToken) {
    try {
      await navigator.clipboard.writeText(token.token);
      Toast.success('Token copied to clipboard');
      trackAction('copy_access_token').catch(() => {});
    } catch {
      Toast.error('Failed to copy token');
    }
  }

  async function handleDelete(token: StoredAccessToken) {
    if (!confirm(`Delete the access token for ${token.store}? This cannot be undone.`)) return;
    try {
      await deleteStoredToken(token.id);
      Toast.success('Token deleted');
      trackAction('delete_access_token').catch(() => {});
    } catch {
      Toast.error('Failed to delete token');
    }
  }

  async function handleClearAll() {
    if (!confirm(`Delete all ${tokens.length} access tokens? This cannot be undone.`)) return;
    try {
      await clearAllStoredTokens();
      Toast.success('All tokens deleted');
    } catch {
      Toast.error('Failed to delete tokens');
    }
  }
</script>

<s-section heading="Token vault">
  <s-paragraph>
    Tokens are stored locally in your browser and are never synced or included in any export. Remember
    to uninstall the app on stores you no longer work with — that revokes its tokens.
  </s-paragraph>

  {#if loading}
    <div style="display: flex; justify-content: center; padding: 2rem;">
      <s-spinner size="base"></s-spinner>
    </div>
  {:else if tokens.length === 0}
    <s-banner tone="info">
      No saved tokens yet. Generate one above and it will appear here automatically.
    </s-banner>
  {:else}
    <s-stack direction="inline" justifyContent="end">
      <s-button icon="delete" onclick={handleClearAll} tone="critical" variant="secondary">
        Delete all
      </s-button>
    </s-stack>
    <div class="section-level-2">
      <s-table>
        <s-table-header-row>
          <s-table-header listSlot="primary">Store</s-table-header>
          <s-table-header listSlot="secondary">Token</s-table-header>
          <s-table-header>Scopes</s-table-header>
          <s-table-header>Created</s-table-header>
          <s-table-header></s-table-header>
        </s-table-header-row>
        <s-table-body>
          {#each tokens as token (token.id)}
            <s-table-row>
              <s-table-cell>
                <s-link href="https://{token.store}/admin" target="_blank">{token.store}</s-link>
              </s-table-cell>
              <s-table-cell>
                <code class="token-mask">{maskToken(token.token)}</code>
              </s-table-cell>
              <s-table-cell>
                <span title={token.scopes.join(', ')}>
                  {token.scopes.length}
                  {token.scopes.length === 1 ? 'scope' : 'scopes'}
                </span>
              </s-table-cell>
              <s-table-cell>{formatTimeAgo(token.createdAt)}</s-table-cell>
              <s-table-cell>
                <s-stack direction="inline" gap="small-200">
                  <s-button icon="clipboard" accessibilityLabel="Copy token" onclick={() => handleCopy(token)}
                  ></s-button>
                  <s-button
                    icon="delete"
                    accessibilityLabel="Delete token"
                    onclick={() => handleDelete(token)}
                    tone="critical"
                  ></s-button>
                </s-stack>
              </s-table-cell>
            </s-table-row>
          {/each}
        </s-table-body>
      </s-table>
    </div>
  {/if}
</s-section>

<style>
  .token-mask {
    font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
    font-size: 12px;
  }
</style>
