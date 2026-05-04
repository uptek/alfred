import type { PageAdapter, Permission, PermissionSearchController } from './types';

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

/**
 * Injects a search input above the Dev Dashboard permissions card and wires up
 * real-time filtering. Returns a controller to clear or tear down the search.
 */
export function setupPermissionSearch(): PermissionSearchController | null {
  const permissionsCard = document.querySelector<HTMLElement>('.permissions-card');
  if (!permissionsCard) return null;

  const PERM_SELECTOR = 'input[type="checkbox"][name="permissions[]"]';
  const autoExpandedSections = new Set<string>();
  let debounceTimer: ReturnType<typeof setTimeout> | undefined;

  const allLabels = permissionsCard.querySelectorAll<HTMLLabelElement>(`label:has(${PERM_SELECTOR})`);
  const totalCount = allLabels.length;

  const wrapper = document.createElement('div');
  wrapper.className = 'w-full max-w-[768px] mb-3';
  wrapper.style.cssText = 'position:relative;';

  const input = document.createElement('input');
  input.type = 'text';
  input.placeholder = 'Search permissions...';
  input.className = 'w-full h-8 rounded bg-background-surface-default px-3 text-body-sm';
  input.style.cssText = 'border:1px solid var(--color-border-default,#333);outline:none;';

  const clearBtn = document.createElement('button');
  clearBtn.type = 'button';
  clearBtn.innerHTML = '&#10005;';
  clearBtn.className = 'text-text-subdued';
  clearBtn.style.cssText =
    'position:absolute;right:8px;top:50%;transform:translateY(-50%);background:none;border:none;cursor:pointer;font-size:12px;display:none;padding:2px 4px;';

  const countLabel = document.createElement('div');
  countLabel.className = 'text-caption text-text-subdued';
  countLabel.style.cssText = 'margin-top:4px;display:none;';

  wrapper.appendChild(input);
  wrapper.appendChild(clearBtn);
  wrapper.appendChild(countLabel);
  permissionsCard.insertAdjacentElement('beforebegin', wrapper);

  function collapseAutoExpanded() {
    autoExpandedSections.forEach((sectionId) => {
      const panel = permissionsCard!.querySelector<HTMLElement>(
        `[data-permissions-tree-target="panel"][data-section-id="${CSS.escape(sectionId)}"]`
      );
      if (panel?.getAttribute('data-open') === 'true') {
        const header = permissionsCard!.querySelector<HTMLButtonElement>(
          `[data-permissions-tree-target="header"][data-section-id="${CSS.escape(sectionId)}"]`
        );
        header?.click();
      }
    });
    autoExpandedSections.clear();
  }

  function expandSection(sectionId: string) {
    const panel = permissionsCard!.querySelector<HTMLElement>(
      `[data-permissions-tree-target="panel"][data-section-id="${CSS.escape(sectionId)}"]`
    );
    if (panel?.getAttribute('data-open') === 'false') {
      const header = permissionsCard!.querySelector<HTMLButtonElement>(
        `[data-permissions-tree-target="header"][data-section-id="${CSS.escape(sectionId)}"]`
      );
      header?.click();
      autoExpandedSections.add(sectionId);
    }
  }

  function applyFilter(query: string) {
    const q = query.trim().toLowerCase();

    if (!q) {
      clearFilter();
      return;
    }

    collapseAutoExpanded();

    const sectionHeaders = permissionsCard!.querySelectorAll<HTMLButtonElement>(
      '[data-permissions-tree-target="header"]'
    );

    const sectionMatches = new Map<string, boolean>();
    sectionHeaders.forEach((header) => {
      const sectionId = header.getAttribute('data-section-id') ?? '';
      const headerText = header.querySelector('span.text-heading-xs')?.textContent?.toLowerCase() ?? '';
      sectionMatches.set(sectionId, headerText.includes(q));
    });

    let visibleCount = 0;

    const sectionVisibleCounts = new Map<string, number>();

    allLabels.forEach((label) => {
      const checkbox = label.querySelector<HTMLInputElement>(PERM_SELECTOR);
      if (!checkbox) return;

      const sectionId = checkbox.getAttribute('data-section-id') ?? '';
      const labelText = label.querySelector('span.text-body-sm')?.textContent?.toLowerCase() ?? '';
      const sectionIsMatch = sectionMatches.get(sectionId) ?? false;
      const labelIsMatch = labelText.includes(q);

      if (sectionIsMatch || labelIsMatch) {
        label.style.display = '';
        visibleCount++;
        sectionVisibleCounts.set(sectionId, (sectionVisibleCounts.get(sectionId) ?? 0) + 1);
      } else {
        label.style.display = 'none';
      }
    });

    // Hide subheadings (strong.text-heading-xs inside panels) in sections with no matches
    permissionsCard!
      .querySelectorAll<HTMLElement>('[data-permissions-tree-target="panel"] div > strong.text-heading-xs')
      .forEach((heading) => {
        const panel = heading.closest('[data-permissions-tree-target="panel"]');
        const sectionId = panel?.getAttribute('data-section-id') ?? '';
        const sectionIsMatch = sectionMatches.get(sectionId) ?? false;
        const sectionHasVisiblePerms = (sectionVisibleCounts.get(sectionId) ?? 0) > 0;
        const parentDiv = heading.closest('div.py-2');
        if (parentDiv) {
          (parentDiv as HTMLElement).style.display = sectionIsMatch || sectionHasVisiblePerms ? '' : 'none';
        }
      });

    sectionHeaders.forEach((header) => {
      const sectionId = header.getAttribute('data-section-id') ?? '';
      const sectionIsMatch = sectionMatches.get(sectionId) ?? false;
      const sectionHasVisiblePerms = (sectionVisibleCounts.get(sectionId) ?? 0) > 0;
      const sectionContainer = header.closest('.bg-background-surface-default') as HTMLElement | null;

      if (sectionIsMatch || sectionHasVisiblePerms) {
        if (sectionContainer) sectionContainer.style.display = '';
        expandSection(sectionId);
      } else {
        if (sectionContainer) sectionContainer.style.display = 'none';
      }
    });

    clearBtn.style.display = 'block';
    countLabel.style.display = 'block';
    countLabel.textContent = `Showing ${visibleCount} of ${totalCount} permissions`;
  }

  function clearFilter() {
    input.value = '';
    clearBtn.style.display = 'none';
    countLabel.style.display = 'none';

    allLabels.forEach((label) => {
      label.style.display = '';
    });

    // Restore subheadings
    permissionsCard!
      .querySelectorAll<HTMLElement>('[data-permissions-tree-target="panel"] div > strong.text-heading-xs')
      .forEach((heading) => {
        const parentDiv = heading.closest('div.py-2');
        if (parentDiv) (parentDiv as HTMLElement).style.display = '';
      });

    // Restore hidden sections
    permissionsCard!.querySelectorAll<HTMLElement>('[data-permissions-tree-target="header"]').forEach((header) => {
      const sectionContainer = header.closest('.bg-background-surface-default') as HTMLElement | null;
      if (sectionContainer) sectionContainer.style.display = '';
    });

    collapseAutoExpanded();
  }

  input.addEventListener('input', () => {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => applyFilter(input.value), 150);
  });

  clearBtn.addEventListener('click', clearFilter);

  input.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      clearFilter();
      input.blur();
    }
  });

  return {
    clear() {
      clearFilter();
    },
    destroy() {
      clearTimeout(debounceTimer);
      clearFilter();
      wrapper.remove();
    }
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
