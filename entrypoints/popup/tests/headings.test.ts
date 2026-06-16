import { describe, expect, it } from 'bun:test';
import { analyzeHeadings, headingText } from '../utils/headings';
import type { RawHeading } from '../utils/types';

function h(level: number, text = 'Heading', isHidden = false): RawHeading {
  return { level, text, isHidden };
}

describe('analyzeHeadings', () => {
  it('returns no issues for an empty page', () => {
    expect(analyzeHeadings([])).toEqual([]);
  });

  it('returns no issues for a well-formed outline', () => {
    expect(analyzeHeadings([h(1), h(2), h(3), h(2)])).toEqual([]);
  });

  it('flags missing H1', () => {
    const issues = analyzeHeadings([h(2), h(3)]);
    expect(issues).toEqual([{ type: 'missing-h1' }]);
  });

  it('flags multiple H1s as a single issue carrying every H1 index', () => {
    const issues = analyzeHeadings([h(1), h(2), h(1), h(1)]);
    expect(issues).toEqual([{ type: 'multiple-h1', indexes: [0, 2, 3], details: '3 H1 tags found' }]);
  });

  it('flags H1 not being the first heading', () => {
    const issues = analyzeHeadings([h(2), h(1)]);
    expect(issues).toEqual([{ type: 'h1-not-first', details: 'H2 appears before H1' }]);
  });

  it('flags empty headings with their index', () => {
    const issues = analyzeHeadings([h(1), h(2, '')]);
    expect(issues).toEqual([{ type: 'empty', index: 1, details: 'Empty H2' }]);
  });

  it('flags skipped levels with their index', () => {
    const issues = analyzeHeadings([h(1), h(3)]);
    expect(issues).toEqual([{ type: 'skipped-level', index: 1, details: 'H1 → H3 (skipped H2)' }]);
  });

  describe('hidden headings are excluded from analysis', () => {
    it('does not count hidden H1s toward multiple-h1', () => {
      expect(analyzeHeadings([h(1), h(1, 'Hidden', true), h(2)])).toEqual([]);
    });

    it('flags missing H1 when the only H1 is hidden', () => {
      const issues = analyzeHeadings([h(1, 'Hidden', true), h(2)]);
      expect(issues).toEqual([{ type: 'missing-h1' }]);
    });

    it('flags missing H1 when every heading is hidden', () => {
      const issues = analyzeHeadings([h(1, 'Hidden', true), h(2, 'Hidden', true)]);
      expect(issues).toEqual([{ type: 'missing-h1' }]);
    });

    it('ignores hidden headings when checking h1-not-first', () => {
      expect(analyzeHeadings([h(2, 'Hidden', true), h(1), h(2)])).toEqual([]);
    });

    it('does not flag hidden empty headings', () => {
      expect(analyzeHeadings([h(1), h(2, '', true), h(2)])).toEqual([]);
    });

    it('detects skips across the visible sequence, through hidden headings', () => {
      const issues = analyzeHeadings([h(1), h(2, 'Hidden', true), h(3)]);
      expect(issues).toEqual([{ type: 'skipped-level', index: 2, details: 'H1 → H3 (skipped H2)' }]);
    });

    it('does not flag a skip that only exists because of a hidden heading', () => {
      expect(analyzeHeadings([h(1), h(4, 'Hidden', true), h(2)])).toEqual([]);
    });

    it('reports indexes relative to the full array, not the visible subset', () => {
      const issues = analyzeHeadings([h(1), h(5, 'Hidden', true), h(2, '')]);
      expect(issues).toEqual([{ type: 'empty', index: 2, details: 'Empty H2' }]);
    });
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

  it('returns trimmed text content', () => {
    expect(headingText(fakeEl({ text: '  Sale ends soon  ' }))).toBe('Sale ends soon');
  });

  it('returns empty string when there is no accessible name at all', () => {
    expect(headingText(fakeEl())).toBe('');
  });

  it('falls back to aria-label when text content is empty', () => {
    expect(headingText(fakeEl({ ariaLabel: 'Store name' }))).toBe('Store name');
  });

  it('falls back to a descendant image alt when text content is empty', () => {
    expect(headingText(fakeEl({ imgAlts: ['Store logo'] }))).toBe('Store logo');
  });

  it('prefers text content over fallbacks', () => {
    expect(headingText(fakeEl({ text: 'Welcome', ariaLabel: 'nope', imgAlts: ['nope'] }))).toBe('Welcome');
  });

  it('prefers aria-label over image alt', () => {
    expect(headingText(fakeEl({ ariaLabel: 'Label', imgAlts: ['Alt'] }))).toBe('Label');
  });

  it('skips whitespace-only image alts', () => {
    expect(headingText(fakeEl({ imgAlts: ['  ', 'Store logo'] }))).toBe('Store logo');
  });
});
