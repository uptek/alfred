<script lang="ts">
  import {
    buildHotlinkUrl, generatePresetId, getPresets, savePreset,
    deletePreset, exportPresets, importPresets, normalizePresetHandle
  } from './utils';
  import { Toast } from '@/utils/toast';
  import type { PageAdapter, PermissionPreset } from './types';

  const AUTO_APPLY_PRESET_PARAM = 'alfred_preset';

  interface Props {
    adapter: PageAdapter;
  }
  let { adapter }: Props = $props();

  let presets = $state.raw<PermissionPreset[]>([]);
  let selectedPreset = $state.raw<PermissionPreset | null>(null);
  let checkedPresets = $state.raw<Set<string>>(new Set());
  let hotlinkUrl = $state('');
  let hotlinkHandle = $state('');
  let autoApplyAttempted = $state(false);
  let showHotlinkModal = $state(false);

  // Load saved presets from extension storage on mount.
  $effect(() => {
    getPresets().then((p) => { presets = p; });
  });

  // Auto-apply a preset when the URL contains ?alfred_preset=<handle|name>.
  // Matches by normalized handle first, then falls back to case-insensitive name.
  // Runs once per page load — guarded by autoApplyAttempted.
  $effect(() => {
    if (autoApplyAttempted || presets.length === 0) return;

    const presetNameFromUrl = new URLSearchParams(window.location.search).get(AUTO_APPLY_PRESET_PARAM);
    if (!presetNameFromUrl?.trim()) {
      autoApplyAttempted = true;
      return;
    }

    autoApplyAttempted = true;

    const matchingByHandle = presets.filter((p) => p.handle === normalizePresetHandle(presetNameFromUrl));
    if (matchingByHandle.length === 1) {
      void handleApplyPreset(matchingByHandle[0], 'url_param');
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
    void handleApplyPreset(matchingPresets[0], 'url_param');
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
   */
  async function handleApplyPreset(presetToApply?: PermissionPreset, source: 'manual' | 'url_param' = 'manual') {
    const preset = presetToApply ?? selectedPreset;
    if (!preset) {
      alert('Please select a preset to apply.');
      return;
    }

    adapter.uncheckAll();

    const permissions = preset.permissions ?? [];
    setTimeout(() => {
      permissions.forEach((permission, index) => {
        setTimeout(() => {
          adapter.checkPermission(permission.id);
        }, index * 50);
      });
      setTimeout(() => {
        adapter.expandCheckedSections();
      }, permissions.length * 50 + 50);
    }, 100);

    if (preset.customMessage !== '') {
      adapter.setMessage(preset.customMessage ?? '');
    }

    window.setTimeout(() => {
      window.scrollTo({ top: Math.max(document.body.scrollHeight, document.documentElement.scrollHeight), behavior: 'smooth' });
    }, 100 + permissions.length * 50 + 100);

    const updatedPreset = await savePreset({ ...preset, lastUsed: Date.now() });
    presets = presets.map((p) => (p.id === updatedPreset.id ? updatedPreset : p));
    if (presetToApply) selectedPreset = updatedPreset;

    browser.runtime.sendMessage({
      type: 'track_action', action: 'apply_preset',
      metadata: { permissions_count: (preset.permissions ?? []).length, has_custom_message: !!preset.customMessage, source }
    });

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
    hotlinkUrl = buildHotlinkUrl(preset.handle, adapter.type);
    hotlinkHandle = preset.handle;
    showHotlinkModal = true;
  }

  /** Copies the current hotlink URL to the clipboard. */
  async function handleCopyHotlinkUrl() {
    if (!hotlinkUrl) return;
    try {
      await navigator.clipboard.writeText(hotlinkUrl);
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
      browser.runtime.sendMessage({
        type: 'track_action', action: 'save_preset',
        metadata: { permissions_count: permissions.length, has_custom_message: !!customMessage }
      });
      Toast.success(`Saved preset "${savedPreset.name}"`);
    } catch (error) {
      console.error('Failed to save preset:', error);
      Toast.error('Failed to save preset');
    }
  }
</script>

{#if showHotlinkModal}
<div
  style="position:fixed;inset:0;z-index:9999;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,0.6);"
  onclick={(e) => { if (e.target === e.currentTarget) showHotlinkModal = false; }}
  onkeydown={(e) => { if (e.key === 'Escape') showHotlinkModal = false; }}
  role="dialog"
  tabindex="-1"
>
  <div class="card p-6" style="max-width:500px;width:100%;">
    <h2 class="text-heading-md font-bold mb-4">Preset hotlink</h2>
    <p class="text-body-sm mb-3">
      Auto-apply this preset using the URL parameter
      <code class="font-mono text-caption">alfred_preset={hotlinkHandle}</code>.
      Use it as a bookmark, a shared link, or a platform integration.
    </p>
    <p class="text-body-sm text-text-subdued mb-4">
      <em>Note: Renaming the preset changes the handle and breaks existing hotlinks.</em>
    </p>
    <div style="border-top:1px solid var(--color-border-default,#333);margin-bottom:16px;"></div>
    <p class="text-body-sm mb-3">
      <strong>Mantle</strong> — Use as a Mantle custom action by pasting the following URL into the custom action's URL field.
    </p>
    <div class="flex gap-2 items-center">
      <input
        type="text"
        class="w-full h-8 rounded bg-background-surface-default px-3 text-body-sm"
        style="border:1px solid #59767A;flex:1;"
        value={hotlinkUrl}
        readonly
      >
      <button class="button button-variant-primary button-size-medium" style="height:32px;" onclick={handleCopyHotlinkUrl} aria-label="Copy URL">
        <svg viewBox="0 0 20 20" width="16" height="16" fill="currentColor"><path fill-rule="evenodd" d="M6.515 4.75a2 2 0 0 1 1.985-1.75h3a2 2 0 0 1 1.985 1.75h.265a2.25 2.25 0 0 1 2.25 2.25v7.75a2.25 2.25 0 0 1-2.25 2.25h-7.5a2.25 2.25 0 0 1-2.25-2.25v-7.75a2.25 2.25 0 0 1 2.25-2.25h.265Zm1.985-.25h3a.5.5 0 0 1 .5.5v1a.5.5 0 0 1-.5.5h-3a.5.5 0 0 1-.5-.5v-1a.5.5 0 0 1 .5-.5Zm-1.987 1.73.002.02h-.265a.75.75 0 0 0-.75.75v7.75c0 .414.336.75.75.75h7.5a.75.75 0 0 0 .75-.75v-7.75a.75.75 0 0 0-.75-.75h-.265a2 2 0 0 1-1.985 1.75h-3a2 2 0 0 1-1.987-1.77Z"></path></svg>
      </button>
    </div>
    <div class="flex justify-end mt-4">
      <button class="button button-variant-primary button-size-medium" onclick={() => showHotlinkModal = false}>
        Close
      </button>
    </div>
  </div>
</div>
{/if}

<div class="card p-4 w-full max-w-[768px] mb-4">
  <div class="block text-heading-xs mb-2">
    <strong>Presets</strong>
  </div>

  <div class="flex justify-between items-center mb-3">
    <div class="flex gap-2">
      <button class="button button-variant-primary button-size-medium" style="color:#e26e6e;" onclick={handleDeleteMultiple}>
        {checkedPresets.size === 0 ? 'Delete all' : `Delete ${checkedPresets.size} selected`}
      </button>
      <button class="button button-variant-primary button-size-medium" onclick={() => exportPresets(checkedPresets.size === 0 ? presets : presets.filter((p) => checkedPresets.has(p.id)))}>
        {checkedPresets.size === 0 ? 'Export all' : `Export ${checkedPresets.size} selected`}
      </button>
      <button class="button button-variant-primary button-size-medium" onclick={handleImport}>
        Import
      </button>
    </div>
    <button class="button button-variant-primary button-size-medium" onclick={handleSavePreset}>
      Save preset
    </button>
  </div>

  <div class="rounded-md border border-border-default overflow-hidden bg-background-surface-default">
    <table style="width:100%;border-collapse:collapse;">
      <thead>
        <tr style="border-bottom:1px solid var(--color-border-default,#333);">
          <th style="padding:8px 12px;text-align:left;width:40px;">
            {#if presets.length > 0}
              <span class="relative inline-flex h-4 w-4 shrink-0 items-center justify-center">
                <input
                  type="checkbox"
                  class="checkbox peer absolute inset-0 m-0"
                  checked={presets.length > 0 && checkedPresets.size === presets.length}
                  onchange={(e) => {
                    if ((e.target as HTMLInputElement).checked) {
                      checkedPresets = new Set(presets.map((p) => p.id));
                    } else {
                      checkedPresets = new Set();
                    }
                  }}
                />
                <svg viewBox="0 0 20 20" width="16" height="16" class="icon success hidden peer-checked:block pointer-events-none absolute inset-0">
                  <path fill-rule="evenodd" d="M14.03 7.22a.75.75 0 0 1 0 1.06l-4.5 4.5a.75.75 0 0 1-1.06 0l-2.25-2.25a.75.75 0 1 1 1.06-1.06l1.72 1.72 3.97-3.97a.75.75 0 0 1 1.06 0Z"></path>
                </svg>
              </span>
            {/if}
          </th>
          <th class="text-heading-xs" style="padding:8px 12px;text-align:left;">Name</th>
          <th class="text-heading-xs" style="padding:8px 12px;text-align:left;">Handle</th>
          <th class="text-heading-xs" style="padding:8px 12px;text-align:left;">Permissions</th>
          <th class="text-heading-xs" style="padding:8px 12px;text-align:left;">Message</th>
          <th class="text-heading-xs" style="padding:8px 12px;text-align:left;">Actions</th>
        </tr>
      </thead>
      <tbody>
        {#if presets.length === 0}
          <tr>
            <td colspan="6" class="text-body-sm text-text-subdued" style="padding:12px;">
              No permissions presets saved yet.
            </td>
          </tr>
        {:else}
          {#each presets as preset (preset.id)}
            <tr style="border-bottom:1px solid var(--color-border-default,#333);">
              <td style="padding:8px 12px;">
                <span class="relative inline-flex h-4 w-4 shrink-0 items-center justify-center">
                  <input
                    type="checkbox"
                    class="checkbox peer absolute inset-0 m-0"
                    checked={checkedPresets.has(preset.id)}
                    onchange={(e) => {
                      const newChecked = new Set(checkedPresets);
                      if ((e.target as HTMLInputElement).checked) {
                        newChecked.add(preset.id);
                      } else {
                        newChecked.delete(preset.id);
                      }
                      checkedPresets = newChecked;
                    }}
                  />
                  <svg viewBox="0 0 20 20" width="16" height="16" class="icon success hidden peer-checked:block pointer-events-none absolute inset-0">
                    <path fill-rule="evenodd" d="M14.03 7.22a.75.75 0 0 1 0 1.06l-4.5 4.5a.75.75 0 0 1-1.06 0l-2.25-2.25a.75.75 0 1 1 1.06-1.06l1.72 1.72 3.97-3.97a.75.75 0 0 1 1.06 0Z"></path>
                  </svg>
                </span>
              </td>
              <td class="text-body-sm" style="padding:8px 12px;">{preset.name}</td>
              <td style="padding:8px 12px;">
                <code class="font-mono text-caption text-text-subdued">{preset.handle}</code>
              </td>
              <td class="text-body-sm" style="padding:8px 12px;">
                {(Array.isArray(preset.permissions) ? preset.permissions : []).length}
              </td>
              <td style="padding:8px 12px;text-align:center;">
                {#if preset.customMessage}
                  <span style="color:#43B38E;">&#10003;</span>
                {:else}
                  <span class="text-text-subdued">&#10007;</span>
                {/if}
              </td>
              <td style="padding:8px 12px;">
                <div class="flex gap-2 items-center flex-wrap">
                  <button class="button button-variant-primary button-size-medium" onclick={() => handleApplyPreset(preset)}>
                    <svg viewBox="0 0 16 16" width="14" height="14" fill="currentColor"><path fill-rule="evenodd" d="M8 15a7 7 0 1 0 0-14 7 7 0 0 0 0 14m3.079-8.523a.75.75 0 1 0-1.158-.954l-2.858 3.47-.939-1.409a.75.75 0 0 0-1.248.832l1.21 1.815c.042.063.097.146.153.215.062.078.18.21.371.297a1 1 0 0 0 .728.037 1 1 0 0 0 .4-.258c.062-.063.125-.14.173-.198z"></path></svg>
                    Apply
                  </button>
                  <button class="button button-variant-primary button-size-medium" style="height:32px;" onclick={() => handleEditPreset(preset)} aria-label="Edit preset">
                    <svg viewBox="0 0 16 16" width="14" height="14" fill="currentColor"><path fill-rule="evenodd" d="M13.655 2.344a2.694 2.694 0 0 0-3.81 0l-.599.599-.009-.009-1.06 1.06.009.01-5.88 5.88a2.75 2.75 0 0 0-.806 1.944v1.922a.75.75 0 0 0 .75.75h1.922a2.75 2.75 0 0 0 1.944-.806l7.54-7.54a2.694 2.694 0 0 0 0-3.81Zm-4.409 2.72-5.88 5.88a1.25 1.25 0 0 0-.366.884v1.172h1.172c.331 0 .65-.132.883-.366l5.88-5.88zm2.75.629.599-.599a1.196 1.196 0 0 0-1.69-1.69l-.598.6z"></path></svg>
                  </button>
                  <button class="button button-variant-primary button-size-medium" style="color:#e26e6e;height:32px;" onclick={() => handleDeletePreset(preset.id)} aria-label="Delete preset">
                    <svg viewBox="0 0 16 16" width="14" height="14" fill="currentColor"><path d="M9.5 6.25a.75.75 0 0 1 .75.75v4.25a.75.75 0 0 1-1.5 0v-4.25a.75.75 0 0 1 .75-.75"></path><path d="M7.25 7a.75.75 0 0 0-1.5 0v4.25a.75.75 0 0 0 1.5 0z"></path><path fill-rule="evenodd" d="M5.25 3.25a2.75 2.75 0 1 1 5.5 0h3a.75.75 0 0 1 0 1.5h-.75v5.45c0 1.68 0 2.52-.327 3.162a3 3 0 0 1-1.311 1.311c-.642.327-1.482.327-3.162.327h-.4c-1.68 0-2.52 0-3.162-.327a3 3 0 0 1-1.311-1.311c-.327-.642-.327-1.482-.327-3.162v-5.45h-.75a.75.75 0 0 1 0-1.5zm1.5 0a1.25 1.25 0 0 1 2.5 0zm-2.25 1.5h7v5.45c0 .865-.001 1.423-.036 1.848-.033.408-.09.559-.128.633a1.5 1.5 0 0 1-.655.655c-.074.038-.225.095-.633.128-.425.035-.983.036-1.848.036h-.4c-.865 0-1.423-.001-1.848-.036-.408-.033-.559-.09-.633-.128a1.5 1.5 0 0 1-.656-.655c-.037-.074-.094-.225-.127-.633-.035-.425-.036-.983-.036-1.848z"></path></svg>
                  </button>
                  <button class="button button-variant-primary button-size-medium" onclick={() => handleOpenHotlinkModal(preset)}>
                    Hotlink
                  </button>
                </div>
              </td>
            </tr>
          {/each}
        {/if}
      </tbody>
    </table>
  </div>
</div>
