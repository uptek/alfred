/**
 * Single source of truth for the popup's sidebar tabs. Adding a tab here gives
 * it a sidebar entry, a `TabId` union member, and per-tab state persistence;
 * the content pane, icon, and badge count are wired up in App.svelte.
 * Kept free of runes and WXT auto-imports so it can be unit-tested directly.
 */

export type TabGroup = 'shopify' | 'seo' | 'utility';

// Future tabs: 'apps' | 'products'
export const TABS = [
  { id: 'theme', label: 'Theme', group: 'shopify' },
  { id: 'overview', label: 'Overview', group: 'seo' },
  { id: 'headings', label: 'Headings', group: 'seo' },
  { id: 'links', label: 'Links', group: 'seo' },
  { id: 'assets', label: 'Assets', group: 'seo' },
  { id: 'images', label: 'Images', group: 'seo' },
  { id: 'robots', label: 'Robots.txt', group: 'seo' },
  { id: 'hreflangs', label: 'Hreflangs', group: 'seo' },
  { id: 'schema', label: 'Schema', group: 'seo' },
  { id: 'social', label: 'Social', group: 'seo' },
  { id: 'sitemaps', label: 'Sitemaps', group: 'seo' },
  { id: 'settings', label: 'Settings', group: 'utility' }
] as const satisfies readonly { id: string; label: string; group: TabGroup }[];

export type TabId = (typeof TABS)[number]['id'];

export type Tab = (typeof TABS)[number];

export function tabsInGroup(group: TabGroup): Tab[] {
  return TABS.filter((tab) => tab.group === group);
}
