import { describe, expect, test } from 'bun:test';
import { analyzeHreflangs, isValidHreflangCode, normalizeUrl, summarizeHreflangs } from '../utils/hreflang';
import type { HreflangAnalysis, HreflangEntry } from '../utils/hreflang';
import type { RawHreflang } from '../utils/types';

const tag = (overrides: Partial<RawHreflang>): RawHreflang => ({
  index: 0,
  href: 'https://example.com/',
  rawHref: 'https://example.com/',
  hreflang: 'en',
  inHead: true,
  ...overrides
});

const PAGE = 'https://example.com/';

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

describe('normalizeUrl', () => {
  test('drops hash, lowercases host, strips trailing slash beyond root', () => {
    expect(normalizeUrl('https://Example.com/en/#top')).toBe('https://example.com/en');
    expect(normalizeUrl('https://example.com/')).toBe('https://example.com/');
  });

  test('returns null for unparseable input', () => {
    expect(normalizeUrl('/en/')).toBeNull();
  });
});

describe('analyzeHreflangs', () => {
  test('empty input yields no entries and no issues', () => {
    const a = analyzeHreflangs([], PAGE);
    expect(a.entries).toEqual([]);
    expect(a.issues).toEqual([]);
  });

  test('clean set: self-ref + x-default produces zero issues', () => {
    const a = analyzeHreflangs(
      [
        tag({ index: 0, hreflang: 'x-default' }),
        tag({ index: 1, hreflang: 'en' }),
        tag({ index: 2, hreflang: 'fr', href: 'https://example.com/fr/', rawHref: 'https://example.com/fr/' })
      ],
      PAGE
    );
    expect(a.issues).toEqual([]);
    expect(a.hasXDefault).toBe(true);
    expect(a.hasSelf).toBe(true);
    expect(a.entries[1]!.isSelf).toBe(true);
    expect(a.errorCount).toBe(0);
  });

  test('flags invalid codes on the entry and set level', () => {
    const a = analyzeHreflangs([tag({ hreflang: 'en_US' }), tag({ index: 1, hreflang: 'x-default' })], PAGE);
    expect(a.entries[0]!.invalidCode).toBe(true);
    expect(a.issues.some((i) => i.id === 'invalid-code' && i.severity === 'error')).toBe(true);
  });

  test('flags relative hrefs', () => {
    const a = analyzeHreflangs([tag({ rawHref: '/fr/', href: 'https://example.com/fr/', hreflang: 'fr' })], PAGE);
    expect(a.entries[0]!.relativeHref).toBe(true);
    expect(a.issues.some((i) => i.id === 'relative-href')).toBe(true);
  });

  test('same code with different URLs is a conflict error', () => {
    const a = analyzeHreflangs(
      [tag({ hreflang: 'en' }), tag({ index: 1, hreflang: 'EN', href: 'https://example.com/other/' })],
      PAGE
    );
    expect(a.entries[0]!.conflictingCode).toBe(true);
    expect(a.issues.some((i) => i.id === 'conflicting-code' && i.severity === 'error')).toBe(true);
  });

  test('same code with the same URL is only a duplicate warning', () => {
    const a = analyzeHreflangs([tag({}), tag({ index: 1 })], PAGE);
    expect(a.entries[0]!.duplicateCode).toBe(true);
    expect(a.entries[0]!.conflictingCode).toBe(false);
    const dup = a.issues.find((i) => i.id === 'duplicate-code');
    expect(dup?.severity).toBe('warning');
  });

  test('missing self-reference is an error; skipped without a page URL', () => {
    const tags = [tag({ href: 'https://example.com/fr/', rawHref: 'https://example.com/fr/', hreflang: 'fr' })];
    expect(analyzeHreflangs(tags, PAGE).issues.some((i) => i.id === 'missing-self')).toBe(true);
    expect(analyzeHreflangs(tags, null).issues.some((i) => i.id === 'missing-self')).toBe(false);
  });

  test('missing x-default is a warning', () => {
    const a = analyzeHreflangs([tag({})], PAGE);
    const issue = a.issues.find((i) => i.id === 'missing-x-default');
    expect(issue?.severity).toBe('warning');
    expect(a.warningCount).toBe(1);
  });

  test('tag outside head is an error', () => {
    const a = analyzeHreflangs([tag({ inHead: false }), tag({ index: 1, hreflang: 'x-default' })], PAGE);
    expect(a.issues.some((i) => i.id === 'outside-head' && i.severity === 'error')).toBe(true);
  });

  test('self-reference matches across trailing slash and hash differences', () => {
    const a = analyzeHreflangs(
      [tag({ href: 'https://example.com/en/', rawHref: 'https://example.com/en/', hreflang: 'en' })],
      'https://example.com/en#section'
    );
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

  const entry = (over: Partial<HreflangEntry> = {}): HreflangEntry =>
    ({ ...tag({}), isSelf: false, ...over }) as HreflangEntry;

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
