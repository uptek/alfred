import { describe, expect, test } from 'bun:test';
import { TABS, tabsInGroup } from '../tabs';

describe('TABS registry', () => {
  test('gives every tab a non-empty label', () => {
    for (const tab of TABS) expect(tab.label.length).toBeGreaterThan(0);
  });
});

describe('tabsInGroup', () => {
  const ids = (group: Parameters<typeof tabsInGroup>[0]) => tabsInGroup(group).map((t) => t.id);

  test('returns only the tabs in the requested group, in registry order', () => {
    expect(ids('shopify')).toEqual(['theme']);
    expect(ids('utility')).toEqual(['settings']);
    expect(ids('seo')[0]).toBe('overview');
  });

  // Also proves every tab has a known group and a unique id.
  test('partitions the registry with no tab lost or duplicated', () => {
    const grouped = [...ids('shopify'), ...ids('seo'), ...ids('utility')];
    expect(grouped.length).toBe(TABS.length);
    expect(new Set(grouped).size).toBe(TABS.length);
  });
});
