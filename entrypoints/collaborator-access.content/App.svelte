<script lang="ts">
  import {
    buildHotlinkUrl, generatePresetId, getPresets, savePreset,
    deletePreset, exportPresets, importPresets, normalizePresetHandle
  } from './utils';
  import { Toast } from '@/utils/toast';
  import type { Permission, PermissionPreset } from './types';

  const AUTO_APPLY_PRESET_PARAM = 'alfred_preset';
  const HOTLINK_MODAL_ID = 'alfred-hotlink-modal';

  let presets = $state.raw<PermissionPreset[]>([]);
  let selectedPreset = $state.raw<PermissionPreset | null>(null);
  let checkedPresets = $state.raw<Set<string>>(new Set());
  let hotlinkUrl = $state('');
  let hotlinkHandle = $state('');
  let autoApplyAttempted = $state(false);

  // Load presets on mount
  $effect(() => {
    getPresets().then((p) => { presets = p; });
  });

  // Auto-apply preset from URL param
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

  // Listen for save-preset custom event
  $effect(() => {
    const handler = () => handleSavePreset();
    document.addEventListener('alfred:save-preset', handler);
    return () => document.removeEventListener('alfred:save-preset', handler);
  });

  async function handleApplyPreset(presetToApply?: PermissionPreset, source: 'manual' | 'url_param' = 'manual') {
    const preset = presetToApply ?? selectedPreset;
    if (!preset) {
      alert('Please select a preset to apply.');
      return;
    }

    const checkedCheckboxes = document.querySelectorAll(
      '#AppFrameMain form .Polaris-FormLayout__Item:nth-child(2) input[type="checkbox"]:checked'
    );
    checkedCheckboxes.forEach((checkbox) => { (checkbox as HTMLInputElement).click(); });

    setTimeout(() => {
      (preset.permissions ?? []).forEach((permission, index) => {
        setTimeout(() => {
          const checkbox = document.getElementById(permission.id) as HTMLInputElement;
          if (checkbox && !checkbox.checked) checkbox.click();
        }, index * 50);
      });
    }, 100);

    if (preset.customMessage !== '') {
      const messageTextarea = document.querySelector('#AppFrameMain form .Polaris-FormLayout__Item:nth-child(3) textarea');
      if (messageTextarea) {
        (messageTextarea as HTMLTextAreaElement).value = preset.customMessage ?? '';
        messageTextarea.dispatchEvent(new Event('input', { bubbles: true }));
        messageTextarea.dispatchEvent(new Event('change', { bubbles: true }));
      }
    }

    window.setTimeout(() => {
      window.scrollTo({ top: Math.max(document.body.scrollHeight, document.documentElement.scrollHeight), behavior: 'smooth' });
    }, 150);

    const updatedPreset = await savePreset({ ...preset, lastUsed: Date.now() });
    presets = presets.map((p) => (p.id === updatedPreset.id ? updatedPreset : p));
    if (presetToApply) selectedPreset = updatedPreset;

    browser.runtime.sendMessage({
      type: 'track_action', action: 'apply_preset',
      metadata: { permissions_count: (preset.permissions ?? []).length, has_custom_message: !!preset.customMessage, source }
    });

    Toast.success(`Applied preset "${updatedPreset.name}"`);
  }

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

  function handleOpenHotlinkModal(preset: PermissionPreset) {
    hotlinkUrl = buildHotlinkUrl(preset.handle);
    hotlinkHandle = preset.handle;
  }

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

  async function handleSavePreset() {
    const checkedCheckboxes = document.querySelectorAll(
      '#AppFrameMain form .Polaris-FormLayout__Item:nth-child(2) input[type="checkbox"]:checked'
    );
    if (checkedCheckboxes.length === 0) {
      alert('Please select at least one permission to save as a preset.');
      return;
    }

    const presetName = prompt('Enter a name for this preset:');
    if (!presetName?.trim()) return;

    const permissions: Permission[] = [];
    checkedCheckboxes.forEach((checkbox) => {
      const label = checkbox.closest('label')?.querySelector('p')?.textContent ?? '';
      permissions.push({ id: checkbox.id, label: label.trim() });
    });

    const messageTextarea = document.querySelector<HTMLTextAreaElement>(
      '#AppFrameMain form .Polaris-FormLayout__Item:nth-child(3) textarea'
    );
    const customMessage = messageTextarea?.value ?? '';

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

<s-modal id={HOTLINK_MODAL_ID} heading="Preset hotlink" accessibilityLabel="Preset Hotlink Modal">
  <s-stack gap="base">
    <s-paragraph>
      Auto-apply this preset using the URL parameter <em><code>alfred_preset={hotlinkHandle}</code></em>. Use it as a bookmark, a shared link, or a platform integration.
    </s-paragraph>
    <s-paragraph>
      <em>Note: Renaming the preset changes the handle and breaks existing hotlinks.</em>
    </s-paragraph>
    <s-divider></s-divider>
    <s-paragraph>
      <strong>Mantle</strong> — Use as a Mantle custom action by pasting the following URL into the custom action's URL field.
    </s-paragraph>
    <s-stack direction="inline" gap="small-200" alignItems="center">
      <div style="flex: 1 1 auto">
        <s-text-field value={hotlinkUrl} readOnly></s-text-field>
      </div>
      <s-button variant="secondary" icon="clipboard" accessibilityLabel="Copy URL" onclick={handleCopyHotlinkUrl}>
        Copy
      </s-button>
    </s-stack>
  </s-stack>
  <s-button slot="primary-action" variant="primary" commandFor={HOTLINK_MODAL_ID} command="--hide">
    Close
  </s-button>
</s-modal>
<s-divider></s-divider>
<s-box padding="large">
  <s-stack gap="base">
    <s-stack direction="inline" justifyContent="space-between">
      <s-stack direction="inline" gap="small-200">
        <s-button variant="secondary" tone="critical" icon="delete" onclick={handleDeleteMultiple}>
          {checkedPresets.size === 0 ? 'Delete all' : `Delete ${checkedPresets.size} selected`}
        </s-button>
        <s-button variant="secondary" icon="export" onclick={() => exportPresets(checkedPresets.size === 0 ? presets : presets.filter((p) => checkedPresets.has(p.id)))}>
          {checkedPresets.size === 0 ? 'Export all' : `Export ${checkedPresets.size} selected`}
        </s-button>
        <s-button variant="secondary" icon="import" onclick={handleImport}>
          Import
        </s-button>
      </s-stack>
      <s-button variant="secondary" onclick={handleSavePreset}>
        Save preset
      </s-button>
    </s-stack>
    <s-section padding="none">
      <s-table>
        <s-table-header-row>
          <s-table-header>
            {#if presets.length > 0}
              <input
                type="checkbox"
                checked={presets.length > 0 && checkedPresets.size === presets.length}
                onchange={(e) => {
                  if ((e.target as HTMLInputElement).checked) {
                    checkedPresets = new Set(presets.map((p) => p.id));
                  } else {
                    checkedPresets = new Set();
                  }
                }}
              />
            {/if}
          </s-table-header>
          <s-table-header listSlot="primary">Name</s-table-header>
          <s-table-header>Handle</s-table-header>
          <s-table-header>Permissions</s-table-header>
          <s-table-header>Message</s-table-header>
          <s-table-header>Actions</s-table-header>
        </s-table-header-row>
        <s-table-body>
          {#if presets.length === 0}
            <s-table-row>
              <s-table-cell></s-table-cell>
              <s-table-cell>No permissions presets saved yet.</s-table-cell>
              <s-table-cell></s-table-cell>
              <s-table-cell></s-table-cell>
              <s-table-cell></s-table-cell>
              <s-table-cell></s-table-cell>
            </s-table-row>
          {:else}
            {#each presets as preset (preset.id)}
              <s-table-row>
                <s-table-cell>
                  <input
                    type="checkbox"
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
                </s-table-cell>
                <s-table-cell>{preset.name}</s-table-cell>
                <s-table-cell>
                  <code style="font-size: 12px; color: rgb(97, 107, 117)">{preset.handle}</code>
                </s-table-cell>
                <s-table-cell>
                  {(Array.isArray(preset.permissions) ? preset.permissions : []).slice(0, 2).map((p) => p.label.length > 15 ? p.label.slice(0, 15) + '...' : p.label).join(', ')}
                  {#if Array.isArray(preset.permissions) && preset.permissions.length > 3}, +{preset.permissions.length - 3} more{/if}
                </s-table-cell>
                <s-table-cell>
                  {#if preset.customMessage}
                    <s-icon type="check-circle-filled"></s-icon>
                  {:else}
                    <s-icon type="x-circle"></s-icon>
                  {/if}
                </s-table-cell>
                <s-table-cell>
                  <s-stack direction="inline" gap="small-200">
                    <s-button icon="check-circle-filled" accessibilityLabel="Apply preset" variant="primary" onclick={() => handleApplyPreset(preset)}>
                      Apply
                    </s-button>
                    <s-button icon="edit" accessibilityLabel="Edit preset" onclick={() => handleEditPreset(preset)}></s-button>
                    <s-button icon="delete" tone="critical" accessibilityLabel="Delete preset" onclick={() => handleDeletePreset(preset.id)}></s-button>
                    <s-divider direction="block"></s-divider>
                    <s-button accessibilityLabel="Hotlink" icon="link" commandFor={HOTLINK_MODAL_ID} command="--show" onclick={() => handleOpenHotlinkModal(preset)}>
                      Hotlink
                    </s-button>
                  </s-stack>
                </s-table-cell>
              </s-table-row>
            {/each}
          {/if}
        </s-table-body>
      </s-table>
    </s-section>
  </s-stack>
</s-box>
