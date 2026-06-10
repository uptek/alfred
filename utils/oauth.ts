/**
 * Shared logic for the Shopify Admin Access Token Generator (issue #47).
 *
 * The OAuth flow spans two contexts:
 * - The options page builds the authorization URL, stores a pending session,
 *   and opens the Shopify approval tab.
 * - The background service worker captures the redirect back to the app's
 *   redirect URI, exchanges the code for a token, and saves it to the vault.
 *
 * Both contexts import from this module so storage keys and data shapes have
 * a single source of truth.
 *
 * Security notes:
 * - The client secret only ever exists in the pending session, which is
 *   deleted as soon as the redirect is captured (or after SESSION_EXPIRY_MS).
 * - Tokens live in their own storage key (`local:access_tokens`) so they can
 *   never leak through preset import/export, which uses separate keys.
 */

import { storage } from '#imports';

export const PENDING_SESSION_KEY = 'local:oauth_pending_session';
export const ACCESS_TOKENS_KEY = 'local:access_tokens';

/** Shopify authorization codes expire after 10 minutes; so do our sessions. */
export const SESSION_EXPIRY_MS = 10 * 60 * 1000;

export const DEFAULT_REDIRECT_URI = 'http://localhost/';

export interface PendingOAuthSession {
  /** Random value sent as the OAuth `state` param and validated on redirect */
  state: string;
  /** Full myshopify domain, e.g. "mystore.myshopify.com" */
  store: string;
  clientId: string;
  /** Held only while the flow is in flight; deleted with the session */
  clientSecret: string;
  redirectUri: string;
  /** Requested scopes (the granted set comes back in the exchange response) */
  scopes: string[];
  createdAt: number;
}

export interface StoredAccessToken {
  id: string;
  /** Full myshopify domain */
  store: string;
  token: string;
  /** Scopes actually granted, parsed from the exchange response */
  scopes: string[];
  createdAt: number;
}

/** Result codes surfaced to the options page via the `oauth` URL param. */
export type OAuthResult = 'success' | 'denied' | 'state_mismatch' | 'exchange_failed' | 'network_error';

/** User-facing messages for every non-success outcome of the OAuth flow. */
export const OAUTH_ERROR_MESSAGES: Record<Exclude<OAuthResult, 'success'>, string> = {
  denied: 'Authorization was declined on the Shopify approval screen.',
  state_mismatch: 'Security check failed: the callback did not match the pending request. Please try again.',
  exchange_failed: 'Token exchange failed. Double-check the client ID, client secret, and redirect URI.',
  network_error: 'Network error during the token exchange. Please try again.'
};

// --- Pending session ---

export async function savePendingSession(session: PendingOAuthSession): Promise<void> {
  await storage.setItem<PendingOAuthSession>(PENDING_SESSION_KEY, session);
}

/**
 * Get the in-flight OAuth session, if any. Expired sessions are cleared and
 * reported as absent, which also guarantees the client secret never outlives
 * SESSION_EXPIRY_MS in storage.
 */
export async function getPendingSession(): Promise<PendingOAuthSession | null> {
  const session = await storage.getItem<PendingOAuthSession>(PENDING_SESSION_KEY);
  if (!session) return null;

  if (Date.now() - session.createdAt > SESSION_EXPIRY_MS) {
    await clearPendingSession();
    return null;
  }

  return session;
}

export async function clearPendingSession(): Promise<void> {
  await storage.removeItem(PENDING_SESSION_KEY);
}

// --- Token vault ---

export async function getStoredTokens(): Promise<StoredAccessToken[]> {
  return (await storage.getItem<StoredAccessToken[]>(ACCESS_TOKENS_KEY)) ?? [];
}

export async function addStoredToken(token: StoredAccessToken): Promise<void> {
  const tokens = await getStoredTokens();
  await storage.setItem(ACCESS_TOKENS_KEY, [token, ...tokens]);
}

export async function deleteStoredToken(id: string): Promise<void> {
  const tokens = await getStoredTokens();
  await storage.setItem(
    ACCESS_TOKENS_KEY,
    tokens.filter((t) => t.id !== id)
  );
}

export async function clearAllStoredTokens(): Promise<void> {
  await storage.removeItem(ACCESS_TOKENS_KEY);
}

// --- URL helpers ---

/**
 * Normalize user input into a full myshopify domain.
 * Accepts "mystore", "mystore.myshopify.com", or a pasted URL.
 * @returns The normalized domain, or null if the input is not usable
 */
export function normalizeStoreDomain(raw: string): string | null {
  const trimmed = raw
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, '')
    .replace(/\/.*$/, '');

  if (!trimmed) return null;

  // Bare store handle, e.g. "mystore"
  if (!trimmed.includes('.')) return `${trimmed}.myshopify.com`;

  // Only myshopify domains can serve the OAuth endpoints
  if (!trimmed.endsWith('.myshopify.com')) return null;

  return trimmed;
}

export function buildAuthorizationUrl(session: PendingOAuthSession): string {
  const params = new URLSearchParams({
    client_id: session.clientId,
    scope: session.scopes.join(','),
    redirect_uri: session.redirectUri,
    state: session.state
  });
  return `https://${session.store}/admin/oauth/authorize?${params.toString()}`;
}

/**
 * Check whether a navigated URL is the OAuth callback for the given session.
 * Matches on origin + path prefix so query params don't matter.
 */
export function isOAuthRedirect(url: string, redirectUri: string): boolean {
  try {
    const navigated = new URL(url);
    const redirect = new URL(redirectUri);
    return navigated.origin === redirect.origin && navigated.pathname.startsWith(redirect.pathname);
  } catch {
    return false;
  }
}

// --- Token exchange ---

/**
 * Exchange an authorization code for an access token.
 * Runs in the background service worker (host_permissions cover CORS).
 * @throws Error('exchange_failed') on a non-OK or malformed response —
 *   deliberately generic so credentials never end up in error messages
 */
export async function exchangeCodeForToken(
  session: PendingOAuthSession,
  code: string
): Promise<{ token: string; scopes: string[] }> {
  const response = await fetch(`https://${session.store}/admin/oauth/access_token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      client_id: session.clientId,
      client_secret: session.clientSecret,
      code
    })
  });

  if (!response.ok) throw new Error('exchange_failed');

  const data = (await response.json().catch(() => null)) as { access_token?: string; scope?: string } | null;
  if (!data?.access_token) throw new Error('exchange_failed');

  return {
    token: data.access_token,
    scopes: (data.scope ?? '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)
  };
}
