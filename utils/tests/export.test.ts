import { afterAll, beforeAll, describe, expect, it, spyOn } from 'bun:test';
import { csvField, downloadFile, siteSlug } from '../export';

describe('siteSlug', () => {
  it.each([
    ['falls back to "site" when there is no domain', undefined, 'site'],
    ['strips a leading www', 'www.example.com', 'example-com'],
    ['only strips www at the start', 'shop.www.example.com', 'shop-www-example-com'],
    ['collapses runs of non-alphanumerics into a single dash', 'my--shop..example.com', 'my-shop-example-com'],
    ['trims trailing dashes', 'example.com.', 'example-com'],
    ['keeps digits and mixed case', 'Shop123.MyShopify.com', 'Shop123-MyShopify-com'],
    ['yields an empty slug on a domain with no usable characters', '...', '']
  ])('%s', (_, domain, slug) => {
    expect(siteSlug(domain)).toBe(slug);
  });
});

describe('csvField', () => {
  it.each([
    ['quotes plain values', 'hello', '"hello"'],
    ['stringifies numbers', 42, '"42"'],
    ['stringifies null', null, '"null"'],
    ['stringifies undefined', undefined, '"undefined"'],
    ['doubles embedded quotes', 'say "hi"', '"say ""hi"""'],
    ['neutralizes a leading =', '=SUM(A1:A9)', '"\'=SUM(A1:A9)"'],
    ['neutralizes a leading @', '@import', '"\'@import"'],
    ['neutralizes a leading +', '+1234', '"\'+1234"'],
    ['neutralizes a leading -', '-cmd', '"\'-cmd"'],
    ['neutralizes a formula after a leading tab', '\t=SUM(A1)', '"\'\t=SUM(A1)"'],
    ['neutralizes a formula after a leading CR', '\r-cmd', '"\'\r-cmd"'],
    ['stringifies booleans', true, '"true"'],
    ['leaves an equals sign mid-string alone', 'a=b', '"a=b"']
  ])('%s', (_, value, field) => {
    expect(csvField(value)).toBe(field);
  });
});

describe('downloadFile', () => {
  const g = globalThis as { document?: unknown };
  const realDocument = g.document;
  const anchor = {
    href: '',
    download: '',
    clicks: 0,
    click() {
      this.clicks++;
    }
  };
  let minted = 0;
  const create = spyOn(URL, 'createObjectURL').mockImplementation(() => `blob:fake/${++minted}`);
  const revoke = spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});

  beforeAll(() => {
    g.document = { createElement: (tag: string) => (tag === 'a' ? anchor : null) };
  });

  afterAll(() => {
    g.document = realDocument;
    create.mockRestore();
    revoke.mockRestore();
  });

  it('clicks an anchor at a fresh blob url per download, then revokes it', async () => {
    downloadFile('id,url\n1,/a', 'alfred-links-example-com.csv', 'text/csv');
    expect(anchor).toMatchObject({ href: 'blob:fake/1', download: 'alfred-links-example-com.csv', clicks: 1 });
    const blob = create.mock.calls[0]![0] as Blob;
    expect(blob.type).toBe('text/csv');
    expect(await blob.text()).toBe('id,url\n1,/a');

    downloadFile('{}', 'alfred-assets.json', 'application/json');
    expect(anchor).toMatchObject({ href: 'blob:fake/2', download: 'alfred-assets.json', clicks: 2 });
    expect(revoke.mock.calls).toEqual([['blob:fake/1'], ['blob:fake/2']]);
  });
});
