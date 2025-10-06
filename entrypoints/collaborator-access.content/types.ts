export type Permission = {
  id: string;
  label: string;
};

export type PermissionPreset = {
  id: string;
  name: string;
  permissions: Permission[];
  customMessage?: string;
  createdAt: number;
  lastUsed?: number;
};

export interface PresetStorageData {
  presets: PermissionPreset[];
}
