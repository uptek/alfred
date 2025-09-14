export type InfoItemType = 'url' | 'text';

export interface InfoItemProps {
  label: string;
  value: string | undefined | null;
  type?: InfoItemType;
  isLast?: boolean;
}

export interface ThemeInfo {
  isShopify: boolean;
  theme: {
    name?: string;
    id?: number;
    schema_name?: string;
    schema_version?: string;
    theme_store_id?: number;
    role?: string;
    handle?: string;
    author?: string;
  } | null;
  shop: string | null;
  page_url: string | null;
}
