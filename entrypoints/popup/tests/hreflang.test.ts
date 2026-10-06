import { describe, expect, test } from 'bun:test';
import { analyzeHreflangs, isValidHreflangCode, summarizeHreflangs } from '../utils/hreflang';
import type { HreflangAnalysis, HreflangEntry } from '../utils/hreflang';
import type { RawHreflang } from '../utils/types';

const PAGE = 'https://example.com/';
const FR = 'https://example.com/fr/';

const tag = (hreflang: string, href = PAGE, over: Partial<RawHreflang> = {}): RawHreflang => ({
  index: 0,
  href,
  rawHref: href,
  hreflang,
  inHead: true,
  ...over
});

describe('isValidHreflangCode', () => {
  test('accepts language, language-region, language-script, and x-default', () => {
    for (const code of ['en', 'EN', 'fr-CA', 'zh-Hant', 'zh-Hant-TW', 'x-default', 'X-Default']) {
      expect(isValidHreflangCode(code)).toBe(true);
    }
  });

  test('rejects underscores, bare regions, and junk', () => {
    for (const code of ['en_US', 'english', 'en-USA', '', 'en-']) {
      expect(isValidHreflangCode(code)).toBe(false);
    }
  });
});

describe('analyzeHreflangs', () => {
  test('empty input yields no entries and no issues', () => {
    expect(analyzeHreflangs([], PAGE)).toEqual({
      entries: [],
      issues: [],
      hasXDefault: false,
      hasSelf: false,
      errorCount: 0,
      warningCount: 0
    });
  });

  test('clean set: self-ref + x-default produces zero issues', () => {
    const a = analyzeHreflangs([tag('x-default'), tag('en'), tag('fr', FR)], PAGE);
    expect(a.issues).toEqual([]);
    expect(a.hasXDefault).toBe(true);
    expect(a.hasSelf).toBe(true);
    expect(a.entries[1]!.isSelf).toBe(true);
    expect(a.errorCount).toBe(0);
  });

  test.each([
    ['invalid-code', 'error', { invalidCode: true }, [tag('en_US'), tag('x-default')]],
    ['relative-href', 'error', { relativeHref: true }, [tag('fr', FR, { rawHref: '/fr/' })]],
    // Same code with different URLs.
    ['conflicting-code', 'error', { conflictingCode: true }, [tag('en'), tag('EN', 'https://example.com/other/')]],
    // Same code with the same URL is not a conflict.
    ['duplicate-code', 'warning', { duplicateCode: true, conflictingCode: false }, [tag('en'), tag('en')]],
    ['outside-head', 'error', {}, [tag('en', PAGE, { inHead: false }), tag('x-default')]]
  ])('raises %s at %s severity', (id, severity, entryFlags, tags) => {
    const a = analyzeHreflangs(tags, PAGE);
    expect(a.entries[0]).toMatchObject(entryFlags);
    expect(a.issues.find((i) => i.id === id)?.severity).toBe(severity);
  });

  test('missing self-reference is an error; skipped without a page URL', () => {
    const tags = [tag('fr', FR)];
    expect(analyzeHreflangs(tags, PAGE).issues.find((i) => i.id === 'missing-self')?.severity).toBe('error');
    expect(analyzeHreflangs(tags, null).issues.some((i) => i.id === 'missing-self')).toBe(false);
  });

  test('missing x-default is a warning', () => {
    const a = analyzeHreflangs([tag('en')], PAGE);
    expect(a.issues.find((i) => i.id === 'missing-x-default')?.severity).toBe('warning');
    expect(a.warningCount).toBe(1);
  });

  test('self-reference matches across trailing slash and hash differences', () => {
    const a = analyzeHreflangs([tag('en', 'https://example.com/en/')], 'https://example.com/en#section');
    expect(a.hasSelf).toBe(true);
  });
});

describe('summarizeHreflangs', () => {
  const analysis = (over: Partial<HreflangAnalysis>): HreflangAnalysis => ({
    entries: [],
    issues: [],
    hasXDefault: false,
    hasSelf: false,
    errorCount: 0,
    warningCount: 0,
    ...over
  });

  const entry = () => ({ ...tag('en'), isSelf: false }) as HreflangEntry;

  const texts = (items: { text: string }[]) => items.map((i) => i.text);

  test('leads with the alternate count, singular for one', () => {
    expect(summarizeHreflangs(analysis({ entries: [entry()] }), PAGE)[0]?.text).toBe('1 alternate');
    expect(summarizeHreflangs(analysis({ entries: [entry(), entry()] }), PAGE)[0]?.text).toBe('2 alternates');
  });

  test('states the healthy x-default and self-reference cases rather than suppressing them', () => {
    const items = summarizeHreflangs(analysis({ hasXDefault: true, hasSelf: true }), PAGE);
    expect(texts(items)).toEqual(['0 alternates', 'x-default', 'self-referencing']);
    expect(items.every((i) => i.tone === undefined)).toBe(true);
  });

  test('warns on a missing x-default and errors on a missing self-reference', () => {
    const items = summarizeHreflangs(analysis({}), PAGE);
    expect(items.find((i) => i.text === 'no x-default')?.tone).toBe('warn');
    expect(items.find((i) => i.text === 'no self-reference')?.tone).toBe('err');
  });

  test('omits the self-reference item entirely without a page URL', () => {
    expect(texts(summarizeHreflangs(analysis({ hasSelf: false }), null))).toEqual(['0 alternates', 'no x-default']);
  });

  test('appends the error count, singular for one', () => {
    expect(summarizeHreflangs(analysis({ errorCount: 1 }), PAGE).at(-1)).toEqual({ text: '1 error', tone: 'err' });
    expect(summarizeHreflangs(analysis({ errorCount: 2 }), PAGE).at(-1)?.text).toBe('2 errors');
  });
});
