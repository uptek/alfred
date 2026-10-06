import { describe, expect, it } from 'bun:test';
import { analyzeHeadings, headingText } from '../utils/headings';
import type { HeadingIssue, RawHeading } from '../utils/types';

function h(level: number, text = 'Heading', isHidden = false): RawHeading {
  return { level, text, isHidden };
}

const hidden = (level: number, text = 'Hidden'): RawHeading => h(level, text, true);

describe('analyzeHeadings', () => {
  it.each<[string, RawHeading[], HeadingIssue[]]>([
    ['nothing for an empty page', [], []],
    ['nothing for a well-formed outline', [h(1), h(2), h(3), h(2)], []],
    ['a missing H1', [h(2), h(3)], [{ type: 'missing-h1' }]],
    [
      'multiple H1s as a single issue carrying every H1 index',
      [h(1), h(2), h(1), h(1)],
      [{ type: 'multiple-h1', indexes: [0, 2, 3], details: '3 H1 tags found' }]
    ],
    ['an H1 that is not the first heading', [h(2), h(1)], [{ type: 'h1-not-first', details: 'H2 appears before H1' }]],
    ['an empty heading with its index', [h(1), h(2, '')], [{ type: 'empty', index: 1, details: 'Empty H2' }]],
    [
      'a skipped level with its index',
      [h(1), h(3)],
      [{ type: 'skipped-level', index: 1, details: 'H1 → H3 (skipped H2)' }]
    ]
  ])('reports %s', (_, headings, expected) => {
    expect(analyzeHeadings(headings)).toEqual(expected);
  });

  it.each<[string, RawHeading[], HeadingIssue[]]>([
    ['does not count hidden H1s toward multiple-h1', [h(1), hidden(1), h(2)], []],
    ['flags missing H1 when the only H1 is hidden', [hidden(1), h(2)], [{ type: 'missing-h1' }]],
    ['flags missing H1 when every heading is hidden', [hidden(1), hidden(2)], [{ type: 'missing-h1' }]],
    ['ignores hidden headings when checking h1-not-first', [hidden(2), h(1), h(2)], []],
    ['does not flag hidden empty headings', [h(1), hidden(2, ''), h(2)], []],
    [
      'detects skips across the visible sequence, through hidden headings',
      [h(1), hidden(2), h(3)],
      [{ type: 'skipped-level', index: 2, details: 'H1 → H3 (skipped H2)' }]
    ],
    ['does not flag a skip that only exists because of a hidden heading', [h(1), hidden(4), h(2)], []],
    [
      'reports indexes relative to the full array, not the visible subset',
      [h(1), hidden(5), h(2, '')],
      [{ type: 'empty', index: 2, details: 'Empty H2' }]
    ]
  ])('hidden headings: %s', (_, headings, expected) => {
    expect(analyzeHeadings(headings)).toEqual(expected);
  });
});

describe('headingText', () => {
  function fakeEl({ text = '', ariaLabel = null as string | null, imgAlts = [] as string[] } = {}) {
    return {
      textContent: text,
      getAttribute: (name: string) => (name === 'aria-label' ? ariaLabel : null),
      querySelectorAll: () => imgAlts.map((alt) => ({ getAttribute: () => alt }))
    };
  }

  it.each<[string, Parameters<typeof fakeEl>[0], string]>([
    ['returns trimmed text content', { text: '  Sale ends soon  ' }, 'Sale ends soon'],
    ['returns empty string when there is no accessible name at all', {}, ''],
    ['falls back to aria-label when text content is empty', { ariaLabel: 'Store name' }, 'Store name'],
    ['falls back to a descendant image alt when text content is empty', { imgAlts: ['Store logo'] }, 'Store logo'],
    ['prefers text content over fallbacks', { text: 'Welcome', ariaLabel: 'nope', imgAlts: ['nope'] }, 'Welcome'],
    ['prefers aria-label over image alt', { ariaLabel: 'Label', imgAlts: ['Alt'] }, 'Label'],
    ['skips whitespace-only image alts', { imgAlts: ['  ', 'Store logo'] }, 'Store logo']
  ])('%s', (_, el, expected) => {
    expect(headingText(fakeEl(el))).toBe(expected);
  });
});
