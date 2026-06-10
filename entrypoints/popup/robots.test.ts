import { describe, expect, it } from 'bun:test';
import {
  detectShopifyDefault,
  isAllowed,
  lintRobots,
  looksLikeHtml,
  parseRobots,
  SHOPIFY_DEFAULT_RULES
} from './robots';

describe('looksLikeHtml', () => {
  it('detects SPA fallback HTML served at /robots.txt', () => {
    expect(looksLikeHtml('<!doctype html><html><head></head></html>')).toBe(true);
    expect(looksLikeHtml('<HTML lang="en">')).toBe(true);
    expect(looksLikeHtml('User-agent: *\nDisallow: /admin\n')).toBe(false);
    expect(looksLikeHtml(`# comment mentioning <html> usage\n${'x'.repeat(2000)}<html>`)).toBe(true);
  });
});

const parse = parseRobots;

describe('parseRobots', () => {
  it('parses groups, rules, and line numbers', () => {
    const p = parse('User-agent: *\nDisallow: /admin\nAllow: /admin/public\n');
    expect(p.groups.length).toBe(1);
    const g = p.groups[0]!;
    expect(g.userAgents).toEqual([{ token: '*', line: 1 }]);
    expect(g.rules).toEqual([
      { type: 'disallow', path: '/admin', line: 2 },
      { type: 'allow', path: '/admin/public', line: 3 }
    ]);
  });

  it('stacks consecutive User-agent lines into one group', () => {
    const p = parse('User-agent: GPTBot\nUser-agent: CCBot\nDisallow: /\n');
    expect(p.groups.length).toBe(1);
    expect(p.groups[0]!.userAgents.map((u) => u.token)).toEqual(['GPTBot', 'CCBot']);
  });

  it('starts a new group when User-agent follows rules', () => {
    const p = parse('User-agent: *\nDisallow: /a\nUser-agent: GPTBot\nDisallow: /\n');
    expect(p.groups.length).toBe(2);
  });

  it('strips comments and handles case-insensitive directives', () => {
    const p = parse('user-AGENT: * # everyone\nDISALLOW: /x # private\n# full comment line\n');
    expect(p.groups[0]!.rules).toEqual([{ type: 'disallow', path: '/x', line: 2 }]);
  });

  it('records orphan rules before any group', () => {
    const p = parse('Disallow: /a\nUser-agent: *\nDisallow: /b\n');
    expect(p.orphanRules).toEqual([{ type: 'disallow', path: '/a', line: 1 }]);
    expect(p.groups[0]!.rules.length).toBe(1);
  });

  it('records invalid lines, sitemaps, BOM, and unknown directives', () => {
    const p = parse('﻿this is not a directive\nSitemap: https://x.com/sitemap.xml\nNoindex: /old\n');
    expect(p.hasBom).toBe(true);
    expect(p.invalidLines).toEqual([1]);
    expect(p.sitemaps).toEqual([{ url: 'https://x.com/sitemap.xml', line: 2 }]);
    expect(p.otherDirectives).toEqual([{ name: 'noindex', value: '/old', line: 3 }]);
  });

  it('keeps the first Crawl-delay of a group', () => {
    const p = parse('User-agent: AhrefsBot\nCrawl-delay: 10\nCrawl-delay: 20\n');
    expect(p.groups[0]!.crawlDelay).toEqual({ value: '10', line: 2 });
  });

  it('handles CRLF and bare CR line endings with correct line numbers', () => {
    const p = parse('User-agent: *\r\nDisallow: /a\rAllow: /b\n');
    expect(p.groups[0]!.rules).toEqual([
      { type: 'disallow', path: '/a', line: 2 },
      { type: 'allow', path: '/b', line: 3 }
    ]);
  });

  it('treats Crawl-delay before any group as an other directive', () => {
    const p = parse('Crawl-delay: 5\nUser-agent: *\nDisallow: /a\n');
    expect(p.otherDirectives).toEqual([{ name: 'crawl-delay', value: '5', line: 1 }]);
    expect(p.groups[0]!.crawlDelay).toBeNull();
  });
});

describe('isAllowed', () => {
  it('allows when there are no groups at all', () => {
    expect(isAllowed(parse(''), '/anything', 'Googlebot')).toEqual({
      allowed: true,
      rule: null,
      group: null
    });
  });

  it('blocks by prefix match', () => {
    const p = parse('User-agent: *\nDisallow: /admin\n');
    expect(isAllowed(p, '/admin/settings', 'Googlebot').allowed).toBe(false);
    expect(isAllowed(p, '/products', 'Googlebot').allowed).toBe(true);
  });

  it('supports * wildcards and $ end anchors', () => {
    const p = parse('User-agent: *\nDisallow: /*.pdf$\nDisallow: /private*/data\n');
    expect(isAllowed(p, '/files/report.pdf', 'Googlebot').allowed).toBe(false);
    expect(isAllowed(p, '/files/report.pdf?page=2', 'Googlebot').allowed).toBe(true);
    expect(isAllowed(p, '/private-area/data', 'Googlebot').allowed).toBe(false);
  });

  it('longest pattern wins regardless of rule order', () => {
    const p = parse('User-agent: *\nDisallow: /shop\nAllow: /shop/public\n');
    expect(isAllowed(p, '/shop/public/item', 'Googlebot').allowed).toBe(true);
    expect(isAllowed(p, '/shop/private', 'Googlebot').allowed).toBe(false);
  });

  it('allow wins on equal-length tie', () => {
    const p = parse('User-agent: *\nDisallow: /page\nAllow: /page\n');
    expect(isAllowed(p, '/page', 'Googlebot').allowed).toBe(true);
  });

  it('empty Disallow restricts nothing', () => {
    const p = parse('User-agent: *\nDisallow:\n');
    expect(isAllowed(p, '/x', 'Googlebot').allowed).toBe(true);
  });

  it('selects the most specific user-agent group and ignores * for named bots', () => {
    const p = parse('User-agent: *\nDisallow: /\nUser-agent: GPTBot\nAllow: /\n');
    expect(isAllowed(p, '/page', 'GPTBot').allowed).toBe(true);
    expect(isAllowed(p, '/page', 'Bingbot').allowed).toBe(false);
  });

  it('matches group tokens as prefixes of the bot token', () => {
    const p = parse('User-agent: Googlebot\nDisallow: /no-google\n');
    expect(isAllowed(p, '/no-google', 'Googlebot-Image').allowed).toBe(false);
    expect(isAllowed(p, '/no-google', 'Bingbot').allowed).toBe(true);
  });

  it('merges duplicate groups for the same token', () => {
    const p = parse(
      'User-agent: GPTBot\nDisallow: /a\nUser-agent: *\nDisallow: /x\nUser-agent: GPTBot\nDisallow: /b\n'
    );
    expect(isAllowed(p, '/a', 'GPTBot').allowed).toBe(false);
    expect(isAllowed(p, '/b', 'GPTBot').allowed).toBe(false);
    expect(isAllowed(p, '/x', 'GPTBot').allowed).toBe(true);
  });

  it('picks the longest matching token among multiple named groups', () => {
    const p = parse('User-agent: Googlebot\nDisallow: /broad\nUser-agent: Googlebot-Image\nDisallow: /narrow\n');
    const v = isAllowed(p, '/broad', 'Googlebot-Image');
    expect(v.allowed).toBe(true); // only the most specific group applies
    expect(isAllowed(p, '/narrow', 'Googlebot-Image').group).toBe('googlebot-image');
  });

  it('reports the matched rule and group', () => {
    const p = parse('User-agent: *\nDisallow: /admin\n');
    const v = isAllowed(p, '/admin', 'Googlebot');
    expect(v.rule).toEqual({ type: 'disallow', path: '/admin', line: 2 });
    expect(v.group).toBe('*');
  });
});

const lint = (text: string, size = 100) => lintRobots(parse(text), { size });
const codes = (text: string, size = 100) => lint(text, size).map((f) => f.code);

describe('lintRobots', () => {
  it('flags rules before any group', () => {
    expect(codes('Disallow: /a\nUser-agent: *\nDisallow: /b\n')).toContain('rule-before-group');
  });

  it('flags unparseable lines', () => {
    expect(codes('User-agent: *\nDisallow /a\n')).toContain('unparseable');
  });

  it('flags paths missing a leading slash and full-URL paths', () => {
    const found = codes('User-agent: *\nDisallow: admin\nDisallow: https://x.com/a\n');
    expect(found).toContain('path-no-slash');
    expect(found).toContain('full-url-path');
  });

  it('flags a site-wide block as an error', () => {
    const findings = lint('User-agent: *\nDisallow: /\n');
    const f = findings.find((x) => x.code === 'site-blocked')!;
    expect(f.severity).toBe('error');
    expect(f.line).toBe(2);
  });

  it('flags oversized files', () => {
    expect(codes('User-agent: *\nDisallow:\n', 501 * 1024)).toContain('too-large');
  });

  it('warns when approaching the 500 KiB limit but errors only past it', () => {
    const near = lint('User-agent: *\nDisallow:\n', 460 * 1024).find((f) => f.code === 'too-large')!;
    expect(near.severity).toBe('warning');
    expect(codes('User-agent: *\nDisallow:\n', 450 * 1024)).not.toContain('too-large');
    // Exactly at the limit is still a warning; one byte past is an error.
    expect(lint('User-agent: *\nDisallow:\n', 500 * 1024).find((f) => f.code === 'too-large')!.severity).toBe(
      'warning'
    );
    expect(lint('User-agent: *\nDisallow:\n', 500 * 1024 + 1).find((f) => f.code === 'too-large')!.severity).toBe(
      'error'
    );
  });

  it('reports content-signal and unknown directives as info', () => {
    const findings = lint('User-agent: *\nDisallow: /a\nContent-Signal: ai-train=no\nFoo-bar: baz\n');
    expect(findings.find((f) => f.code === 'content-signal')!.severity).toBe('info');
    expect(findings.find((f) => f.code === 'unknown-directive')!.severity).toBe('info');
  });

  it('flags misspelled and retired directives', () => {
    const found = codes('User-agent: *\nDissallow: /a\nNoindex: /b\nHost: x.com\n');
    expect(found).toContain('misspelled');
    expect(found.filter((c) => c === 'unsupported').length).toBe(2);
  });

  it('reports crawl-delay as info, or warning when non-numeric', () => {
    const ok = lint('User-agent: *\nCrawl-delay: 10\nSitemap: https://x.com/s.xml\n');
    expect(ok.find((f) => f.code === 'crawl-delay')!.severity).toBe('info');
    const bad = lint('User-agent: *\nCrawl-delay: fast\n');
    expect(bad.find((f) => f.code === 'crawl-delay')!.severity).toBe('warning');
  });

  it('flags rules that block CSS/JS assets', () => {
    expect(codes('User-agent: *\nDisallow: /assets\n')).toContain('blocks-assets');
    expect(codes('User-agent: *\nDisallow: /admin\n')).not.toContain('blocks-assets');
  });

  it('flags relative sitemap URLs and missing sitemaps', () => {
    expect(codes('User-agent: *\nDisallow:\nSitemap: /sitemap.xml\n')).toContain('sitemap-relative');
    expect(codes('User-agent: *\nDisallow:\n')).toContain('no-sitemap');
  });

  it('flags empty groups, duplicate groups, and BOM', () => {
    const found = codes('﻿User-agent: *\nDisallow: /x\nUser-agent: *\nDisallow: /y\nUser-agent: GPTBot\n');
    expect(found).toContain('empty-group');
    expect(found).toContain('duplicate-group');
    expect(found).toContain('bom');
  });

  it('returns no findings for a clean file', () => {
    const clean = 'User-agent: *\nDisallow: /admin\n\nSitemap: https://x.com/sitemap.xml\n';
    expect(lint(clean)).toEqual([]);
  });

  it('sorts findings by severity', () => {
    const findings = lint('Disallow: /a\nUser-agent: *\nCrawl-delay: 10\nNoindex: /x\nSitemap: https://x.com/s.xml\n');
    const severities = findings.map((f) => f.severity);
    expect(severities).toEqual(
      [...severities].sort((a, b) => ({ error: 0, warning: 1, info: 2 })[a] - { error: 0, warning: 1, info: 2 }[b])
    );
  });
});

// Reconstruct a plausible stock file from the snapshot to keep the fixture in
// sync with the constant.
const stockFile = () =>
  SHOPIFY_DEFAULT_RULES.map((entry) => {
    const colon = entry.indexOf(':');
    const name = entry.slice(0, colon);
    const value = entry
      .slice(colon + 1)
      .trim()
      .replace('{store-id}', '12345678901')
      .replace('{origin}', 'https://test-store.myshopify.com');
    const label = { 'user-agent': 'User-agent', allow: 'Allow', disallow: 'Disallow', sitemap: 'Sitemap' }[name];
    return `${label}: ${value}`;
  }).join('\n');

const STOCK_HOST = 'test-store.myshopify.com';

describe('detectShopifyDefault', () => {
  it('recognizes the stock Shopify robots.txt', () => {
    const diff = detectShopifyDefault(parse(`# we use Shopify\n${stockFile()}\n`), STOCK_HOST);
    expect(diff.isDefault).toBe(true);
    expect(diff.addedLines).toEqual([]);
    expect(diff.removedRules).toEqual([]);
  });

  it('reports added lines with their line numbers', () => {
    const text = `${stockFile()}\nUser-agent: GPTBot\nDisallow: /\n`;
    const diff = detectShopifyDefault(parse(text), STOCK_HOST);
    expect(diff.isDefault).toBe(false);
    const lineCount = stockFile().split('\n').length;
    expect(diff.addedLines).toEqual([lineCount + 1, lineCount + 2]);
  });

  it('reports removed default rules', () => {
    const lines = stockFile()
      .split('\n')
      .filter((l) => l !== 'Disallow: /admin');
    const diff = detectShopifyDefault(parse(lines.join('\n')), STOCK_HOST);
    expect(diff.isDefault).toBe(false);
    expect(diff.removedRules).toEqual(['disallow: /admin']);
  });

  it('treats any store id and matching origin as default', () => {
    const text = stockFile().replaceAll('/12345678901', '/99').replaceAll(STOCK_HOST, 'shop.example.com');
    expect(detectShopifyDefault(parse(text), 'shop.example.com').isDefault).toBe(true);
  });

  it('flags a sitemap pointing at a foreign host as a customization', () => {
    const text = stockFile().replace(
      `Sitemap: https://${STOCK_HOST}/sitemap.xml`,
      'Sitemap: https://attacker.example/sitemap.xml'
    );
    const diff = detectShopifyDefault(parse(text), STOCK_HOST);
    expect(diff.isDefault).toBe(false);
    expect(diff.removedRules).toContain('sitemap: {origin}/sitemap.xml');
  });
});

describe('against the live Shopify default shape', () => {
  const stock = parse(stockFile());

  it('keeps products crawlable but blocks checkout for Googlebot', () => {
    expect(isAllowed(stock, '/products/cool-shirt', 'Googlebot').allowed).toBe(true);
    expect(isAllowed(stock, '/checkout', 'Googlebot').allowed).toBe(false);
    expect(isAllowed(stock, '/collections/all?sort_by=price', 'Googlebot').allowed).toBe(false);
  });

  it('does not trip the asset lint on the default wpm rule', () => {
    expect(lintRobots(stock, { size: 1000 }).map((f) => f.code)).not.toContain('blocks-assets');
  });
});
