export interface Permission {
  id: string;
  label: string;
}

export interface PermissionPreset {
  id: string;
  name: string;
  permissions: Permission[];
  customMessage?: string;
  createdAt: number;
  lastUsed?: number;
}

export interface PresetStorageData {
  presets: PermissionPreset[];
}
