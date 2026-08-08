/**
 * Single source of truth for the popup's sidebar tabs. Adding a tab here gives
 * it a sidebar entry, a `TabId` union member, and per-tab state persistence;
 * the content pane and badge count are wired up in App.svelte.
 * Kept free of runes and WXT auto-imports so it can be unit-tested directly.
 */

export type TabGroup = 'shopify' | 'seo' | 'utility';

export interface TabDef {
  id: string;
  label: string;
  icon: string;
  group: TabGroup;
}

// Future tabs: 'apps' | 'products'
export const TABS = [
  { id: 'theme', label: 'Theme', icon: 'theme', group: 'shopify' },
  { id: 'overview', label: 'Overview', icon: 'overview', group: 'seo' },
  { id: 'headings', label: 'Headings', icon: 'headings', group: 'seo' },
  { id: 'links', label: 'Links', icon: 'links', group: 'seo' },
  { id: 'assets', label: 'Assets', icon: 'assets', group: 'seo' },
  { id: 'images', label: 'Images', icon: 'images', group: 'seo' },
  { id: 'robots', label: 'Robots.txt', icon: 'robots', group: 'seo' },
  { id: 'hreflangs', label: 'Hreflangs', icon: 'hreflangs', group: 'seo' },
  { id: 'schema', label: 'Schema', icon: 'schema', group: 'seo' },
  { id: 'social', label: 'Social', icon: 'social', group: 'seo' },
  { id: 'sitemaps', label: 'Sitemaps', icon: 'sitemaps', group: 'seo' },
  { id: 'settings', label: 'Settings', icon: 'settings', group: 'utility' }
] as const satisfies readonly TabDef[];

export type TabId = (typeof TABS)[number]['id'];

export type Tab = (typeof TABS)[number];

export function tabsInGroup(group: TabGroup): Tab[] {
  return TABS.filter((tab) => tab.group === group);
}
