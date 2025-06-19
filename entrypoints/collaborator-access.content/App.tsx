import { useEffect, useState, useRef } from 'preact/hooks';
import { getPresets, savePreset, deletePreset } from './utils';
import { formatTimeAgo } from '@/utils/helpers';
import type { Permission, PermissionPreset } from './types';

export default function App() {
  const [presets, setPresets] = useState<PermissionPreset[]>([]);
  const [selectedPreset, setSelectedPreset] = useState<PermissionPreset | null>(null);
  const [showPresetsTable, setShowPresetsTable] = useState(false);
  const selectRef = useRef<any>(null);

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
      const shadowRoot = (selectElement as any).shadowRoot;

      if (shadowRoot) {
        // Look for the actual select element inside the shadow DOM
        const internalSelect = shadowRoot.querySelector('select');

        if (internalSelect) {
          const handleChange = (event: Event) => {
            const value = (event.target as HTMLSelectElement).value;

            if (value !== '0') {
              const preset = presets.find((preset) => preset.id === value);
              setSelectedPreset(preset || null);
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

  const handleApplyPreset = () => {
    if (!selectedPreset) {
      alert('Please select a preset to apply.');
      return;
    }

    // First uncheck all checkboxes by clicking checked ones
    const checkedCheckboxes = document.querySelectorAll('#AppFrameMain form .Polaris-FormLayout__Item:nth-child(2) input[type="checkbox"]:checked');
    checkedCheckboxes.forEach((checkbox) => {
      (checkbox as HTMLInputElement).click();
    });

    // Then click to check only the ones in the preset with delay between each
    setTimeout(() => {
      selectedPreset.permissions.forEach((permission, index) => {
        setTimeout(() => {
          const checkbox = document.getElementById(permission.id) as HTMLInputElement;
          if (checkbox && !checkbox.checked) {
            checkbox.click();
          }
        }, index * 50); // 50ms delay between each click
      });
    }, 100);
  };

  const handleEditPreset = async (preset: PermissionPreset) => {
    const newName = prompt('Enter new name for the preset:', preset.name);

    if (!newName || newName.trim() === preset.name) {
      return;
    }

    const updatedPreset = {
      ...preset,
      name: newName.trim(),
    };

    try {
      await savePreset(updatedPreset);
      // Update local state
      setPresets(presets.map((p) => (p.id === preset.id ? updatedPreset : p)));
      // Update selected preset if it was edited
      if (selectedPreset?.id === preset.id) {
        setSelectedPreset(updatedPreset);
      }
    } catch (error) {
      console.error('Failed to update preset:', error);
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
      } catch (error) {
        console.error('Failed to delete preset:', error);
      }
    }
  };

  const handleSavePreset = async () => {
    const checkedCheckboxes = document.querySelectorAll('#AppFrameMain form .Polaris-FormLayout__Item:nth-child(2) input[type="checkbox"]:checked');

    if (checkedCheckboxes.length === 0) {
      alert('Please select at least one permission to save as a preset.');
      return;
    }

    const presetName = prompt('Enter a name for this preset:');

    if (!presetName || !presetName.trim()) {
      return;
    }

    const permissions: Permission[] = [];

    // Build permissions array
    checkedCheckboxes.forEach((checkbox) => {
      const label = checkbox.closest('label')?.querySelector('p')?.textContent || '';
      permissions.push({
        id: checkbox.id,
        label: label.trim(),
      });
    });

    const newPreset = {
      id: Math.random().toString(36).substring(2, 8) + Date.now().toString(36),
      name: presetName.trim(),
      permissions,
      createdAt: Date.now(),
    };

    try {
      await savePreset(newPreset);
      // Add the new preset to the local state
      setPresets([...presets, newPreset]);
    } catch (error) {
      console.error('Failed to save preset:', error);
    }
  };

  return (
    <>
      <s-divider></s-divider>
      <s-box padding="large">
        <s-stack gap="base">
          <s-text type="strong">Permission Presets</s-text>
          <s-stack direction="inline" gap="base small-200">
            <div style={{ width: '300px' }}>
              <s-select
                ref={selectRef}
                label="Presets"
                labelAccessibilityVisibility="exclusive"
                value={selectedPreset?.id || '0'}
              >
                <s-option value="0">Select a preset</s-option>
                {presets.map((preset) => (
                  <s-option key={preset.id} value={preset.id}>
                    {preset.name}
                  </s-option>
                ))}
              </s-select>
            </div>
            <s-button variant="primary" onClick={handleApplyPreset}>
              Apply
            </s-button>
            <s-button variant="secondary" onClick={handleSavePreset}>
              Save preset
            </s-button>
            <s-button variant="tertiary" onClick={() => setShowPresetsTable(!showPresetsTable)}>
              View all presets
            </s-button>
          </s-stack>

          {showPresetsTable && (
            <s-section padding="none">
              <s-table>
                <s-table-header-row>
                  <s-table-header listSlot="primary">Name</s-table-header>
                  <s-table-header>Permissions</s-table-header>
                  <s-table-header>Last used</s-table-header>
                  <s-table-header>Created</s-table-header>
                  <s-table-header>Actions</s-table-header>
                </s-table-header-row>
                <s-table-body>
                  {presets.length === 0 ? (
                    <s-table-row>
                      <s-table-cell>No permission presets saved yet.</s-table-cell>
                      <s-table-cell></s-table-cell>
                      <s-table-cell></s-table-cell>
                      <s-table-cell></s-table-cell>
                      <s-table-cell></s-table-cell>
                    </s-table-row>
                  ) : (
                    presets.map((preset) => (
                      <s-table-row key={preset.id}>
                        <s-table-cell>{preset.name}</s-table-cell>
                        <s-table-cell>
                          {preset.permissions
                            .slice(0, 3)
                            .map((p) => p.label)
                            .join(', ')}
                          {preset.permissions.length > 3 && `, +${preset.permissions.length - 3} more`}
                        </s-table-cell>
                        <s-table-cell>{preset.lastUsed ? formatTimeAgo(preset.lastUsed) : 'Never'}</s-table-cell>
                        <s-table-cell>{formatTimeAgo(preset.createdAt)}</s-table-cell>
                        <s-table-cell>
                          <s-stack direction="inline" gap="small-200">
                            <s-button icon="edit" accessibilityLabel="Edit" onClick={() => handleEditPreset(preset)} />
                            <s-button icon="delete" accessibilityLabel="Delete" onClick={() => handleDeletePreset(preset.id)} />
                          </s-stack>
                        </s-table-cell>
                      </s-table-row>
                    ))
                  )}
                </s-table-body>
              </s-table>
            </s-section>
          )}
        </s-stack>
      </s-box>
    </>
  );
}
