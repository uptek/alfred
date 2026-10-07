import { describe, expect, test } from 'bun:test';
import type { ImageStatus, RawImage } from '../utils/types';
import {
  altState,
  analyzeImages,
  capDataUri,
  fileLabel,
  imageFormat,
  imageStatus,
  isBrokenImage,
  isOversized,
  parseBackgroundUrls,
  summarizeImages
} from '../utils/images';

describe('isBrokenImage', () => {
  test('loaded with zero natural width and a src is broken', () => {
    expect(isBrokenImage({ complete: true, naturalWidth: 0 }, 'https://a.com/x.png')).toBe(true);
  });

  test('still loading, decoded fine, or src-less images are not broken', () => {
    expect(isBrokenImage({ complete: false, naturalWidth: 0 }, 'https://a.com/x.png')).toBe(false);
    expect(isBrokenImage({ complete: true, naturalWidth: 100 }, 'https://a.com/x.png')).toBe(false);
    expect(isBrokenImage({ complete: true, naturalWidth: 0 }, '')).toBe(false);
  });
});

describe('capDataUri', () => {
  const pad = 'A'.repeat(100_000);
  test.each([
    ['small data URIs pass through untouched', 'data:image/gif;base64,R0lGOD', 'data:image/gif;base64,R0lGOD'],
    ['oversized data URIs collapse to their MIME essence', `data:image/png;base64,${pad}`, 'data:image/png'],
    ['long regular URLs are never touched', `https://example.com/${pad}.png`, `https://example.com/${pad}.png`],
    ['malformed oversized data URIs are hard-truncated', `data:${pad}`, `data:${pad}`.slice(0, 65536)]
  ])('%s', (_, src, expected) => {
    expect(capDataUri(src)).toBe(expected);
  });
});

describe('altState', () => {
  // Empty or whitespace-only alt is the spec's decorative signal, not a missing one
  test.each([
    [null, 'missing'],
    ['', 'decorative'],
    ['   ', 'decorative'],
    ['A product photo', 'present']
  ])('%p is %p', (alt, state) => {
    expect(altState(alt)).toBe(state);
  });
});

describe('imageStatus', () => {
  // Broken beats missing alt; backgrounds have no alt concept; decorative is deliberate
  test.each([
    [true, 'missing', 'img', 'broken'],
    [false, 'missing', 'img', 'missing-alt'],
    [false, 'missing', 'picture', 'missing-alt'],
    [false, 'missing', 'background', 'ok'],
    [false, 'decorative', 'img', 'ok'],
    [false, 'present', 'img', 'ok']
  ] as const)('broken=%p alt=%p source=%p is %p', (broken, alt, source, status) => {
    expect(imageStatus({ broken, alt, source })).toBe(status);
  });
});

describe('imageFormat', () => {
  test.each([
    ['https://example.com/photo.png', 'png'],
    ['https://example.com/photo.JPEG', 'jpg'],
    ['https://cdn.shopify.com/files/photo.webp?v=123&width=400', 'webp'],
    ['https://example.com/photo.tiff', ''],
    ['https://example.com/photo', ''],
    ['data:image/png;base64,AAAA', 'png'],
    ['data:image/svg+xml,%3Csvg%3E', 'svg'],
    ['https://cdn.example.com/i/abc123?format=webp', 'webp'],
    ['https://images.unsplash.com/photo-150?fm=pjpg', 'jpg'],
    ['https://example.com/photo.png?format=webp', 'png'],
    ['not a url', '']
  ])('%p is %p', (url, format) => {
    expect(imageFormat(url)).toBe(format);
  });
});

describe('fileLabel', () => {
  test.each([
    ['https://example.com/cdn/shop/photo.png?v=9', 'photo.png?v=9'],
    ['https://example.com/', '/'],
    [`data:image/png;base64,${'A'.repeat(5000)}`, 'data:image/png'],
    ['data:image/svg+xml,%3Csvg%3E', 'data:image/svg+xml'],
    ['not a url', 'not a url'],
    ['', '(no source)']
  ])('%p is labeled %p', (src, label) => {
    expect(fileLabel(src)).toBe(label);
  });
});

describe('parseBackgroundUrls', () => {
  test.each([
    ['url("https://example.com/a.jpg")', ['https://example.com/a.jpg']],
    ['url("/a.jpg"), url("/b.png")', ['/a.jpg', '/b.png']],
    ['linear-gradient(rgba(0, 0, 0, 0.5), rgba(0, 0, 0, 0.5)), url("/hero.jpg")', ['/hero.jpg']],
    ['url(/a.jpg)', ['/a.jpg']],
    ['none', []],
    ['linear-gradient(#fff, #000)', []],
    ['url("")', []]
  ])('%p yields %p', (bg, urls) => {
    expect(parseBackgroundUrls(bg)).toEqual(urls);
  });
});

describe('analyzeImages', () => {
  const img = (over: Partial<RawImage>): RawImage => ({ lacksAlt: false, decorative: false, ...over }) as RawImage;

  test('counts only images whose alt attribute is absent, never decorative or background ones', () => {
    expect(analyzeImages([img({ lacksAlt: true }), img({ lacksAlt: true }), img({ decorative: true })])).toBe(2);
    expect(analyzeImages([img({ source: 'background' })])).toBe(0);
    expect(analyzeImages([])).toBe(0);
  });
});

describe('isOversized', () => {
  test.each([
    ['flags a hero rendered at a fraction of its natural size', 1600, 1000, 160, 100, 1, true],
    ['does not flag a properly sized image', 160, 100, 160, 100, 1, false],
    ['allows exactly 2x per dimension for retina at dpr 1 (strict threshold)', 320, 200, 160, 100, 1, false],
    ['never flags a small icon under the waste floor', 128, 128, 20, 20, 1, false],
    ['never flags a 256px icon under the waste floor', 256, 256, 32, 32, 1, false],
    ['flags once the waste passes the floor', 512, 512, 64, 64, 1, true],
    ['accounts for devicePixelRatio', 640, 400, 160, 100, 2, false],
    ['never flags an unknown natural size (lazy, not decoded)', 0, 0, 160, 100, 1, false],
    ['never flags an unrendered image', 1600, 1000, 0, 0, 1, false],
    ['falls back to dpr 1 when dpr is non-positive', 1600, 1000, 160, 100, 0, true]
  ])('%s', (_, naturalWidth, naturalHeight, displayWidth, displayHeight, dpr, oversized) => {
    expect(isOversized(naturalWidth, naturalHeight, displayWidth, displayHeight, dpr)).toBe(oversized);
  });
});

describe('summarizeImages', () => {
  const img = (over: Partial<RawImage>): RawImage => ({ index: 0, size: 0, oversized: false, ...over }) as RawImage;
  const plain = (count: number) => Array.from({ length: count }, (_, index) => img({ index }));

  // Images missing from the status map read as ok, so nothing past the count shows
  test.each([
    [0, '0 images'],
    [1, '1 image'],
    [2, '2 images']
  ])('%p plain images show only the count %p', (count, text) => {
    expect(summarizeImages(plain(count), new Map())).toEqual([{ text }]);
  });

  test('adds known size and each defect count with its tone', () => {
    const images = [img({ size: 1024, oversized: true }), img({ index: 1 }), img({ index: 2 }), img({ index: 3 })];
    const statuses = new Map<number, ImageStatus>([
      [0, 'missing-alt'],
      [1, 'broken'],
      [2, 'ok']
    ]);
    expect(summarizeImages(images, statuses)).toEqual([
      { text: '4 images' },
      { text: '1.0 KB', title: expect.any(String) },
      { text: '1 missing alt', tone: 'warn' },
      { text: '1 broken', tone: 'err' },
      { text: '1 oversized', tone: 'warn' }
    ]);
  });
});
