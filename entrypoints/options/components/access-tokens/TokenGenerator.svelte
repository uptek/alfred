<script lang="ts">
  import { storage } from '#imports';
  import { ADMIN_SCOPES, SCOPE_BUNDLES, type ScopeBundle } from '@/utils/adminScopes';
  import {
    buildAuthorizationUrl,
    clearPendingSession,
    DEFAULT_REDIRECT_URI,
    getPendingSession,
    normalizeStoreDomain,
    PENDING_SESSION_KEY,
    savePendingSession,
    type PendingOAuthSession
  } from '@/utils/oauth';

  let storeDomain = $state('');
  let clientId = $state('');
  let clientSecret = $state('');
  let redirectUri = $state(DEFAULT_REDIRECT_URI);
  let selectedScopes = $state.raw<Set<string>>(new Set());
  let scopeSearch = $state('');
  let formError = $state('');
  let isLaunching = $state(false);
  let pendingStore = $state<string | null>(null);

  $effect(() => {
    let alive = true;

    getPendingSession().then((session) => {
      if (alive) pendingStore = session?.store ?? null;
    });

    // The background deletes the session once the flow concludes
    const unwatch = storage.watch<PendingOAuthSession>(PENDING_SESSION_KEY, (session) => {
      pendingStore = session?.store ?? null;
    });

    return () => {
      alive = false;
      unwatch();
    };
  });

  const filteredScopes = $derived.by(() => {
    const query = scopeSearch.trim().toLowerCase();
    if (!query) return ADMIN_SCOPES;
    return ADMIN_SCOPES.filter(
      (s) =>
        s.handle.includes(query) ||
        s.label.toLowerCase().includes(query) ||
        s.group.toLowerCase().includes(query)
    );
  });

  const scopeGroups = $derived.by(() => {
    const groups = new Map<string, typeof ADMIN_SCOPES>();
    for (const scope of filteredScopes) {
      const group = groups.get(scope.group);
      if (group) group.push(scope);
      else groups.set(scope.group, [scope]);
    }
    return [...groups.entries()];
  });

  function toggleScope(handle: string) {
    const next = new Set(selectedScopes);
    if (next.has(handle)) next.delete(handle);
    else next.add(handle);
    selectedScopes = next;
  }

  function applyBundle(bundle: ScopeBundle) {
    selectedScopes = new Set(bundle.scopes);
  }

  function clearScopes() {
    selectedScopes = new Set();
  }

  async function handleCancelPending() {
    await clearPendingSession();
    pendingStore = null;
  }

  async function handleGenerate() {
    formError = '';

    const domain = normalizeStoreDomain(storeDomain);
    if (!domain) {
      formError = 'Enter a valid store domain (mystore or mystore.myshopify.com).';
      return;
    }
    if (!clientId.trim() || !clientSecret.trim()) {
      formError = 'Client ID and client secret are required.';
      return;
    }
    if (!URL.canParse(redirectUri.trim())) {
      formError = 'Redirect URI must be a valid URL.';
      return;
    }
    if (selectedScopes.size === 0) {
      formError = 'Select at least one scope.';
      return;
    }

    isLaunching = true;
    try {
      const session: PendingOAuthSession = {
        state: crypto.randomUUID(),
        store: domain,
        clientId: clientId.trim(),
        clientSecret: clientSecret.trim(),
        redirectUri: redirectUri.trim(),
        scopes: [...selectedScopes],
        createdAt: Date.now()
      };

      await savePendingSession(session);
      await browser.tabs.create({ url: buildAuthorizationUrl(session) });

      // The secret now lives only in the pending session until the
      // background completes the exchange and deletes it; the session
      // watcher picks up the new pending state.
      clientSecret = '';
    } catch (error) {
      console.error('Failed to start OAuth flow:', error);
      formError = 'Failed to start the authorization flow. Please try again.';
    } finally {
      isLaunching = false;
    }
  }
</script>

<s-section heading="Generate access token">
  <s-paragraph>
    Automates the Shopify OAuth flow for custom apps: pick scopes, approve the install, and the token
    appears below. The client secret is only kept while the authorization is in flight and is discarded
    as soon as the flow finishes.
  </s-paragraph>

  {#if formError}
    <s-banner tone="critical">{formError}</s-banner>
  {/if}

  {#if pendingStore}
    <s-banner tone="info">
      Waiting for authorization on {pendingStore}. Approve the app in the Shopify tab, or
      <s-link onclick={handleCancelPending}>cancel the pending flow</s-link>.
    </s-banner>
  {/if}

  <s-grid gridTemplateColumns="1fr 1fr" gap="base">
    <s-text-field
      label="Store domain"
      placeholder="mystore.myshopify.com"
      value={storeDomain}
      oninput={(e: Event) => (storeDomain = (e.target as HTMLInputElement).value)}
    ></s-text-field>
    <s-text-field
      label="Redirect URI"
      details="Must match an allowed redirection URL in the app's configuration."
      value={redirectUri}
      oninput={(e: Event) => (redirectUri = (e.target as HTMLInputElement).value)}
    ></s-text-field>
    <s-text-field
      label="Client ID"
      value={clientId}
      oninput={(e: Event) => (clientId = (e.target as HTMLInputElement).value)}
    ></s-text-field>
    <s-password-field
      label="Client secret"
      details="Used once for the token exchange. Never stored."
      value={clientSecret}
      oninput={(e: Event) => (clientSecret = (e.target as HTMLInputElement).value)}
    ></s-password-field>
  </s-grid>

  <div class="section-level-2">
    <s-stack gap="small">
      <s-stack direction="inline" alignItems="center" gap="small-200">
        <s-text>Quick select:</s-text>
        {#each SCOPE_BUNDLES as bundle (bundle.id)}
          <s-button variant="secondary" onclick={() => applyBundle(bundle)}>{bundle.label}</s-button>
        {/each}
        <s-button variant="tertiary" onclick={clearScopes} disabled={selectedScopes.size === 0}>
          Clear
        </s-button>
      </s-stack>

      <s-text-field
        label="Search scopes"
        labelAccessibilityVisibility="exclusive"
        placeholder="Search {ADMIN_SCOPES.length} scopes…"
        value={scopeSearch}
        oninput={(e: Event) => (scopeSearch = (e.target as HTMLInputElement).value)}
      ></s-text-field>

      <div class="scope-list">
        {#each scopeGroups as [group, scopes] (group)}
          <div class="scope-group">
            <s-text color="subdued">{group}</s-text>
            {#each scopes as scope (scope.handle)}
              <s-checkbox
                label={scope.label}
                details={scope.handle}
                checked={selectedScopes.has(scope.handle)}
                onchange={() => toggleScope(scope.handle)}
              ></s-checkbox>
            {/each}
          </div>
        {:else}
          <s-text color="subdued">No scopes match "{scopeSearch}".</s-text>
        {/each}
      </div>
    </s-stack>
  </div>

  <s-stack direction="inline" justifyContent="space-between" alignItems="center">
    <s-text color="subdued">
      {selectedScopes.size}
      {selectedScopes.size === 1 ? 'scope' : 'scopes'} selected
    </s-text>
    <s-button variant="primary" onclick={handleGenerate} loading={isLaunching}>Generate token</s-button>
  </s-stack>
</s-section>

<style>
  .scope-list {
    max-height: 320px;
    overflow-y: auto;
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
    gap: 12px;
    padding: 4px 0;
  }

  .scope-group {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }
</style>
