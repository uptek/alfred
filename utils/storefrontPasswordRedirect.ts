/**
 * Utility for managing storefront password page redirect functionality.
 * When a user visits a password-protected page, we save their intended destination
 * so they can be redirected back after successful password entry.
 */

import { storage } from '#imports';

const STORAGE_KEY = 'local:storefront_password_return_url';

interface StorefrontPasswordRedirectData {
  url: string;
  timestamp: number;
}

// URLs are valid for 5 minutes (enough time to enter password)
const URL_EXPIRY_MS = 300 * 1000;

/**
 * Save the URL the user intended to visit before being redirected to the password page.
 * Called from background script when detecting a redirect to /password.
 * @param url - The full URL to redirect back to
 */
export async function saveReturnUrl(url: string): Promise<void> {
  try {
    await storage.setItem<StorefrontPasswordRedirectData>(STORAGE_KEY, {
      url,
      timestamp: Date.now(),
    });
  } catch (error) {
    console.error('[Alfred] Failed to save return URL:', error);
  }
}

/**
 * Get the saved return URL if it's still valid (not expired).
 * @returns The return URL or null if not set or expired
 */
export async function getReturnUrl(): Promise<string | null> {
  try {
    const data =
      await storage.getItem<StorefrontPasswordRedirectData>(STORAGE_KEY);
    if (!data) return null;

    // Check if URL is expired
    if (Date.now() - data.timestamp > URL_EXPIRY_MS) {
      await clearReturnUrl();
      return null;
    }

    return data.url;
  } catch (error) {
    console.error('[Alfred] Failed to get return URL:', error);
    return null;
  }
}

/**
 * Clear the saved return URL.
 */
export async function clearReturnUrl(): Promise<void> {
  try {
    await storage.removeItem(STORAGE_KEY);
  } catch (error) {
    console.error('[Alfred] Failed to clear return URL:', error);
  }
}

/**
 * Check if a URL is a valid redirect target (not home page or password page).
 * @param url - The URL to validate
 * @returns true if the URL is valid for redirect
 */
export function isValidReturnUrl(url: string): boolean {
  try {
    const urlObj = new URL(url);
    const path = urlObj.pathname;

    // Must not be the password page itself
    if (path === '/password' || path === '/password/') {
      return false;
    }

    return true;
  } catch {
    return false;
  }
}

/**
 * Handle redirect after successful password entry.
 * Checks for a stored return URL and redirects if valid.
 * Should be called early in content scripts (except on password page).
 * @returns true if a redirect was performed (caller should stop execution)
 */
export async function handleReturnUrlRedirect(): Promise<boolean> {
  const currentPath = window.location.pathname;

  // Don't redirect if we're on the password page
  if (currentPath === '/password' || currentPath === '/password/') {
    return false;
  }

  const returnUrl = await getReturnUrl();
  if (!returnUrl) {
    return false;
  }

  // Clear immediately to prevent redirect loops
  await clearReturnUrl();

  // Verify the return URL is for this origin (safety check)
  try {
    const returnUrlObj = new URL(returnUrl);
    if (
      returnUrlObj.origin === window.location.origin &&
      window.location.href !== returnUrl
    ) {
      window.location.replace(returnUrl);
      return true;
    }
  } catch {
    // Invalid URL, ignore
  }

  return false;
}
