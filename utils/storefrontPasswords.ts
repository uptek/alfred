import { storage } from '#imports';

const STORAGE_KEY = 'local:storefront_passwords';

/**
 * Represents a stored password entry for a storefront
 */
export interface StorefrontPasswordEntry {
  password: string; // Plain text password
  createdAt: string; // ISO timestamp
  lastUsed?: string | undefined; // ISO timestamp
  failedAttempts: number; // Counter for failed attempts
  lastFailedAt?: string | undefined; // ISO timestamp of last failure
  enabled: boolean; // Auto-fill enabled flag
}

/**
 * Map of domain to password entry
 */
export type StorefrontPasswordsStorage = Record<string, StorefrontPasswordEntry>;

/**
 * Get all stored storefront passwords
 */
export async function getAllPasswordEntries(): Promise<StorefrontPasswordsStorage> {
  const data = await storage.getItem<StorefrontPasswordsStorage>(STORAGE_KEY);
  return data ?? {};
}

/**
 * Get password entry for a specific domain
 * @param domain - The Shopify store domain
 * @returns The password entry or null if not found
 */
export async function getPasswordEntry(domain: string): Promise<StorefrontPasswordEntry | null> {
  const allPasswords = await getAllPasswordEntries();
  return allPasswords[domain] ?? null;
}

/**
 * Get password for a specific domain
 * @param domain - The Shopify store domain
 * @returns The password or null if not found or not enabled
 */
export async function getPassword(domain: string): Promise<string | null> {
  const entry = await getPasswordEntry(domain);
  if (!entry?.enabled) {
    return null;
  }
  return entry.password;
}

/**
 * Save or update a password for a domain
 * @param domain - The Shopify store domain
 * @param password - The plain text password
 * @param resetFailures - Whether to reset failure count (default: true)
 */
export async function savePassword(domain: string, password: string, resetFailures = true): Promise<void> {
  const allPasswords = await getAllPasswordEntries();
  const existing = allPasswords[domain];

  allPasswords[domain] = {
    password: password,
    createdAt: existing?.createdAt ?? new Date().toISOString(),
    lastUsed: existing?.lastUsed,
    failedAttempts: resetFailures ? 0 : (existing?.failedAttempts ?? 0),
    lastFailedAt: resetFailures ? undefined : existing?.lastFailedAt,
    enabled: existing?.enabled ?? true
  };

  await storage.setItem(STORAGE_KEY, allPasswords);
}

/**
 * Delete a password for a domain
 * @param domain - The Shopify store domain
 */
export async function deletePassword(domain: string): Promise<void> {
  const allPasswords = await getAllPasswordEntries();
  delete allPasswords[domain];
  await storage.setItem(STORAGE_KEY, allPasswords);
}

/**
 * Mark a password as successfully used
 * @param domain - The Shopify store domain
 */
export async function markPasswordUsed(domain: string): Promise<void> {
  const allPasswords = await getAllPasswordEntries();
  const entry = allPasswords[domain];

  if (entry) {
    entry.lastUsed = new Date().toISOString();
    entry.failedAttempts = 0;
    delete entry.lastFailedAt;
    entry.enabled = true; // Enable since password was successfully used
    await storage.setItem(STORAGE_KEY, allPasswords);
  }
}

/**
 * Mark a password as failed
 * @param domain - The Shopify store domain
 * @param threshold - Number of failures before disabling (default: 1)
 */
export async function markPasswordFailed(domain: string, threshold = 1): Promise<void> {
  const allPasswords = await getAllPasswordEntries();
  const entry = allPasswords[domain];

  if (entry) {
    entry.failedAttempts = (entry.failedAttempts ?? 0) + 1;
    entry.lastFailedAt = new Date().toISOString();

    if (entry.failedAttempts >= threshold) {
      // If password fails above threshold, disable auto-fill
      entry.enabled = false;
    }

    await storage.setItem(STORAGE_KEY, allPasswords);
  }
}

/**
 * Enable or disable auto-fill for a domain
 * @param domain - The Shopify store domain
 * @param enabled - Whether to enable auto-fill
 */
export async function setPasswordEnabled(domain: string, enabled: boolean): Promise<void> {
  const allPasswords = await getAllPasswordEntries();
  const entry = allPasswords[domain];

  if (entry) {
    entry.enabled = enabled;
    if (enabled) {
      // Reset failures when enabling
      entry.failedAttempts = 0;
      delete entry.lastFailedAt;
    }
    await storage.setItem(STORAGE_KEY, allPasswords);
  }
}

/**
 * Delete all stored passwords
 */
export async function deleteAllPasswords(): Promise<void> {
  await storage.setItem(STORAGE_KEY, {});
}
