import {
  addStoredToken,
  clearPendingSession,
  exchangeCodeForToken,
  getPendingSession,
  isOAuthRedirect,
  type OAuthResult,
  type StoredAccessToken
} from '@/utils/oauth';
import { trackAction } from '@/utils/analytics';

/**
 * Capture the redirect leg of the Access Token Generator's OAuth flow.
 *
 * After the user approves the app on Shopify, the browser navigates to the
 * app's redirect URI (conventionally http://localhost/) carrying ?code= and
 * ?state=. Nothing usually listens there, but onBeforeNavigate fires before
 * any connection attempt, so the code is captured even when the navigation
 * itself ends in a connection error.
 */
export function registerOAuthHandler(): void {
  browser.webNavigation.onBeforeNavigate.addListener((details) => {
    if (details.frameId !== 0) return;
    void handleNavigation(details.tabId, details.url);
  });
}

async function handleNavigation(tabId: number, url: string): Promise<void> {
  let navigated: URL;
  try {
    navigated = new URL(url);
  } catch {
    return;
  }

  // Cheap pre-filter so most navigations skip the storage read
  const params = navigated.searchParams;
  if (!params.has('code') && !params.has('error')) return;

  const session = await getPendingSession();
  if (!session) return;
  if (!isOAuthRedirect(url, session.redirectUri)) return;

  // The state param is the CSRF guard, and it doubles as proof that this
  // navigation is actually our callback: Shopify echoes it on both success
  // and denial. A forged callback or an unrelated navigation to the redirect
  // URI is ignored entirely, leaving the real flow able to complete.
  if (params.get('state') !== session.state) return;

  // This is our callback. Delete the session now so the client secret's
  // lifetime in storage ends here, whatever happens next.
  await clearPendingSession();

  if (params.get('error')) {
    await finishFlow(tabId, 'denied');
    return;
  }

  // Shopify includes the shop domain in the callback; if it's present and
  // not the store this session targets, something is off.
  const shop = params.get('shop');
  if (shop && shop !== session.store) {
    await finishFlow(tabId, 'state_mismatch');
    return;
  }

  const code = params.get('code');
  if (!code) {
    await finishFlow(tabId, 'exchange_failed');
    return;
  }

  try {
    const { token, scopes } = await exchangeCodeForToken(session, code);

    const storedToken: StoredAccessToken = {
      id: crypto.randomUUID(),
      store: session.store,
      token,
      scopes,
      createdAt: Date.now()
    };

    await addStoredToken(storedToken);
    trackAction('generate_access_token', { store_domain: session.store }).catch(() => {});
    await finishFlow(tabId, 'success');
  } catch (error) {
    await finishFlow(
      tabId,
      error instanceof Error && error.message === 'exchange_failed' ? 'exchange_failed' : 'network_error'
    );
  }
}

/** Send the OAuth tab back to the options page with the outcome. */
async function finishFlow(tabId: number, result: OAuthResult): Promise<void> {
  const optionsUrl = browser.runtime.getURL(`/options.html?page=access-tokens&oauth=${result}`);
  try {
    await browser.tabs.update(tabId, { url: optionsUrl });
  } catch {
    // Tab already closed — the options page still picks up the token via storage.watch
  }
}
