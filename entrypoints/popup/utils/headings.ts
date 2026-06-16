import type { RawHeading, HeadingIssue } from './types';
import type { TextSourceElement } from './dom-text';
import { accessibleText } from './dom-text';

/**
 * Analyzes heading structure and returns SEO/accessibility issues.
 *
 * Hidden headings (display:none / visibility:hidden) are excluded: they are
 * removed from the accessibility tree and discounted by search engines, so
 * the outline is judged on the visible sequence only. Issue indexes still
 * refer to positions in the full input array so the UI can map them to rows.
 *
 * @param {RawHeading[]} headings - Array of headings in DOM order.
 * @returns {HeadingIssue[]} Array of detected issues.
 */
export function analyzeHeadings(headings: RawHeading[]): HeadingIssue[] {
  const issues: HeadingIssue[] = [];

  if (headings.length === 0) return issues;

  const visible = headings.map((heading, index) => ({ heading, index })).filter(({ heading }) => !heading.isHidden);

  const h1s = visible.filter(({ heading }) => heading.level === 1);
  if (h1s.length === 0) {
    issues.push({ type: 'missing-h1' });
  } else if (h1s.length > 1) {
    issues.push({
      type: 'multiple-h1',
      indexes: h1s.map(({ index }) => index),
      details: `${h1s.length} H1 tags found`
    });
  }

  if (h1s.length > 0 && visible[0]!.heading.level !== 1) {
    issues.push({ type: 'h1-not-first', details: `H${visible[0]!.heading.level} appears before H1` });
  }

  for (let i = 0; i < visible.length; i++) {
    const { heading, index } = visible[i]!;
    if (heading.text.trim() === '') {
      issues.push({ type: 'empty', index, details: `Empty H${heading.level}` });
    }

    if (i > 0) {
      const prev = visible[i - 1]!.heading.level;
      const curr = heading.level;
      if (curr > prev + 1) {
        issues.push({
          type: 'skipped-level',
          index,
          details: `H${prev} → H${curr} (skipped H${prev + 1})`
        });
      }
    }
  }

  return issues;
}

/**
 * Resolves the display/accessible text of a heading element. Falls back to
 * aria-label, then to a descendant image's alt, so image-only headings (a
 * logo wrapped in an H1 is common on Shopify storefronts) aren't reported
 * as empty. Structural parameter type so the content script can pass a live
 * Element while tests pass plain objects.
 * @param el - The heading element (or a minimal stand-in).
 * @returns {string} The heading text; '' when it has no accessible name.
 */
export function headingText(el: TextSourceElement): string {
  return accessibleText(el, (text) => text.trim());
}
