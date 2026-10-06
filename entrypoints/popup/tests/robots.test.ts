import { describe, expect, it } from 'bun:test';
import {
  detectShopifyDefault,
  encodePath,
  isAllowed,
  lintRobots,
  looksLikeHtml,
  parseRobots,
  SHOPIFY_DEFAULT_RULES,
  userAgentToken
} from '../utils/robots';

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
    expect(g.userAgents).toEqual([{ raw: '*', token: '*', line: 1 }]);
    expect(g.rules).toEqual([
      { type: 'disallow', path: '/admin', line: 2 },
      { type: 'allow', path: '/admin/public', line: 3 }
    ]);
  });

  it('stacks consecutive User-agent lines into one group', () => {
    const p = parse('User-agent: GPTBot\nUser-agent: CCBot\nDisallow: /\n');
    expect(p.groups.length).toBe(1);
    expect(p.groups[0]!.userAgents.map((u) => u.raw)).toEqual(['GPTBot', 'CCBot']);
  });

  it('normalizes each declared user-agent to its product token at parse time', () => {
    const p = parse('User-agent: Googlebot/2.1\nUser-agent:\nDisallow: /\n');
    expect(p.groups[0]!.userAgents.map((u) => u.token)).toEqual(['googlebot', '']);
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

  it('keeps the first Crawl-delay of a group and treats one before any group as an other directive', () => {
    const p = parse('Crawl-delay: 5\nUser-agent: *\nDisallow: /a\nUser-agent: Bot\nCrawl-delay: 10\nCrawl-delay: 20\n');
    expect(p.otherDirectives).toEqual([{ name: 'crawl-delay', value: '5', line: 1 }]);
    expect(p.groups.map((g) => g.crawlDelay)).toEqual([null, { value: '10', line: 5 }]);
  });

  it('handles CRLF and bare CR line endings with correct line numbers', () => {
    const p = parse('User-agent: *\r\nDisallow: /a\rAllow: /b\n');
    expect(p.groups[0]!.rules).toEqual([
      { type: 'disallow', path: '/a', line: 2 },
      { type: 'allow', path: '/b', line: 3 }
    ]);
  });
});

describe('isAllowed', () => {
  // No groups at all, or only a group whose empty user-agent matches no bot.
  it.each(['', 'User-agent:\nDisallow: /\n'])('allows with no applicable group in %j', (text) => {
    expect(isAllowed(parse(text), '/anything', 'Googlebot')).toEqual({ allowed: true, rule: null, group: null });
  });

  it.each([
    ['Disallow: /admin', '/admin/settings', false], // prefix match
    ['Disallow: /admin', '/products', true],
    ['Disallow: /*.pdf$\nDisallow: /private*/data', '/files/report.pdf', false], // * wildcards and $ anchors
    ['Disallow: /*.pdf$\nDisallow: /private*/data', '/files/report.pdf?page=2', true],
    ['Disallow: /*.pdf$\nDisallow: /private*/data', '/private-area/data', false],
    // An unencoded rule matches the encoded path a browser reports.
    ['Disallow: /café', '/caf%C3%A9', false],
    ['Disallow: /café', '/caf%C3%A9/menu', false],
    ['Disallow: /café', '/coffee', true],
    ['Disallow: /caf%C3%A9', '/caf%C3%A9', false], // an already-encoded rule is not double-encoded
    // URL.pathname uppercases what it encodes itself, but preserves whatever
    // case the URL was written in, so both hex-case directions have to hold.
    ['Disallow: /caf%c3%a9', '/caf%C3%A9', false],
    ['Disallow: /caf%C3%A9', '/caf%c3%a9', false],
    // Encoded and unencoded spellings are equally specific, so Allow wins the tie.
    ['Disallow: /caf%C3%A9\nAllow: /café', '/caf%C3%A9', true],
    ['Disallow: /shop\nAllow: /shop/public', '/shop/public/item', true], // longest pattern wins
    ['Disallow: /shop\nAllow: /shop/public', '/shop/private', false],
    ['Disallow: /page\nAllow: /page', '/page', true], // Allow wins an equal-length tie
    ['Disallow:', '/x', true] // an empty Disallow restricts nothing
  ])('under * with %j, allows %s: %p', (rules, path, allowed) => {
    expect(isAllowed(parse(`User-agent: *\n${rules}\n`), path, 'Googlebot').allowed).toBe(allowed);
  });

  it('applies a versioned user-agent group to the bare bot token', () => {
    const p = parse('User-agent: Googlebot/2.1\nDisallow: /admin\n\nUser-agent: *\nDisallow: /\n');
    expect(isAllowed(p, '/admin', 'Googlebot')).toMatchObject({ allowed: false, group: 'googlebot' });
    // The versioned group wins over `*`, so an unlisted path stays allowed.
    expect(isAllowed(p, '/products', 'Googlebot').allowed).toBe(true);
  });

  it('does not let an empty user-agent group swallow every bot', () => {
    const p = parse('User-agent:\nDisallow: /\n\nUser-agent: *\nAllow: /\n');
    expect(isAllowed(p, '/anything', 'Googlebot')).toMatchObject({ allowed: true, group: '*' });
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
    expect(isAllowed(p, '/broad', 'Googlebot-Image').allowed).toBe(true); // only the most specific group applies
    expect(isAllowed(p, '/narrow', 'Googlebot-Image').group).toBe('googlebot-image');
  });

  it('reports the matched rule and group', () => {
    const v = isAllowed(parse('User-agent: *\nDisallow: /admin\n'), '/admin', 'Googlebot');
    expect(v).toEqual({ allowed: false, rule: { type: 'disallow', path: '/admin', line: 2 }, group: '*' });
  });
});

describe('encodePath', () => {
  it.each([
    // Unencoded non-ASCII is encoded the way URL.pathname would.
    ['/café', '/caf%C3%A9'],
    ['/日本', '/%E6%97%A5%E6%9C%AC'],
    // An already-encoded octet is not double-encoded.
    ['/caf%C3%A9', '/caf%C3%A9'],
    ['/a%20b', '/a%20b'],
    // RFC 3986 §6.2.2.1: the two hex cases are the same octet, but the matcher
    // compares strings, so an encoded octet's hex is uppercased.
    ['/caf%c3%a9', '/caf%C3%A9'],
    ['/a%2fb', '/a%2Fb'],
    ['/caf%c3%A9', '/caf%C3%A9'],
    // A bare percent that is not a valid octet is encoded.
    ['/100%', '/100%25'],
    ['/%zz', '/%25zz'],
    ['/caf%C3%A9/thé', '/caf%C3%A9/th%C3%A9'], // encoded and unencoded segments in one path
    // Wildcard syntax, plain ASCII paths, and query strings pass through.
    ['/*.pdf$', '/*.pdf$'],
    ['/a/*/b$', '/a/*/b$'],
    ['/products?page=2&sort=a', '/products?page=2&sort=a'],
    ['', ''],
    ['/products?filter[]=red', '/products?filter%5B%5D=red'] // brackets encode on both sides, so they still match
  ])('encodes %p as %p', (path, expected) => {
    expect(encodePath(path)).toBe(expected);
  });

  // Load-bearing: the page side arrives already encoded from URL.pathname, so a
  // second pass must not shift it out from under an equally-encoded rule.
  it('is idempotent', () => {
    for (const p of ['/caf%C3%A9/menu?q=th%C3%A9', '/products?filter[]=red', '/a%20b/c', "/o'brien/(x)/a+b"]) {
      expect(encodePath(encodePath(p))).toBe(encodePath(p));
    }
  });
});

describe('userAgentToken', () => {
  // Lowercases and truncates at the first non-token character, so a version
  // suffix drops off; hyphens and underscores are token characters.
  it.each([
    ['Googlebot/2.1', 'googlebot'],
    ['Googlebot', 'googlebot'],
    ['OAI-SearchBot', 'oai-searchbot'],
    ['some_bot', 'some_bot'],
    ['Bingbot 2.0', 'bingbot'],
    ['bot(compatible)', 'bot'],
    // Empty for values with no leading token character.
    ['', ''],
    ['   ', ''],
    ['*', ''],
    ['2.1', '']
  ])('reduces %p to %p', (ua, token) => {
    expect(userAgentToken(ua)).toBe(token);
  });
});

const lint = (text: string, size = 100) => lintRobots(parse(text), { size });
const codes = (text: string) => lint(text).map((f) => f.code);
const find = (text: string, code: string, size?: number) => lint(text, size).find((f) => f.code === code);

describe('lintRobots', () => {
  it.each([
    ['rule-before-group', 'error', 'Disallow: /a\nUser-agent: *\nDisallow: /b\n'],
    ['unparseable', 'error', 'User-agent: *\nDisallow /a\n'],
    ['path-no-slash', 'error', 'User-agent: *\nDisallow: admin\n'],
    ['full-url-path', 'warning', 'User-agent: *\nDisallow: https://x.com/a\n'],
    ['content-signal', 'info', 'User-agent: *\nDisallow: /a\nContent-Signal: ai-train=no\n'],
    ['unknown-directive', 'info', 'User-agent: *\nDisallow: /a\nFoo-bar: baz\n'],
    ['crawl-delay', 'info', 'User-agent: *\nCrawl-delay: 10\n'],
    ['crawl-delay', 'warning', 'User-agent: *\nCrawl-delay: fast\n'],
    ['blocks-assets', 'warning', 'User-agent: *\nDisallow: /assets\n'],
    ['sitemap-relative', 'warning', 'User-agent: *\nDisallow:\nSitemap: /sitemap.xml\n'],
    ['no-sitemap', 'info', 'User-agent: *\nDisallow:\n']
  ])('flags %s as %s in %j', (code, severity, text) => {
    expect(find(text, code)?.severity).toBe(severity);
  });

  it('flags a user-agent with no product token, quoting the value when there is one', () => {
    expect(find('User-agent:\nDisallow: /admin\n', 'empty-user-agent')).toMatchObject({
      severity: 'info',
      line: 1,
      message: expect.stringContaining('matches no crawler')
    });
    expect(find('User-agent: 2.1\nDisallow: /a\n', 'empty-user-agent')?.message).toContain('`2.1`');
  });

  it('counts a versioned and bare spelling of one bot as a duplicate group, not a tokenless one', () => {
    const found = codes('User-agent: Googlebot\nDisallow: /a\n\nUser-agent: Googlebot/2.1\nDisallow: /b\n');
    expect(found).toContain('duplicate-group');
    expect(found).not.toContain('empty-user-agent');
  });

  it('flags a site-wide block as an error', () => {
    expect(find('User-agent: *\nDisallow: /\n', 'site-blocked')).toMatchObject({ severity: 'error', line: 2 });
  });

  // Warns when approaching the 500 KiB limit; exactly at it is still a warning, one byte past is an error.
  it.each([
    [450 * 1024, undefined],
    [460 * 1024, 'warning'],
    [500 * 1024, 'warning'],
    [500 * 1024 + 1, 'error']
  ])('rates a %i byte file as too-large: %p', (size, severity) => {
    expect(find('User-agent: *\nDisallow:\n', 'too-large', size)?.severity).toBe(severity);
  });

  it('flags misspelled and retired directives', () => {
    const found = codes('User-agent: *\nDissallow: /a\nNoindex: /b\nHost: x.com\n');
    expect(found).toContain('misspelled');
    expect(found.filter((c) => c === 'unsupported').length).toBe(2);
  });

  it('flags empty groups, duplicate groups, and BOM', () => {
    const found = codes('﻿User-agent: *\nDisallow: /x\nUser-agent: *\nDisallow: /y\nUser-agent: GPTBot\n');
    expect(found).toEqual(expect.arrayContaining(['empty-group', 'duplicate-group', 'bom']));
  });

  it('returns no findings for a clean file', () => {
    expect(lint('User-agent: *\nDisallow: /admin\n\nSitemap: https://x.com/sitemap.xml\n')).toEqual([]);
  });

  it('sorts findings by severity, then line', () => {
    const text = '﻿Disallow: /a\nUser-agent: *\nCrawl-delay: 10\nNoindex: /x\nSitemap: https://x.com/s.xml\n';
    expect(codes(text)).toEqual(['rule-before-group', 'bom', 'unsupported', 'crawl-delay']);
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
    expect(diff).toEqual({ isDefault: true, addedLines: [], removedRules: [] });
  });

  it('reports added lines with their line numbers', () => {
    const diff = detectShopifyDefault(parse(`${stockFile()}\nUser-agent: GPTBot\nDisallow: /\n`), STOCK_HOST);
    expect(diff.isDefault).toBe(false);
    const lineCount = stockFile().split('\n').length;
    expect(diff.addedLines).toEqual([lineCount + 1, lineCount + 2]);
  });

  it('reports removed default rules', () => {
    const text = stockFile().replace(/^Disallow: \/admin$/gm, '');
    const diff = detectShopifyDefault(parse(text), STOCK_HOST);
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
