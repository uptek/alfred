import { describe, expect, it } from 'bun:test';
import {
  analyzeSitemaps,
  categorizeSitemap,
  classifySitemap,
  countUrls,
  extractRobotsSitemaps,
  parseIndexEntries,
  parseUrlsetUrls,
  sitemapFilename,
  type SitemapNode,
  type SitemapsData
} from '../utils/sitemaps';

const INDEX_XML = `<?xml version="1.0" encoding="UTF-8"?>
<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <sitemap>
    <loc>https://shop.example.com/sitemap_products_1.xml?from=1&amp;to=99</loc>
    <lastmod>2026-08-01T04:00:00Z</lastmod>
  </sitemap>
  <sitemap>
    <loc>https://shop.example.com/sitemap_pages_1.xml</loc>
  </sitemap>
</sitemapindex>`;

const URLSET_XML = `<?xml version="1.0"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url><loc>https://shop.example.com/</loc></url>
  <url><loc>https://shop.example.com/products/a</loc><lastmod>2026-01-01</lastmod></url>
</urlset>`;

describe('classifySitemap', () => {
  it('classifies index, urlset, html, and garbage', () => {
    expect(classifySitemap(INDEX_XML)).toBe('index');
    expect(classifySitemap(URLSET_XML)).toBe('urlset');
    expect(classifySitemap('<!doctype html><html></html>')).toBe('html');
    expect(classifySitemap('not xml at all')).toBe('invalid');
  });
});

describe('parseIndexEntries', () => {
  it('extracts loc + lastmod pairs and decodes entities', () => {
    expect(parseIndexEntries(INDEX_XML)).toEqual([
      { loc: 'https://shop.example.com/sitemap_products_1.xml?from=1&to=99', lastmod: '2026-08-01T04:00:00Z' },
      { loc: 'https://shop.example.com/sitemap_pages_1.xml', lastmod: null }
    ]);
  });

  it('returns [] for a urlset document', () => {
    expect(parseIndexEntries(URLSET_XML)).toEqual([]);
  });
});

describe('parseUrlsetUrls', () => {
  it('extracts and decodes page URLs from a urlset', () => {
    expect(parseUrlsetUrls(URLSET_XML)).toEqual(['https://shop.example.com/', 'https://shop.example.com/products/a']);
    expect(parseUrlsetUrls('<url><loc>https://a.example/?x=1&amp;y=2</loc></url>')).toEqual([
      'https://a.example/?x=1&y=2'
    ]);
  });

  it('ignores namespaced image/video loc tags and empty locs', () => {
    const xml = `<urlset>
      <url><loc>https://a.example/p</loc><image:image><image:loc>https://a.example/p.jpg</image:loc></image:image></url>
      <url><loc>  </loc></url>
    </urlset>`;
    expect(parseUrlsetUrls(xml)).toEqual(['https://a.example/p']);
  });
});

describe('countUrls', () => {
  it('counts loc tags in a urlset', () => {
    expect(countUrls(URLSET_XML)).toBe(2);
    expect(countUrls('<urlset></urlset>')).toBe(0);
  });
});

describe('extractRobotsSitemaps', () => {
  it('extracts absolute Sitemap lines case-insensitively', () => {
    const robots =
      'User-agent: *\nDisallow: /admin\nSitemap: https://x.com/sitemap.xml\nsitemap: https://x.com/other.xml\nSitemap: /relative.xml\n';
    expect(extractRobotsSitemaps(robots)).toEqual(['https://x.com/sitemap.xml', 'https://x.com/other.xml']);
  });
});

describe('sitemapFilename', () => {
  it('returns the last path segment, falling back to host', () => {
    expect(sitemapFilename('https://x.com/sitemap_products_1.xml?from=1')).toBe('sitemap_products_1.xml');
    expect(sitemapFilename('https://x.com/')).toBe('x.com');
    expect(sitemapFilename('not a url')).toBe('not a url');
  });
});

describe('categorizeSitemap', () => {
  it('categorizes Shopify sitemap filenames', () => {
    expect(categorizeSitemap('https://x.com/sitemap_products_1.xml').label).toBe('Products');
    expect(categorizeSitemap('https://x.com/sitemap_collections_1.xml').label).toBe('Collections');
    expect(categorizeSitemap('https://x.com/sitemap_pages_1.xml').label).toBe('Pages');
    expect(categorizeSitemap('https://x.com/sitemap_blogs_1.xml').label).toBe('Blogs');
    expect(categorizeSitemap('https://x.com/sitemap_agentic_discovery.xml').label).toBe('Discovery');
    expect(categorizeSitemap('https://x.com/sitemap.xml').label).toBe('Sitemap');
  });
});

function node(partial: Partial<SitemapNode>): SitemapNode {
  return {
    url: 'https://x.com/sitemap.xml',
    finalUrl: 'https://x.com/sitemap.xml',
    ok: true,
    status: 200,
    kind: 'urlset',
    urlCount: 10,
    truncated: false,
    lastmod: null,
    children: [],
    ...partial
  };
}

describe('analyzeSitemaps', () => {
  it('returns not-ok with no findings for null data', () => {
    const a = analyzeSitemaps(null);
    expect(a.ok).toBe(false);
    expect(a.findings).toEqual([]);
    expect(a.errorCount).toBe(0);
  });

  it('flags a missing sitemap as an error', () => {
    const data: SitemapsData = {
      nodes: [node({ ok: false, status: 404, kind: 'invalid', urlCount: 0 })],
      robotsSitemaps: []
    };
    const a = analyzeSitemaps(data);
    expect(a.ok).toBe(false);
    expect(a.findings.some((f) => f.code === 'no-sitemap' && f.severity === 'error')).toBe(true);
    expect(a.errorCount).toBe(1);
  });

  it('counts totals across an index and flags empty/failed children', () => {
    const data: SitemapsData = {
      nodes: [
        node({
          kind: 'index',
          urlCount: 3,
          children: [
            node({ url: 'https://x.com/sitemap_products_1.xml', urlCount: 5000 }),
            node({ url: 'https://x.com/sitemap_pages_1.xml', urlCount: 0 }),
            node({ url: 'https://x.com/sitemap_blogs_1.xml', ok: false, status: 500, kind: 'invalid', urlCount: 0 })
          ]
        })
      ],
      robotsSitemaps: ['https://x.com/sitemap.xml']
    };
    const a = analyzeSitemaps(data);
    expect(a.ok).toBe(true);
    expect(a.totalSitemaps).toBe(3);
    expect(a.totalUrls).toBe(5000);
    expect(a.findings.some((f) => f.code === 'empty-sitemap' && f.severity === 'warning')).toBe(true);
    expect(a.findings.some((f) => f.code === 'child-fetch-failed' && f.severity === 'warning')).toBe(true);
  });

  it('flags HTML and invalid XML bodies', () => {
    const html = analyzeSitemaps({ nodes: [node({ kind: 'html', urlCount: 0 })], robotsSitemaps: ['x'] });
    expect(html.findings.some((f) => f.code === 'serves-html' && f.severity === 'warning')).toBe(true);
    const invalid = analyzeSitemaps({ nodes: [node({ kind: 'invalid', urlCount: 0 })], robotsSitemaps: ['x'] });
    expect(invalid.findings.some((f) => f.code === 'invalid-xml' && f.severity === 'error')).toBe(true);
    expect(invalid.errorCount).toBe(1);
  });

  it('notes when robots.txt has no Sitemap line', () => {
    const a = analyzeSitemaps({ nodes: [node({})], robotsSitemaps: [] });
    expect(a.findings.some((f) => f.code === 'not-in-robots' && f.severity === 'info')).toBe(true);
  });

  it('notes truncated counts as a floor', () => {
    const a = analyzeSitemaps({
      nodes: [node({ kind: 'index', urlCount: 1, children: [node({ truncated: true, urlCount: 40000 })] })],
      robotsSitemaps: ['x']
    });
    expect(a.findings.some((f) => f.code === 'truncated' && f.severity === 'info')).toBe(true);
  });

  it('treats a flat urlset root as one sitemap', () => {
    const a = analyzeSitemaps({ nodes: [node({ urlCount: 42 })], robotsSitemaps: ['x'] });
    expect(a.totalSitemaps).toBe(1);
    expect(a.totalUrls).toBe(42);
  });
});
