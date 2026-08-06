import { describe, expect, it } from 'bun:test';
import { badgeCount, graphemeSlice, lintSocial, previewModel, probeTargetUrl, resolveSocial } from '../utils/social';
import type { ResolvedSocial, SocialFinding, SocialProbeResult } from '../utils/social';
import type { RawSocial, RawSocialMeta } from '../utils/types';

const meta = (attr: 'property' | 'name', key: string, value: string): RawSocialMeta => ({
  attr,
  key,
  value
});

const baseRaw = (over: Partial<RawSocial> = {}): RawSocial => ({
  metas: [],
  fallbackTitle: 'Fallback Title',
  fallbackDescription: 'Fallback description',
  pageUrl: 'https://shop.example.com/products/widget',
  ...over
});

const fullMetas: RawSocialMeta[] = [
  meta('property', 'og:title', 'Widget'),
  meta('property', 'og:description', 'A great widget'),
  meta('property', 'og:url', 'https://shop.example.com/products/widget'),
  meta('property', 'og:type', 'product'),
  meta('property', 'og:image', 'https://cdn.example.com/widget.jpg'),
  meta('property', 'og:image:secure_url', 'https://cdn.example.com/widget.jpg'),
  meta('property', 'og:image:width', '1200'),
  meta('property', 'og:image:height', '630'),
  meta('property', 'fb:app_id', '12345')
];

const findingIds = (findings: SocialFinding[]): string[] => findings.map((f) => f.id);

describe('resolveSocial', () => {
  it('parses simple og and twitter tags', () => {
    const resolved = resolveSocial(baseRaw({ metas: fullMetas }));
    expect(resolved.og.title).toBe('Widget');
    expect(resolved.og.description).toBe('A great widget');
    expect(resolved.og.url).toBe('https://shop.example.com/products/widget');
    expect(resolved.og.type).toBe('product');
    expect(resolved.fbAppId).toBe('12345');
    expect(resolved.hasAnyTags).toBe(true);
  });

  it('associates structured image properties with the preceding og:image root', () => {
    const resolved = resolveSocial(
      baseRaw({
        metas: [
          meta('property', 'og:image', 'https://cdn.example.com/a.jpg'),
          meta('property', 'og:image:secure_url', 'https://cdn.example.com/a.jpg'),
          meta('property', 'og:image:width', '800'),
          meta('property', 'og:image:height', '600'),
          meta('property', 'og:image:type', 'image/jpeg'),
          meta('property', 'og:image:alt', 'A widget')
        ]
      })
    );
    expect(resolved.images).toEqual([
      {
        url: 'https://cdn.example.com/a.jpg',
        secureUrl: 'https://cdn.example.com/a.jpg',
        declaredWidth: 800,
        declaredHeight: 600,
        mimeType: 'image/jpeg',
        alt: 'A widget'
      }
    ]);
  });

  it('starts a new image on og:image:url and keeps two images in order', () => {
    const resolved = resolveSocial(
      baseRaw({
        metas: [
          meta('property', 'og:image', 'https://cdn.example.com/a.jpg'),
          meta('property', 'og:image:width', '100'),
          meta('property', 'og:image:url', 'https://cdn.example.com/b.jpg'),
          meta('property', 'og:image:width', '200')
        ]
      })
    );
    expect(resolved.images.length).toBe(2);
    expect(resolved.images[0]).toEqual({ url: 'https://cdn.example.com/a.jpg', declaredWidth: 100 });
    expect(resolved.images[1]).toEqual({ url: 'https://cdn.example.com/b.jpg', declaredWidth: 200 });
  });

  it('ignores a structured image property with no preceding root', () => {
    const resolved = resolveSocial(
      baseRaw({
        metas: [meta('property', 'og:image:width', '800'), meta('property', 'og:image:height', '600')]
      })
    );
    expect(resolved.images).toEqual([]);
  });

  it('treats non-numeric width and height as undefined', () => {
    const resolved = resolveSocial(
      baseRaw({
        metas: [
          meta('property', 'og:image', 'https://cdn.example.com/a.jpg'),
          meta('property', 'og:image:width', 'auto'),
          meta('property', 'og:image:height', '')
        ]
      })
    );
    expect(resolved.images[0]!.declaredWidth).toBeUndefined();
    expect(resolved.images[0]!.declaredHeight).toBeUndefined();
  });

  it('reads twitter tags by name or property attr', () => {
    const resolved = resolveSocial(
      baseRaw({
        metas: [
          meta('name', 'twitter:card', 'summary_large_image'),
          meta('property', 'twitter:title', 'Widget on X'),
          meta('name', 'twitter:description', 'Widget desc'),
          meta('property', 'twitter:image', 'https://cdn.example.com/x.jpg')
        ]
      })
    );
    expect(resolved.twitter).toEqual({
      card: 'summary_large_image',
      title: 'Widget on X',
      description: 'Widget desc',
      image: 'https://cdn.example.com/x.jpg'
    });
  });

  it('sets hasAnyTags false when no og/twitter metas exist', () => {
    const resolved = resolveSocial(baseRaw({ metas: [meta('name', 'description', 'irrelevant')] }));
    expect(resolved.hasAnyTags).toBe(false);
  });

  it('counts duplicate simple keys', () => {
    const resolved = resolveSocial(
      baseRaw({
        metas: [
          meta('property', 'og:title', 'First'),
          meta('property', 'og:title', 'Second'),
          meta('property', 'og:title', 'Third')
        ]
      })
    );
    expect(resolved.duplicateCounts['og:title']).toBe(3);
  });

  it('counts multiple og:image roots as a single duplicated key', () => {
    const resolved = resolveSocial(
      baseRaw({
        metas: [
          meta('property', 'og:image', 'https://cdn.example.com/a.jpg'),
          meta('property', 'og:image', 'https://cdn.example.com/b.jpg')
        ]
      })
    );
    expect(resolved.duplicateCounts['og:image']).toBe(2);
  });

  it('does not report og:image in duplicateCounts when only one root exists', () => {
    const resolved = resolveSocial(baseRaw({ metas: [meta('property', 'og:image', 'https://cdn.example.com/a.jpg')] }));
    expect(resolved.duplicateCounts['og:image']).toBeUndefined();
  });

  it('carries fallbacks from the raw input', () => {
    const resolved = resolveSocial(baseRaw());
    expect(resolved.fallbacks).toEqual({
      title: 'Fallback Title',
      description: 'Fallback description',
      url: 'https://shop.example.com/products/widget'
    });
  });
});

describe('probeTargetUrl', () => {
  it('returns null when there are no images', () => {
    expect(probeTargetUrl(resolveSocial(baseRaw()))).toBeNull();
  });

  it('prefers secureUrl over url', () => {
    const resolved = resolveSocial(
      baseRaw({
        metas: [
          meta('property', 'og:image', 'http://cdn.example.com/a.jpg'),
          meta('property', 'og:image:secure_url', 'https://cdn.example.com/a.jpg')
        ]
      })
    );
    expect(probeTargetUrl(resolved)).toBe('https://cdn.example.com/a.jpg');
  });

  it('resolves a relative image url against the page url', () => {
    const resolved = resolveSocial(
      baseRaw({
        metas: [meta('property', 'og:image', '/images/widget.jpg')],
        pageUrl: 'https://shop.example.com/products/widget'
      })
    );
    expect(probeTargetUrl(resolved)).toBe('https://shop.example.com/images/widget.jpg');
  });

  it('returns the absolute url unchanged when already absolute', () => {
    const resolved = resolveSocial(baseRaw({ metas: [meta('property', 'og:image', 'https://cdn.example.com/a.jpg')] }));
    expect(probeTargetUrl(resolved)).toBe('https://cdn.example.com/a.jpg');
  });
});

describe('graphemeSlice', () => {
  it('returns ASCII text unchanged when within max', () => {
    expect(graphemeSlice('hello', 10)).toBe('hello');
  });

  it('slices ASCII text at the exact boundary', () => {
    expect(graphemeSlice('hello world', 5)).toBe('hello');
  });

  it('does not split an emoji ZWJ family sequence', () => {
    const family = '👨‍👩‍👧‍👦';
    const text = `a${family}b`;
    expect(graphemeSlice(text, 2)).toBe(`a${family}`);
  });

  it('does not split a combining mark from its base character', () => {
    const combining = 'é';
    const text = `${combining}x`;
    expect(graphemeSlice(text, 1)).toBe(combining);
  });

  it('returns the full text when length equals max exactly', () => {
    expect(graphemeSlice('abcde', 5)).toBe('abcde');
  });
});

describe('lintSocial', () => {
  const withoutProbe = (resolved: ResolvedSocial): SocialFinding[] => lintSocial(resolved, null);

  it('emits a single no-social-tags error when hasAnyTags is false', () => {
    const findings = withoutProbe(resolveSocial(baseRaw()));
    expect(findingIds(findings)).toEqual(['no-social-tags']);
    expect(findings[0]!.severity).toBe('error');
    expect(findings[0]!.platforms).toEqual(['facebook', 'x', 'linkedin']);
  });

  it('emits per-tag missing findings instead of no-social-tags when some tags exist', () => {
    const resolved = resolveSocial(baseRaw({ metas: [meta('property', 'og:title', 'Widget')] }));
    const findings = withoutProbe(resolved);
    expect(findingIds(findings)).not.toContain('no-social-tags');
    expect(findingIds(findings)).toContain('missing-og-description');
    expect(findingIds(findings)).toContain('missing-og-image');
    expect(findingIds(findings)).toContain('missing-og-url');
    expect(findingIds(findings)).toContain('missing-og-type');
    expect(findingIds(findings)).not.toContain('missing-og-title');
  });

  it('does not emit missing-tag findings when all core tags present', () => {
    const findings = withoutProbe(resolveSocial(baseRaw({ metas: fullMetas })));
    expect(findingIds(findings).filter((id) => id.startsWith('missing-'))).toEqual([]);
  });

  it('emits fb-app-id-missing when fb:app_id absent and tags exist', () => {
    const resolved = resolveSocial(baseRaw({ metas: [meta('property', 'og:title', 'Widget')] }));
    const findings = withoutProbe(resolved);
    const finding = findings.find((f) => f.id === 'fb-app-id-missing');
    expect(finding).toBeDefined();
    expect(finding!.severity).toBe('info');
    expect(finding!.platforms).toEqual(['facebook']);
  });

  it('does not emit fb-app-id-missing when fb:app_id present', () => {
    const findings = withoutProbe(resolveSocial(baseRaw({ metas: fullMetas })));
    expect(findingIds(findings)).not.toContain('fb-app-id-missing');
  });

  it('does not emit fb-app-id-missing when hasAnyTags is false (folded into no-social-tags)', () => {
    const findings = withoutProbe(resolveSocial(baseRaw()));
    expect(findingIds(findings)).not.toContain('fb-app-id-missing');
  });

  it('flags og-image-insecure for http without secure_url on a non-localhost host', () => {
    const resolved = resolveSocial(baseRaw({ metas: [meta('property', 'og:image', 'http://cdn.example.com/a.jpg')] }));
    const findings = withoutProbe(resolved);
    const finding = findings.find((f) => f.id === 'og-image-insecure');
    expect(finding).toBeDefined();
    expect(finding!.severity).toBe('warning');
    expect(finding!.platforms).toEqual(['facebook', 'x', 'linkedin']);
  });

  it('does not flag og-image-insecure when secure_url is present', () => {
    const resolved = resolveSocial(
      baseRaw({
        metas: [
          meta('property', 'og:image', 'http://cdn.example.com/a.jpg'),
          meta('property', 'og:image:secure_url', 'https://cdn.example.com/a.jpg')
        ]
      })
    );
    expect(findingIds(withoutProbe(resolved))).not.toContain('og-image-insecure');
  });

  it('exempts localhost http images from og-image-insecure', () => {
    const resolved = resolveSocial(baseRaw({ metas: [meta('property', 'og:image', 'http://localhost:4242/a.jpg')] }));
    expect(findingIds(withoutProbe(resolved))).not.toContain('og-image-insecure');
  });

  it('flags og-image-relative for a schemeless image url', () => {
    const resolved = resolveSocial(baseRaw({ metas: [meta('property', 'og:image', '/images/a.jpg')] }));
    const finding = withoutProbe(resolved).find((f) => f.id === 'og-image-relative');
    expect(finding).toBeDefined();
    expect(finding!.severity).toBe('warning');
  });

  it('does not flag og-image-relative for an absolute image url', () => {
    const resolved = resolveSocial(baseRaw({ metas: [meta('property', 'og:image', 'https://cdn.example.com/a.jpg')] }));
    expect(findingIds(withoutProbe(resolved))).not.toContain('og-image-relative');
  });

  it('flags og-image-multiple with count when duplicated', () => {
    const resolved = resolveSocial(
      baseRaw({
        metas: [
          meta('property', 'og:image', 'https://cdn.example.com/a.jpg'),
          meta('property', 'og:image', 'https://cdn.example.com/b.jpg'),
          meta('property', 'og:image', 'https://cdn.example.com/c.jpg')
        ]
      })
    );
    const finding = withoutProbe(resolved).find((f) => f.id === 'og-image-multiple');
    expect(finding).toBeDefined();
    expect(finding!.severity).toBe('info');
    expect(finding!.message).toContain('3');
  });

  it('does not flag og-image-multiple for a single image', () => {
    const resolved = resolveSocial(baseRaw({ metas: [meta('property', 'og:image', 'https://cdn.example.com/a.jpg')] }));
    expect(findingIds(withoutProbe(resolved))).not.toContain('og-image-multiple');
  });

  it('flags og-image-svg for image/svg+xml mime type', () => {
    const resolved = resolveSocial(
      baseRaw({
        metas: [
          meta('property', 'og:image', 'https://cdn.example.com/a.png'),
          meta('property', 'og:image:type', 'image/svg+xml')
        ]
      })
    );
    expect(findingIds(withoutProbe(resolved))).toContain('og-image-svg');
  });

  it('flags og-image-svg for a .svg url extension', () => {
    const resolved = resolveSocial(baseRaw({ metas: [meta('property', 'og:image', 'https://cdn.example.com/a.svg')] }));
    expect(findingIds(withoutProbe(resolved))).toContain('og-image-svg');
  });

  it('does not flag og-image-svg for a normal jpg', () => {
    const resolved = resolveSocial(baseRaw({ metas: [meta('property', 'og:image', 'https://cdn.example.com/a.jpg')] }));
    expect(findingIds(withoutProbe(resolved))).not.toContain('og-image-svg');
  });

  it('flags description-overflow with actual grapheme count when over 300', () => {
    const longDescription = 'a'.repeat(350);
    const resolved = resolveSocial(baseRaw({ metas: [meta('property', 'og:description', longDescription)] }));
    const finding = withoutProbe(resolved).find((f) => f.id === 'description-overflow');
    expect(finding).toBeDefined();
    expect(finding!.severity).toBe('warning');
    expect(finding!.platforms).toEqual(['facebook']);
    expect(finding!.message).toContain('350');
  });

  it('does not flag description-overflow at or under 300 graphemes', () => {
    const resolved = resolveSocial(baseRaw({ metas: [meta('property', 'og:description', 'a'.repeat(300))] }));
    expect(findingIds(withoutProbe(resolved))).not.toContain('description-overflow');
  });

  it('flags entity-double-encoded when a decoded value still contains an entity pattern', () => {
    const resolved = resolveSocial(baseRaw({ metas: [meta('property', 'og:title', 'Salt &amp; Pepper')] }));
    const finding = withoutProbe(resolved).find((f) => f.id === 'entity-double-encoded');
    expect(finding).toBeDefined();
    expect(finding!.severity).toBe('warning');
  });

  it('flags entity-double-encoded for a numeric character reference', () => {
    const resolved = resolveSocial(baseRaw({ metas: [meta('property', 'og:title', 'Caf&#233;')] }));
    expect(findingIds(withoutProbe(resolved))).toContain('entity-double-encoded');
  });

  it('does not flag entity-double-encoded for plain text', () => {
    const resolved = resolveSocial(baseRaw({ metas: [meta('property', 'og:title', 'Salt & Pepper')] }));
    expect(findingIds(withoutProbe(resolved))).not.toContain('entity-double-encoded');
  });

  it('flags twitter-image-fallback when twitter:card set but no twitter:image and og:image exists', () => {
    const resolved = resolveSocial(
      baseRaw({
        metas: [meta('name', 'twitter:card', 'summary'), meta('property', 'og:image', 'https://cdn.example.com/a.jpg')]
      })
    );
    const finding = withoutProbe(resolved).find((f) => f.id === 'twitter-image-fallback');
    expect(finding).toBeDefined();
    expect(finding!.platforms).toEqual(['x']);
  });

  it('does not flag twitter-image-fallback when twitter:image is set', () => {
    const resolved = resolveSocial(
      baseRaw({
        metas: [
          meta('name', 'twitter:card', 'summary'),
          meta('name', 'twitter:image', 'https://cdn.example.com/x.jpg'),
          meta('property', 'og:image', 'https://cdn.example.com/a.jpg')
        ]
      })
    );
    expect(findingIds(withoutProbe(resolved))).not.toContain('twitter-image-fallback');
  });

  it('flags og-type-product for facebook and linkedin', () => {
    const resolved = resolveSocial(baseRaw({ metas: [meta('property', 'og:type', 'product')] }));
    const finding = withoutProbe(resolved).find((f) => f.id === 'og-type-product');
    expect(finding).toBeDefined();
    expect(finding!.severity).toBe('info');
    expect(finding!.platforms).toEqual(['linkedin', 'facebook']);
  });

  it('does not flag og-type-product for og:type article', () => {
    const resolved = resolveSocial(baseRaw({ metas: [meta('property', 'og:type', 'article')] }));
    expect(findingIds(withoutProbe(resolved))).not.toContain('og-type-product');
  });

  it('flags declared-dimensions-mismatch when probe dims differ from declared', () => {
    const resolved = resolveSocial(
      baseRaw({
        metas: [
          meta('property', 'og:image', 'https://cdn.example.com/a.jpg'),
          meta('property', 'og:image:width', '1200'),
          meta('property', 'og:image:height', '630')
        ]
      })
    );
    const probe: SocialProbeResult = { status: 'ok', width: 800, height: 600 };
    const finding = lintSocial(resolved, probe).find((f) => f.id === 'declared-dimensions-mismatch');
    expect(finding).toBeDefined();
    expect(finding!.severity).toBe('warning');
    expect(finding!.fromProbe).toBe(true);
  });

  it('does not flag declared-dimensions-mismatch when probe dims match declared', () => {
    const resolved = resolveSocial(
      baseRaw({
        metas: [
          meta('property', 'og:image', 'https://cdn.example.com/a.jpg'),
          meta('property', 'og:image:width', '1200'),
          meta('property', 'og:image:height', '630')
        ]
      })
    );
    const probe: SocialProbeResult = { status: 'ok', width: 1200, height: 630 };
    expect(findingIds(lintSocial(resolved, probe))).not.toContain('declared-dimensions-mismatch');
  });

  it('flags image-unloadable on probe error, error severity, fromProbe true', () => {
    const resolved = resolveSocial(baseRaw({ metas: [meta('property', 'og:image', 'https://cdn.example.com/a.jpg')] }));
    const probe: SocialProbeResult = { status: 'error' };
    const finding = lintSocial(resolved, probe).find((f) => f.id === 'image-unloadable');
    expect(finding).toBeDefined();
    expect(finding!.severity).toBe('error');
    expect(finding!.fromProbe).toBe(true);
  });

  it('flags image-unverified on probe timeout, info severity, fromProbe true', () => {
    const resolved = resolveSocial(baseRaw({ metas: [meta('property', 'og:image', 'https://cdn.example.com/a.jpg')] }));
    const probe: SocialProbeResult = { status: 'timeout' };
    const finding = lintSocial(resolved, probe).find((f) => f.id === 'image-unverified');
    expect(finding).toBeDefined();
    expect(finding!.severity).toBe('info');
    expect(finding!.fromProbe).toBe(true);
  });

  it('flags image-too-small for facebook below the 200x200 hard minimum using probe dims', () => {
    const resolved = resolveSocial(baseRaw({ metas: [meta('property', 'og:image', 'https://cdn.example.com/a.jpg')] }));
    const probe: SocialProbeResult = { status: 'ok', width: 150, height: 150 };
    const finding = lintSocial(resolved, probe).find((f) => f.id === 'image-too-small');
    expect(finding).toBeDefined();
    expect(finding!.severity).toBe('warning');
    expect(finding!.platforms).toContain('facebook');
    expect(finding!.fromProbe).toBe(true);
  });

  it('flags image-too-small for x summary_large_image below 300x157 using declared dims when no probe', () => {
    const resolved = resolveSocial(
      baseRaw({
        metas: [
          meta('name', 'twitter:card', 'summary_large_image'),
          meta('property', 'og:image', 'https://cdn.example.com/a.jpg'),
          meta('property', 'og:image:width', '250'),
          meta('property', 'og:image:height', '100')
        ]
      })
    );
    const finding = lintSocial(resolved, null).find((f) => f.id === 'image-too-small');
    expect(finding).toBeDefined();
    expect(finding!.platforms).toContain('x');
    expect(finding!.fromProbe).toBe(false);
  });

  it('flags image-too-small for x summary below 144x144 but not above it', () => {
    const resolved = resolveSocial(
      baseRaw({
        metas: [
          meta('name', 'twitter:card', 'summary'),
          meta('property', 'og:image', 'https://cdn.example.com/a.jpg'),
          meta('property', 'og:image:width', '100'),
          meta('property', 'og:image:height', '100')
        ]
      })
    );
    const finding = lintSocial(resolved, null).find((f) => f.id === 'image-too-small');
    expect(finding!.platforms).toContain('x');
  });

  it('does not flag image-too-small when dims meet all thresholds', () => {
    const resolved = resolveSocial(
      baseRaw({
        metas: [
          meta('name', 'twitter:card', 'summary_large_image'),
          meta('property', 'og:image', 'https://cdn.example.com/a.jpg'),
          meta('property', 'og:image:width', '1200'),
          meta('property', 'og:image:height', '630')
        ]
      })
    );
    expect(findingIds(lintSocial(resolved, null))).not.toContain('image-too-small');
  });

  it('skips dimension-dependent rules when no probe and no declared dims', () => {
    const resolved = resolveSocial(baseRaw({ metas: [meta('property', 'og:image', 'https://cdn.example.com/a.jpg')] }));
    const findings = lintSocial(resolved, null);
    expect(findingIds(findings)).not.toContain('image-too-small');
    expect(findingIds(findings)).not.toContain('image-ratio-square');
    expect(findingIds(findings)).not.toContain('declared-dimensions-mismatch');
  });

  it('flags image-ratio-square for facebook and linkedin when square', () => {
    const resolved = resolveSocial(
      baseRaw({
        metas: [
          meta('property', 'og:image', 'https://cdn.example.com/a.jpg'),
          meta('property', 'og:image:width', '1000'),
          meta('property', 'og:image:height', '1000')
        ]
      })
    );
    const finding = lintSocial(resolved, null).find((f) => f.id === 'image-ratio-square');
    expect(finding).toBeDefined();
    expect(finding!.platforms).toEqual(['facebook', 'linkedin']);
  });

  it('includes x in image-ratio-square only for summary_large_image card', () => {
    const resolved = resolveSocial(
      baseRaw({
        metas: [
          meta('name', 'twitter:card', 'summary_large_image'),
          meta('property', 'og:image', 'https://cdn.example.com/a.jpg'),
          meta('property', 'og:image:width', '1000'),
          meta('property', 'og:image:height', '1000')
        ]
      })
    );
    const finding = lintSocial(resolved, null).find((f) => f.id === 'image-ratio-square');
    expect(finding!.platforms).toContain('x');
  });

  it('does not flag image-ratio-square for x when card is summary', () => {
    const resolved = resolveSocial(
      baseRaw({
        metas: [
          meta('name', 'twitter:card', 'summary'),
          meta('property', 'og:image', 'https://cdn.example.com/a.jpg'),
          meta('property', 'og:image:width', '150'),
          meta('property', 'og:image:height', '150')
        ]
      })
    );
    const finding = lintSocial(resolved, null).find((f) => f.id === 'image-ratio-square');
    expect(finding!.platforms).not.toContain('x');
  });

  it('does not flag image-ratio-square for a landscape image', () => {
    const resolved = resolveSocial(
      baseRaw({
        metas: [
          meta('property', 'og:image', 'https://cdn.example.com/a.jpg'),
          meta('property', 'og:image:width', '1200'),
          meta('property', 'og:image:height', '630')
        ]
      })
    );
    expect(findingIds(lintSocial(resolved, null))).not.toContain('image-ratio-square');
  });
});

describe('badgeCount', () => {
  it('counts only error-severity findings from a null-probe lint', () => {
    expect(badgeCount(resolveSocial(baseRaw({ metas: fullMetas })))).toBe(0);
  });

  it('counts 1 for no-social-tags regardless of how many tags would otherwise be missing', () => {
    expect(badgeCount(resolveSocial(baseRaw()))).toBe(1);
  });

  it('excludes probe-derived findings even when a probe result would produce errors', () => {
    const resolved = resolveSocial(baseRaw({ metas: fullMetas }));
    const withProbeErrors = lintSocial(resolved, { status: 'error' });
    expect(withProbeErrors.some((f) => f.id === 'image-unloadable')).toBe(true);
    expect(badgeCount(resolved)).toBe(0);
  });

  it('counts multiple missing-tag errors when some but not all tags are present', () => {
    const resolved = resolveSocial(baseRaw({ metas: [meta('property', 'og:title', 'Widget')] }));
    expect(badgeCount(resolved)).toBe(4);
  });
});

describe('previewModel', () => {
  it('uses twitter title/description on x when present, og otherwise', () => {
    const resolved = resolveSocial(
      baseRaw({
        metas: [
          meta('property', 'og:title', 'OG Title'),
          meta('property', 'og:description', 'OG Description'),
          meta('name', 'twitter:title', 'Twitter Title'),
          meta('name', 'twitter:description', 'Twitter Description')
        ]
      })
    );
    const x = previewModel(resolved, 'x');
    expect(x.title).toBe('Twitter Title');
    expect(x.description).toBe('Twitter Description');

    const facebook = previewModel(resolved, 'facebook');
    expect(facebook.title).toBe('OG Title');
    expect(facebook.description).toBe('OG Description');
  });

  it('falls back through og to page fallback title/description on facebook and linkedin', () => {
    const resolved = resolveSocial(baseRaw());
    const facebook = previewModel(resolved, 'facebook');
    expect(facebook.title).toBe('Fallback Title');
    expect(facebook.description).toBe('Fallback description');
    expect(facebook.inferred).toBe(true);

    const linkedin = previewModel(resolved, 'linkedin');
    expect(linkedin.title).toBe('Fallback Title');
    expect(linkedin.inferred).toBe(true);
  });

  it('falls back through twitter then og to page fallback on x', () => {
    const resolved = resolveSocial(baseRaw());
    const x = previewModel(resolved, 'x');
    expect(x.title).toBe('Fallback Title');
    expect(x.description).toBe('Fallback description');
    expect(x.inferred).toBe(true);
  });

  it('sets inferred false when both title and description come from tags', () => {
    const resolved = resolveSocial(baseRaw({ metas: fullMetas }));
    expect(previewModel(resolved, 'facebook').inferred).toBe(false);
  });

  it('derives domain from og:url, falling back to page url', () => {
    const withOgUrl = resolveSocial(baseRaw({ metas: [meta('property', 'og:url', 'https://og.example.com/page')] }));
    expect(previewModel(withOgUrl, 'facebook').domain).toBe('og.example.com');

    const withoutOgUrl = resolveSocial(baseRaw({ pageUrl: 'https://fallback.example.com/page' }));
    expect(previewModel(withoutOgUrl, 'facebook').domain).toBe('fallback.example.com');
  });

  it('prefers twitter:image over og:image on x', () => {
    const resolved = resolveSocial(
      baseRaw({
        metas: [
          meta('property', 'og:image', 'https://cdn.example.com/og.jpg'),
          meta('name', 'twitter:image', 'https://cdn.example.com/tw.jpg')
        ]
      })
    );
    expect(previewModel(resolved, 'x').imageUrl).toBe('https://cdn.example.com/tw.jpg');
    expect(previewModel(resolved, 'facebook').imageUrl).toBe('https://cdn.example.com/og.jpg');
  });

  it('resolves a relative twitter:image against the page url', () => {
    const resolved = resolveSocial(
      baseRaw({
        metas: [meta('name', 'twitter:image', '/x.jpg')],
        pageUrl: 'https://shop.example.com/page'
      })
    );
    expect(previewModel(resolved, 'x').imageUrl).toBe('https://shop.example.com/x.jpg');
  });

  it('returns null imageUrl and bare cardType when there is no image anywhere', () => {
    const resolved = resolveSocial(baseRaw());
    const facebook = previewModel(resolved, 'facebook');
    expect(facebook.imageUrl).toBeNull();
    expect(facebook.cardType).toBe('bare');
  });

  it('maps x cardType to small for twitter:card summary', () => {
    const resolved = resolveSocial(
      baseRaw({
        metas: [meta('name', 'twitter:card', 'summary'), meta('property', 'og:image', 'https://cdn.example.com/a.jpg')]
      })
    );
    expect(previewModel(resolved, 'x').cardType).toBe('small');
  });

  it('maps x cardType to large for twitter:card summary_large_image', () => {
    const resolved = resolveSocial(
      baseRaw({
        metas: [
          meta('name', 'twitter:card', 'summary_large_image'),
          meta('property', 'og:image', 'https://cdn.example.com/a.jpg')
        ]
      })
    );
    expect(previewModel(resolved, 'x').cardType).toBe('large');
  });

  it('maps x cardType to large when twitter:card absent but an image exists', () => {
    const resolved = resolveSocial(baseRaw({ metas: [meta('property', 'og:image', 'https://cdn.example.com/a.jpg')] }));
    expect(previewModel(resolved, 'x').cardType).toBe('large');
  });

  it('maps facebook and linkedin cardType to large when an image exists, bare otherwise', () => {
    const withImage = resolveSocial(
      baseRaw({ metas: [meta('property', 'og:image', 'https://cdn.example.com/a.jpg')] })
    );
    expect(previewModel(withImage, 'facebook').cardType).toBe('large');
    expect(previewModel(withImage, 'linkedin').cardType).toBe('large');

    const withoutImage = resolveSocial(baseRaw());
    expect(previewModel(withoutImage, 'facebook').cardType).toBe('bare');
    expect(previewModel(withoutImage, 'linkedin').cardType).toBe('bare');
  });
});

describe('non-http image URL rejection', () => {
  it('probeTargetUrl rejects javascript: og:image', () => {
    const resolved = resolveSocial(baseRaw({ metas: [meta('property', 'og:image', 'javascript:alert(1)')] }));
    expect(probeTargetUrl(resolved)).toBeNull();
  });

  it('probeTargetUrl rejects data: og:image but keeps https', () => {
    const rejected = resolveSocial(baseRaw({ metas: [meta('property', 'og:image', 'data:image/png;base64,AAAA')] }));
    expect(probeTargetUrl(rejected)).toBeNull();
    const kept = resolveSocial(baseRaw({ metas: [meta('property', 'og:image', 'https://cdn.example.com/a.png')] }));
    expect(probeTargetUrl(kept)).toBe('https://cdn.example.com/a.png');
  });

  it('previewModel drops non-http twitter:image and falls back to bare card', () => {
    const resolved = resolveSocial(
      baseRaw({
        metas: [
          meta('name', 'twitter:card', 'summary_large_image'),
          meta('name', 'twitter:image', 'javascript:alert(1)')
        ]
      })
    );
    const preview = previewModel(resolved, 'x');
    expect(preview.imageUrl).toBeNull();
    expect(preview.cardType).toBe('bare');
  });
});
