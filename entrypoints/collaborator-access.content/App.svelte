<script lang="ts">
  import { sendTrackEvent } from '@/utils/analytics';
  import CreditChip from '@/components/CreditChip.svelte';
  import {
    buildHotlinkUrl, generatePresetId, getPresets, savePreset,
    deletePreset, exportPresets, importPresets, normalizePresetHandle,
    setupPermissionSearch, createAdapter,
    HOTLINK_PRESET_PARAM, HOTLINK_AUTOSUBMIT_PARAM
  } from './presets';
  import { Toast } from '@/utils/toast';
  import type { PermissionPreset, PermissionSearchController } from './presets';
  import type { Snippet } from 'svelte';

  const adapter = createAdapter();

  // Subtle tint flash on a field whenever its bound value changes
  // (e.g. toggling auto-submit rewrites the hotlink URLs) — light UX feedback.
  // Painted as an inset shadow because readonly field backgrounds are pinned.
  function flashOnChange(node: HTMLElement, _value: string) {
    return {
      update() {
        node.style.transition = 'none';
        node.style.boxShadow = 'inset 0 0 0 100vmax rgba(67, 179, 142, 0.22)';
        void node.offsetWidth; // force reflow so the fade restarts each time
        node.style.transition = 'box-shadow 1000ms ease-out';
        node.style.boxShadow = '';
      }
    };
  }

  let presets = $state.raw<PermissionPreset[]>([]);
  let selectedPreset = $state.raw<PermissionPreset | null>(null);
  let checkedPresets = $state.raw<Set<string>>(new Set());
  let hotlinkHandle = $state('');
  let hotlinkAutoSubmit = $state(false);
  let autoApplyAttempted = $state(false);
  let hotlinkDialog = $state<HTMLDialogElement>();
  // Backdrop clicks close the dialog only when the press started there too, so
  // a text selection dragged out of the panel doesn't
  let pressedBackdrop = false;
  let searchController: PermissionSearchController | null = null;

  // Hotlink URLs reactively reflect the selected preset handle and the auto-submit checkbox.
  let hotlinkUrl = $derived(hotlinkHandle ? buildHotlinkUrl(hotlinkHandle, hotlinkAutoSubmit) : '');
  let hotlinkBareUrl = $derived(hotlinkHandle ? buildHotlinkUrl(hotlinkHandle, hotlinkAutoSubmit, { bare: true }) : '');

  // Load saved presets from extension storage on mount.
  $effect(() => {
    getPresets().then((p) => { presets = p; });
  });

  // Inject the permission search filter into the permissions card.
  $effect(() => {
    searchController = setupPermissionSearch();
    return () => { searchController?.destroy(); searchController = null; };
  });

  // Auto-apply a preset when the URL contains ?alfred_preset=<handle|name>.
  // Matches by normalized handle first, then falls back to case-insensitive name.
  // Runs once per page load — guarded by autoApplyAttempted.
  $effect(() => {
    if (autoApplyAttempted || presets.length === 0) return;

    const params = new URLSearchParams(window.location.search);
    const presetNameFromUrl = params.get(HOTLINK_PRESET_PARAM);
    if (!presetNameFromUrl?.trim()) {
      autoApplyAttempted = true;
      return;
    }

    autoApplyAttempted = true;
    const autoSubmit = params.get(HOTLINK_AUTOSUBMIT_PARAM) === '1';

    const matchingByHandle = presets.filter((p) => p.handle === normalizePresetHandle(presetNameFromUrl));
    if (matchingByHandle.length === 1) {
      void handleApplyPreset(matchingByHandle[0], 'url_param', autoSubmit);
      return;
    }

    const matchingPresets = presets.filter((p) => p.name.trim().toLowerCase() === presetNameFromUrl.trim().toLowerCase());
    if (matchingPresets.length === 0) {
      Toast.error(`Preset "${presetNameFromUrl}" not found`);
      return;
    }
    if (matchingPresets.length > 1) {
      Toast.error(`Multiple presets named "${presetNameFromUrl}" found`);
      return;
    }
    void handleApplyPreset(matchingPresets[0], 'url_param', autoSubmit);
  });

  // Arriving from the storefront context menu without a preset (the "Open request form"
  // option) prefills ?store_url= via server render, which never fires an input event —
  // so the store never validates. The preset path handles its own validation, so only
  // kick it off here for the no-preset case. Small delay lets the page's controllers connect.
  $effect(() => {
    const params = new URLSearchParams(window.location.search);
    if (!params.get('store_url')) return;
    if (params.get(HOTLINK_PRESET_PARAM)?.trim()) return;
    const timer = setTimeout(() => adapter.triggerStoreUrlValidation(), 150);
    return () => clearTimeout(timer);
  });

  // Listen for the alfred:save-preset custom event dispatched by proxy buttons injected in index.ts.
  $effect(() => {
    const handler = () => handleSavePreset();
    document.addEventListener('alfred:save-preset', handler);
    return () => document.removeEventListener('alfred:save-preset', handler);
  });

  /**
   * Applies a preset by unchecking all permissions, then checking the preset's permissions
   * one by one with staggered delays. Expands collapsed sections and scrolls to bottom when done.
   * @param presetToApply - The preset to apply. Falls back to selectedPreset if omitted.
   * @param source - Whether triggered manually or via URL param. Defaults to 'manual'.
   * @param autoSubmit - When true, submits the request automatically once the form is filled.
   */
  async function handleApplyPreset(
    presetToApply?: PermissionPreset,
    source: 'manual' | 'url_param' = 'manual',
    autoSubmit = false
  ) {
    const preset = presetToApply ?? selectedPreset;
    if (!preset) {
      alert('Please select a preset to apply.');
      return;
    }

    searchController?.clear();
    adapter.uncheckAll();

    // Hotlink arrivals prefill the store URL from the query param via server render,
    // which never fires an input event — so the page never validates the domain and
    // the Request access button stays disabled. Kick off validation explicitly.
    if (source === 'url_param') {
      adapter.triggerStoreUrlValidation();
    }

    const permissions = preset.permissions ?? [];
    const permissionsApplied = new Promise<void>((resolve) => {
      setTimeout(() => {
        permissions.forEach((permission, index) => {
          setTimeout(() => {
            adapter.checkPermission(permission.id);
          }, index * 50);
        });
        setTimeout(() => {
          adapter.expandCheckedSections();
          resolve();
        }, permissions.length * 50 + 50);
      }, 100);
    });

    if (preset.customMessage !== '') {
      adapter.setMessage(preset.customMessage ?? '');
    }

    window.setTimeout(() => {
      window.scrollTo({ top: Math.max(document.body.scrollHeight, document.documentElement.scrollHeight), behavior: 'smooth' });
    }, 100 + permissions.length * 50 + 400);

    // Optionally submit once every permission is applied AND the page enables the
    // Request access button. The page enables the button as soon as the store URL
    // validates and a single permission registers, so waiting on the enabled state
    // alone fires submit mid-fill, dropping the permissions still queued behind it.
    // Gate on the full apply schedule first, then wait for the real enabled state.
    if (autoSubmit) {
      void permissionsApplied
        .then(() => adapter.waitForSubmitEnabled())
        .then((ready) => {
          if (ready && adapter.submit()) {
            sendTrackEvent('preset_auto_submit', { permissions_count: permissions.length, source });
          }
        });
    }

    const updatedPreset = await savePreset({ ...preset, lastUsed: Date.now() });
    presets = presets.map((p) => (p.id === updatedPreset.id ? updatedPreset : p));
    if (presetToApply) selectedPreset = updatedPreset;

    sendTrackEvent('apply_preset', { permissions_count: (preset.permissions ?? []).length, has_custom_message: !!preset.customMessage, source, auto_submit: autoSubmit });

    Toast.success(`Applied preset "${updatedPreset.name}"`);
  }

  /**
   * Prompts the user for a new name and updates the preset in storage.
   * @param preset - The preset to rename.
   */
  async function handleEditPreset(preset: PermissionPreset) {
    const newName = prompt('Enter new name for the preset.\n\nNote: Renaming changes the handle and breaks existing hotlinks.', preset.name);
    if (!newName || newName.trim() === preset.name) return;

    try {
      const updatedPreset = await savePreset({ ...preset, name: newName.trim(), handle: newName.trim() });
      presets = presets.map((p) => (p.id === preset.id ? updatedPreset : p));
      if (selectedPreset?.id === preset.id) selectedPreset = updatedPreset;
      Toast.success(`Updated preset "${updatedPreset.name}".`);
    } catch (error) {
      console.error('Failed to update preset:', error);
      Toast.error('Failed to update preset');
    }
  }

  /**
   * Deletes a preset after user confirmation.
   * @param presetId - The ID of the preset to delete.
   */
  async function handleDeletePreset(presetId: string) {
    if (confirm('Are you sure you want to delete this preset?')) {
      try {
        await deletePreset(presetId);
        presets = presets.filter((p) => p.id !== presetId);
        if (selectedPreset?.id === presetId) selectedPreset = null;
        Toast.success('Preset deleted');
      } catch (error) {
        console.error('Failed to delete preset:', error);
        Toast.error('Failed to delete preset');
      }
    }
  }

  /**
   * Opens the hotlink modal with the URL and handle for the given preset.
   * @param preset - The preset to generate a hotlink for.
   */
  function handleOpenHotlinkModal(preset: PermissionPreset) {
    hotlinkHandle = preset.handle;
    hotlinkAutoSubmit = false;
    hotlinkDialog?.showModal();
  }

  /** Label of the hotlink URL field whose copy button shows the copied state. */
  let copiedField = $state<string | null>(null);
  let copiedTimer: ReturnType<typeof setTimeout>;

  /** Copies a hotlink URL and flags its button as copied for 2s, like the dashboard's copy buttons. */
  async function copyHotlinkUrl(url: string, field: string) {
    if (!url) return;
    try {
      await navigator.clipboard.writeText(url);
      copiedField = field;
      clearTimeout(copiedTimer);
      copiedTimer = setTimeout(() => (copiedField = null), 2000);
      Toast.success('URL copied');
    } catch (error) {
      console.error('Failed to copy hotlink URL:', error);
      Toast.error('Failed to copy URL');
    }
  }

  /** Opens a file picker to import presets from a JSON file and reloads the preset list. */
  async function handleImport() {
    try {
      const count = await importPresets();
      if (count === null) return;
      presets = await getPresets();
      checkedPresets = new Set();
      Toast.success(`Imported ${count} preset${count !== 1 ? 's' : ''}`);
    } catch (error) {
      console.error('Import failed:', error);
      Toast.error('Failed to import presets');
    }
  }

  /** Deletes checked presets after confirmation. Deletes all presets if none are checked. */
  async function handleDeleteMultiple() {
    const presetsToDelete = checkedPresets.size === 0 ? presets.map((p) => p.id) : Array.from(checkedPresets);
    if (confirm(`Are you sure you want to delete ${presetsToDelete.length} preset${presetsToDelete.length !== 1 ? 's' : ''}?`)) {
      for (const id of presetsToDelete) await deletePreset(id);
      presets = presets.filter((p) => !presetsToDelete.includes(p.id));
      checkedPresets = new Set();
      if (selectedPreset && presetsToDelete.includes(selectedPreset.id)) selectedPreset = null;
      Toast.success(`Deleted ${presetsToDelete.length} preset${presetsToDelete.length !== 1 ? 's' : ''}`);
    }
  }

  /** Reads the currently checked permissions and message from the page, prompts for a name, and saves a new preset to extension storage. */
  async function handleSavePreset() {
    const permissions = adapter.getCheckedPermissions();
    if (permissions.length === 0) {
      alert('Please select at least one permission to save as a preset.');
      return;
    }

    const presetName = prompt('Enter a name for this preset:');
    if (!presetName?.trim()) return;

    const customMessage = adapter.getMessage();

    const newPreset: PermissionPreset = {
      id: generatePresetId(), name: presetName.trim(), handle: presetName.trim(),
      permissions, customMessage, createdAt: Date.now()
    };

    try {
      const savedPreset = await savePreset(newPreset);
      presets = [...presets, savedPreset];
      sendTrackEvent('save_preset', { permissions_count: permissions.length, has_custom_message: !!customMessage });
      Toast.success(`Saved preset "${savedPreset.name}"`);
    } catch (error) {
      console.error('Failed to save preset:', error);
      Toast.error('Failed to save preset');
    }
  }
</script>

{#snippet checkmark(checked: boolean, onchange: (e: Event) => void, ariaLabel: string)}
  <label class="choice-checkbox-container">
    <input type="checkbox" class="choice-input-sr-only" {checked} {onchange} aria-label={ariaLabel} />
    <span class="choice-checkbox-indicator" aria-hidden="true">
      <span class="choice-checkbox-check">{@render checkIcon()}</span>
    </span>
  </label>
{/snippet}

<!-- Markup mirrors the dashboard's Altair Button so it themes with the page -->
{#snippet button(label: string, onclick: () => void, opts: { variant?: 'primary' | 'secondary' | 'critical'; size?: 'micro' | 'default'; icon?: Snippet; iconOnly?: boolean } = {})}
  {@const variant = opts.variant ?? 'secondary'}
  {@const size = opts.size ?? 'micro'}
  <button
    type="button"
    class="altair-button altair-button--{variant}"
    class:altair-button--micro={size === 'micro'}
    class:altair-button--icon-only={opts.iconOnly}
    class:altair-button--with-leading-icon={opts.icon && !opts.iconOnly}
    data-altair-component="Button"
    data-altair-variant={variant}
    data-altair-size={size}
    data-state="idle"
    aria-label={opts.iconOnly ? label : undefined}
    {onclick}>
    <span class="altair-button__content">
      {#if opts.icon}
        <span class="altair-button__icon" data-altair-slot="leading" aria-hidden="true">
          <span class="altair-icon altair-icon--small">{@render opts.icon()}</span>
        </span>
      {/if}
      {#if !opts.iconOnly}<span class="altair-button__label">{label}</span>{/if}
    </span>
  </button>
{/snippet}

{#snippet checkIcon()}
  <svg viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M15.78 5.97a.75.75 0 0 1 0 1.06l-6.5 6.5a.75.75 0 0 1-1.06 0l-3.25-3.25a.75.75 0 1 1 1.06-1.06l2.72 2.72 5.97-5.97a.75.75 0 0 1 1.06 0Z"></path></svg>
{/snippet}

{#snippet applyIcon()}
  <svg viewBox="0 0 16 16" fill="currentColor"><path fill-rule="evenodd" d="M8 15a7 7 0 1 0 0-14 7 7 0 0 0 0 14m3.079-8.523a.75.75 0 1 0-1.158-.954l-2.858 3.47-.939-1.409a.75.75 0 0 0-1.248.832l1.21 1.815c.042.063.097.146.153.215.062.078.18.21.371.297a1 1 0 0 0 .728.037 1 1 0 0 0 .4-.258c.062-.063.125-.14.173-.198z"></path></svg>
{/snippet}

{#snippet editIcon()}
  <svg viewBox="0 0 16 16" fill="currentColor"><path fill-rule="evenodd" d="M13.655 2.344a2.694 2.694 0 0 0-3.81 0l-.599.599-.009-.009-1.06 1.06.009.01-5.88 5.88a2.75 2.75 0 0 0-.806 1.944v1.922a.75.75 0 0 0 .75.75h1.922a2.75 2.75 0 0 0 1.944-.806l7.54-7.54a2.694 2.694 0 0 0 0-3.81Zm-4.409 2.72-5.88 5.88a1.25 1.25 0 0 0-.366.884v1.172h1.172c.331 0 .65-.132.883-.366l5.88-5.88zm2.75.629.599-.599a1.196 1.196 0 0 0-1.69-1.69l-.598.6z"></path></svg>
{/snippet}

{#snippet deleteIcon()}
  <svg viewBox="0 0 16 16" fill="currentColor"><path d="M9.5 6.25a.75.75 0 0 1 .75.75v4.25a.75.75 0 0 1-1.5 0v-4.25a.75.75 0 0 1 .75-.75"></path><path d="M7.25 7a.75.75 0 0 0-1.5 0v4.25a.75.75 0 0 0 1.5 0z"></path><path fill-rule="evenodd" d="M5.25 3.25a2.75 2.75 0 1 1 5.5 0h3a.75.75 0 0 1 0 1.5h-.75v5.45c0 1.68 0 2.52-.327 3.162a3 3 0 0 1-1.311 1.311c-.642.327-1.482.327-3.162.327h-.4c-1.68 0-2.52 0-3.162-.327a3 3 0 0 1-1.311-1.311c-.327-.642-.327-1.482-.327-3.162v-5.45h-.75a.75.75 0 0 1 0-1.5zm1.5 0a1.25 1.25 0 0 1 2.5 0zm-2.25 1.5h7v5.45c0 .865-.001 1.423-.036 1.848-.033.408-.09.559-.128.633a1.5 1.5 0 0 1-.655.655c-.074.038-.225.095-.633.128-.425.035-.983.036-1.848.036h-.4c-.865 0-1.423-.001-1.848-.036-.408-.033-.559-.09-.633-.128a1.5 1.5 0 0 1-.656-.655c-.037-.074-.094-.225-.127-.633-.035-.425-.036-.983-.036-1.848z"></path></svg>
{/snippet}

{#snippet urlField(value: string, ariaLabel: string)}
  {@const copied = copiedField === ariaLabel}
  <div class="url-row">
    <div class="field">
      <div class="field__control">
        <input type="text" class="field__input font-mono" {value} use:flashOnChange={value} aria-label={ariaLabel} readonly />
      </div>
    </div>
    <!-- The dashboard's own copy button: its CSS swaps the icons while data-copied is set -->
    <button
      type="button"
      class="altair-button altair-button--secondary altair-button--icon-only developer-dashboard-copy-button"
      data-altair-component="Button"
      data-altair-variant="secondary"
      data-altair-size="default"
      data-state="idle"
      data-copied={copied || undefined}
      aria-label={copied ? 'Copied to clipboard' : `Copy ${ariaLabel}`}
      onclick={() => copyHotlinkUrl(value, ariaLabel)}>
      <span class="altair-button__content">
        <span class="altair-button__label">
          <span class="copy-icons" aria-hidden="true">
            <span class="altair-icon altair-icon--small developer-dashboard-copy-button__icon developer-dashboard-copy-button__copy-icon">
              <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect x="8" y="8" width="9" height="9" rx="2"></rect><path d="M5 13h-.5A1.5 1.5 0 0 1 3 11.5v-7A1.5 1.5 0 0 1 4.5 3h7A1.5 1.5 0 0 1 13 4.5V5"></path></svg>
            </span>
            <span class="altair-icon altair-icon--small developer-dashboard-copy-button__icon developer-dashboard-copy-button__check-icon">
              {@render checkIcon()}
            </span>
          </span>
        </span>
      </span>
    </button>
  </div>
{/snippet}

<div class="altair-modal">
<dialog
  bind:this={hotlinkDialog}
  class="altair-modal__dialog"
  aria-labelledby="alfred-hotlink-title"
  onpointerdown={(e) => { pressedBackdrop = e.target === e.currentTarget; }}
  onclick={(e) => { if (pressedBackdrop && e.target === e.currentTarget) hotlinkDialog?.close(); }}>
  <div class="altair-modal__panel">
    <div class="altair-modal__header">
      <div class="altair-modal__heading">
        <h2 class="altair-modal__title" id="alfred-hotlink-title">Preset hotlink</h2>
      </div>
      <button type="button" class="altair-modal__close" aria-label="Close" onclick={() => hotlinkDialog?.close()}>
        <span class="altair-modal__close-glyph" aria-hidden="true">
          <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><path d="M4 4l8 8M12 4l-8 8" /></svg>
        </span>
      </button>
    </div>
    <div class="altair-modal__body">
      <p class="altair-text" data-altair-role="body-minor" data-altair-tone="secondary">
        Auto-apply this preset using the URL parameter
        <code class="altair-text" data-altair-role="code" data-altair-tone="primary">alfred_preset={hotlinkHandle}</code>.
        Use it as a bookmark, a shared link, or a platform integration.
      </p>
      <p class="altair-text" data-altair-role="body-minor" data-altair-tone="tertiary">
        <em>Note: Renaming the preset changes the handle and breaks existing hotlinks.</em>
      </p>
      <label class="choice-checkbox-container">
        <input
          type="checkbox"
          class="choice-input-sr-only"
          checked={hotlinkAutoSubmit}
          onchange={(e) => { hotlinkAutoSubmit = (e.target as HTMLInputElement).checked; }} />
        <span class="choice-checkbox-indicator" aria-hidden="true">
          <span class="choice-checkbox-check">{@render checkIcon()}</span>
        </span>
        <span class="choice-text">
          <span class="choice-label">Auto-submit the request</span>
          <span class="choice-description">
            When this hotlink is opened, the permissions and message are filled in and the access request is submitted automatically. Leave unchecked to review the request before submitting it yourself.
          </span>
        </span>
      </label>
      {@render urlField(hotlinkBareUrl, 'URL')}
      <hr class="divider" />
      <p class="altair-text" data-altair-role="body-minor" data-altair-tone="secondary">
        <strong>Mantle</strong>: Use as a Mantle custom action by pasting the following URL into the custom action's URL field.
      </p>
      {@render urlField(hotlinkUrl, 'Mantle URL')}
    </div>
    <div class="altair-modal__footer">
      {@render button('Close', () => hotlinkDialog?.close(), { size: 'default' })}
    </div>
  </div>
</dialog>
</div>

<div
  class="altair-card"
  data-altair-component="Card"
  data-altair-tier="primary"
  data-altair-padding="compact"
  data-altair-radius="card"
  data-altair-border="default">
  <div class="altair-card__header" data-altair-part="header">
    <h2 class="altair-card__title" data-altair-part="title">Presets</h2>
    <div class="altair-card__action" data-altair-part="action">
      <div class="actions">
        {@render button(checkedPresets.size === 0 ? 'Delete all' : `Delete ${checkedPresets.size} selected`, handleDeleteMultiple, { variant: 'critical' })}
        {@render button(checkedPresets.size === 0 ? 'Export all' : `Export ${checkedPresets.size} selected`, () => exportPresets(checkedPresets.size === 0 ? presets : presets.filter((p) => checkedPresets.has(p.id))))}
        {@render button('Import', handleImport)}
        {@render button('Save preset', handleSavePreset)}
      </div>
    </div>
  </div>

  <div class="altair-card__content" data-altair-part="content">
    <div class="altair-data-table" data-altair-component="DataTable">
      <div class="altair-data-table__scroller">
        <table class="altair-data-table__table">
          <thead>
            <tr>
              <th class="altair-data-table__select-cell">
                {#if presets.length > 0}
                  {@render checkmark(
                    checkedPresets.size === presets.length,
                    (e) => {
                      checkedPresets = (e.target as HTMLInputElement).checked ? new Set(presets.map((p) => p.id)) : new Set();
                    },
                    'Select all presets'
                  )}
                {/if}
              </th>
              <th class="altair-data-table__th altair-data-table__th--start">Name</th>
              <th class="altair-data-table__th altair-data-table__th--start">Handle</th>
              <th class="altair-data-table__th altair-data-table__th--end">Permissions</th>
              <th class="altair-data-table__th">Message</th>
              <th class="altair-data-table__th altair-data-table__th--end">Actions</th>
            </tr>
          </thead>
          <tbody>
            {#if presets.length === 0}
              <tr class="altair-data-table__row">
                <td colspan="6" class="altair-data-table__td">No permissions presets saved yet.</td>
              </tr>
            {:else}
              {#each presets as preset (preset.id)}
                <tr class="altair-data-table__row" class:altair-data-table__row--selected={checkedPresets.has(preset.id)}>
                  <td class="altair-data-table__select-cell">
                    {@render checkmark(
                      checkedPresets.has(preset.id),
                      (e) => {
                        const newChecked = new Set(checkedPresets);
                        if ((e.target as HTMLInputElement).checked) {
                          newChecked.add(preset.id);
                        } else {
                          newChecked.delete(preset.id);
                        }
                        checkedPresets = newChecked;
                      },
                      `Select ${preset.name}`
                    )}
                  </td>
                  <td class="altair-data-table__td altair-data-table__td--primary altair-data-table__td--nowrap">{preset.name}</td>
                  <td class="altair-data-table__td">
                    <code class="altair-text" data-altair-role="code" data-altair-tone="secondary">{preset.handle}</code>
                  </td>
                  <td class="altair-data-table__td altair-data-table__td--end">
                    {(Array.isArray(preset.permissions) ? preset.permissions : []).length}
                  </td>
                  <td class="altair-data-table__td">
                    {#if preset.customMessage}
                      <span class="message-yes" role="img" aria-label="Has message">&#10003;</span>
                    {:else}
                      <span class="message-no" role="img" aria-label="No message">&#10007;</span>
                    {/if}
                  </td>
                  <td class="altair-data-table__td altair-data-table__td--end">
                    <div class="actions row-actions">
                      {@render button('Apply', () => handleApplyPreset(preset), { icon: applyIcon })}
                      {@render button(`Edit ${preset.name}`, () => handleEditPreset(preset), { icon: editIcon, iconOnly: true })}
                      {@render button(`Delete ${preset.name}`, () => handleDeletePreset(preset.id), { variant: 'critical', icon: deleteIcon, iconOnly: true })}
                      {@render button('Hotlink', () => handleOpenHotlinkModal(preset))}
                    </div>
                  </td>
                </tr>
              {/each}
            {/if}
          </tbody>
        </table>
      </div>
    </div>

    <div class="credit">
      <CreditChip source="collaborator_access" variant="plain" />
    </div>
  </div>
</div>

<style>
  /* Same table treatment as the dashboard's Logs page: flush with the card
     edges and a tinted header row */
  .altair-data-table {
    width: auto;
    margin-inline: calc(-1 * var(--altair-card-padding));
    border-inline: 0;
    border-radius: 0;
  }

  .altair-data-table__scroller {
    border-radius: 0;
  }

  thead tr {
    background: var(--ui-surface-tertiary);
  }

  .actions {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: flex-end;
    gap: var(--ui-size-200);
  }

  .row-actions {
    flex-wrap: nowrap;
  }

  .credit {
    display: flex;
    justify-content: flex-end;
    color: var(--ui-text-tertiary);
    font: var(--ui-text-body-sm-font);
  }

  .message-yes {
    color: var(--ui-text-success);
  }

  .message-no {
    color: var(--ui-text-tertiary);
  }

  .choice-text {
    display: flex;
    flex-direction: column;
    gap: var(--ui-size-050);
  }

  .url-row {
    display: flex;
    align-items: center;
    gap: var(--ui-size-200);
  }

  .url-row .field {
    flex: 1;
    min-width: 0;
  }

  /* Stacks the copy and check icons so they cross-fade in place */
  .copy-icons {
    display: inline-grid;
    place-items: center;
    vertical-align: middle;
  }

  .copy-icons > * {
    grid-area: 1 / 1;
  }

  .divider {
    margin: 0;
    border: 0;
    border-top: var(--ui-border-width-025) solid var(--ui-border);
  }
</style>
