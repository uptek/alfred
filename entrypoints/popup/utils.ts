import type { StoreInfo, Theme, RawHeading, HeadingIssue } from './types';
import { lookupThemeStoreEntry } from './themeStoreLookup';

/**
 * Analyzes heading structure and returns SEO/accessibility issues.
 * @param {RawHeading[]} headings - Array of headings in DOM order.
 * @returns {HeadingIssue[]} Array of detected issues.
 */
export function analyzeHeadings(headings: RawHeading[]): HeadingIssue[] {
  const issues: HeadingIssue[] = [];

  if (headings.length === 0) return issues;

  const h1s = headings.filter((h) => h.level === 1);
  if (h1s.length === 0) {
    issues.push({ type: 'missing-h1' });
  } else if (h1s.length > 1) {
    for (let i = 0; i < headings.length; i++) {
      if (headings[i]!.level === 1) {
        issues.push({ type: 'multiple-h1', index: i, details: `${h1s.length} H1 tags found` });
      }
    }
  }

  if (h1s.length > 0 && headings[0]!.level !== 1) {
    issues.push({ type: 'h1-not-first', details: `H${headings[0]!.level} appears before H1` });
  }

  for (let i = 0; i < headings.length; i++) {
    const heading = headings[i]!;
    if (heading.text.trim() === '') {
      issues.push({ type: 'empty', index: i, details: `Empty H${heading.level}` });
    }

    if (i > 0) {
      const prev = headings[i - 1]!.level;
      const curr = heading.level;
      if (curr > prev + 1) {
        issues.push({
          type: 'skipped-level',
          index: i,
          details: `H${prev} → H${curr} (skipped H${prev + 1})`
        });
      }
    }
  }

  return issues;
}

/**
 * Extracts all H1-H6 headings from the active tab via content script.
 * @returns {Promise<RawHeading[]>} Array of headings in DOM order, or empty array on failure.
 */
export const getHeadings = async (): Promise<RawHeading[]> => {
  try {
    const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
    if (tab?.id) {
      const response = await browser.tabs.sendMessage(tab.id, { action: 'get_headings' });
      return Array.isArray(response) ? response : [];
    }
    return [];
  } catch {
    return [];
  }
};

/**
 * Scrolls the active tab to a heading by its DOM index and briefly highlights it.
 * @param {number} index - Zero-based index of the heading in DOM order.
 */
export const scrollToHeading = async (index: number): Promise<void> => {
  try {
    const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
    if (tab?.id) {
      await browser.tabs.sendMessage(tab.id, { action: 'scroll_to_heading', index });
    }
  } catch {
    // silently fail if content script is unreachable
  }
};

/**
 * Detects Shopify theme info from the active tab via content script and enriches it with Theme Store metadata.
 * @returns {Promise<StoreInfo | null>} Store and theme data, or null if the tab is inaccessible.
 */
export const getTheme = async (): Promise<StoreInfo | null> => {
  try {
    // Get the current active tab
    const [tab] = await browser.tabs.query({
      active: true,
      currentWindow: true
    });

    if (tab?.id && tab?.url) {
      // Send message to content script
      interface ThemeResponse {
        isShopify?: boolean;
        shop?: string;
        theme?: Theme;
      }

      const response: ThemeResponse = await browser.tabs.sendMessage(tab.id, {
        action: 'get_theme'
      });

      const theme = response?.theme ?? null;

      // Transform response to StoreInfo format
      return {
        isShopify: response?.isShopify ?? false,
        domain: new URL(tab.url).hostname,
        shopDomain: response?.shop ?? null,
        page_url: tab.url,
        theme,
        themeStoreEntry: await lookupThemeStoreEntry(theme)
      };
    }
    return null;
  } catch (error) {
    console.error('Error getting theme:', error);
    return null;
  }
};
