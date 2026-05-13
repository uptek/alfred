import type { PageAdapter, Permission, PermissionSearchController } from './types';
import { sendTrackEvent } from '@/utils/analytics';

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

  const transitionStyle = document.createElement('style');
  transitionStyle.textContent = `
    .alfred-perm-filter { transition: opacity 150ms ease, max-height 150ms ease; overflow: hidden; }
    .alfred-perm-filter-hidden { opacity: 0; max-height: 0 !important; padding-top: 0 !important; padding-bottom: 0 !important; margin: 0 !important; pointer-events: none; }
    .alfred-section-filter { transition: opacity 150ms ease, max-height 200ms ease, padding 150ms ease, margin 150ms ease, border-width 150ms ease; overflow: hidden; }
    .alfred-section-filter-hidden { opacity: 0; max-height: 0 !important; padding: 0 !important; margin: 0 !important; border-width: 0 !important; overflow: hidden; pointer-events: none; }
  `;
  document.head.appendChild(transitionStyle);

  allLabels.forEach((label) => label.classList.add('alfred-perm-filter'));

  const sectionContainers = permissionsCard.querySelectorAll<HTMLElement>('[data-permissions-tree-target="header"]');
  sectionContainers.forEach((header) => {
    const container = header.closest('.bg-background-surface-default') as HTMLElement | null;
    if (container) container.classList.add('alfred-section-filter');
  });

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

  const selectAllBtn = permissionsCard
    .closest('[data-controller="permissions-tree"]')
    ?.querySelector<HTMLButtonElement>('[data-permissions-tree-target="selectAllButton"]');
  if (selectAllBtn) {
    const linkBtnStyle = 'border:none;background:none;padding:0;';

    const expandAllBtn = document.createElement('button');
    expandAllBtn.type = 'button';
    expandAllBtn.textContent = 'Expand all';
    expandAllBtn.className = 'text-link text-body-sm cursor-pointer';
    expandAllBtn.style.cssText = linkBtnStyle;

    const collapseAllBtn = document.createElement('button');
    collapseAllBtn.type = 'button';
    collapseAllBtn.textContent = 'Collapse all';
    collapseAllBtn.className = 'text-link text-body-sm cursor-pointer';
    collapseAllBtn.style.cssText = linkBtnStyle;

    function clickSectionsByState(openState: string) {
      permissionsCard!.querySelectorAll<HTMLElement>('[data-permissions-tree-target="panel"]').forEach((panel) => {
        if (panel.getAttribute('data-open') === openState) {
          const sectionId = panel.getAttribute('data-section-id') ?? '';
          permissionsCard!
            .querySelector<HTMLButtonElement>(
              `[data-permissions-tree-target="header"][data-section-id="${CSS.escape(sectionId)}"]`
            )
            ?.click();
        }
      });
    }

    expandAllBtn.addEventListener('click', () => {
      clickSectionsByState('false');
      sendTrackEvent('expand_all_permissions');
    });
    collapseAllBtn.addEventListener('click', () => {
      clickSectionsByState('true');
      sendTrackEvent('collapse_all_permissions');
    });

    const btnGroup = document.createElement('span');
    btnGroup.style.cssText = 'display:inline-flex;align-items:center;gap:4px;';
    selectAllBtn.parentNode!.insertBefore(btnGroup, selectAllBtn);
    btnGroup.appendChild(selectAllBtn);
    btnGroup.appendChild(document.createTextNode(' · '));
    btnGroup.appendChild(expandAllBtn);
    btnGroup.appendChild(document.createTextNode(' · '));
    btnGroup.appendChild(collapseAllBtn);
  }

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

    const words = q.split(/\s+/).filter(Boolean);

    const sectionTexts = new Map<string, string>();
    sectionHeaders.forEach((header) => {
      const sectionId = header.getAttribute('data-section-id') ?? '';
      const headerText = header.querySelector('span.text-heading-xs')?.textContent?.toLowerCase() ?? '';
      sectionTexts.set(sectionId, headerText);
    });

    let visibleCount = 0;

    const sectionVisibleCounts = new Map<string, number>();

    allLabels.forEach((label) => {
      const checkbox = label.querySelector<HTMLInputElement>(PERM_SELECTOR);
      if (!checkbox) return;

      const sectionId = checkbox.getAttribute('data-section-id') ?? '';
      const labelText = label.querySelector('span.text-body-sm')?.textContent?.toLowerCase() ?? '';
      const sectionText = sectionTexts.get(sectionId) ?? '';
      const combined = sectionText + ' ' + labelText;
      const allWordsMatch = words.every((word) => combined.includes(word));

      if (allWordsMatch) {
        label.classList.remove('alfred-perm-filter-hidden');
        visibleCount++;
        sectionVisibleCounts.set(sectionId, (sectionVisibleCounts.get(sectionId) ?? 0) + 1);
      } else {
        label.classList.add('alfred-perm-filter-hidden');
      }
    });

    // Hide subheadings whose following permission labels are all hidden.
    // Walk forward from each subheading div until the next subheading or end of container.
    permissionsCard!
      .querySelectorAll<HTMLElement>('[data-permissions-tree-target="panel"] div.py-2:has(> strong.text-heading-xs)')
      .forEach((headingDiv) => {
        let hasVisibleSibling = false;
        let sibling = headingDiv.nextElementSibling as HTMLElement | null;
        while (sibling) {
          if (sibling.matches('div.py-2:has(> strong.text-heading-xs)')) break;
          if (sibling.tagName === 'LABEL' && !sibling.classList.contains('alfred-perm-filter-hidden')) {
            hasVisibleSibling = true;
            break;
          }
          sibling = sibling.nextElementSibling as HTMLElement | null;
        }
        if (hasVisibleSibling) {
          headingDiv.classList.remove('alfred-perm-filter-hidden');
        } else {
          headingDiv.classList.add('alfred-perm-filter-hidden');
        }
      });

    sectionHeaders.forEach((header) => {
      const sectionId = header.getAttribute('data-section-id') ?? '';
      const sectionHasVisiblePerms = (sectionVisibleCounts.get(sectionId) ?? 0) > 0;
      const sectionContainer = header.closest('.bg-background-surface-default') as HTMLElement | null;

      if (sectionHasVisiblePerms) {
        if (sectionContainer) sectionContainer.classList.remove('alfred-section-filter-hidden');
        expandSection(sectionId);
      } else {
        if (sectionContainer) sectionContainer.classList.add('alfred-section-filter-hidden');
      }
    });

    clearBtn.style.display = 'block';
    countLabel.style.display = 'block';
    countLabel.textContent = `Showing ${visibleCount} of ${totalCount} permissions`;

    sendTrackEvent('permission_search', { query: q, results_count: visibleCount, total_count: totalCount });
  }

  function clearFilter() {
    input.value = '';
    clearBtn.style.display = 'none';
    countLabel.style.display = 'none';

    allLabels.forEach((label) => {
      label.classList.remove('alfred-perm-filter-hidden');
    });

    // Restore subheadings
    permissionsCard!
      .querySelectorAll<HTMLElement>('[data-permissions-tree-target="panel"] div > strong.text-heading-xs')
      .forEach((heading) => {
        const parentDiv = heading.closest('div.py-2');
        if (parentDiv) (parentDiv as HTMLElement).classList.remove('alfred-perm-filter-hidden');
      });

    // Restore hidden sections
    permissionsCard!.querySelectorAll<HTMLElement>('[data-permissions-tree-target="header"]').forEach((header) => {
      const sectionContainer = header.closest('.bg-background-surface-default') as HTMLElement | null;
      if (sectionContainer) sectionContainer.classList.remove('alfred-section-filter-hidden');
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
      transitionStyle.remove();
      allLabels.forEach((label) => label.classList.remove('alfred-perm-filter'));
      permissionsCard!.querySelectorAll<HTMLElement>('.alfred-section-filter').forEach((el) => {
        el.classList.remove('alfred-section-filter');
      });
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
