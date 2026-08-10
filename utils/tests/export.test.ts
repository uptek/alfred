import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { csvField, downloadFile, siteSlug } from '../export';

describe('siteSlug', () => {
  it('falls back to "site" when there is no domain', () => {
    expect(siteSlug()).toBe('site');
    expect(siteSlug(undefined)).toBe('site');
  });

  it('strips a leading www', () => {
    expect(siteSlug('www.example.com')).toBe('example-com');
  });

  it('only strips www at the start', () => {
    expect(siteSlug('shop.www.example.com')).toBe('shop-www-example-com');
  });

  it('collapses runs of non-alphanumerics into a single dash', () => {
    expect(siteSlug('my--shop..example.com')).toBe('my-shop-example-com');
  });

  it('trims trailing dashes', () => {
    expect(siteSlug('example.com.')).toBe('example-com');
  });

  it('keeps digits and mixed case', () => {
    expect(siteSlug('Shop123.MyShopify.com')).toBe('Shop123-MyShopify-com');
  });

  it('yields an empty slug rather than throwing on a domain with no usable characters', () => {
    expect(siteSlug('...')).toBe('');
  });
});

describe('csvField', () => {
  it('quotes plain values', () => {
    expect(csvField('hello')).toBe('"hello"');
  });

  it('stringifies non-strings', () => {
    expect(csvField(42)).toBe('"42"');
    expect(csvField(null)).toBe('"null"');
    expect(csvField(undefined)).toBe('"undefined"');
  });

  it('doubles embedded quotes', () => {
    expect(csvField('say "hi"')).toBe('"say ""hi"""');
  });

  it('neutralizes formula-leading characters', () => {
    expect(csvField('=SUM(A1:A9)')).toBe('"\'=SUM(A1:A9)"');
    expect(csvField('@import')).toBe('"\'@import"');
  });

  it('leaves an equals sign mid-string alone', () => {
    expect(csvField('a=b')).toBe('"a=b"');
  });
});

describe('downloadFile', () => {
  interface FakeAnchor {
    href: string;
    download: string;
    clicks: number;
    click(): void;
  }

  let anchor: FakeAnchor;
  let created: Blob[];
  let revoked: string[];
  const realDocument = (globalThis as { document?: unknown }).document;
  const realCreate = URL.createObjectURL;
  const realRevoke = URL.revokeObjectURL;

  beforeEach(() => {
    created = [];
    revoked = [];
    anchor = {
      href: '',
      download: '',
      clicks: 0,
      click() {
        anchor.clicks++;
      }
    };
    (globalThis as { document?: unknown }).document = {
      createElement: (tag: string) => {
        if (tag !== 'a') throw new Error(`unexpected element: ${tag}`);
        return anchor;
      }
    };
    URL.createObjectURL = ((blob: Blob) => {
      created.push(blob);
      return `blob:fake/${created.length}`;
    }) as typeof URL.createObjectURL;
    URL.revokeObjectURL = ((url: string) => void revoked.push(url)) as typeof URL.revokeObjectURL;
  });

  afterEach(() => {
    (globalThis as { document?: unknown }).document = realDocument;
    URL.createObjectURL = realCreate;
    URL.revokeObjectURL = realRevoke;
  });

  it('clicks an anchor pointing at the blob url', () => {
    downloadFile('a,b', 'alfred-links-example-com.csv', 'text/csv');
    expect(anchor.clicks).toBe(1);
    expect(anchor.href).toBe('blob:fake/1');
  });

  it('sets the suggested filename', () => {
    downloadFile('{}', 'alfred-assets.json', 'application/json');
    expect(anchor.download).toBe('alfred-assets.json');
  });

  it('builds the blob with the requested mime type and content', async () => {
    downloadFile('id,url\n1,/a', 'x.csv', 'text/csv');
    expect(created).toHaveLength(1);
    expect(created[0]?.type).toBe('text/csv');
    expect(await created[0]?.text()).toBe('id,url\n1,/a');
  });

  it('revokes the object url so the blob is not leaked', () => {
    downloadFile('x', 'x.txt', 'text/plain');
    expect(revoked).toEqual(['blob:fake/1']);
  });

  it('mints a fresh url per download', () => {
    downloadFile('a', 'a.txt', 'text/plain');
    downloadFile('b', 'b.txt', 'text/plain');
    expect(revoked).toEqual(['blob:fake/1', 'blob:fake/2']);
    expect(anchor.clicks).toBe(2);
  });
});
