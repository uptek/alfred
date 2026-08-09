import { describe, expect, it } from 'bun:test';
import type { LinkStatusBucket, LinkStatusResult, RawLink } from '../utils/types';
import {
  classifyLink,
  followRank,
  isBrokenAnchor,
  isDofollow,
  isInsecureHttp,
  linkText,
  relFlags,
  samePageFragment,
  summarizeLinks
} from '../utils/links';

describe('isDofollow', () => {
  const link = (over: Partial<{ isNofollow: boolean; isSponsored: boolean; isUgc: boolean }>) => ({
    isNofollow: false,
    isSponsored: false,
    isUgc: false,
    ...over
  });

  it('passes follow equity only without any nofollow-class hint', () => {
    expect(isDofollow(link({}))).toBe(true);
  });

  it('nofollow, sponsored, and ugc each break dofollow', () => {
    expect(isDofollow(link({ isNofollow: true }))).toBe(false);
    expect(isDofollow(link({ isSponsored: true }))).toBe(false);
    expect(isDofollow(link({ isUgc: true }))).toBe(false);
  });

  it('combined hints stay nofollow', () => {
    expect(isDofollow(link({ isNofollow: true, isSponsored: true }))).toBe(false);
  });

  it('ranks dofollow, ugc, sponsored, nofollow in that order', () => {
    expect(followRank(link({}))).toBe(0);
    expect(followRank(link({ isUgc: true }))).toBe(1);
    expect(followRank(link({ isSponsored: true }))).toBe(2);
    expect(followRank(link({ isNofollow: true }))).toBe(3);
  });

  it('nofollow dominates the rank when hints combine', () => {
    expect(followRank(link({ isNofollow: true, isUgc: true }))).toBe(3);
  });
});

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

describe('isBrokenAnchor', () => {
  const PAGE = 'https://shop.com/products/tee';

  const targets = (ids: string[] = [], names: string[] = []) => ({
    hasId: (id: string) => ids.includes(id),
    hasNamedAnchor: (name: string) => names.includes(name)
  });

  it('flags a same-page fragment with no matching target', () => {
    expect(isBrokenAnchor(`${PAGE}#nowhere`, PAGE, targets())).toBe(true);
  });

  it('accepts a fragment matching an element id', () => {
    expect(isBrokenAnchor(`${PAGE}#reviews`, PAGE, targets(['reviews']))).toBe(false);
  });

  it('accepts a fragment matching a legacy named anchor', () => {
    expect(isBrokenAnchor(`${PAGE}#reviews`, PAGE, targets([], ['reviews']))).toBe(false);
  });

  it('exempts #top, which scrolls to the document top with no target', () => {
    expect(isBrokenAnchor(`${PAGE}#top`, PAGE, targets())).toBe(false);
  });

  it('still resolves #top through a real target when one exists', () => {
    expect(isBrokenAnchor(`${PAGE}#top`, PAGE, targets(['top']))).toBe(false);
  });

  it('does not exempt other casings of top', () => {
    expect(isBrokenAnchor(`${PAGE}#Top`, PAGE, targets())).toBe(true);
  });

  it('never flags a bare href="#"', () => {
    expect(isBrokenAnchor(`${PAGE}#`, PAGE, targets())).toBe(false);
  });

  it('never flags a link that points off this page', () => {
    expect(isBrokenAnchor('https://shop.com/other#nowhere', PAGE, targets())).toBe(false);
    expect(isBrokenAnchor('https://example.com/#nowhere', PAGE, targets())).toBe(false);
    expect(isBrokenAnchor(`${PAGE}?variant=2#nowhere`, PAGE, targets())).toBe(false);
  });

  it('never flags a link with no fragment at all', () => {
    expect(isBrokenAnchor(PAGE, PAGE, targets())).toBe(false);
  });

  it('matches the decoded fragment, not the percent-encoded one', () => {
    expect(isBrokenAnchor(`${PAGE}#size%20guide`, PAGE, targets(['size guide']))).toBe(false);
    expect(isBrokenAnchor(`${PAGE}#size%20guide`, PAGE, targets(['size%20guide']))).toBe(true);
  });

  it('does not consult the name index when an id already matched', () => {
    let consulted = false;
    isBrokenAnchor(`${PAGE}#reviews`, PAGE, {
      hasId: () => true,
      hasNamedAnchor: () => {
        consulted = true;
        return false;
      }
    });
    expect(consulted).toBe(false);
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

describe('summarizeLinks', () => {
  const link = (over: Partial<RawLink>): RawLink =>
    ({
      index: 0,
      href: 'https://example.com/a',
      text: 'a',
      rel: '',
      kind: 'internal',
      isNofollow: false,
      isSponsored: false,
      isUgc: false,
      isImage: false,
      isHidden: false,
      isInsecure: false,
      isBrokenAnchor: false,
      ...over
    }) as RawLink;

  const status = (bucket: LinkStatusBucket): LinkStatusResult => ({ status: 0, bucket });
  const NO_STATUS = new Map<string, LinkStatusResult>();

  const texts = (items: { text: string }[]) => items.map((i) => i.text);

  it('always leads with the row count and external total', () => {
    expect(texts(summarizeLinks([link({}), link({ kind: 'external' })], NO_STATUS))).toEqual(['2 links', '1 external']);
  });

  it('uses the singular noun for one link', () => {
    expect(summarizeLinks([link({})], NO_STATUS)[0]?.text).toBe('1 link');
  });

  it('keeps the plural noun for an empty list', () => {
    expect(texts(summarizeLinks([], NO_STATUS))).toEqual(['0 links', '0 external']);
  });

  it('suppresses every defect count at zero', () => {
    expect(summarizeLinks([link({})], NO_STATUS)).toHaveLength(2);
  });

  it('counts sponsored and ugc as nofollow-class hints', () => {
    const links = [link({ isNofollow: true }), link({ isSponsored: true }), link({ isUgc: true }), link({})];
    expect(texts(summarizeLinks(links, NO_STATUS))).toContain('3 nofollow');
  });

  it('leaves the nofollow item untoned but titled', () => {
    const item = summarizeLinks([link({ isNofollow: true })], NO_STATUS).find((i) => i.text === '1 nofollow');
    expect(item?.tone).toBeUndefined();
    expect(item?.title).toBe('Links carrying nofollow, sponsored, or ugc hints');
  });

  it('warns on insecure http and errors on broken fragments', () => {
    const items = summarizeLinks([link({ isInsecure: true, isBrokenAnchor: true })], NO_STATUS);
    expect(items.find((i) => i.text === '1 insecure http')?.tone).toBe('warn');
    expect(items.find((i) => i.text === '1 broken #')?.tone).toBe('err');
  });

  it('warns on redirects', () => {
    const statuses = new Map([['https://example.com/a', status('redirect')]]);
    expect(summarizeLinks([link({})], statuses).find((i) => i.text === '1 redirect')?.tone).toBe('warn');
  });

  it('folds 4xx, 5xx, and unreachable into one failing count', () => {
    const links = [
      link({ href: 'https://example.com/1' }),
      link({ href: 'https://example.com/2' }),
      link({ href: 'https://example.com/3' })
    ];
    const statuses = new Map([
      ['https://example.com/1', status('client-error')],
      ['https://example.com/2', status('server-error')],
      ['https://example.com/3', status('error')]
    ]);
    expect(summarizeLinks(links, statuses).find((i) => i.text === '3 failing')?.tone).toBe('err');
  });

  it('ignores links that came back ok', () => {
    const statuses = new Map([['https://example.com/a', status('ok')]]);
    expect(summarizeLinks([link({})], statuses)).toHaveLength(2);
  });

  it('ignores links that were never checked', () => {
    expect(summarizeLinks([link({ href: 'https://example.com/unchecked' })], NO_STATUS)).toHaveLength(2);
  });
});
