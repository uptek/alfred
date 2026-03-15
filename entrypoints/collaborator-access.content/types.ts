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

export interface PresetStorageData {
  presets: PermissionPreset[];
}
