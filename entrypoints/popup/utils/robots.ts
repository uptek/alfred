// robots.txt parsing, RFC 9309 matching, linting, and Shopify default
// detection. The parsing/matching/lint logic is pure (no browser APIs) so it
// can be tested with `bun test`; `getRobots` is the lone content-script wrapper.
import type { RobotsResponse } from './types';
import { queryActiveTab } from './messaging';

/**
 * Fetches the site's robots.txt via the content script. The fetch runs in the
 * page context, reusing its HTTP cache, warm connection, and cookies — fast and
 * reliable where an extension-origin fetch can hang on proxies or bot protection.
 * @returns {Promise<RobotsResponse | null>} Raw file + HTTP metadata, or null when the tab is unreachable.
 */
export const getRobots = (): Promise<RobotsResponse | null> =>
  queryActiveTab<RobotsResponse | null>(
    'get_robots',
    null,
    (r) => !!r && typeof (r as { status?: unknown }).status === 'number'
  );

export interface RobotsRule {
  type: 'allow' | 'disallow';
  path: string;
  line: number;
}

export interface RobotsGroup {
  /** `token` is the normalized product token used for matching; `raw` is the line as written. */
  userAgents: { raw: string; token: string; line: number }[];
  rules: RobotsRule[];
  crawlDelay: { value: string; line: number } | null;
}

export interface ParsedRobots {
  groups: RobotsGroup[];
  sitemaps: { url: string; line: number }[];
  lines: string[];
  hasBom: boolean;
  orphanRules: RobotsRule[];
  otherDirectives: { name: string; value: string; line: number }[];
  invalidLines: number[];
}

export interface Verdict {
  allowed: boolean;
  rule: RobotsRule | null;
  /** User-agent token whose group decided the verdict ('*' for the wildcard group). */
  group: string | null;
}

export type LintSeverity = 'error' | 'warning' | 'info';

export interface LintFinding {
  severity: LintSeverity;
  code: string;
  message: string;
  line?: number;
}

export interface ShopifyDiff {
  isDefault: boolean;
  /** Line numbers in the live file that are not part of the stock Shopify robots.txt. */
  addedLines: number[];
  /** Stock rules missing from the live file (normalized `directive: value` form). */
  removedRules: string[];
}

export type AiBotPurpose = 'training' | 'search' | 'fetch';

export interface AiBot {
  token: string;
  vendor: string;
  purpose: AiBotPurpose;
}

export const AI_BOTS: AiBot[] = [
  { token: 'GPTBot', vendor: 'OpenAI', purpose: 'training' },
  { token: 'ClaudeBot', vendor: 'Anthropic', purpose: 'training' },
  { token: 'Google-Extended', vendor: 'Google', purpose: 'training' },
  { token: 'Applebot-Extended', vendor: 'Apple', purpose: 'training' },
  { token: 'CCBot', vendor: 'Common Crawl', purpose: 'training' },
  { token: 'Bytespider', vendor: 'ByteDance', purpose: 'training' },
  { token: 'Meta-ExternalAgent', vendor: 'Meta', purpose: 'training' },
  { token: 'OAI-SearchBot', vendor: 'OpenAI', purpose: 'search' },
  { token: 'PerplexityBot', vendor: 'Perplexity', purpose: 'search' },
  { token: 'Claude-SearchBot', vendor: 'Anthropic', purpose: 'search' },
  { token: 'ChatGPT-User', vendor: 'OpenAI', purpose: 'fetch' },
  { token: 'Claude-User', vendor: 'Anthropic', purpose: 'fetch' },
  { token: 'Perplexity-User', vendor: 'Perplexity', purpose: 'fetch' }
];

const MISSPELLINGS: Record<string, string> = {
  dissallow: 'Disallow',
  disalow: 'Disallow',
  dissalow: 'Disallow',
  useragent: 'User-agent',
  'user agent': 'User-agent',
  'crawl delay': 'Crawl-delay',
  sitemaps: 'Sitemap'
};

// Directives Google documents as ignored. noindex/nofollow were formally
// retired on Sept 1, 2019; the rest were never supported.
const IGNORED_DIRECTIVES = new Set([
  'noindex',
  'nofollow',
  'host',
  'clean-param',
  'request-rate',
  'visit-time',
  'revisit-after'
]);

export function parseRobots(text: string): ParsedRobots {
  const hasBom = text.charCodeAt(0) === 0xfeff;
  const body = hasBom ? text.slice(1) : text;
  const lines = body.split(/\r\n|\r|\n/);

  const parsed: ParsedRobots = {
    groups: [],
    sitemaps: [],
    lines,
    hasBom,
    orphanRules: [],
    otherDirectives: [],
    invalidLines: []
  };

  let group: RobotsGroup | null = null;
  // A User-agent line after rules starts a new group; consecutive User-agent
  // lines stack onto the same group (RFC 9309 §2.1).
  let groupHasRules = false;

  lines.forEach((raw, i) => {
    const line = i + 1;
    const hash = raw.indexOf('#');
    const content = (hash === -1 ? raw : raw.slice(0, hash)).trim();
    if (!content) return;

    const colon = content.indexOf(':');
    if (colon === -1) {
      parsed.invalidLines.push(line);
      return;
    }

    const name = content.slice(0, colon).trim().toLowerCase();
    const value = content.slice(colon + 1).trim();

    switch (name) {
      case 'user-agent':
        if (!group || groupHasRules) {
          group = { userAgents: [], rules: [], crawlDelay: null };
          groupHasRules = false;
          parsed.groups.push(group);
        }
        group.userAgents.push({ raw: value, token: value === '*' ? '*' : userAgentToken(value), line });
        break;
      case 'allow':
      case 'disallow': {
        const rule: RobotsRule = { type: name, path: value, line };
        if (group) {
          group.rules.push(rule);
          groupHasRules = true;
        } else {
          parsed.orphanRules.push(rule);
        }
        break;
      }
      case 'crawl-delay':
        if (group) {
          group.crawlDelay ??= { value, line };
          groupHasRules = true;
        } else {
          parsed.otherDirectives.push({ name, value, line });
        }
        break;
      case 'sitemap':
        parsed.sitemaps.push({ url: value, line });
        break;
      default:
        parsed.otherDirectives.push({ name, value, line });
    }
  });

  return parsed;
}

const encoder = new TextEncoder();

function byteLength(s: string): number {
  return encoder.encode(s).length;
}

/** SPA fallbacks commonly serve index.html with a 200 at /robots.txt. */
export function looksLikeHtml(text: string): boolean {
  return /<html|<!doctype/i.test(text.slice(0, 1024));
}

/** A percent-encoded octet, the one form already-encoded input must survive as-is. */
const PCT_TRIPLET = /%[0-9A-Fa-f]{2}/g;

/**
 * Brings a rule path into the same percent-encoded form as `URL.pathname`, so
 * `Disallow: /café` compares against `/caf%C3%A9` (RFC 9309 §2.2.2 requires
 * both sides be encoded consistently). Existing `%XX` octets are left alone
 * rather than re-encoded into `%25XX`, and `*`/`$` pass through `encodeURI`
 * untouched, so the wildcard syntax survives.
 * @param {string} path - A rule path or page path.
 * @returns {string} The path with unencoded non-ASCII and unsafe octets encoded.
 */
export function encodePath(path: string): string {
  let out = '';
  let last = 0;
  PCT_TRIPLET.lastIndex = 0;
  for (let m = PCT_TRIPLET.exec(path); m !== null; m = PCT_TRIPLET.exec(path)) {
    out += encodeURI(path.slice(last, m.index)) + m[0];
    last = m.index + m[0].length;
  }
  return out + encodeURI(path.slice(last));
}

/**
 * RFC 9309 pattern match: `*` matches any sequence, `$` is only special at
 * the end. Both arguments must already have been through encodePath, so an
 * unencoded rule compares against the browser's encoded path. Greedy
 * two-pointer scan — linear in path length, so hostile patterns with many
 * wildcards can't trigger regex-style catastrophic backtracking (the file comes
 * from the site being inspected, i.e. untrusted).
 */
function matchesPattern(pattern: string, path: string): boolean {
  let p = pattern;
  let anchored = false;
  if (p.endsWith('$')) {
    anchored = true;
    p = p.slice(0, -1);
  }
  const parts = p.split('*');
  if (!path.startsWith(parts[0]!)) return false;
  let pos = parts[0]!.length;
  for (let i = 1; i < parts.length; i++) {
    const part = parts[i]!;
    if (part === '') continue; // consecutive or trailing '*'
    if (anchored && i === parts.length - 1) {
      return path.endsWith(part) && path.length - part.length >= pos;
    }
    const idx = path.indexOf(part, pos);
    if (idx === -1) return false;
    pos = idx + part.length;
  }
  if (anchored) {
    // A trailing '*' before '$' consumes the rest; otherwise the prefix
    // matched so far must already be the whole path.
    return parts[parts.length - 1] === '' || pos === path.length;
  }
  return true;
}

/**
 * Reduces a declared `User-agent:` value to the product token crawlers match
 * on: lowercased, truncated at the first character outside RFC 9309's
 * `[A-Za-z_-]` set. That drops the version suffix so a group declared as
 * `Googlebot/2.1` still applies to the bot token `Googlebot`, matching how
 * Google's own parser reads the line.
 * @param {string} raw - The value as written in robots.txt.
 * @returns {string} The bare product token, '' when the value has no leading
 *   token character (an empty or punctuation-only User-agent line).
 */
export function userAgentToken(raw: string): string {
  return /^[A-Za-z_-]*/.exec(raw.trim())![0]!.toLowerCase();
}

function selectGroups(parsed: ParsedRobots, botToken: string): { groups: RobotsGroup[]; token: string | null } {
  const bot = userAgentToken(botToken);
  let best = '';
  for (const g of parsed.groups) {
    for (const ua of g.userAgents) {
      // '' would prefix-match every bot; such a line declares no group at all.
      if (ua.token === '*' || ua.token === '') continue;
      if (bot.startsWith(ua.token) && ua.token.length > best.length) best = ua.token;
    }
  }
  if (best) {
    const groups = parsed.groups.filter((g) => g.userAgents.some((ua) => ua.token === best));
    return { groups, token: best };
  }
  const wildcard = parsed.groups.filter((g) => g.userAgents.some((ua) => ua.token === '*'));
  return { groups: wildcard, token: wildcard.length ? '*' : null };
}

/**
 * RFC 9309 matching: most specific user-agent group (longest token that
 * prefixes the bot token, falling back to `*`), then longest matching path
 * pattern wins; on a tie Allow beats Disallow; no match means allowed.
 * `path` should include the query string when present.
 */
export function isAllowed(parsed: ParsedRobots, path: string, botToken: string): Verdict {
  const { groups, token } = selectGroups(parsed, botToken);
  if (groups.length === 0) return { allowed: true, rule: null, group: null };

  // Encoded once here rather than per rule; both sides must be in the same form.
  const target = encodePath(path);
  let best: RobotsRule | null = null;
  let bestLen = -1;
  for (const g of groups) {
    for (const rule of g.rules) {
      if (rule.path === '') continue; // empty Disallow = no restriction
      const pattern = encodePath(rule.path);
      if (!matchesPattern(pattern, target)) continue;
      // Encoded length, so `/café` and `/caf%C3%A9` rank as the same specificity.
      const len = byteLength(pattern);
      if (len > bestLen) {
        best = rule;
        bestLen = len;
      } else if (len === bestLen && rule.type === 'allow' && best?.type === 'disallow') {
        best = rule;
      }
    }
  }

  if (!best) return { allowed: true, rule: null, group: token };
  return { allowed: best.type === 'allow', rule: best, group: token };
}

// Representative asset URLs used to detect rules that block CSS/JS rendering
// resources (Shopify CDN theme assets and a generic /assets path).
const ASSET_PROBES = [
  '/cdn/shop/t/1/assets/theme.css',
  '/cdn/shop/t/1/assets/theme.js',
  '/assets/app.css',
  '/assets/app.js'
];

const KIB = 1024;
/** Google stops processing robots.txt past this size. */
const GOOGLE_SIZE_LIMIT = 500 * KIB;
/** Warn at 90% of the limit. */
const SIZE_WARN_THRESHOLD = 450 * KIB;

export function lintRobots(parsed: ParsedRobots, meta: { size: number }): LintFinding[] {
  const findings: LintFinding[] = [];

  for (const rule of parsed.orphanRules) {
    findings.push({
      severity: 'error',
      code: 'rule-before-group',
      message: `${rule.type === 'allow' ? 'Allow' : 'Disallow'} appears before any User-agent line: crawlers ignore it`,
      line: rule.line
    });
  }

  for (const line of parsed.invalidLines) {
    findings.push({
      severity: 'error',
      code: 'unparseable',
      message: 'Line has no `:` separator and cannot be parsed',
      line
    });
  }

  const allRules = [...parsed.orphanRules, ...parsed.groups.flatMap((g) => g.rules)];
  for (const rule of allRules) {
    if (rule.path === '') continue;
    if (/^https?:\/\//i.test(rule.path)) {
      findings.push({
        severity: 'warning',
        code: 'full-url-path',
        message: 'Rule uses a full URL: paths must start with `/` (this rule never matches)',
        line: rule.line
      });
    } else if (!rule.path.startsWith('/') && !rule.path.startsWith('*')) {
      findings.push({
        severity: 'error',
        code: 'path-no-slash',
        message: `Path \`${rule.path}\` does not start with \`/\`: Google ignores relative paths`,
        line: rule.line
      });
    }
  }

  const rootVerdict = isAllowed(parsed, '/', 'Googlebot');
  if (!rootVerdict.allowed) {
    findings.push({
      severity: 'error',
      code: 'site-blocked',
      message: 'Googlebot is blocked from the entire site',
      ...(rootVerdict.rule ? { line: rootVerdict.rule.line } : {})
    });
  }

  if (meta.size > GOOGLE_SIZE_LIMIT) {
    findings.push({
      severity: 'error',
      code: 'too-large',
      message: 'File exceeds 500 KiB. Google ignores everything past that limit'
    });
  } else if (meta.size > SIZE_WARN_THRESHOLD) {
    findings.push({
      severity: 'warning',
      code: 'too-large',
      message: 'File is close to Google’s 500 KiB limit'
    });
  }

  for (const d of parsed.otherDirectives) {
    const correct = MISSPELLINGS[d.name];
    if (correct) {
      findings.push({
        severity: 'warning',
        code: 'misspelled',
        message: `\`${d.name}\` looks like a misspelling of \`${correct}\`: crawlers ignore it`,
        line: d.line
      });
    } else if (d.name === 'noindex' || d.name === 'nofollow') {
      findings.push({
        severity: 'warning',
        code: 'unsupported',
        message: `\`${d.name}\` in robots.txt is not supported by Google and is ignored (retired Sept 2019)`,
        line: d.line
      });
    } else if (IGNORED_DIRECTIVES.has(d.name)) {
      findings.push({
        severity: 'warning',
        code: 'unsupported',
        message: `\`${d.name}\` is ignored by Google`,
        line: d.line
      });
    } else if (d.name === 'content-signal') {
      findings.push({
        severity: 'info',
        code: 'content-signal',
        message: 'Content-Signal declares AI usage preferences, but Google ignores this field',
        line: d.line
      });
    } else {
      findings.push({
        severity: 'info',
        code: 'unknown-directive',
        message: `Unknown directive \`${d.name}\`: crawlers ignore it`,
        line: d.line
      });
    }
  }

  for (const g of parsed.groups) {
    for (const ua of g.userAgents) {
      // '' when the value is blank or has no token character at all. Such a
      // group matches no crawler, so its rules never apply to anyone.
      if (ua.token === '') {
        findings.push({
          severity: 'info',
          code: 'empty-user-agent',
          message: ua.raw
            ? `User-agent \`${ua.raw}\` has no product token: this group matches no crawler`
            : 'User-agent has no value: this group matches no crawler',
          line: ua.line
        });
      }
    }
    if (g.crawlDelay) {
      const numeric = /^\d+(\.\d+)?$/.test(g.crawlDelay.value);
      findings.push({
        severity: numeric ? 'info' : 'warning',
        code: 'crawl-delay',
        message: numeric
          ? 'Crawl-delay is ignored by Google, honored by Bing and Yandex only'
          : `Crawl-delay value \`${g.crawlDelay.value}\` is not a number`,
        line: g.crawlDelay.line
      });
    }
    if (g.rules.length === 0 && !g.crawlDelay) {
      const first = g.userAgents[0];
      if (first) {
        findings.push({
          severity: 'info',
          code: 'empty-group',
          message: `Group \`${first.raw}\` has no rules: that allows everything, which may be unintended`,
          line: first.line
        });
      }
    }
  }

  const seenTokens = new Map<string, number>();
  for (const g of parsed.groups) {
    for (const ua of g.userAgents) {
      // Keyed on the normalized token, so `Googlebot` and `Googlebot/2.1` count
      // as the one group they actually merge into. Tokenless values are
      // reported separately by the empty-user-agent lint.
      if (ua.token === '') continue;
      const count = (seenTokens.get(ua.token) ?? 0) + 1;
      seenTokens.set(ua.token, count);
      if (count === 2) {
        findings.push({
          severity: 'info',
          code: 'duplicate-group',
          message: `\`${ua.raw}\` appears in multiple groups: crawlers merge them, but it is easy to misread`,
          line: ua.line
        });
      }
    }
  }

  for (const probe of ASSET_PROBES) {
    const verdict = isAllowed(parsed, probe, 'Googlebot');
    if (!verdict.allowed) {
      findings.push({
        severity: 'warning',
        code: 'blocks-assets',
        message: 'Blocks CSS/JS assets Google needs to render the page',
        ...(verdict.rule ? { line: verdict.rule.line } : {})
      });
      break;
    }
  }

  for (const s of parsed.sitemaps) {
    if (!/^https?:\/\//i.test(s.url)) {
      findings.push({
        severity: 'warning',
        code: 'sitemap-relative',
        message: 'Sitemap URL must be absolute (https://…)',
        line: s.line
      });
    }
  }
  if (parsed.sitemaps.length === 0) {
    findings.push({
      severity: 'info',
      code: 'no-sitemap',
      message: 'No Sitemap line. Adding one helps crawlers discover URLs'
    });
  }

  if (parsed.hasBom) {
    findings.push({
      severity: 'warning',
      code: 'bom',
      message: 'File starts with a UTF-8 BOM. Google tolerates it, but some parsers break',
      line: 1
    });
  }

  const order: Record<LintSeverity, number> = { error: 0, warning: 1, info: 2 };
  return findings.sort((a, b) => order[a.severity] - order[b.severity] || (a.line ?? 0) - (b.line ?? 0));
}

// Normalized rules of Shopify's generated robots.txt, captured 2026-06-10 from
// theme-dawn-demo.myshopify.com/robots.txt. `/{store-id}` and `{origin}` are
// placeholders for store-specific values. Refresh this snapshot when Shopify
// revises its default (stock stores will start showing "Customized").
export const SHOPIFY_DEFAULT_RULES: string[] = [
  'user-agent: *',
  'allow: /',
  'allow: /products/account',
  'allow: /products/orders',
  'allow: /products/checkout',
  'allow: /*/products/account',
  'allow: /*/products/orders',
  'allow: /*/products/checkout',
  'allow: /collections/account',
  'allow: /collections/orders',
  'allow: /collections/checkout',
  'allow: /*/collections/account',
  'allow: /*/collections/orders',
  'allow: /*/collections/checkout',
  'allow: /pages/checkout',
  'allow: /*/pages/checkout',
  'allow: /blogs/*account',
  'allow: /blogs/*orders',
  'allow: /blogs/*checkout',
  'allow: /*/blogs/*account',
  'allow: /*/blogs/*orders',
  'allow: /*/blogs/*checkout',
  'disallow: /admin',
  'disallow: /cart/',
  'disallow: /*/cart/',
  'disallow: /checkout',
  'disallow: /*/checkout',
  'disallow: /checkouts/',
  'disallow: /*/checkouts/',
  'disallow: /orders',
  'disallow: /*/orders',
  'allow: /account/login',
  'allow: /*/account/login',
  'disallow: /account',
  'disallow: /*/account',
  'disallow: /{store-id}',
  'disallow: /cdn/wpm/*.js',
  'disallow: /services',
  'disallow: /sf_*',
  'disallow: /cart.js',
  'disallow: /*/cart.js',
  'disallow: /recommendations/products',
  'disallow: /*/recommendations/products',
  'disallow: /collections/*sort_by*',
  'disallow: /*/collections/*sort_by*',
  'disallow: /collections/*+*',
  'disallow: /collections/*%2B*',
  'disallow: /collections/*%2b*',
  'disallow: /*/collections/*+*',
  'disallow: /*/collections/*%2B*',
  'disallow: /*/collections/*%2b*',
  'disallow: /collections/*filter*&*filter*',
  'disallow: /*/collections/*filter*&*filter*',
  'disallow: /blogs/*+*',
  'disallow: /blogs/*%2B*',
  'disallow: /blogs/*%2b*',
  'disallow: /*/blogs/*+*',
  'disallow: /*/blogs/*%2B*',
  'disallow: /*/blogs/*%2b*',
  'disallow: /*?*ls=*&ls=*',
  'disallow: /*?*ls%3*ls%3*',
  'disallow: /*?*oseid=*',
  'disallow: /*?*preview_theme_id=*',
  'disallow: /*?*preview_script_id=*',
  'user-agent: adsbot-google',
  'allow: /products/',
  'allow: /*/products/',
  'allow: /collections/',
  'allow: /*/collections/',
  'allow: /pages/',
  'allow: /*/pages/',
  'allow: /blogs/',
  'allow: /*/blogs/',
  'allow: /pages/checkout',
  'allow: /*/pages/checkout',
  'allow: /blogs/*checkout',
  'allow: /*/blogs/*checkout',
  'disallow: /checkout',
  'disallow: /*/checkout',
  'disallow: /checkouts/',
  'disallow: /*/checkouts/',
  'disallow: /orders',
  'disallow: /*/orders',
  'disallow: /services',
  'disallow: /sf_*',
  'disallow: /{store-id}',
  'disallow: /cdn/wpm/*.js',
  'sitemap: {origin}/sitemap.xml'
];

function normalizeEntry(name: string, value: string, pageHost: string | null): string {
  let v = value;
  if ((name === 'allow' || name === 'disallow') && /^\/\d+$/.test(v)) v = '/{store-id}';
  if (name === 'user-agent') v = v.toLowerCase();
  if (name === 'sitemap' && /^https?:\/\/[^/]+\/sitemap\.xml$/i.test(v)) {
    // Only treat the sitemap as stock when it points at the store itself — a
    // sitemap redirected to a foreign host is a customization worth surfacing.
    try {
      if (pageHost !== null && new URL(v).host.toLowerCase() === pageHost.toLowerCase()) {
        v = '{origin}/sitemap.xml';
      }
    } catch {
      // unparseable URL: leave as-is, shows up in the diff
    }
  }
  return `${name}: ${v}`;
}

/**
 * Multiset diff of the live file's directives against the stock Shopify
 * robots.txt. Comments and blank lines are ignored; order is ignored.
 * @param pageHost - Host of the store being inspected; sitemap URLs only
 *   normalize to the stock placeholder when they point at this host.
 */
export function detectShopifyDefault(parsed: ParsedRobots, pageHost: string | null): ShopifyDiff {
  const live: { entry: string; line: number }[] = [];

  for (const g of parsed.groups) {
    for (const ua of g.userAgents) {
      live.push({ entry: normalizeEntry('user-agent', ua.raw, pageHost), line: ua.line });
    }
    for (const r of g.rules) live.push({ entry: normalizeEntry(r.type, r.path, pageHost), line: r.line });
    if (g.crawlDelay) {
      live.push({ entry: normalizeEntry('crawl-delay', g.crawlDelay.value, pageHost), line: g.crawlDelay.line });
    }
  }
  for (const r of parsed.orphanRules) live.push({ entry: normalizeEntry(r.type, r.path, pageHost), line: r.line });
  for (const d of parsed.otherDirectives) live.push({ entry: normalizeEntry(d.name, d.value, pageHost), line: d.line });
  for (const s of parsed.sitemaps) live.push({ entry: normalizeEntry('sitemap', s.url, pageHost), line: s.line });

  const remaining = new Map<string, number>();
  for (const entry of SHOPIFY_DEFAULT_RULES) {
    const key = entry.toLowerCase();
    remaining.set(key, (remaining.get(key) ?? 0) + 1);
  }

  const addedLines: number[] = [];
  for (const { entry, line } of live) {
    const key = entry.toLowerCase();
    const count = remaining.get(key) ?? 0;
    if (count > 0) {
      remaining.set(key, count - 1);
    } else {
      addedLines.push(line);
    }
  }

  const removedRules: string[] = [];
  for (const [entry, count] of remaining) {
    for (let i = 0; i < count; i++) removedRules.push(entry);
  }

  return {
    isDefault: addedLines.length === 0 && removedRules.length === 0,
    addedLines: addedLines.sort((a, b) => a - b),
    removedRules
  };
}

/** Minimal fetch-result shape analyzeRobots needs (RobotsResponse satisfies it). */
export interface RobotsFetchResult {
  ok: boolean;
  status: number;
  content: string;
  size: number;
  truncated?: boolean;
}

export interface RobotsAnalysis {
  /** Fetch succeeded with a 2xx. */
  ok: boolean;
  isHtml: boolean;
  parsed: ParsedRobots | null;
  /** Capped at MAX_FINDINGS for rendering; use errorCount for totals. */
  findings: LintFinding[];
  /** Error-severity count over ALL findings, computed before the cap. */
  errorCount: number;
  shopifyDiff: ShopifyDiff | null;
}

/** Bound the Issues list (and its DOM) — a garbage 600 KiB body could otherwise yield ~100k findings. */
const MAX_FINDINGS = 100;

/**
 * Single analysis pipeline shared by the tab badge (App.svelte) and the
 * Robots tab, so the two surfaces can never disagree about the same response.
 * @param pageUrl - URL of the inspected page (host scopes the Shopify sitemap check).
 */
export function analyzeRobots(
  robots: RobotsFetchResult | null,
  isShopify: boolean,
  pageUrl: string | null
): RobotsAnalysis {
  const ok = robots !== null && robots.ok && robots.status >= 200 && robots.status < 300;
  if (!ok) return { ok: false, isHtml: false, parsed: null, findings: [], errorCount: 0, shopifyDiff: null };

  const parsed = parseRobots(robots.content);

  // An HTML body (SPA fallback route) is one misconfiguration, not hundreds
  // of unparseable lines — short-circuit so findings don't flood.
  if (looksLikeHtml(robots.content)) {
    return {
      ok,
      isHtml: true,
      parsed,
      findings: [
        {
          severity: 'warning',
          code: 'serves-html',
          message: 'robots.txt serves HTML instead of plain text: crawlers may ignore it'
        }
      ],
      errorCount: 0,
      shopifyDiff: null
    };
  }

  let findings = lintRobots(parsed, { size: robots.size });
  const errorCount = findings.reduce((n, f) => n + (f.severity === 'error' ? 1 : 0), 0);
  if (findings.length > MAX_FINDINGS) {
    const hidden = findings.length - MAX_FINDINGS;
    findings = findings.slice(0, MAX_FINDINGS);
    findings.push({
      severity: 'info',
      code: 'findings-capped',
      message: `… ${hidden} more findings not shown`
    });
  }

  if (robots.truncated) {
    findings.push({
      severity: 'warning',
      code: 'truncated',
      message: 'File is larger than crawlers process: only the beginning is analyzed and shown below'
    });
  }

  let pageHost: string | null = null;
  if (pageUrl) {
    try {
      pageHost = new URL(pageUrl).host;
    } catch {
      pageHost = null;
    }
  }
  const shopifyDiff = isShopify ? detectShopifyDefault(parsed, pageHost) : null;
  if (shopifyDiff && !shopifyDiff.isDefault) {
    findings.push({
      severity: 'info',
      code: 'shopify-customized',
      message: `Differs from the default Shopify robots.txt (${shopifyDiff.addedLines.length} added, ${shopifyDiff.removedRules.length} removed, added lines highlighted below)`
    });
  }

  return { ok, isHtml: false, parsed, findings, errorCount, shopifyDiff };
}
