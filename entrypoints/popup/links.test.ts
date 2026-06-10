import { describe, expect, it } from 'bun:test';
import { classifyLink, csvField, isInsecureHttp, linkText, relFlags, samePageFragment } from './links';

describe('classifyLink', () => {
  it('classifies a same-host link as internal', () => {
    expect(classifyLink('https://shop.com/collections/all', 'shop.com')).toBe('internal');
  });

  it('classifies a different-host link as external', () => {
    expect(classifyLink('https://example.com/', 'shop.com')).toBe('external');
  });

  it('treats the www variant of the page host as internal', () => {
    expect(classifyLink('https://www.shop.com/', 'shop.com')).toBe('internal');
  });

  it('treats a bare-host link as internal when the page is on www', () => {
    expect(classifyLink('https://shop.com/', 'www.shop.com')).toBe('internal');
  });

  it('keeps other subdomains external', () => {
    expect(classifyLink('https://blog.shop.com/', 'shop.com')).toBe('external');
  });

  it('compares hosts case-insensitively', () => {
    expect(classifyLink('https://SHOP.com/', 'shop.com')).toBe('internal');
  });

  it('classifies http links by host like https ones', () => {
    expect(classifyLink('http://shop.com/old', 'shop.com')).toBe('internal');
  });

  it('classifies mailto links as mailto, not external', () => {
    expect(classifyLink('mailto:hello@example.com', 'shop.com')).toBe('mailto');
  });

  it('classifies tel links as tel, not external', () => {
    expect(classifyLink('tel:+15551234567', 'shop.com')).toBe('tel');
  });

  it('classifies javascript pseudo-links as other', () => {
    expect(classifyLink('javascript:void(0)', 'shop.com')).toBe('other');
  });

  it('classifies non-web protocols as other', () => {
    expect(classifyLink('ftp://shop.com/file', 'shop.com')).toBe('other');
  });

  it('classifies unparseable hrefs as other', () => {
    expect(classifyLink('not a url', 'shop.com')).toBe('other');
  });
});

describe('relFlags', () => {
  it('returns all-false for an empty rel', () => {
    expect(relFlags('')).toEqual({ nofollow: false, sponsored: false, ugc: false });
  });

  it('detects nofollow', () => {
    expect(relFlags('nofollow')).toEqual({ nofollow: true, sponsored: false, ugc: false });
  });

  it('detects sponsored without nofollow', () => {
    expect(relFlags('sponsored')).toEqual({ nofollow: false, sponsored: true, ugc: false });
  });

  it('detects ugc without nofollow', () => {
    expect(relFlags('ugc')).toEqual({ nofollow: false, sponsored: false, ugc: true });
  });

  it('detects combined hints in a token list', () => {
    expect(relFlags('noopener sponsored nofollow')).toEqual({ nofollow: true, sponsored: true, ugc: false });
  });

  it('matches case-insensitively', () => {
    expect(relFlags('NoFollow UGC')).toEqual({ nofollow: true, sponsored: false, ugc: true });
  });

  it('does not match partial tokens', () => {
    expect(relFlags('nofollower sponsoredx fugc')).toEqual({ nofollow: false, sponsored: false, ugc: false });
  });
});

describe('linkText', () => {
  function fakeEl({ text = '', ariaLabel = null as string | null, imgAlts = [] as string[] } = {}) {
    return {
      textContent: text,
      getAttribute: (name: string) => (name === 'aria-label' ? ariaLabel : null),
      querySelectorAll: () => imgAlts.map((alt) => ({ getAttribute: () => alt }))
    };
  }

  it('returns trimmed text content', () => {
    expect(linkText(fakeEl({ text: '  Shop now  ' }))).toBe('Shop now');
  });

  it('collapses interior whitespace from multi-line markup', () => {
    expect(linkText(fakeEl({ text: 'Shop\n    the\t collection ' }))).toBe('Shop the collection');
  });

  it('returns empty string when there is no accessible name at all', () => {
    expect(linkText(fakeEl())).toBe('');
  });

  it('falls back to aria-label when text content is empty', () => {
    expect(linkText(fakeEl({ ariaLabel: 'Theme fixture' }))).toBe('Theme fixture');
  });

  it('falls back to a descendant image alt when text content is empty', () => {
    expect(linkText(fakeEl({ imgAlts: ['Black tee'] }))).toBe('Black tee');
  });

  it('prefers text content over fallbacks', () => {
    expect(linkText(fakeEl({ text: 'Shop now', ariaLabel: 'nope', imgAlts: ['nope'] }))).toBe('Shop now');
  });

  it('prefers aria-label over image alt', () => {
    expect(linkText(fakeEl({ ariaLabel: 'Label', imgAlts: ['Alt'] }))).toBe('Label');
  });

  it('skips whitespace-only image alts', () => {
    expect(linkText(fakeEl({ imgAlts: ['  ', 'Black tee'] }))).toBe('Black tee');
  });
});

describe('samePageFragment', () => {
  const page = 'https://shop.com/products/tee';

  it('returns the fragment for a same-page hash link', () => {
    expect(samePageFragment('https://shop.com/products/tee#reviews', page)).toBe('reviews');
  });

  it('ignores any hash on the page URL itself', () => {
    expect(samePageFragment('https://shop.com/products/tee#reviews', `${page}#other`)).toBe('reviews');
  });

  it('returns null when the link has no fragment', () => {
    expect(samePageFragment(page, page)).toBeNull();
  });

  it('returns null for a bare trailing hash', () => {
    expect(samePageFragment(`${page}#`, page)).toBeNull();
  });

  it('returns null when the path differs', () => {
    expect(samePageFragment('https://shop.com/other#reviews', page)).toBeNull();
  });

  it('returns null when the host differs', () => {
    expect(samePageFragment('https://example.com/products/tee#reviews', page)).toBeNull();
  });

  it('returns null when the query string differs', () => {
    expect(samePageFragment('https://shop.com/products/tee?variant=2#reviews', page)).toBeNull();
  });

  it('decodes percent-encoded fragments', () => {
    expect(samePageFragment('https://shop.com/products/tee#size%20guide', page)).toBe('size guide');
  });

  it('returns the raw fragment when decoding fails', () => {
    expect(samePageFragment('https://shop.com/products/tee#100%', page)).toBe('100%');
  });

  it('returns null for unparseable URLs', () => {
    expect(samePageFragment('not a url', page)).toBeNull();
  });
});

describe('isInsecureHttp', () => {
  it('flags plain-http links', () => {
    expect(isInsecureHttp('http://example.com/old-page')).toBe(true);
  });

  it('does not flag https links', () => {
    expect(isInsecureHttp('https://example.com/')).toBe(false);
  });

  it('does not flag non-web protocols', () => {
    expect(isInsecureHttp('mailto:hello@example.com')).toBe(false);
  });

  it('does not flag localhost (a secure context)', () => {
    expect(isInsecureHttp('http://localhost:4242/')).toBe(false);
  });

  it('does not flag .localhost subdomains', () => {
    expect(isInsecureHttp('http://www.localhost:4242/')).toBe(false);
  });

  it('does not flag loopback IPs', () => {
    expect(isInsecureHttp('http://127.0.0.1/')).toBe(false);
    expect(isInsecureHttp('http://[::1]/')).toBe(false);
  });

  it('does not flag unparseable hrefs', () => {
    expect(isInsecureHttp('not a url')).toBe(false);
  });
});

describe('csvField', () => {
  it('quotes plain values', () => {
    expect(csvField('hello')).toBe('"hello"');
  });

  it('stringifies non-string values', () => {
    expect(csvField(true)).toBe('"true"');
  });

  it('escapes embedded quotes by doubling them', () => {
    expect(csvField('say "hi"')).toBe('"say ""hi"""');
  });

  it('neutralizes formula-leading characters for spreadsheet safety', () => {
    expect(csvField('=SUM(A1:A9)')).toBe('"\'=SUM(A1:A9)"');
    expect(csvField('+1234')).toBe('"\'+1234"');
    expect(csvField('-cmd')).toBe('"\'-cmd"');
    expect(csvField('@import')).toBe('"\'@import"');
  });

  it('leaves values that merely contain formula characters alone', () => {
    expect(csvField('a=b')).toBe('"a=b"');
  });
});
