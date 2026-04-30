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

export type DashboardType = 'partner' | 'dev';

export interface PageAdapter {
  type: DashboardType;
  getCheckedPermissions(): Permission[];
  uncheckAll(): void;
  checkPermission(id: string): void;
  getMessage(): string;
  setMessage(text: string): void;
  expandCheckedSections(): void;
}
