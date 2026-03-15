import { useEffect, useState, useRef } from 'preact/hooks';
import {
  buildHotlinkUrl,
  generatePresetId,
  getPresets,
  savePreset,
  deletePreset,
  exportPresets,
  importPresets,
  normalizePresetHandle
} from './utils';
import { Toast } from '@/utils/toast';
import type { Permission, PermissionPreset } from './types';

const AUTO_APPLY_PRESET_PARAM = 'alfred_preset';
const HOTLINK_MODAL_ID = 'alfred-hotlink-modal';

export default function App() {
  const [presets, setPresets] = useState<PermissionPreset[]>([]);
  const [selectedPreset, setSelectedPreset] = useState<PermissionPreset | null>(null);
  const [checkedPresets, setCheckedPresets] = useState<Set<string>>(new Set());
  const [hotlinkUrl, setHotlinkUrl] = useState<string>('');
  const [hotlinkHandle, setHotlinkHandle] = useState<string>('');
  const selectRef = useRef<HTMLSelectElement | null>(null);
  const autoApplyAttemptedRef = useRef(false);

  useEffect(() => {
    // Load presets from storage on component mount
    getPresets().then((presets) => {
      setPresets(presets);
    });
  }, []);

  useEffect(() => {
    // Add event listener to handle the custom select
    const selectElement = selectRef.current;
    if (!selectElement) return;

    let cleanup: (() => void) | undefined;

    // Wait a bit for the shadow DOM to be ready
    const timeoutId = setTimeout(() => {
      // Try to access the shadow root
      const shadowRoot = selectElement.shadowRoot;

      if (shadowRoot) {
        // Look for the actual select element inside the shadow DOM
        const internalSelect = shadowRoot.querySelector('select');

        if (internalSelect) {
          const handleChange = (event: Event) => {
            const value = (event.target as HTMLSelectElement).value;

            if (value !== '0') {
              const preset = presets.find((preset) => preset.id === value);
              setSelectedPreset(preset ?? null);
            } else {
              setSelectedPreset(null);
            }
          };

          internalSelect.addEventListener('change', handleChange);

          cleanup = () => {
            internalSelect.removeEventListener('change', handleChange);
          };
        }
      }
    }, 100);

    return () => {
      clearTimeout(timeoutId);
      if (cleanup) cleanup();
    };
  }, [presets]);

  const handleApplyPreset = async (presetToApply?: PermissionPreset, source: 'manual' | 'url_param' = 'manual') => {
    const preset = presetToApply ?? selectedPreset;

    if (!preset) {
      alert('Please select a preset to apply.');
      return;
    }

    // First uncheck all checkboxes by clicking checked ones
    const checkedCheckboxes = document.querySelectorAll(
      '#AppFrameMain form .Polaris-FormLayout__Item:nth-child(2) input[type="checkbox"]:checked'
    );
    checkedCheckboxes.forEach((checkbox) => {
      (checkbox as HTMLInputElement).click();
    });

    // Then click to check only the ones in the preset with delay between each
    setTimeout(() => {
      preset.permissions.forEach((permission, index) => {
        setTimeout(() => {
          const checkbox = document.getElementById(permission.id) as HTMLInputElement;
          if (checkbox && !checkbox.checked) {
            checkbox.click();
          }
        }, index * 50); // 50ms delay between each click
      });
    }, 100);

    // Apply the custom message if it exists
    if (preset.customMessage !== '') {
      const messageTextarea = document.querySelector(
        '#AppFrameMain form .Polaris-FormLayout__Item:nth-child(3) textarea'
      );
      if (messageTextarea) {
        (messageTextarea as HTMLTextAreaElement).value = preset.customMessage ?? '';
        // Trigger input event to ensure React/framework detects the change
        messageTextarea.dispatchEvent(new Event('input', { bubbles: true }));
        messageTextarea.dispatchEvent(new Event('change', { bubbles: true }));
      }
    }

    window.setTimeout(() => {
      window.scrollTo({
        top: Math.max(document.body.scrollHeight, document.documentElement.scrollHeight),
        behavior: 'smooth'
      });
    }, 150);

    // Update the lastUsed timestamp
    const updatedPreset = await savePreset({ ...preset, lastUsed: Date.now() });

    // Update local state
    setPresets((prevPresets) => prevPresets.map((p) => (p.id === updatedPreset.id ? updatedPreset : p)));

    // Update selected preset if applying from table
    if (presetToApply) {
      setSelectedPreset(updatedPreset);
    }

    // Track the apply preset action
    browser.runtime.sendMessage({
      type: 'track_action',
      action: 'apply_preset',
      metadata: {
        permissions_count: preset.permissions.length,
        has_custom_message: !!preset.customMessage,
        source
      }
    });

    Toast.success(`Applied preset "${updatedPreset.name}"`);
  };

  useEffect(() => {
    if (autoApplyAttemptedRef.current || presets.length === 0) {
      return;
    }

    const presetNameFromUrl = new URLSearchParams(window.location.search).get(AUTO_APPLY_PRESET_PARAM);
    if (!presetNameFromUrl?.trim()) {
      autoApplyAttemptedRef.current = true;
      return;
    }

    autoApplyAttemptedRef.current = true;

    const matchingByHandle = presets.filter((preset) => preset.handle === normalizePresetHandle(presetNameFromUrl));

    if (matchingByHandle.length === 1) {
      void handleApplyPreset(matchingByHandle[0], 'url_param');
      return;
    }

    const matchingPresets = presets.filter(
      (preset) => preset.name.trim().toLowerCase() === presetNameFromUrl.trim().toLowerCase()
    );

    if (matchingPresets.length === 0) {
      Toast.error(`Preset "${presetNameFromUrl}" not found`);
      return;
    }

    if (matchingPresets.length > 1) {
      Toast.error(`Multiple presets named "${presetNameFromUrl}" found`);
      return;
    }

    void handleApplyPreset(matchingPresets[0], 'url_param');
  }, [presets]);

  const handleEditPreset = async (preset: PermissionPreset) => {
    const newName = prompt(
      'Enter new name for the preset.\n\nNote: Renaming changes the handle and breaks existing hotlinks.',
      preset.name
    );

    if (!newName || newName.trim() === preset.name) {
      return;
    }

    try {
      const updatedPreset = await savePreset({
        ...preset,
        name: newName.trim(),
        handle: newName.trim()
      });

      // Update local state
      setPresets(presets.map((p) => (p.id === preset.id ? updatedPreset : p)));
      // Update selected preset if it was edited
      if (selectedPreset?.id === preset.id) {
        setSelectedPreset(updatedPreset);
      }

      Toast.success(`Updated preset "${updatedPreset.name}".`);
    } catch (error) {
      console.error('Failed to update preset:', error);
      Toast.error('Failed to update preset');
    }
  };

  const handleDeletePreset = async (presetId: string) => {
    if (confirm('Are you sure you want to delete this preset?')) {
      try {
        await deletePreset(presetId);
        // Remove from local state
        setPresets(presets.filter((p) => p.id !== presetId));
        // Clear selection if the deleted preset was selected
        if (selectedPreset?.id === presetId) {
          setSelectedPreset(null);
        }

        Toast.success('Preset deleted');
      } catch (error) {
        console.error('Failed to delete preset:', error);
        Toast.error('Failed to delete preset');
      }
    }
  };

  const handleOpenHotlinkModal = (preset: PermissionPreset) => {
    setHotlinkUrl(buildHotlinkUrl(preset.handle));
    setHotlinkHandle(preset.handle);
  };

  const handleCopyHotlinkUrl = async () => {
    if (!hotlinkUrl) {
      return;
    }

    try {
      await navigator.clipboard.writeText(hotlinkUrl);
      Toast.success('URL copied');
    } catch (error) {
      console.error('Failed to copy hotlink URL:', error);
      Toast.error('Failed to copy URL');
    }
  };

  const handleImport = async () => {
    try {
      const count = await importPresets();

      if (count === null) {
        // User cancelled
        return;
      }

      // Reload presets to show the imported ones
      const updatedPresets = await getPresets();
      setPresets(updatedPresets);

      // Clear checked presets since IDs have changed
      setCheckedPresets(new Set());

      Toast.success(`Imported ${count} preset${count !== 1 ? 's' : ''}`);
    } catch (error) {
      console.error('Import failed:', error);
      Toast.error('Failed to import presets');
    }
  };

  const handleDeleteMultiple = async () => {
    const presetsToDelete = checkedPresets.size === 0 ? presets.map((p) => p.id) : Array.from(checkedPresets);
    if (
      confirm(
        `Are you sure you want to delete ${presetsToDelete.length} preset${presetsToDelete.length !== 1 ? 's' : ''}?`
      )
    ) {
      for (const id of presetsToDelete) {
        await deletePreset(id);
      }

      setPresets(presets.filter((p) => !presetsToDelete.includes(p.id)));
      setCheckedPresets(new Set());

      if (selectedPreset && presetsToDelete.includes(selectedPreset.id)) {
        setSelectedPreset(null);
      }

      Toast.success(`Deleted ${presetsToDelete.length} preset${presetsToDelete.length !== 1 ? 's' : ''}`);
    }
  };

  useEffect(() => {
    const handler = () => handleSavePreset();
    document.addEventListener('alfred:save-preset', handler);
    return () => document.removeEventListener('alfred:save-preset', handler);
  }, []);

  const handleSavePreset = async () => {
    const checkedCheckboxes = document.querySelectorAll(
      '#AppFrameMain form .Polaris-FormLayout__Item:nth-child(2) input[type="checkbox"]:checked'
    );

    if (checkedCheckboxes.length === 0) {
      alert('Please select at least one permission to save as a preset.');
      return;
    }

    const presetName = prompt('Enter a name for this preset:');

    if (!presetName?.trim()) {
      return;
    }

    const permissions: Permission[] = [];

    // Build permissions array
    checkedCheckboxes.forEach((checkbox) => {
      const label = checkbox.closest('label')?.querySelector('p')?.textContent ?? '';
      permissions.push({
        id: checkbox.id,
        label: label.trim()
      });
    });

    // Get the custom message from the textarea
    const messageTextarea = document.querySelector<HTMLTextAreaElement>(
      '#AppFrameMain form .Polaris-FormLayout__Item:nth-child(3) textarea'
    );
    const customMessage = messageTextarea?.value ?? '';

    const newPreset: PermissionPreset = {
      id: generatePresetId(),
      name: presetName.trim(),
      handle: presetName.trim(),
      permissions,
      customMessage,
      createdAt: Date.now()
    };

    try {
      const savedPreset = await savePreset(newPreset);
      // Add the new preset to the local state
      setPresets((currentPresets) => [...currentPresets, savedPreset]);

      // Track the save preset action
      browser.runtime.sendMessage({
        type: 'track_action',
        action: 'save_preset',
        metadata: {
          permissions_count: permissions.length,
          has_custom_message: !!customMessage
        }
      });

      Toast.success(`Saved preset "${savedPreset.name}"`);
    } catch (error) {
      console.error('Failed to save preset:', error);
      Toast.error('Failed to save preset');
    }
  };

  return (
    <>
      <s-modal id={HOTLINK_MODAL_ID} heading="Preset hotlink" accessibilityLabel="Preset Hotlink Modal">
        <s-stack gap="base">
          <s-paragraph>
            Auto-apply this preset using the URL parameter{' '}
            <em>
              <code>alfred_preset={hotlinkHandle}</code>
            </em>{' '}
            . Use it as a bookmark, a shared link, or a platform integration.
          </s-paragraph>
          <s-paragraph>
            <em>Note: Renaming the preset changes the handle and breaks existing hotlinks.</em>
          </s-paragraph>
          <s-divider></s-divider>
          <s-paragraph>
            <strong>Mantle</strong> — Use as a Mantle custom action by pasting the following URL into the custom
            action's URL field.
          </s-paragraph>
          <s-stack direction="inline" gap="small-200" alignItems="center">
            <div style={{ flex: '1 1 auto' }}>
              <s-text-field value={hotlinkUrl} readOnly />
            </div>
            <s-button variant="secondary" icon="clipboard" accessibilityLabel="Copy URL" onClick={handleCopyHotlinkUrl}>
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
              <s-button variant="secondary" tone="critical" icon="delete" onClick={handleDeleteMultiple}>
                {checkedPresets.size === 0 ? 'Delete all' : `Delete ${checkedPresets.size} selected`}
              </s-button>
              <s-button
                variant="secondary"
                icon="export"
                onClick={() =>
                  exportPresets(checkedPresets.size === 0 ? presets : presets.filter((p) => checkedPresets.has(p.id)))
                }>
                {checkedPresets.size === 0 ? 'Export all' : `Export ${checkedPresets.size} selected`}
              </s-button>
              <s-button variant="secondary" icon="import" onClick={handleImport}>
                Import
              </s-button>
            </s-stack>
            <s-button variant="secondary" onClick={handleSavePreset}>
              Save preset
            </s-button>
          </s-stack>
          <s-section padding="none">
            <s-table>
              <s-table-header-row>
                <s-table-header>
                  {presets.length > 0 && (
                    <input
                      type="checkbox"
                      checked={presets.length > 0 && checkedPresets.size === presets.length}
                      onChange={(e) => {
                        if ((e.target as HTMLInputElement).checked) {
                          setCheckedPresets(new Set(presets.map((p) => p.id)));
                        } else {
                          setCheckedPresets(new Set());
                        }
                      }}
                    />
                  )}
                </s-table-header>
                <s-table-header listSlot="primary">Name</s-table-header>
                <s-table-header>Handle</s-table-header>
                <s-table-header>Permissions</s-table-header>
                <s-table-header>Message</s-table-header>
                <s-table-header>Actions</s-table-header>
              </s-table-header-row>
              <s-table-body>
                {presets.length === 0 ? (
                  <s-table-row>
                    <s-table-cell></s-table-cell>
                    <s-table-cell>No permissions presets saved yet.</s-table-cell>
                    <s-table-cell></s-table-cell>
                    <s-table-cell></s-table-cell>
                    <s-table-cell></s-table-cell>
                    <s-table-cell></s-table-cell>
                  </s-table-row>
                ) : (
                  presets.map((preset) => (
                    <s-table-row key={preset.id}>
                      <s-table-cell>
                        <input
                          type="checkbox"
                          checked={checkedPresets.has(preset.id)}
                          onChange={(e) => {
                            const newChecked = new Set(checkedPresets);
                            if ((e.target as HTMLInputElement).checked) {
                              newChecked.add(preset.id);
                            } else {
                              newChecked.delete(preset.id);
                            }
                            setCheckedPresets(newChecked);
                          }}
                        />
                      </s-table-cell>
                      <s-table-cell>{preset.name}</s-table-cell>
                      <s-table-cell>
                        <code style={{ fontSize: '12px', color: 'rgb(97, 107, 117)' }}>{preset.handle}</code>
                      </s-table-cell>
                      <s-table-cell>
                        {preset.permissions
                          .slice(0, 2)
                          .map((p) => (p.label.length > 15 ? p.label.slice(0, 15) + '...' : p.label))
                          .join(', ')}
                        {preset.permissions.length > 3 && `, +${preset.permissions.length - 3} more`}
                      </s-table-cell>
                      <s-table-cell>
                        {preset.customMessage ? (
                          <s-icon type="check-circle-filled"></s-icon>
                        ) : (
                          <s-icon type="x-circle"></s-icon>
                        )}
                      </s-table-cell>
                      <s-table-cell>
                        {/* Actions */}
                        <s-stack direction="inline" gap="small-200">
                          <s-button
                            icon="check-circle-filled"
                            accessibilityLabel="Apply preset"
                            variant="primary"
                            onClick={() => handleApplyPreset(preset)}>
                            Apply
                          </s-button>
                          <s-button
                            icon="edit"
                            accessibilityLabel="Edit preset"
                            onClick={() => handleEditPreset(preset)}
                          />
                          <s-button
                            icon="delete"
                            tone="critical"
                            accessibilityLabel="Delete preset"
                            onClick={() => handleDeletePreset(preset.id)}
                          />
                          <s-divider direction="block"></s-divider>
                          <s-button
                            accessibilityLabel="Hotlink"
                            icon="link"
                            commandFor={HOTLINK_MODAL_ID}
                            command="--show"
                            onClick={() => handleOpenHotlinkModal(preset)}>
                            Hotlink
                          </s-button>
                        </s-stack>
                      </s-table-cell>
                    </s-table-row>
                  ))
                )}
              </s-table-body>
            </s-table>
          </s-section>
        </s-stack>
      </s-box>
    </>
  );
}
