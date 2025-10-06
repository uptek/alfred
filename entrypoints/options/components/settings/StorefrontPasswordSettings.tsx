import { useEffect, useState } from 'preact/hooks';
import {
  getAllPasswordEntries,
  deletePassword,
  setPasswordEnabled,
  deleteAllPasswords,
  savePassword,
} from '@/utils/storefrontPasswords';
import type { StorefrontPasswordsStorage } from '@/utils/storefrontPasswords';
import { Toast } from '~/utils/toast';

export function StorefrontPasswordSettings() {
  const [passwords, setPasswords] = useState<StorefrontPasswordsStorage>({});
  const [loading, setLoading] = useState(true);
  const [editingPasswords, setEditingPasswords] = useState<
    Record<string, string>
  >({});

  const loadPasswords = async () => {
    setLoading(true);
    const entries = await getAllPasswordEntries();
    setPasswords(entries);
    setLoading(false);
  };

  useEffect(() => {
    loadPasswords();
  }, []);

  const handleToggleEnabled = async (domain: string, enabled: boolean) => {
    // Optimistic update - update UI immediately
    setPasswords((prev) => {
      const existingEntry = prev[domain];
      if (!existingEntry) return prev;

      return {
        ...prev,
        [domain]: { ...existingEntry, enabled },
      };
    });

    try {
      await setPasswordEnabled(domain, enabled);
      Toast.success(enabled ? 'Auto-fill enabled' : 'Auto-fill disabled');
    } catch (error) {
      // Revert on failure
      console.error('Failed to toggle password enabled:', error);
      Toast.error('Failed to update auto-fill setting');
      await loadPasswords();
    }
  };

  const handleDelete = async (domain: string) => {
    if (confirm(`Delete password for ${domain}?`)) {
      try {
        await deletePassword(domain);
        await loadPasswords();
        Toast.success('Password deleted');
      } catch (error) {
        console.error('Failed to delete password:', error);
        Toast.error('Failed to delete password');
      }
    }
  };

  const handleDeleteAll = async () => {
    const count = Object.keys(passwords).length;
    if (
      confirm(
        `Delete all ${count} saved passwords? This action cannot be undone.`
      )
    ) {
      try {
        await deleteAllPasswords();
        await loadPasswords();
        Toast.success('All passwords deleted');
      } catch (error) {
        console.error('Failed to delete all passwords:', error);
        Toast.error('Failed to delete all passwords');
      }
    }
  };

  const handlePasswordChange = (domain: string, value: string) => {
    setEditingPasswords((prev) => ({
      ...prev,
      [domain]: value,
    }));
  };

  const handlePasswordBlur = async (domain: string) => {
    const newPassword = editingPasswords[domain];
    const currentPassword = passwords[domain]?.password;

    // If password hasn't changed, do nothing
    if (newPassword === undefined || newPassword === currentPassword) {
      return;
    }

    // If password is empty, don't save
    if (!newPassword.trim()) {
      Toast.error('Password cannot be empty');
      return;
    }

    const trimmedPassword = newPassword.trim();

    // Optimistic update - update UI immediately
    setPasswords((prev) => {
      const existingEntry = prev[domain];
      if (!existingEntry) return prev;

      return {
        ...prev,
        [domain]: { ...existingEntry, password: trimmedPassword },
      };
    });

    // Clear editing state
    setEditingPasswords((prev) => {
      const updated = { ...prev };
      delete updated[domain];
      return updated;
    });

    try {
      await savePassword(domain, trimmedPassword);
      Toast.success('Password updated');
    } catch (error) {
      console.error('Failed to update password:', error);
      Toast.error('Failed to update password');
      // Revert on failure
      await loadPasswords();
    }
  };

  return (
    <s-section heading="Storefront Password Auto-fill">
      <s-paragraph>
        Automatically fill and submit passwords for password-protected Shopify
        storefronts. Passwords are stored locally in your browser.
      </s-paragraph>

      {loading ? (
        <div style="display: flex; justify-content: center; padding: 2rem;">
          <s-spinner size="base" />
        </div>
      ) : Object.keys(passwords).length === 0 ? (
        <s-banner tone="info">
          No saved passwords yet. Visit a Shopify store and enter a password in
          the Alfred extension popup to save it.
        </s-banner>
      ) : (
        <>
          <s-stack direction="inline" justifyContent="end">
            <s-button
              icon="delete"
              onClick={handleDeleteAll}
              tone="critical"
              variant="secondary"
              disabled={Object.keys(passwords).length === 0}
            >
              Delete all
            </s-button>
          </s-stack>
          <div className="section-level-2">
            <s-table>
              <s-table-header-row>
                <s-table-header listSlot="primary">Store</s-table-header>
                <s-table-header listSlot="secondary">Password</s-table-header>
                <s-table-header>Enabled</s-table-header>
                <s-table-header></s-table-header>
              </s-table-header-row>
              <s-table-body>
                {Object.entries(passwords).map(([domain, entry]) => {
                  return (
                    <s-table-row key={domain}>
                      <s-table-cell>
                        <s-link href={`https://${domain}`} target="_blank">
                          {domain}
                        </s-link>
                      </s-table-cell>
                      <s-table-cell>
                        <s-box maxInlineSize="175px">
                          <s-password-field
                            label="Password"
                            labelAccessibilityVisibility="exclusive"
                            value={editingPasswords[domain] ?? entry.password}
                            onInput={(e) =>
                              handlePasswordChange(
                                domain,
                                (e.target as HTMLInputElement).value
                              )
                            }
                            onBlur={() => handlePasswordBlur(domain)}
                          />
                        </s-box>
                      </s-table-cell>
                      <s-table-cell>
                        <s-checkbox
                          checked={entry.enabled}
                          onChange={(e) =>
                            handleToggleEnabled(
                              domain,
                              (e.target as HTMLInputElement).checked
                            )
                          }
                        />
                      </s-table-cell>
                      <s-table-cell>
                        <s-button
                          icon="delete"
                          accessibilityLabel="Delete password"
                          onClick={() => handleDelete(domain)}
                          tone="critical"
                        />
                      </s-table-cell>
                    </s-table-row>
                  );
                })}
              </s-table-body>
            </s-table>
          </div>
        </>
      )}
    </s-section>
  );
}
