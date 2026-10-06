import { describe, expect, test } from 'bun:test';
import type { RawAsset } from '../utils/types';
import {
  displaySource,
  hasOwnLoad,
  isExternalAssetUrl,
  isRenderBlockingScript,
  isRenderBlockingStylesheet,
  matchesAssetFlag,
  scriptLoad,
  scriptSubtype,
  summarizeAssets,
  typeLabel
} from '../utils/assets';

describe('hasOwnLoad', () => {
  // async/defer never apply to external stylesheets
  test.each([
    ['script', false, true],
    ['script', true, true],
    ['style', true, true],
    ['style', false, false]
  ] as const)('%p with isInline=%p: %p', (kind, isInline, expected) => {
    expect(hasOwnLoad({ kind, isInline })).toBe(expected);
  });
});

describe('typeLabel', () => {
  test.each([
    ['style', 'stylesheet', 'Style'],
    ['script', 'classic', 'Script'],
    ['script', 'module', 'Module'],
    ['script', 'importmap', 'Map'],
    ['script', 'speculationrules', 'Rules'],
    ['script', 'json', 'JSON'],
    ['script', 'ld+json', 'JSON-LD'],
    ['script', 'data', 'Data']
  ] as const)('%p %p is %p', (kind, subtype, label) => {
    expect(typeLabel({ kind, subtype })).toBe(label);
  });
});

describe('matchesAssetFlag', () => {
  const counts = { 'https://a.com/x.js': 2, 'https://a.com/y.js': 1 };

  // failed starts exactly at HTTP 400; duplicate needs a src that appears more than once
  test.each([
    [{ renderBlocking: true }, 'render-blocking', true],
    [{}, 'render-blocking', false],
    [{ status: 400 }, 'failed', true],
    [{ status: 399 }, 'failed', false],
    [{ status: 0 }, 'failed', false],
    [{ src: 'https://a.com/x.js' }, 'duplicate', true],
    [{ src: 'https://a.com/y.js' }, 'duplicate', false],
    [{ src: null }, 'duplicate', false]
  ] as const)('%p matches %p: %p', (over, flag, expected) => {
    expect(matchesAssetFlag({ renderBlocking: false, status: 0, src: null, ...over }, flag, counts)).toBe(expected);
  });
});

describe('scriptSubtype', () => {
  // MIME parameters, case and surrounding whitespace are ignored; unknown types are inert data blocks
  test.each([
    ['', 'classic'],
    ['text/javascript', 'classic'],
    ['application/javascript', 'classic'],
    ['application/ecmascript', 'classic'],
    ['text/jscript', 'classic'],
    ['text/javascript; charset=utf-8', 'classic'],
    ['Text/JavaScript', 'classic'],
    ['  MODULE  ', 'module'],
    ['module', 'module'],
    ['importmap', 'importmap'],
    ['speculationrules', 'speculationrules'],
    ['application/json', 'json'],
    ['text/json', 'json'],
    ['application/ld+json', 'ld+json'],
    ['application/vnd.api+json', 'json'],
    ['text/template', 'data'],
    ['text/x-handlebars', 'data']
  ])('%p is %p', (type, subtype) => {
    expect(scriptSubtype(type)).toBe(subtype);
  });
});

describe('scriptLoad', () => {
  // Inline wins over attributes; modules defer unless async; inert subtypes never fetch even with a src
  test.each([
    ['classic', true, true, true, 'inline'],
    ['module', false, false, true, 'inline'],
    ['module', false, false, false, 'defer'],
    ['module', true, false, false, 'async'],
    ['classic', true, true, false, 'async'],
    ['classic', false, true, false, 'defer'],
    ['classic', false, false, false, 'blocking'],
    ['json', false, false, false, 'inline'],
    ['ld+json', false, false, false, 'inline'],
    ['data', true, true, false, 'inline'],
    ['importmap', false, false, false, 'inline'],
    ['speculationrules', false, false, false, 'inline']
  ] as const)('%p async=%p defer=%p inline=%p loads %p', (subtype, async, defer, inline, load) => {
    expect(scriptLoad(subtype, async, defer, inline)).toBe(load);
  });
});

describe('isRenderBlockingScript', () => {
  const base = {
    subtype: 'classic' as const,
    load: 'blocking' as const,
    placement: 'head' as const,
    isInline: false,
    noModule: false
  };

  test('sync external classic script in head blocks render', () => {
    expect(isRenderBlockingScript(base)).toBe(true);
  });

  // Modules never block the parser, nomodule scripts are not fetched by modern browsers, data scripts are inert
  test.each([
    { load: 'async' },
    { load: 'defer' },
    { placement: 'body' },
    { placement: 'footer' },
    { isInline: true, load: 'inline' },
    { subtype: 'module', load: 'defer' },
    { noModule: true },
    { subtype: 'json' },
    { subtype: 'ld+json' },
    { subtype: 'importmap' }
  ] as const)('%p does not block', (over) => {
    expect(isRenderBlockingScript({ ...base, ...over })).toBe(false);
  });
});

describe('isRenderBlockingStylesheet', () => {
  const matchesScreen = (q: string) => /screen|min-width/.test(q);
  const base = { placement: 'head' as const, media: '', disabled: false, alternate: false };

  // Whitespace-only media counts as no media, so the matcher never sees it
  test.each([
    [{}, true],
    [{ media: '  ' }, true],
    [{ media: 'screen' }, true],
    [{ media: '(min-width: 1px)' }, true],
    [{ media: 'print' }, false],
    [{ media: '(max-width: 1px)' }, false],
    [{ disabled: true }, false],
    [{ alternate: true }, false],
    [{ placement: 'body' }, false],
    [{ placement: 'footer' }, false]
  ] as const)('%p blocks: %p', (over, expected) => {
    expect(isRenderBlockingStylesheet({ ...base, ...over }, matchesScreen)).toBe(expected);
  });
});

describe('isExternalAssetUrl', () => {
  // www variants and case differences are the same host; data/blob have no host; unparseable counts as external
  test.each([
    ['https://example.com/app.js', 'example.com', false],
    ['https://www.example.com/app.js', 'example.com', false],
    ['https://example.com/app.js', 'www.example.com', false],
    ['https://cdn.shopify.com/a.js', 'shop.example.com', true],
    ['https://cdn.example.com/a.js', 'example.com', true],
    ['https://EXAMPLE.com/a.js', 'example.com', false],
    ['data:text/javascript,1', 'example.com', false],
    ['blob:https://example.com/uuid', 'example.com', false],
    ['http://', 'example.com', true]
  ])('%p on %p is external: %p', (url, pageHost, external) => {
    expect(isExternalAssetUrl(url, pageHost)).toBe(external);
  });
});

describe('displaySource', () => {
  // Same-host shows the path, external shows host plus path without www, root paths fall back to the host
  test.each([
    ['https://example.com/assets/app.js?v=2', 'example.com', '/assets/app.js?v=2'],
    ['https://www.example.com/app.js', 'example.com', '/app.js'],
    ['https://example.com/', 'example.com', 'example.com'],
    ['https://www.cdn.com/lib/x.js', 'example.com', 'cdn.com/lib/x.js'],
    ['https://cdn.com/', 'example.com', 'cdn.com'],
    ['https://example.com/app.js', null, 'example.com/app.js'],
    ['not a url', 'example.com', 'not a url']
  ])('%p on %p shows %p', (src, pageHost, shown) => {
    expect(displaySource(src, pageHost)).toBe(shown);
  });
});

describe('summarizeAssets', () => {
  const asset = (over: Partial<RawAsset>): RawAsset =>
    ({ kind: 'script', size: 0, renderBlocking: false, ...over }) as RawAsset;

  test('always shows both kind counts and suppresses size and render-blocking at zero', () => {
    expect(summarizeAssets([])).toEqual([{ text: '0 scripts' }, { text: '0 styles' }]);
    expect(summarizeAssets([asset({}), asset({ kind: 'style' })])).toEqual([{ text: '1 script' }, { text: '1 style' }]);
  });

  test('adds the known size total and warns on render-blocking assets', () => {
    expect(summarizeAssets([asset({ size: 2048, renderBlocking: true }), asset({ kind: 'style' })])).toEqual([
      { text: '1 script' },
      { text: '1 style' },
      { text: '2.0 KB', title: expect.any(String) },
      { text: '1 render-blocking', tone: 'warn' }
    ]);
  });
});
