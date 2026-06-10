// robots.txt parsing, RFC 9309 matching, linting, and Shopify default
// detection. Pure module (no browser APIs) so it can be tested with `bun test`.

export interface RobotsRule {
  type: 'allow' | 'disallow';
  path: string;
  line: number;
}

export interface RobotsGroup {
  userAgents: { token: string; line: number }[];
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
        group.userAgents.push({ token: value, line });
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

// `*` matches any sequence; `$` is only special at the end of the pattern.
function patternToRegex(pattern: string): RegExp {
  let p = pattern;
  let anchored = false;
  if (p.endsWith('$')) {
    anchored = true;
    p = p.slice(0, -1);
  }
  const escaped = p
    .split('*')
    .map((part) => part.replace(/[.+?^${}()|[\]\\]/g, '\\$&'))
    .join('.*');
  return new RegExp(`^${escaped}${anchored ? '$' : ''}`);
}

function selectGroups(parsed: ParsedRobots, botToken: string): { groups: RobotsGroup[]; token: string | null } {
  const bot = botToken.toLowerCase();
  let best = '';
  for (const g of parsed.groups) {
    for (const ua of g.userAgents) {
      const t = ua.token.toLowerCase();
      if (t !== '*' && bot.startsWith(t) && t.length > best.length) best = t;
    }
  }
  if (best) {
    const groups = parsed.groups.filter((g) => g.userAgents.some((ua) => ua.token.toLowerCase() === best));
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

  let best: RobotsRule | null = null;
  let bestLen = -1;
  for (const g of groups) {
    for (const rule of g.rules) {
      if (rule.path === '') continue; // empty Disallow = no restriction
      if (!patternToRegex(rule.path).test(path)) continue;
      const len = byteLength(rule.path);
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

export function lintRobots(parsed: ParsedRobots, meta: { size: number }): LintFinding[] {
  const findings: LintFinding[] = [];

  for (const rule of parsed.orphanRules) {
    findings.push({
      severity: 'error',
      code: 'rule-before-group',
      message: `${rule.type === 'allow' ? 'Allow' : 'Disallow'} appears before any User-agent line — crawlers ignore it`,
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
        message: 'Rule uses a full URL — paths must start with `/` (this rule never matches)',
        line: rule.line
      });
    } else if (!rule.path.startsWith('/') && !rule.path.startsWith('*')) {
      findings.push({
        severity: 'error',
        code: 'path-no-slash',
        message: `Path \`${rule.path}\` does not start with \`/\` — Google ignores relative paths`,
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

  if (meta.size > 500 * KIB) {
    findings.push({
      severity: 'error',
      code: 'too-large',
      message: 'File exceeds 500 KiB — Google ignores everything past that limit'
    });
  } else if (meta.size > 450 * KIB) {
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
        message: `\`${d.name}\` looks like a misspelling of \`${correct}\` — crawlers ignore it`,
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
        message: 'Content-Signal declares AI usage preferences — Google ignores this field',
        line: d.line
      });
    } else {
      findings.push({
        severity: 'info',
        code: 'unknown-directive',
        message: `Unknown directive \`${d.name}\` — crawlers ignore it`,
        line: d.line
      });
    }
  }

  for (const g of parsed.groups) {
    if (g.crawlDelay) {
      const numeric = /^\d+(\.\d+)?$/.test(g.crawlDelay.value);
      findings.push({
        severity: numeric ? 'info' : 'warning',
        code: 'crawl-delay',
        message: numeric
          ? 'Crawl-delay is ignored by Google — honored by Bing and Yandex only'
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
          message: `Group \`${first.token}\` has no rules — that allows everything, which may be unintended`,
          line: first.line
        });
      }
    }
  }

  const seenTokens = new Map<string, number>();
  for (const g of parsed.groups) {
    for (const ua of g.userAgents) {
      const t = ua.token.toLowerCase();
      const count = (seenTokens.get(t) ?? 0) + 1;
      seenTokens.set(t, count);
      if (count === 2) {
        findings.push({
          severity: 'info',
          code: 'duplicate-group',
          message: `\`${ua.token}\` appears in multiple groups — crawlers merge them, but it is easy to misread`,
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
      message: 'No Sitemap line — adding one helps crawlers discover URLs'
    });
  }

  if (parsed.hasBom) {
    findings.push({
      severity: 'warning',
      code: 'bom',
      message: 'File starts with a UTF-8 BOM — Google tolerates it, but some parsers break',
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

function normalizeEntry(name: string, value: string): string {
  let v = value;
  if ((name === 'allow' || name === 'disallow') && /^\/\d+$/.test(v)) v = '/{store-id}';
  if (name === 'user-agent') v = v.toLowerCase();
  if (name === 'sitemap' && /^https?:\/\/[^/]+\/sitemap\.xml$/i.test(v)) v = '{origin}/sitemap.xml';
  return `${name}: ${v}`;
}

/**
 * Multiset diff of the live file's directives against the stock Shopify
 * robots.txt. Comments and blank lines are ignored; order is ignored.
 */
export function detectShopifyDefault(parsed: ParsedRobots): ShopifyDiff {
  const live: { entry: string; line: number }[] = [];

  for (const g of parsed.groups) {
    for (const ua of g.userAgents) live.push({ entry: normalizeEntry('user-agent', ua.token), line: ua.line });
    for (const r of g.rules) live.push({ entry: normalizeEntry(r.type, r.path), line: r.line });
    if (g.crawlDelay) live.push({ entry: normalizeEntry('crawl-delay', g.crawlDelay.value), line: g.crawlDelay.line });
  }
  for (const r of parsed.orphanRules) live.push({ entry: normalizeEntry(r.type, r.path), line: r.line });
  for (const d of parsed.otherDirectives) live.push({ entry: normalizeEntry(d.name, d.value), line: d.line });
  for (const s of parsed.sitemaps) live.push({ entry: normalizeEntry('sitemap', s.url), line: s.line });

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
