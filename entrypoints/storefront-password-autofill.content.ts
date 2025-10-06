import { getPassword, markPasswordUsed, markPasswordFailed } from '@/utils/storefrontPasswords';

export default defineContentScript({
  matches: ['*://*/password'],
  runAt: 'document_idle',

  async main() {
    // Get current domain from URL
    const domain = window.location.hostname;
    if (!domain) {
      console.log('[Alfred] Could not detect domain');
      return;
    }

    const passwordInput = document.querySelector<HTMLInputElement>('input[type="password"][name="password"]');
    const form = passwordInput?.closest('form');

    if (!passwordInput || !form) {
      console.log('[Alfred] Password form not found');
      return;
    }

    // Check if there was a failed password attempt
    if (passwordInput?.classList.contains('with-error')) {
      console.log('[Alfred] Password error detected on page load');
      await markPasswordFailed(domain);
      return;
    }

    // Get stored password for this domain
    const password = await getPassword(domain);
    if (!password) {
      console.log('[Alfred] No password stored for', domain);
      return;
    }

    // Don't auto-fill if user has already entered something
    if (passwordInput.value.trim() !== '') {
      console.log('[Alfred] Password field already has a value, skipping auto-fill');
      return;
    }

    // Fill the password
    passwordInput.value = password;
    console.log('[Alfred] Password auto-filled for', domain);

    // Mark password as used
    await markPasswordUsed(domain);

    // Track successful autofill
    browser.runtime.sendMessage({
      type: 'track_action',
      action: 'password_autofill',
      metadata: {
        domain,
        password_length: password.length,
      },
    });

    // Auto-submit the form
    try {
      form.submit();
      console.log('[Alfred] Password form submitted');
    } catch (error) {
      console.error('[Alfred] Error submitting password form:', error);
    }
  },
});
