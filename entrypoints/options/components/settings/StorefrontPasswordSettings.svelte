<script lang="ts">
  import {
    getAllPasswordEntries,
    deletePassword,
    setPasswordEnabled,
    deleteAllPasswords,
    savePassword
  } from '@/utils/storefrontPasswords';
  import type { StorefrontPasswordsStorage } from '@/utils/storefrontPasswords';
  import { Toast } from '~/utils/toast';

  let passwords = $state<StorefrontPasswordsStorage>({});
  let loading = $state(true);
  let editingPasswords = $state<Record<string, string>>({});

  async function loadPasswords() {
    loading = true;
    const entries = await getAllPasswordEntries();
    passwords = entries;
    loading = false;
  }

  $effect(() => { loadPasswords(); });

  async function handleToggleEnabled(domain: string, enabled: boolean) {
    const existingEntry = passwords[domain];
    if (!existingEntry) return;
    passwords = { ...passwords, [domain]: { ...existingEntry, enabled } };
    try {
      await setPasswordEnabled(domain, enabled);
      Toast.success(enabled ? 'Auto-fill enabled' : 'Auto-fill disabled');
    } catch (error) {
      console.error('Failed to toggle password enabled:', error);
      Toast.error('Failed to update auto-fill setting');
      await loadPasswords();
    }
  }

  async function handleDelete(domain: string) {
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
  }

  async function handleDeleteAll() {
    const count = Object.keys(passwords).length;
    if (confirm(`Delete all ${count} saved passwords? This action cannot be undone.`)) {
      try {
        await deleteAllPasswords();
        await loadPasswords();
        Toast.success('All passwords deleted');
      } catch (error) {
        console.error('Failed to delete all passwords:', error);
        Toast.error('Failed to delete all passwords');
      }
    }
  }

  function handlePasswordChange(domain: string, value: string) {
    editingPasswords = { ...editingPasswords, [domain]: value };
  }

  async function handlePasswordBlur(domain: string) {
    const newPassword = editingPasswords[domain];
    const currentPassword = passwords[domain]?.password;

    if (newPassword === undefined || newPassword === currentPassword) return;
    if (!newPassword.trim()) {
      Toast.error('Password cannot be empty');
      return;
    }

    const trimmedPassword = newPassword.trim();
    const existingEntry = passwords[domain];
    if (existingEntry) {
      passwords = { ...passwords, [domain]: { ...existingEntry, password: trimmedPassword } };
    }

    const updated = { ...editingPasswords };
    delete updated[domain];
    editingPasswords = updated;

    try {
      await savePassword(domain, trimmedPassword);
      Toast.success('Password updated');
    } catch (error) {
      console.error('Failed to update password:', error);
      Toast.error('Failed to update password');
      await loadPasswords();
    }
  }

  const passwordEntries = $derived(Object.entries(passwords));
</script>

<s-section heading="Storefront Password Auto-fill">
  <s-paragraph>
    Automatically fill and submit passwords for password-protected Shopify storefronts. Passwords are stored locally in your browser.
  </s-paragraph>

  {#if loading}
    <div style="display: flex; justify-content: center; padding: 2rem;">
      <s-spinner size="base"></s-spinner>
    </div>
  {:else if passwordEntries.length === 0}
    <s-banner tone="info">
      No saved passwords yet. Visit a Shopify store and enter a password in the Alfred extension popup to save it.
    </s-banner>
  {:else}
    <s-stack direction="inline" justifyContent="end">
      <s-button
        icon="delete"
        onclick={handleDeleteAll}
        tone="critical"
        variant="secondary"
        disabled={passwordEntries.length === 0}>
        Delete all
      </s-button>
    </s-stack>
    <div class="section-level-2">
      <s-table>
        <s-table-header-row>
          <s-table-header listSlot="primary">Store</s-table-header>
          <s-table-header listSlot="secondary">Password</s-table-header>
          <s-table-header>Enabled</s-table-header>
          <s-table-header></s-table-header>
        </s-table-header-row>
        <s-table-body>
          {#each passwordEntries as [domain, entry]}
            <s-table-row>
              <s-table-cell>
                <s-link href="https://{domain}" target="_blank">{domain}</s-link>
              </s-table-cell>
              <s-table-cell>
                <s-box maxInlineSize="175px">
                  <s-password-field
                    label="Password"
                    labelAccessibilityVisibility="exclusive"
                    value={editingPasswords[domain] ?? entry.password}
                    oninput={(e: Event) => handlePasswordChange(domain, (e.target as HTMLInputElement).value)}
                    onblur={() => handlePasswordBlur(domain)}
                  ></s-password-field>
                </s-box>
              </s-table-cell>
              <s-table-cell>
                <s-checkbox
                  checked={entry.enabled}
                  onchange={(e: Event) => handleToggleEnabled(domain, (e.target as HTMLInputElement).checked)}
                ></s-checkbox>
              </s-table-cell>
              <s-table-cell>
                <s-button
                  icon="delete"
                  accessibilityLabel="Delete password"
                  onclick={() => handleDelete(domain)}
                  tone="critical"
                ></s-button>
              </s-table-cell>
            </s-table-row>
          {/each}
        </s-table-body>
      </s-table>
    </div>
  {/if}
</s-section>
