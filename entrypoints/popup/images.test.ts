import { describe, expect, test } from 'bun:test';
import { altState, fileLabel, imageFormat, imageStatus, isOversized, parseBackgroundUrls } from './images';

describe('altState', () => {
  test('absent attribute is missing', () => {
    expect(altState(null)).toBe('missing');
  });

  test('empty attribute marks a decorative image', () => {
    expect(altState('')).toBe('decorative');
  });

  test('whitespace-only attribute counts as decorative', () => {
    expect(altState('   ')).toBe('decorative');
  });

  test('real text is present', () => {
    expect(altState('A product photo')).toBe('present');
  });
});

describe('imageStatus', () => {
  test('broken wins over missing alt', () => {
    expect(imageStatus({ broken: true, alt: 'missing', source: 'img' })).toBe('broken');
  });

  test('missing alt flags img sources', () => {
    expect(imageStatus({ broken: false, alt: 'missing', source: 'img' })).toBe('missing-alt');
  });

  test('missing alt flags picture sources', () => {
    expect(imageStatus({ broken: false, alt: 'missing', source: 'picture' })).toBe('missing-alt');
  });

  test('backgrounds have no alt concept and stay ok', () => {
    expect(imageStatus({ broken: false, alt: 'missing', source: 'background' })).toBe('ok');
  });

  test('decorative images are ok, not missing alt', () => {
    expect(imageStatus({ broken: false, alt: 'decorative', source: 'img' })).toBe('ok');
  });

  test('present alt is ok', () => {
    expect(imageStatus({ broken: false, alt: 'present', source: 'img' })).toBe('ok');
  });
});

describe('imageFormat', () => {
  test('parses the path extension', () => {
    expect(imageFormat('https://example.com/photo.png')).toBe('png');
  });

  test('normalizes jpeg to jpg', () => {
    expect(imageFormat('https://example.com/photo.JPEG')).toBe('jpg');
  });

  test('ignores query strings after the extension', () => {
    expect(imageFormat('https://cdn.shopify.com/files/photo.webp?v=123&width=400')).toBe('webp');
  });

  test('unknown extensions return empty', () => {
    expect(imageFormat('https://example.com/photo.tiff')).toBe('');
  });

  test('extensionless URLs return empty', () => {
    expect(imageFormat('https://example.com/photo')).toBe('');
  });

  test('reads the MIME from data URIs', () => {
    expect(imageFormat('data:image/png;base64,AAAA')).toBe('png');
  });

  test('normalizes svg+xml data URIs to svg', () => {
    expect(imageFormat('data:image/svg+xml,%3Csvg%3E')).toBe('svg');
  });

  test('falls back to the format query param', () => {
    expect(imageFormat('https://cdn.example.com/i/abc123?format=webp')).toBe('webp');
  });

  test('falls back to the fm query param and normalizes pjpg', () => {
    expect(imageFormat('https://images.unsplash.com/photo-150?fm=pjpg')).toBe('jpg');
  });

  test('extension wins over a conflicting query param', () => {
    expect(imageFormat('https://example.com/photo.png?format=webp')).toBe('png');
  });

  test('unparseable URLs return empty', () => {
    expect(imageFormat('not a url')).toBe('');
  });
});

describe('fileLabel', () => {
  test('shows the last path segment with the query string', () => {
    expect(fileLabel('https://example.com/cdn/shop/photo.png?v=9')).toBe('photo.png?v=9');
  });

  test('root path falls back to the pathname', () => {
    expect(fileLabel('https://example.com/')).toBe('/');
  });

  test('data URIs collapse to their MIME label, never the payload', () => {
    expect(fileLabel(`data:image/png;base64,${'A'.repeat(5000)}`)).toBe('data:image/png');
  });

  test('data URIs without parameters keep the MIME', () => {
    expect(fileLabel('data:image/svg+xml,%3Csvg%3E')).toBe('data:image/svg+xml');
  });

  test('unparseable sources pass through', () => {
    expect(fileLabel('not a url')).toBe('not a url');
  });

  test('empty source has a placeholder', () => {
    expect(fileLabel('')).toBe('(no source)');
  });
});

describe('parseBackgroundUrls', () => {
  test('extracts a single quoted url', () => {
    expect(parseBackgroundUrls('url("https://example.com/a.jpg")')).toEqual(['https://example.com/a.jpg']);
  });

  test('extracts every url from multiple backgrounds', () => {
    expect(parseBackgroundUrls('url("/a.jpg"), url("/b.png")')).toEqual(['/a.jpg', '/b.png']);
  });

  test('finds the url inside a gradient combo', () => {
    expect(parseBackgroundUrls('linear-gradient(rgba(0, 0, 0, 0.5), rgba(0, 0, 0, 0.5)), url("/hero.jpg")')).toEqual([
      '/hero.jpg'
    ]);
  });

  test('handles unquoted urls', () => {
    expect(parseBackgroundUrls('url(/a.jpg)')).toEqual(['/a.jpg']);
  });

  test('none yields nothing', () => {
    expect(parseBackgroundUrls('none')).toEqual([]);
  });

  test('gradient-only backgrounds yield nothing', () => {
    expect(parseBackgroundUrls('linear-gradient(#fff, #000)')).toEqual([]);
  });

  test('empty url() entries are dropped', () => {
    expect(parseBackgroundUrls('url("")')).toEqual([]);
  });
});

describe('isOversized', () => {
  test('flags a hero rendered at a fraction of its natural size', () => {
    expect(isOversized(1600, 1000, 160, 100, 1)).toBe(true);
  });

  test('does not flag a properly sized image', () => {
    expect(isOversized(160, 100, 160, 100, 1)).toBe(false);
  });

  test('allows 2x headroom for retina before flagging at dpr 1', () => {
    // 2x per dimension = exactly 4x the pixels: not flagged (threshold is strict)
    expect(isOversized(320, 200, 160, 100, 1)).toBe(false);
  });

  test('small icons never flag even at huge ratios (waste floor)', () => {
    // 128px emoji rendered at 20px wastes ~16k pixels: trivial, not worth surfacing
    expect(isOversized(128, 128, 20, 20, 1)).toBe(false);
    expect(isOversized(256, 256, 32, 32, 1)).toBe(false);
  });

  test('flags once the waste passes the floor', () => {
    expect(isOversized(512, 512, 64, 64, 1)).toBe(true);
  });

  test('accounts for devicePixelRatio', () => {
    // 4x the pixels at dpr 2 is exactly the needed density: not flagged
    expect(isOversized(640, 400, 160, 100, 2)).toBe(false);
  });

  test('unknown natural size never flags (lazy, not decoded)', () => {
    expect(isOversized(0, 0, 160, 100, 1)).toBe(false);
  });

  test('unrendered images never flag', () => {
    expect(isOversized(1600, 1000, 0, 0, 1)).toBe(false);
  });

  test('non-positive dpr falls back to 1', () => {
    expect(isOversized(1600, 1000, 160, 100, 0)).toBe(true);
  });
});
