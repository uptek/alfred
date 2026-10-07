import { describe, expect, it } from 'bun:test';
import { badgeCount, graphemeSlice, lintSocial, previewModel, probeTargetUrl, resolveSocial } from '../utils/social';
import type { SocialFinding, SocialPlatform, SocialProbeResult } from '../utils/social';
import type { RawSocialMeta } from '../utils/types';

const IMG = 'https://cdn.example.com/a.jpg';
const PAGE = 'https://shop.example.com/products/widget';
const ALL: SocialPlatform[] = ['facebook', 'x', 'linkedin'];

const meta = (attr: 'property' | 'name', key: string, value: string): RawSocialMeta => ({ attr, key, value });
const og = (key: string, value: string) => meta('property', `og:${key}`, value);
const tw = (key: string, value: string) => meta('name', `twitter:${key}`, value);

const resolve = (...metas: RawSocialMeta[]) =>
  resolveSocial({ metas, fallbackTitle: 'Fallback Title', fallbackDescription: 'Fallback description', pageUrl: PAGE });

// An og:image with declared dimensions, optionally under a twitter:card.
const sized = (width: number, height: number, card?: string): RawSocialMeta[] => [
  ...(card ? [tw('card', card)] : []),
  og('image', IMG),
  og('image:width', String(width)),
  og('image:height', String(height))
];

const fullMetas: RawSocialMeta[] = [
  og('title', 'Widget'),
  og('description', 'A great widget'),
  og('url', PAGE),
  og('type', 'product'),
  og('image', IMG),
  og('image:secure_url', IMG),
  og('image:width', '1200'),
  og('image:height', '630'),
  og('image:type', 'image/jpeg'),
  og('image:alt', 'A widget'),
  meta('property', 'fb:app_id', '12345')
];

const ids = (metas: RawSocialMeta[], probe: SocialProbeResult | null = null): string[] =>
  lintSocial(resolve(...metas), probe).map((f) => f.id);

describe('resolveSocial', () => {
  it('resolves a full tag set, attaching structured image properties to the og:image root', () => {
    expect(resolve(...fullMetas)).toEqual({
      og: { title: 'Widget', description: 'A great widget', url: PAGE, type: 'product' },
      images: [
        { url: IMG, secureUrl: IMG, declaredWidth: 1200, declaredHeight: 630, mimeType: 'image/jpeg', alt: 'A widget' }
      ],
      twitter: {},
      fbAppId: '12345',
      fallbacks: { title: 'Fallback Title', description: 'Fallback description', url: PAGE },
      duplicateCounts: {},
      hasAnyTags: true
    });
  });

  it('starts a new image on og:image:url and keeps images in order', () => {
    const b = 'https://cdn.example.com/b.jpg';
    const { images } = resolve(
      og('image', IMG),
      og('image:width', '100'),
      og('image:url', b),
      og('image:width', '200')
    );
    expect(images).toEqual([
      { url: IMG, declaredWidth: 100 },
      { url: b, declaredWidth: 200 }
    ]);
  });

  it('ignores a structured image property with no preceding root', () => {
    expect(resolve(og('image:width', '800'), og('image:height', '600')).images).toEqual([]);
  });

  it('treats non-numeric width and height as undefined', () => {
    expect(resolve(og('image', IMG), og('image:width', 'auto'), og('image:height', '')).images).toEqual([{ url: IMG }]);
  });

  it('reads twitter tags by name or property attr', () => {
    const { twitter } = resolve(
      tw('card', 'summary_large_image'),
      meta('property', 'twitter:title', 'Widget on X'),
      tw('description', 'Widget desc'),
      meta('property', 'twitter:image', 'https://cdn.example.com/x.jpg')
    );
    expect(twitter).toEqual({
      card: 'summary_large_image',
      title: 'Widget on X',
      description: 'Widget desc',
      image: 'https://cdn.example.com/x.jpg'
    });
  });

  it('sets hasAnyTags false when no og/twitter metas exist', () => {
    expect(resolve(meta('name', 'description', 'irrelevant')).hasAnyTags).toBe(false);
  });

  it('counts duplicated keys, with each og:image root as one occurrence', () => {
    const { duplicateCounts } = resolve(
      og('title', 'First'),
      og('title', 'Second'),
      og('title', 'Third'),
      og('image', IMG),
      og('image', 'https://cdn.example.com/b.jpg')
    );
    expect(duplicateCounts).toEqual({ 'og:title': 3, 'og:image': 2 });
  });
});

describe('probeTargetUrl', () => {
  it.each<[string, RawSocialMeta[], string | null]>([
    ['null with no images', [], null],
    ['secure_url over url', [og('image', 'http://cdn.example.com/a.jpg'), og('image:secure_url', IMG)], IMG],
    ['an absolute url unchanged', [og('image', IMG)], IMG],
    ['a relative url against the page url', [og('image', '/images/a.jpg')], 'https://shop.example.com/images/a.jpg'],
    ['null for a javascript: url', [og('image', 'javascript:alert(1)')], null],
    ['null for a data: url', [og('image', 'data:image/png;base64,AAAA')], null]
  ])('returns %s', (_, metas, expected) => {
    expect(probeTargetUrl(resolve(...metas))).toBe(expected);
  });
});

describe('graphemeSlice', () => {
  const family = '👨‍👩‍👧‍👦';

  it.each<[string, string, number, string]>([
    ['keeps text shorter than max', 'hello', 10, 'hello'],
    ['keeps text exactly max long', 'abcde', 5, 'abcde'],
    ['slices ASCII text at the boundary', 'hello world', 5, 'hello'],
    ['does not split an emoji ZWJ family sequence', `a${family}b`, 2, `a${family}`],
    ['does not split a combining mark from its base', 'éx', 1, 'é']
  ])('%s', (_, text, max, expected) => {
    expect(graphemeSlice(text, max)).toBe(expected);
  });
});

describe('lintSocial', () => {
  const lone = [og('image', IMG)];

  it.each<[string, RawSocialMeta[], string[], SocialProbeResult?]>([
    ['no tags', [], ['no-social-tags']],
    [
      'only og:title',
      [og('title', 'Widget')],
      ['missing-og-description', 'missing-og-image', 'missing-og-url', 'missing-og-type', 'fb-app-id-missing']
    ],
    [
      'a lone https og:image with no dimensions',
      lone,
      ['missing-og-title', 'missing-og-description', 'missing-og-url', 'missing-og-type', 'fb-app-id-missing']
    ],
    ['the full tag set', fullMetas, ['og-type-product']],
    [
      'the full tag set with a matching probe',
      fullMetas,
      ['og-type-product'],
      { status: 'ok', width: 1200, height: 630 }
    ]
  ])('emits exactly the expected findings for %s', (_, metas, expected, probe = null) => {
    expect(ids(metas, probe)).toEqual(expected);
  });

  it.each<[string, string, RawSocialMeta[], Partial<SocialFinding>, SocialProbeResult?]>([
    ['no-social-tags', 'no tags', [], { severity: 'error', platforms: ALL }],
    [
      'fb-app-id-missing',
      'tags without fb:app_id',
      [og('title', 'Widget')],
      { severity: 'info', platforms: ['facebook'] }
    ],
    [
      'og-image-insecure',
      'an http image',
      [og('image', 'http://cdn.example.com/a.jpg')],
      { severity: 'warning', platforms: ALL }
    ],
    ['og-image-relative', 'a schemeless url', [og('image', '/images/a.jpg')], { severity: 'warning' }],
    [
      'og-image-multiple',
      'three roots',
      [og('image', IMG), og('image', 'https://cdn.example.com/b.jpg'), og('image', 'https://cdn.example.com/c.jpg')],
      { severity: 'info', message: expect.stringContaining('3') }
    ],
    [
      'og-image-svg',
      'an svg mime type',
      [og('image', 'https://cdn.example.com/a.png'), og('image:type', 'image/svg+xml')],
      {}
    ],
    ['og-image-svg', 'a .svg extension', [og('image', 'https://cdn.example.com/a.svg')], {}],
    [
      'description-overflow',
      '350 graphemes',
      [og('description', 'a'.repeat(350))],
      { severity: 'warning', platforms: ['facebook'], message: expect.stringContaining('350') }
    ],
    ['entity-double-encoded', 'a named entity', [og('title', 'Salt &amp; Pepper')], { severity: 'warning' }],
    ['entity-double-encoded', 'a numeric reference', [og('title', 'Caf&#233;')], {}],
    [
      'twitter-image-fallback',
      'a card with only og:image',
      [tw('card', 'summary'), og('image', IMG)],
      { platforms: ['x'] }
    ],
    [
      'og-type-product',
      'og:type product',
      [og('type', 'product')],
      { severity: 'info', platforms: ['linkedin', 'facebook'] }
    ],
    [
      'declared-dimensions-mismatch',
      'probe dims that differ from declared',
      sized(1200, 630),
      { severity: 'warning', fromProbe: true },
      { status: 'ok', width: 800, height: 600 }
    ],
    ['image-unloadable', 'a probe error', lone, { severity: 'error', fromProbe: true }, { status: 'error' }],
    ['image-unverified', 'a probe timeout', lone, { severity: 'info', fromProbe: true }, { status: 'timeout' }],
    [
      'image-too-small',
      'probe dims under 200x200',
      lone,
      { severity: 'warning', platforms: ['facebook', 'x'], fromProbe: true },
      { status: 'ok', width: 150, height: 150 }
    ],
    [
      'image-too-small',
      'a large card under 300x157',
      sized(250, 100, 'summary_large_image'),
      { platforms: ['facebook', 'x'], fromProbe: false }
    ],
    ['image-too-small', 'a summary card under 144x144', sized(100, 100, 'summary'), { platforms: ['facebook', 'x'] }],
    ['image-too-small', 'a summary card above 144x144', sized(150, 150, 'summary'), { platforms: ['facebook'] }],
    ['image-ratio-square', 'a square image', sized(1000, 1000), { platforms: ['facebook', 'linkedin'] }],
    [
      'image-ratio-square',
      'a square large card',
      sized(1000, 1000, 'summary_large_image'),
      { platforms: ['facebook', 'linkedin', 'x'] }
    ],
    ['image-ratio-square', 'a square summary card', sized(150, 150, 'summary'), { platforms: ['facebook', 'linkedin'] }]
  ])('emits %s for %s', (id, _, metas, expected, probe = null) => {
    expect(lintSocial(resolve(...metas), probe).find((f) => f.id === id)).toMatchObject(expected);
  });

  it.each<[string, string, RawSocialMeta[]]>([
    [
      'og-image-insecure',
      'secure_url is present',
      [og('image', 'http://cdn.example.com/a.jpg'), og('image:secure_url', IMG)]
    ],
    ['og-image-insecure', 'the http image is on localhost', [og('image', 'http://localhost:4242/a.jpg')]],
    ['description-overflow', 'the description is exactly 300 graphemes', [og('description', 'a'.repeat(300))]],
    ['entity-double-encoded', 'text has a bare ampersand', [og('title', 'Salt & Pepper')]],
    ['twitter-image-fallback', 'twitter:image is set', [tw('card', 'summary'), tw('image', IMG), og('image', IMG)]],
    ['og-type-product', 'og:type is article', [og('type', 'article')]]
  ])('omits %s when %s', (id, _, metas) => {
    expect(ids(metas)).not.toContain(id);
  });
});

describe('badgeCount', () => {
  it('counts one no-social-tags error when no tags exist', () => {
    expect(badgeCount(resolve())).toBe(1);
  });

  it('counts each missing-tag error when some tags exist', () => {
    expect(badgeCount(resolve(og('title', 'Widget')))).toBe(4);
  });

  it('ignores info findings and probe-derived errors', () => {
    const resolved = resolve(...fullMetas);
    expect(lintSocial(resolved, { status: 'error' }).map((f) => f.id)).toEqual(['og-type-product', 'image-unloadable']);
    expect(badgeCount(resolved)).toBe(0);
  });
});

describe('previewModel', () => {
  it.each<SocialPlatform>(ALL)(
    'falls back to the page title, description and url on %s when no tags exist',
    (platform) => {
      expect(previewModel(resolve(), platform)).toEqual({
        title: 'Fallback Title',
        description: 'Fallback description',
        domain: 'shop.example.com',
        imageUrl: null,
        cardType: 'bare',
        inferred: true
      });
    }
  );

  it('uses twitter tags on x and og tags elsewhere, with the og:url domain', () => {
    const resolved = resolve(
      og('title', 'OG Title'),
      og('description', 'OG Description'),
      og('url', 'https://og.example.com/page'),
      og('image', 'https://cdn.example.com/og.jpg'),
      tw('title', 'Twitter Title'),
      tw('description', 'Twitter Description'),
      tw('image', 'https://cdn.example.com/tw.jpg')
    );
    const shared = { domain: 'og.example.com', cardType: 'large', inferred: false };
    expect(previewModel(resolved, 'x')).toEqual({
      ...shared,
      title: 'Twitter Title',
      description: 'Twitter Description',
      imageUrl: 'https://cdn.example.com/tw.jpg'
    });
    const ogPreview = {
      ...shared,
      title: 'OG Title',
      description: 'OG Description',
      imageUrl: 'https://cdn.example.com/og.jpg'
    };
    expect(previewModel(resolved, 'facebook')).toEqual(ogPreview);
    expect(previewModel(resolved, 'linkedin')).toEqual(ogPreview);
  });

  it.each([
    ['summary', 'small'],
    ['summary_large_image', 'large']
  ])('maps twitter:card %s to a %s x card', (card, cardType) => {
    expect(previewModel(resolve(tw('card', card), og('image', IMG)), 'x').cardType).toBe(cardType);
  });

  it('resolves a relative twitter:image against the page url', () => {
    expect(previewModel(resolve(tw('image', '/x.jpg')), 'x').imageUrl).toBe('https://shop.example.com/x.jpg');
  });

  it('drops a non-http twitter:image and falls back to a bare x card', () => {
    const preview = previewModel(resolve(tw('card', 'summary_large_image'), tw('image', 'javascript:alert(1)')), 'x');
    expect(preview).toMatchObject({ imageUrl: null, cardType: 'bare' });
  });
});
