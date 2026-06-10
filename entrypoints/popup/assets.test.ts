import { describe, expect, test } from 'bun:test';
import {
  displaySource,
  hasOwnLoad,
  isExternalAssetUrl,
  isRenderBlockingScript,
  isRenderBlockingStylesheet,
  matchesAssetFlag,
  scriptLoad,
  scriptSubtype,
  typeLabel
} from './assets';
import { formatSize } from './format';

describe('hasOwnLoad', () => {
  test('scripts and inline styles have a load strategy', () => {
    expect(hasOwnLoad({ kind: 'script', isInline: false })).toBe(true);
    expect(hasOwnLoad({ kind: 'script', isInline: true })).toBe(true);
    expect(hasOwnLoad({ kind: 'style', isInline: true })).toBe(true);
  });

  test('external stylesheets do not (async/defer never apply to them)', () => {
    expect(hasOwnLoad({ kind: 'style', isInline: false })).toBe(false);
  });
});

describe('typeLabel', () => {
  test('stylesheets are always Style', () => {
    expect(typeLabel({ kind: 'style', subtype: 'stylesheet' })).toBe('Style');
  });

  test('script subtypes get their own labels', () => {
    expect(typeLabel({ kind: 'script', subtype: 'classic' })).toBe('Script');
    expect(typeLabel({ kind: 'script', subtype: 'module' })).toBe('Module');
    expect(typeLabel({ kind: 'script', subtype: 'importmap' })).toBe('Map');
    expect(typeLabel({ kind: 'script', subtype: 'speculationrules' })).toBe('Rules');
    expect(typeLabel({ kind: 'script', subtype: 'json' })).toBe('JSON');
    expect(typeLabel({ kind: 'script', subtype: 'ld+json' })).toBe('JSON-LD');
    expect(typeLabel({ kind: 'script', subtype: 'data' })).toBe('Data');
  });
});

describe('matchesAssetFlag', () => {
  const asset = (over: Partial<{ renderBlocking: boolean; status: number; src: string | null }>) => ({
    renderBlocking: false,
    status: 0,
    src: null,
    ...over
  });

  test('render-blocking flag', () => {
    expect(matchesAssetFlag(asset({ renderBlocking: true }), 'render-blocking', {})).toBe(true);
    expect(matchesAssetFlag(asset({}), 'render-blocking', {})).toBe(false);
  });

  test('failed starts exactly at HTTP 400', () => {
    expect(matchesAssetFlag(asset({ status: 400 }), 'failed', {})).toBe(true);
    expect(matchesAssetFlag(asset({ status: 399 }), 'failed', {})).toBe(false);
    expect(matchesAssetFlag(asset({ status: 0 }), 'failed', {})).toBe(false);
  });

  test('duplicate needs a src that appears more than once', () => {
    const counts = { 'https://a.com/x.js': 2, 'https://a.com/y.js': 1 };
    expect(matchesAssetFlag(asset({ src: 'https://a.com/x.js' }), 'duplicate', counts)).toBe(true);
    expect(matchesAssetFlag(asset({ src: 'https://a.com/y.js' }), 'duplicate', counts)).toBe(false);
    expect(matchesAssetFlag(asset({ src: null }), 'duplicate', counts)).toBe(false);
  });
});

describe('scriptSubtype', () => {
  test('empty type is a classic script', () => {
    expect(scriptSubtype('')).toBe('classic');
  });

  test('javascript MIME types are classic', () => {
    expect(scriptSubtype('text/javascript')).toBe('classic');
    expect(scriptSubtype('application/javascript')).toBe('classic');
    expect(scriptSubtype('application/ecmascript')).toBe('classic');
    expect(scriptSubtype('text/jscript')).toBe('classic');
  });

  test('MIME parameters and case are ignored', () => {
    expect(scriptSubtype('text/javascript; charset=utf-8')).toBe('classic');
    expect(scriptSubtype('Text/JavaScript')).toBe('classic');
    expect(scriptSubtype('  MODULE  ')).toBe('module');
  });

  test('module and importmap and speculationrules are their own kinds', () => {
    expect(scriptSubtype('module')).toBe('module');
    expect(scriptSubtype('importmap')).toBe('importmap');
    expect(scriptSubtype('speculationrules')).toBe('speculationrules');
  });

  test('json variants', () => {
    expect(scriptSubtype('application/json')).toBe('json');
    expect(scriptSubtype('text/json')).toBe('json');
    expect(scriptSubtype('application/ld+json')).toBe('ld+json');
    expect(scriptSubtype('application/vnd.api+json')).toBe('json');
  });

  test('unknown types are inert data blocks', () => {
    expect(scriptSubtype('text/template')).toBe('data');
    expect(scriptSubtype('text/x-handlebars')).toBe('data');
  });
});

describe('scriptLoad', () => {
  test('inline scripts load inline regardless of attributes', () => {
    expect(scriptLoad('classic', true, true, true)).toBe('inline');
    expect(scriptLoad('module', false, false, true)).toBe('inline');
  });

  test('module scripts are deferred by default', () => {
    expect(scriptLoad('module', false, false, false)).toBe('defer');
  });

  test('module scripts honor async', () => {
    expect(scriptLoad('module', true, false, false)).toBe('async');
  });

  test('classic scripts: async wins over defer, no attributes blocks', () => {
    expect(scriptLoad('classic', true, true, false)).toBe('async');
    expect(scriptLoad('classic', false, true, false)).toBe('defer');
    expect(scriptLoad('classic', false, false, false)).toBe('blocking');
  });

  test('inert data blocks never load, even with a src (browsers ignore it)', () => {
    expect(scriptLoad('json', false, false, false)).toBe('inline');
    expect(scriptLoad('ld+json', false, false, false)).toBe('inline');
    expect(scriptLoad('data', true, true, false)).toBe('inline');
    expect(scriptLoad('importmap', false, false, false)).toBe('inline');
    expect(scriptLoad('speculationrules', false, false, false)).toBe('inline');
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

  test('async and defer do not block', () => {
    expect(isRenderBlockingScript({ ...base, load: 'async' })).toBe(false);
    expect(isRenderBlockingScript({ ...base, load: 'defer' })).toBe(false);
  });

  test('body and footer placement do not block first render', () => {
    expect(isRenderBlockingScript({ ...base, placement: 'body' })).toBe(false);
    expect(isRenderBlockingScript({ ...base, placement: 'footer' })).toBe(false);
  });

  test('inline scripts are not flagged', () => {
    expect(isRenderBlockingScript({ ...base, isInline: true, load: 'inline' })).toBe(false);
  });

  test('module scripts never block the parser', () => {
    expect(isRenderBlockingScript({ ...base, subtype: 'module', load: 'defer' })).toBe(false);
  });

  test('nomodule scripts are not even fetched by modern browsers', () => {
    expect(isRenderBlockingScript({ ...base, noModule: true })).toBe(false);
  });

  test('data scripts are inert', () => {
    expect(isRenderBlockingScript({ ...base, subtype: 'json' })).toBe(false);
    expect(isRenderBlockingScript({ ...base, subtype: 'ld+json' })).toBe(false);
    expect(isRenderBlockingScript({ ...base, subtype: 'importmap' })).toBe(false);
  });
});

describe('isRenderBlockingStylesheet', () => {
  const matchesScreen = (q: string) => !/print|max-width: 1px/.test(q);
  const base = { placement: 'head' as const, media: '', disabled: false, alternate: false };

  test('plain head stylesheet blocks render', () => {
    expect(isRenderBlockingStylesheet(base, matchesScreen)).toBe(true);
  });

  test('non-matching media query does not block', () => {
    expect(isRenderBlockingStylesheet({ ...base, media: 'print' }, matchesScreen)).toBe(false);
    expect(isRenderBlockingStylesheet({ ...base, media: '(max-width: 1px)' }, matchesScreen)).toBe(false);
  });

  test('matching media query blocks', () => {
    expect(isRenderBlockingStylesheet({ ...base, media: 'screen' }, matchesScreen)).toBe(true);
    expect(isRenderBlockingStylesheet({ ...base, media: '(min-width: 1px)' }, matchesScreen)).toBe(true);
  });

  test('whitespace-only media counts as no media', () => {
    expect(isRenderBlockingStylesheet({ ...base, media: '  ' }, () => false)).toBe(true);
  });

  test('disabled stylesheets are never fetched', () => {
    expect(isRenderBlockingStylesheet({ ...base, disabled: true }, matchesScreen)).toBe(false);
  });

  test('alternate stylesheets are not applied', () => {
    expect(isRenderBlockingStylesheet({ ...base, alternate: true }, matchesScreen)).toBe(false);
  });

  test('body placement does not block first render', () => {
    expect(isRenderBlockingStylesheet({ ...base, placement: 'body' }, matchesScreen)).toBe(false);
    expect(isRenderBlockingStylesheet({ ...base, placement: 'footer' }, matchesScreen)).toBe(false);
  });
});

describe('isExternalAssetUrl', () => {
  test('same host is not external', () => {
    expect(isExternalAssetUrl('https://example.com/app.js', 'example.com')).toBe(false);
  });

  test('www variant of the page host is not external', () => {
    expect(isExternalAssetUrl('https://www.example.com/app.js', 'example.com')).toBe(false);
    expect(isExternalAssetUrl('https://example.com/app.js', 'www.example.com')).toBe(false);
  });

  test('different host and subdomains are external', () => {
    expect(isExternalAssetUrl('https://cdn.shopify.com/a.js', 'shop.example.com')).toBe(true);
    expect(isExternalAssetUrl('https://cdn.example.com/a.js', 'example.com')).toBe(true);
  });

  test('host comparison is case-insensitive', () => {
    expect(isExternalAssetUrl('https://EXAMPLE.com/a.js', 'example.com')).toBe(false);
  });

  test('data and blob URIs are not external hosts', () => {
    expect(isExternalAssetUrl('data:text/javascript,1', 'example.com')).toBe(false);
    expect(isExternalAssetUrl('blob:https://example.com/uuid', 'example.com')).toBe(false);
  });

  test('unparseable URLs count as external', () => {
    expect(isExternalAssetUrl('http://', 'example.com')).toBe(true);
  });
});

describe('displaySource', () => {
  test('same-host assets show path only', () => {
    expect(displaySource('https://example.com/assets/app.js?v=2', 'example.com')).toBe('/assets/app.js?v=2');
  });

  test('www variant counts as same host', () => {
    expect(displaySource('https://www.example.com/app.js', 'example.com')).toBe('/app.js');
  });

  test('same-host root path falls back to the host', () => {
    expect(displaySource('https://example.com/', 'example.com')).toBe('example.com');
  });

  test('external assets show host plus path, www stripped', () => {
    expect(displaySource('https://www.cdn.com/lib/x.js', 'example.com')).toBe('cdn.com/lib/x.js');
  });

  test('external root path shows just the host', () => {
    expect(displaySource('https://cdn.com/', 'example.com')).toBe('cdn.com');
  });

  test('no page host behaves like external display', () => {
    expect(displaySource('https://example.com/app.js', null)).toBe('example.com/app.js');
  });

  test('unparseable src is returned as-is', () => {
    expect(displaySource('not a url', 'example.com')).toBe('not a url');
  });
});

describe('formatSize', () => {
  test('bytes under 1 KB', () => {
    expect(formatSize(512)).toBe('512 B');
  });

  test('kilobytes with one decimal', () => {
    expect(formatSize(2048)).toBe('2.0 KB');
    expect(formatSize(1536)).toBe('1.5 KB');
  });

  test('megabytes with one decimal', () => {
    expect(formatSize(1.5 * 1024 * 1024)).toBe('1.5 MB');
    expect(formatSize(2 * 1024 * 1024)).toBe('2.0 MB');
  });
});
