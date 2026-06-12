import { getItem, setItem } from '@/utils/storage';
import { sendTrackEvent } from '@/utils/analytics';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface Permission {
  id: string;
  label: string;
}

export interface PermissionPreset {
  id: string;
  name: string;
  handle: string;
  permissions: Permission[];
  customMessage?: string;
  createdAt: number;
  lastUsed?: number;
}

export interface PermissionSearchController {
  clear(): void;
  destroy(): void;
}

// ---------------------------------------------------------------------------
// Preset storage, hotlinks, import/export
// ---------------------------------------------------------------------------

const STORAGE_KEY = 'alfred:permission-presets';
const HOTLINK_PRESET_PARAM = 'alfred_preset';
export const HOTLINK_AUTOSUBMIT_PARAM = 'alfred_submit';

type StoredPermissionPreset = PermissionPreset;

/**
 * Generates a unique ID for a preset.
 * @returns A unique preset ID
 */
export function generatePresetId(): string {
  return Math.random().toString(36).substring(2, 8) + Date.now().toString(36);
}

/**
 * Builds the hotlink URL for a preset using the current partner ID.
 * @param handle - The preset handle to include in the hotlink
 * @param autoSubmit - When true, appends the auto-submit param so the request is sent automatically after applying
 * @returns A collaborator request URL with the preset param appended
 */
export function buildHotlinkUrl(handle: string, autoSubmit = false): string {
  const url = new URL(window.location.href);
  const segments = url.pathname.split('/').filter(Boolean);
  const partnerId = segments[1];

  let hotlink = `${url.host}/dashboard/${partnerId}/stores/collaborations/new?${HOTLINK_PRESET_PARAM}=${handle}&store_url={{ customer.shopifyDomain }}`;
  if (autoSubmit) {
    hotlink += `&${HOTLINK_AUTOSUBMIT_PARAM}=1`;
  }
  return hotlink;
}

/**
 * Normalizes a preset handle into a URL-friendly slug.
 * @param value - Raw handle input
 * @returns The normalized handle, or null if empty after normalization
 */
export function normalizePresetHandle(value: string | undefined): string | null {
  const normalized =
    value
      ?.trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') ?? '';
  return normalized || null;
}

/**
 * Ensures a preset handle is unique within the current preset collection.
 * @param handle - Preferred handle, if one exists
 * @param presets - Current set of presets to compare against
 * @param currentPresetId - Current preset ID when updating an existing preset
 * @returns A unique handle
 */
function ensureUniquePresetHandle(
  handle: string | undefined,
  presets: PermissionPreset[],
  currentPresetId?: string
): string {
  const existingHandles = new Set(
    presets.filter((preset) => preset.id !== currentPresetId).map((preset) => preset.handle)
  );

  const preferredHandle = normalizePresetHandle(handle);
  if (preferredHandle && !existingHandles.has(preferredHandle)) {
    return preferredHandle;
  }

  const baseHandle = preferredHandle ?? 'preset';
  let suffix = 2;
  let generatedHandle = `${baseHandle}-${suffix}`;

  while (existingHandles.has(generatedHandle)) {
    suffix += 1;
    generatedHandle = `${baseHandle}-${suffix}`;
  }

  return generatedHandle;
}

/**
 * Normalizes a stored preset before it is used in the app.
 * @param preset - Stored preset record
 * @param presets - Already-normalized presets used for uniqueness checks
 * @returns A normalized preset ready for runtime use
 */
function normalizePreset(preset: StoredPermissionPreset, presets: PermissionPreset[]): PermissionPreset {
  return {
    ...preset,
    name: preset.name.trim(),
    handle: ensureUniquePresetHandle(preset.handle ?? preset.name, presets, preset.id),
    createdAt: preset.createdAt || Date.now()
  };
}

/**
 * Retrieves all permissions presets from browser storage.
 * @returns Promise that resolves to an array of permissions presets, or empty array if none exist
 */
export async function getPresets(): Promise<PermissionPreset[]> {
  const data = await getItem<{ presets?: StoredPermissionPreset[] }>(STORAGE_KEY);
  const storedPresets = data?.presets ?? [];
  const normalizedPresets = storedPresets.reduce<PermissionPreset[]>((acc, preset) => {
    acc.push(normalizePreset(preset, acc));
    return acc;
  }, []);

  if (
    storedPresets.length !== normalizedPresets.length ||
    storedPresets.some(
      (preset, index) =>
        preset.handle !== normalizedPresets[index]?.handle ||
        preset.name !== normalizedPresets[index]?.name ||
        preset.createdAt !== normalizedPresets[index]?.createdAt
    )
  ) {
    await setItem(STORAGE_KEY, { presets: normalizedPresets });
  }

  return normalizedPresets;
}

/**
 * Saves the entire array of permissions presets to browser storage.
 * @param presets - Array of permissions presets to save
 * @internal Used internally by savePreset and deletePreset functions
 */
export async function savePresets(presets: StoredPermissionPreset[]): Promise<PermissionPreset[]> {
  const normalizedPresets = presets.reduce<PermissionPreset[]>((acc, preset) => {
    acc.push(normalizePreset(preset, acc));
    return acc;
  }, []);

  await setItem(STORAGE_KEY, { presets: normalizedPresets });
  return normalizedPresets;
}

/**
 * Saves or updates a permissions preset in browser storage.
 * If a preset with the same ID exists, it will be updated.
 * If not, the preset will be added as a new entry.
 * @param preset - The permissions preset to save or update
 */
export async function savePreset(preset: StoredPermissionPreset): Promise<PermissionPreset> {
  const presets = await getPresets();
  const updatedPresets: StoredPermissionPreset[] = [...presets];

  const existingIndex = updatedPresets.findIndex((p) => p.id === preset.id);
  if (existingIndex >= 0) {
    updatedPresets[existingIndex] = preset;
  } else {
    updatedPresets.push(preset);
  }

  const savedPresets = await savePresets(updatedPresets);
  return savedPresets.find((savedPreset) => savedPreset.id === preset.id)!;
}

/**
 * Deletes a permissions preset from browser storage.
 * @param presetId - The ID of the preset to delete
 */
export async function deletePreset(presetId: string): Promise<void> {
  const presets = await getPresets();
  const filteredPresets = presets.filter((p) => p.id !== presetId);
  await savePresets(filteredPresets);
}

/**
 * Exports permissions presets as a JSON file download.
 * @param presetsToExport - Array of presets to export
 */
export function exportPresets(presetsToExport: PermissionPreset[]): void {
  // Remove id and lastUsed fields from export
  const cleanedPresets = presetsToExport.map(({ id: _id, lastUsed: _lastUsed, ...preset }) => preset);
  const dataStr = JSON.stringify(cleanedPresets, null, 2);
  const dataUri = 'data:application/json;charset=utf-8,' + encodeURIComponent(dataStr);
  const filename = `shopify-alfred-permissions-presets-${new Date().toISOString().split('T')[0]}.json`;

  const linkElement = document.createElement('a');
  linkElement.setAttribute('href', dataUri);
  linkElement.setAttribute('download', filename);
  linkElement.click();
}

/**
 * Imports permissions presets from a JSON file.
 * @returns Promise that resolves to the number of imported presets, or null if cancelled
 */
export function importPresets(): Promise<number | null> {
  return new Promise((resolve, reject) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';

    input.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) {
        resolve(null);
        return;
      }

      try {
        const text = await file.text();
        const importedPresets = JSON.parse(text) as StoredPermissionPreset[];

        if (!Array.isArray(importedPresets)) {
          throw new Error('Invalid file format. Expected an array of presets.');
        }

        // Import each preset one by one
        let importCount = 0;
        for (const importedPreset of importedPresets) {
          const newPreset: StoredPermissionPreset = {
            ...importedPreset,
            id: generatePresetId(),
            createdAt: importedPreset.createdAt || Date.now()
          };

          await savePreset(newPreset);
          importCount++;
        }

        resolve(importCount);
      } catch (error) {
        reject(error as Error);
      }
    };

    input.click();
  });
}

// ---------------------------------------------------------------------------
// Permission search filter (injected into the page's permissions card)
// ---------------------------------------------------------------------------

/**
 * Injects a search input above the permissions card and wires up
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

// ---------------------------------------------------------------------------
// Page interaction (reads/writes the collaborator request form)
// ---------------------------------------------------------------------------

/** Creates the page-interaction helpers for the Shopify collaborator request form (dev.shopify.com). */
export function createAdapter() {
  const PERM_SELECTOR = 'input[type="checkbox"][name="permissions[]"]';
  const MSG_SELECTOR = '#collaboration-request-message';

  return {
    /** @returns All currently checked permissions with their form `value` attribute and label text. */
    getCheckedPermissions(): Permission[] {
      const permissions: Permission[] = [];
      document.querySelectorAll<HTMLInputElement>(`${PERM_SELECTOR}:checked`).forEach((checkbox) => {
        const label = checkbox.closest('label')?.querySelector('span.text-body-sm')?.textContent ?? '';
        permissions.push({ id: checkbox.value, label: label.trim() });
      });
      return permissions;
    },

    /**
     * Unchecks the entire permission tree, re-querying after each click until
     * nothing remains checked. Targets every tree checkbox by
     * `data-permissions-tree-target`, not just `permissions[]` leaves: a section
     * group header (e.g. `orders_group`, which has no `name`/`value`) stays checked
     * after its children are cleared, so a leaf-only sweep left the group still
     * ticked when switching presets. Clicking a checked group cascades its subtree
     * clear; the guard caps iterations in case a click ever fails to uncheck.
     */
    uncheckAll() {
      const TREE_SELECTOR = 'input[type="checkbox"][data-permissions-tree-target="checkbox"]';
      for (let guard = 0; guard < 1000; guard += 1) {
        const checkbox = document.querySelector<HTMLInputElement>(`${TREE_SELECTOR}:checked`);
        if (!checkbox) break;
        checkbox.click();
      }
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
    },

    /**
     * Triggers the page's `store-url-debounce` controller to validate the store URL.
     * Hotlinks prefill the field from the `store_url` query param via server render,
     * which never fires an `input` event — so the controller never validates the
     * domain and the Request access button stays disabled. Dispatch one to kick it off.
     * @returns true if the store URL input was found with a value to validate.
     */
    triggerStoreUrlValidation(): boolean {
      const input = document.querySelector<HTMLInputElement>('#store-url-input');
      if (input && input.value.trim()) {
        input.dispatchEvent(new Event('input', { bubbles: true }));
        return true;
      }
      return false;
    },

    /**
     * Resolves once the Request access button is enabled. The button stays disabled
     * until the store URL validates and at least one permission is registered, so
     * auto-submit must wait for the real enabled state rather than a fixed delay.
     * @param timeoutMs - Max time to wait before giving up.
     * @returns true when the button became enabled, false on timeout or if missing.
     */
    waitForSubmitEnabled(timeoutMs = 3000): Promise<boolean> {
      const button = document.querySelector<HTMLButtonElement>('#collaboration-request-submit-button');
      if (!button) return Promise.resolve(false);
      if (!button.disabled) return Promise.resolve(true);

      return new Promise((resolve) => {
        let settled = false;
        const finish = (value: boolean) => {
          if (settled) return;
          settled = true;
          observer.disconnect();
          clearTimeout(timer);
          resolve(value);
        };
        const observer = new MutationObserver(() => {
          if (!button.disabled) finish(true);
        });
        observer.observe(button, { attributes: true, attributeFilter: ['disabled'] });
        const timer = setTimeout(() => finish(false), timeoutMs);
      });
    },

    /**
     * Clicks the "Request access" submit button on the collaboration form.
     * @returns true if the button was found and clicked, false if missing or still disabled.
     */
    submit(): boolean {
      const button = document.querySelector<HTMLButtonElement>('#collaboration-request-submit-button');
      if (button && !button.disabled) {
        button.click();
        return true;
      }
      return false;
    }
  };
}
