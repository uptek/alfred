import { describe, expect, it } from 'bun:test';
import type { RawLink } from '../utils/types';
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

describe('isDofollow and followRank', () => {
  const link = (over: object) => ({ isNofollow: false, isSponsored: false, isUgc: false, ...over });

  // Only a link with no nofollow-class hint is dofollow. Rank orders dofollow,
  // ugc, sponsored, nofollow, and nofollow dominates when hints combine.
  it.each([
    ['no hints', {}, true, 0],
    ['ugc', { isUgc: true }, false, 1],
    ['sponsored', { isSponsored: true }, false, 2],
    ['nofollow', { isNofollow: true }, false, 3],
    ['nofollow + sponsored', { isNofollow: true, isSponsored: true }, false, 3],
    ['nofollow + ugc', { isNofollow: true, isUgc: true }, false, 3]
  ])('%s: dofollow %p, rank %p', (_, over, dofollow, rank) => {
    expect(isDofollow(link(over))).toBe(dofollow);
    expect(followRank(link(over))).toBe(rank);
  });
});

describe('classifyLink', () => {
  it.each([
    ['https://shop.com/collections/all', 'shop.com', 'internal'],
    ['https://example.com/', 'shop.com', 'external'],
    ['https://www.shop.com/', 'shop.com', 'internal'], // www variant of the page host
    ['https://shop.com/', 'www.shop.com', 'internal'], // bare host when the page is on www
    ['https://blog.shop.com/', 'shop.com', 'external'], // other subdomains stay external
    ['https://SHOP.com/', 'shop.com', 'internal'], // hosts compare case-insensitively
    ['http://shop.com/old', 'shop.com', 'internal'],
    ['mailto:hello@example.com', 'shop.com', 'mailto'],
    ['tel:+15551234567', 'shop.com', 'tel'],
    ['javascript:void(0)', 'shop.com', 'other'],
    ['ftp://shop.com/file', 'shop.com', 'other'],
    ['not a url', 'shop.com', 'other']
  ])('classifies %s on %s as %s', (href, host, kind) => {
    expect(classifyLink(href, host)).toBe(kind);
  });
});

describe('relFlags', () => {
  it.each([
    ['', false, false, false],
    ['nofollow', true, false, false],
    ['sponsored', false, true, false],
    ['ugc', false, false, true],
    ['noopener sponsored nofollow', true, true, false],
    ['NoFollow UGC', true, false, true], // case-insensitive
    ['nofollower sponsoredx fugc', false, false, false] // partial tokens do not match
  ])('reads %p as nofollow %p, sponsored %p, ugc %p', (rel, nofollow, sponsored, ugc) => {
    expect(relFlags(rel)).toEqual({ nofollow, sponsored, ugc });
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

  it.each([
    ['trims and collapses whitespace', { text: '  Shop\n    the\t collection ' }, 'Shop the collection'],
    ['returns empty string with no accessible name at all', {}, ''],
    ['prefers text content over fallbacks', { text: 'Shop now', ariaLabel: 'nope', imgAlts: ['nope'] }, 'Shop now'],
    ['falls back to aria-label before image alt', { ariaLabel: 'Label', imgAlts: ['Alt'] }, 'Label'],
    ['falls back to the first non-blank image alt', { imgAlts: ['  ', 'Black tee'] }, 'Black tee']
  ])('%s', (_, el, expected) => {
    expect(linkText(fakeEl(el))).toBe(expected);
  });
});

const PAGE = 'https://shop.com/products/tee';

describe('samePageFragment', () => {
  it.each([
    [`${PAGE}#reviews`, PAGE, 'reviews'],
    [`${PAGE}#reviews`, `${PAGE}#other`, 'reviews'], // the page URL's own hash is ignored
    [PAGE, PAGE, null], // no fragment
    [`${PAGE}#`, PAGE, null], // bare trailing hash
    ['https://shop.com/other#reviews', PAGE, null], // path differs
    ['https://example.com/products/tee#reviews', PAGE, null], // host differs
    [`${PAGE}?variant=2#reviews`, PAGE, null], // query differs
    [`${PAGE}#size%20guide`, PAGE, 'size guide'], // decoded
    [`${PAGE}#100%`, PAGE, '100%'], // raw when decoding fails
    ['not a url', PAGE, null]
  ])('reads %s on %s as %p', (href, page, expected) => {
    expect(samePageFragment(href, page)).toBe(expected);
  });
});

describe('isBrokenAnchor', () => {
  const targets = (ids: string[] = [], names: string[] = []) => ({
    hasId: (id: string) => ids.includes(id),
    hasNamedAnchor: (name: string) => names.includes(name)
  });

  it.each([
    ['flags a same-page fragment with no matching target', `${PAGE}#nowhere`, targets(), true],
    ['accepts a fragment matching an element id', `${PAGE}#reviews`, targets(['reviews']), false],
    ['accepts a fragment matching a legacy named anchor', `${PAGE}#reviews`, targets([], ['reviews']), false],
    ['exempts #top, which scrolls to the document top with no target', `${PAGE}#top`, targets(), false],
    ['still resolves #top through a real target', `${PAGE}#top`, targets(['top']), false],
    ['does not exempt other casings of top', `${PAGE}#Top`, targets(), true],
    ['never flags a bare href="#"', `${PAGE}#`, targets(), false],
    ['never flags a link to another path', 'https://shop.com/other#nowhere', targets(), false],
    ['never flags a link to another host', 'https://example.com/#nowhere', targets(), false],
    ['never flags a link with another query', `${PAGE}?variant=2#nowhere`, targets(), false],
    ['never flags a link with no fragment at all', PAGE, targets(), false],
    ['matches the decoded fragment', `${PAGE}#size%20guide`, targets(['size guide']), false],
    ['does not match the percent-encoded fragment', `${PAGE}#size%20guide`, targets(['size%20guide']), true]
  ])('%s', (_, href, lookups, broken) => {
    expect(isBrokenAnchor(href, PAGE, lookups)).toBe(broken);
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
  it.each([
    ['http://example.com/old-page', true],
    ['https://example.com/', false],
    ['mailto:hello@example.com', false],
    // Loopback hosts are secure contexts even over http.
    ['http://localhost:4242/', false],
    ['http://www.localhost:4242/', false],
    ['http://127.0.0.1/', false],
    ['http://[::1]/', false],
    ['not a url', false]
  ])('flags %s: %p', (href, insecure) => {
    expect(isInsecureHttp(href)).toBe(insecure);
  });
});

describe('summarizeLinks', () => {
  const link = (over: Partial<RawLink> = {}) => ({ kind: 'internal', ...over }) as RawLink;
  const NO_STATUS = new Map();
  const texts = (items: { text: string }[]) => items.map((i) => i.text);

  it('leads with the row count and external total, suppressing every defect count at zero', () => {
    expect(texts(summarizeLinks([], NO_STATUS))).toEqual(['0 links', '0 external']);
    expect(texts(summarizeLinks([link()], NO_STATUS))).toEqual(['1 link', '0 external']);
    expect(texts(summarizeLinks([link(), link({ kind: 'external' })], NO_STATUS))).toEqual(['2 links', '1 external']);
  });

  it('counts sponsored and ugc as nofollow-class hints in an untoned, titled item', () => {
    const links = [link({ isNofollow: true }), link({ isSponsored: true }), link({ isUgc: true }), link()];
    expect(summarizeLinks(links, NO_STATUS)[2]).toEqual({
      text: '3 nofollow',
      title: 'Links carrying nofollow, sponsored, or ugc hints'
    });
  });

  it('warns on insecure http and errors on broken fragments', () => {
    const items = summarizeLinks([link({ isInsecure: true, isBrokenAnchor: true })], NO_STATUS);
    expect(items.slice(2)).toMatchObject([
      { text: '1 insecure http', tone: 'warn' },
      { text: '1 broken #', tone: 'err' }
    ]);
  });

  it('warns on redirects and errors on 4xx, 5xx, or unreachable, ignoring ok and unchecked links', () => {
    const buckets = ['ok', 'redirect', 'client-error', 'server-error', 'error'] as const;
    const statuses = new Map(buckets.map((bucket) => [bucket, { status: 0, bucket }]));
    const links = [...buckets, 'unchecked'].map((href) => link({ href }));
    expect(summarizeLinks(links, statuses).slice(2)).toMatchObject([
      { text: '1 redirect', tone: 'warn' },
      { text: '3 failing', tone: 'err' }
    ]);
    expect(summarizeLinks([link({ href: 'ok' })], statuses)).toHaveLength(2);
  });
});
