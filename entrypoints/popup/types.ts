export interface RawHeading {
  level: number;
  text: string;
  isHidden: boolean;
}

export interface RawLink {
  index: number;
  href: string;
  text: string;
  rel: string;
  isExternal: boolean;
  isNofollow: boolean;
  isImage: boolean;
  isHidden: boolean;
}

export type HeadingIssueType = 'missing-h1' | 'multiple-h1' | 'skipped-level' | 'empty' | 'h1-not-first';

export interface HeadingIssue {
  type: HeadingIssueType;
  details?: string;
  index?: number;
}

export type InfoItemType = 'url' | 'text';

export interface InfoItemProps {
  label: string;
  value: string | undefined | null;
  type?: InfoItemType;
  isLast?: boolean;
  copyable?: boolean;
}

export interface Theme {
  name?: string;
  id?: number;
  schema_name?: string;
  schema_version?: string;
  theme_store_id?: number;
  role?: string;
  handle?: string;
  author?: string;
}

export interface StoreInfo {
  isShopify: boolean;
  shopDomain: string | null; // .myshopify.com domain
  domain: string | null; // Current URL domain (from page_url)
  page_url: string | null;
  theme: Theme | null;
  themeStoreEntry?: ThemeStoreEntry | null;
}

export interface ThemeStoreEntry {
  name: string;
  theme_store_id: number;
  version: string;
  price: string;
  theme_url: string;
  developer: {
    name: string;
    url: string;
  };
}
