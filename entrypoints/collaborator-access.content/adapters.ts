import type { PageAdapter, Permission } from './types';

/** Creates a PageAdapter for the Shopify Partner Dashboard (partners.shopify.com). */
export function createPartnerAdapter(): PageAdapter {
  const PERM_SELECTOR = '#AppFrameMain form .Polaris-FormLayout__Item:nth-child(2) input[type="checkbox"]';
  const MSG_SELECTOR = '#AppFrameMain form .Polaris-FormLayout__Item:nth-child(3) textarea';

  return {
    type: 'partner',

    /** @returns All currently checked permissions with their Polaris checkbox ID and label text. */
    getCheckedPermissions(): Permission[] {
      const permissions: Permission[] = [];
      document.querySelectorAll<HTMLInputElement>(`${PERM_SELECTOR}:checked`).forEach((checkbox) => {
        const label = checkbox.closest('label')?.querySelector('p')?.textContent ?? '';
        permissions.push({ id: checkbox.id, label: label.trim() });
      });
      return permissions;
    },

    /** Unchecks all currently checked permission checkboxes. Checks `.checked` before clicking to avoid re-toggling cascaded children. */
    uncheckAll() {
      document.querySelectorAll<HTMLInputElement>(`${PERM_SELECTOR}:checked`).forEach((checkbox) => {
        if (checkbox.checked) checkbox.click();
      });
    },

    /**
     * Checks a single permission checkbox by its DOM element ID.
     * @param id - The checkbox element ID (Polaris-generated).
     */
    checkPermission(id: string) {
      const checkbox = document.getElementById(id) as HTMLInputElement | null;
      if (checkbox && !checkbox.checked) checkbox.click();
    },

    /** @returns The current value of the custom message textarea. */
    getMessage(): string {
      return document.querySelector<HTMLTextAreaElement>(MSG_SELECTOR)?.value ?? '';
    },

    /**
     * Sets the custom message textarea value and dispatches input/change events.
     * @param text - The message text to set.
     */
    setMessage(text: string) {
      const textarea = document.querySelector<HTMLTextAreaElement>(MSG_SELECTOR);
      if (textarea) {
        textarea.value = text;
        textarea.dispatchEvent(new Event('input', { bubbles: true }));
        textarea.dispatchEvent(new Event('change', { bubbles: true }));
      }
    },

    /** No-op on the partner dashboard — Polaris does not use collapsible permission sections. */
    expandCheckedSections() {}
  };
}

/** Creates a PageAdapter for the Shopify Dev Dashboard (dev.shopify.com). */
export function createDevDashboardAdapter(): PageAdapter {
  const PERM_SELECTOR = 'input[type="checkbox"][name="permissions[]"]';
  const MSG_SELECTOR = '#collaboration-request-message';

  return {
    type: 'dev',

    /** @returns All currently checked permissions with their form `value` attribute and label text. */
    getCheckedPermissions(): Permission[] {
      const permissions: Permission[] = [];
      document.querySelectorAll<HTMLInputElement>(`${PERM_SELECTOR}:checked`).forEach((checkbox) => {
        const label = checkbox.closest('label')?.querySelector('span.text-body-sm')?.textContent ?? '';
        permissions.push({ id: checkbox.value, label: label.trim() });
      });
      return permissions;
    },

    /** Unchecks all currently checked permission checkboxes. Checks `.checked` before clicking to avoid re-toggling cascaded children. */
    uncheckAll() {
      document.querySelectorAll<HTMLInputElement>(`${PERM_SELECTOR}:checked`).forEach((checkbox) => {
        if (checkbox.checked) checkbox.click();
      });
    },

    /**
     * Checks a single permission checkbox by its form value.
     * @param id - The checkbox `value` attribute (e.g. `orders_orders`, `home_dashboard`).
     */
    checkPermission(id: string) {
      const checkbox = document.querySelector<HTMLInputElement>(`${PERM_SELECTOR}[value="${CSS.escape(id)}"]`);
      if (checkbox && !checkbox.checked) checkbox.click();
    },

    /** @returns The current value of the custom message textarea. */
    getMessage(): string {
      return document.querySelector<HTMLTextAreaElement>(MSG_SELECTOR)?.value ?? '';
    },

    /**
     * Sets the custom message textarea value and dispatches input/change events.
     * @param text - The message text to set.
     */
    setMessage(text: string) {
      const textarea = document.querySelector<HTMLTextAreaElement>(MSG_SELECTOR);
      if (textarea) {
        textarea.value = text;
        textarea.dispatchEvent(new Event('input', { bubbles: true }));
        textarea.dispatchEvent(new Event('change', { bubbles: true }));
      }
    },

    /** Expands any collapsed permission sections that contain checked checkboxes. Clicks the Stimulus-controlled section header to trigger the native expand animation. */
    expandCheckedSections() {
      const checked = document.querySelectorAll<HTMLInputElement>(`${PERM_SELECTOR}:checked`);
      const sectionIds = new Set<string>();
      checked.forEach((cb) => {
        const id = cb.getAttribute('data-section-id');
        if (id) sectionIds.add(id);
      });
      sectionIds.forEach((sectionId) => {
        const panel = document.querySelector(
          `[data-permissions-tree-target="panel"][data-section-id="${CSS.escape(sectionId)}"]`
        );
        if (panel?.getAttribute('data-open') === 'false') {
          const header = document.querySelector<HTMLButtonElement>(
            `[data-permissions-tree-target="header"][data-section-id="${CSS.escape(sectionId)}"]`
          );
          header?.click();
        }
      });
    }
  };
}
