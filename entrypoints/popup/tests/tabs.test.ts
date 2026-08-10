import { describe, expect, it } from 'bun:test';
import { TABS, tabsInGroup } from '../tabs';

describe('TABS registry', () => {
  it('has unique ids', () => {
    const ids = TABS.map((t) => t.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('assigns every tab to a known group', () => {
    const groups = new Set(['shopify', 'seo', 'utility']);
    for (const tab of TABS) expect(groups.has(tab.group)).toBe(true);
  });

  it('gives every tab a non-empty label', () => {
    for (const tab of TABS) expect(tab.label.length).toBeGreaterThan(0);
  });
});

describe('tabsInGroup', () => {
  it('returns only the tabs in the requested group, in registry order', () => {
    expect(tabsInGroup('shopify').map((t) => t.id)).toEqual(['theme']);
    expect(tabsInGroup('utility').map((t) => t.id)).toEqual(['settings']);
    expect(tabsInGroup('seo')[0]?.id).toBe('overview');
  });

  it('partitions the registry with no tab lost or duplicated', () => {
    const grouped = [...tabsInGroup('shopify'), ...tabsInGroup('seo'), ...tabsInGroup('utility')];
    expect(grouped.length).toBe(TABS.length);
    expect(new Set(grouped.map((t) => t.id)).size).toBe(TABS.length);
  });
});
