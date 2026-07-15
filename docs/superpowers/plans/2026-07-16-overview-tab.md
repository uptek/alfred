# Overview Tab Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the complete Overview SEO tab: indexability verdict, SERP preview, core meta + technical checks, raw-vs-rendered comparison, Shopify-specific checks, social profiles, and quick links.

**Architecture:** Three data sources feed one pure analyzer. (1) `get_overview` content-script action extracts everything DOM-readable synchronously; (2) `get_overview_network` re-fetches the current URL from page context for HTTP status, X-Robots-Tag, raw-HTML head tags, and llms.txt presence (non-gating, like `get_robots`); (3) `get_shopify_context` relays main-world `window.Shopify` / `window.ShopifyAnalytics` data via the existing postMessage bridge. The popup combines them with the already-fetched robots.txt, schema blocks, and links in `analyzeOverview()` (pure, bun-tested), rendered by `Overview.svelte` with a `SerpPreview.svelte` sub-component.

**Tech Stack:** WXT, Svelte 5 runes, TypeScript, Bun test runner.

## Global Constraints

- Svelte 5 Runes API only (`$state`, `$props`, `$derived`, `$effect`); no JSX.
- Unit tests in `entrypoints/popup/tests/*.test.ts`, run with `bun test`; tests are excluded from tsconfig.
- Analyzer logic must be pure (no browser APIs) so bun can test it; browser calls live only in getters/handlers.
- Commit messages: Conventional Commits, single line, imperative, no body, **no attribution lines of any kind**.
- Comments: WHY only, never restate code; no "added/changed" narration.
- Component styles use existing CSS custom properties (`--text`, `--text-muted`, `--text-secondary`, `--text-label`, `--border`, `--bg`, `--bg-raised`, `--bg-hover`, `--error-bg`, `--error-strong`, `--success-bg`, `--success-strong`, `--warning-bg`, `--warning-strong`, `--accent`) for dark-mode compatibility. If `--warning-bg`/`--warning-strong` do not exist in `entrypoints/popup/index.html`'s token sheet, check the tokens used by `Robots.svelte` for warning styling and reuse those.
- Do NOT run `bun run dev`, builds, or typechecks during iteration (user has HMR running). `bun test` is fine.
- Do NOT bump the version or touch CHANGELOG (done separately via /version-bump at ship time).
- Analytics events must be added to BOTH `utils/analytics-actions.ts` and `VALID_ACTIONS` in `supabase/functions/track/index.ts` — a parity test fails otherwise.

---

### Task 1: Types and PopupSection registration

**Files:**

- Modify: `entrypoints/popup/utils/types.ts` (append at end)
- Modify: `entrypoints/popup/stores/tabState.ts:7`

**Interfaces:**

- Consumes: nothing.
- Produces: `RawOverview`, `RawCanonical`, `OverviewNetwork`, `ShopifyContext`, `RobotsDirective`, `CanonicalInfo`, `CanonicalStateKind`, `IndexabilityVerdict`, `IndexabilityStatus`, `OverviewSeverity`, `OverviewFinding`, `OverviewAnalysis`, `SocialProfile` — all consumed by Tasks 2–10. `PopupSection` gains `'overview'`.

- [ ] **Step 1: Append the Overview types to `entrypoints/popup/utils/types.ts`**

```ts
export interface RawCanonical {
  raw: string; // href attribute as written (detects relative canonicals)
  resolved: string; // absolute URL after browser resolution
  inHead: boolean;
}

export interface RawOverview {
  url: string; // location.href
  titles: string[]; // textContent of every <title>, DOM order
  descriptions: string[]; // content of every meta[name="description"]
  robotsMeta: string[]; // content of every meta[name="robots"]
  googlebotMeta: string[]; // content of every meta[name="googlebot"]
  canonicals: RawCanonical[];
  viewport: string | null;
  charset: string; // document.characterSet
  lang: string; // documentElement.lang ('' when absent)
  faviconHref: string | null; // first icon link, resolved
  ogSiteName: string | null;
  publishedTime: string | null; // meta[property="article:published_time"]
  modifiedTime: string | null;
  wordCount: number; // visible words in <main> (fallback <body>)
  navStatus: number; // PerformanceNavigationTiming.responseStatus; 0 unknown
}

// Result of re-fetching the current URL from page context: HTTP-level data
// plus head tags parsed from the raw (pre-JavaScript) HTML.
export interface OverviewNetwork {
  ok: boolean; // fetch reached the server
  status: number; // HTTP status; 0 on network error
  xRobotsTag: string | null;
  rawTitle: string | null;
  rawDescription: string | null;
  rawCanonical: string | null; // href attribute as written in raw HTML
  rawRobotsMeta: string | null;
  llmsTxt: boolean; // /llms.txt exists and is plain text
}

// Main-world Shopify globals snapshot (window.Shopify + ShopifyAnalytics.meta).
export interface ShopifyContext {
  isShopify: boolean;
  pageType: string | null; // ShopifyAnalytics.meta.page.pageType
  resourceId: string | null;
  shop: string | null; // permanent *.myshopify.com domain
  locale: string | null;
  currency: string | null;
  country: string | null;
  marketRoot: string | null; // Shopify.routes.root, e.g. '/fr/'
  themeRole: string | null; // 'main' on the live theme
  designMode: boolean; // true inside the theme editor
}

export interface RobotsDirective {
  name: string; // lowercased, e.g. 'noindex', 'max-snippet'
  value: string | null; // e.g. '0' for max-snippet:0
  source: 'meta' | 'googlebot' | 'header';
}

export type CanonicalStateKind = 'self' | 'elsewhere' | 'cross-domain' | 'missing' | 'multiple';

export interface CanonicalInfo {
  kind: CanonicalStateKind;
  href: string | null; // first canonical, resolved
}

export type IndexabilityStatus = 'indexable' | 'not-indexable' | 'canonicalized' | 'unknown';

export interface IndexabilityVerdict {
  status: IndexabilityStatus;
  reasons: string[];
}

export type OverviewSeverity = 'error' | 'warning' | 'info';

export interface OverviewFinding {
  severity: OverviewSeverity;
  code: string; // stable kebab-case id, e.g. 'title-long'
  message: string;
}

export interface SocialProfile {
  network: string; // display name, e.g. 'Facebook'
  url: string;
}

export interface OverviewAnalysis {
  indexability: IndexabilityVerdict;
  findings: OverviewFinding[];
  errorCount: number; // error-severity findings (sidebar badge)
  title: { text: string | null; length: number };
  description: { text: string | null; length: number };
  canonical: CanonicalInfo;
  directives: RobotsDirective[];
  pageType: string | null; // Shopify page type, URL-derived fallback
  dates: { published: string | null; modified: string | null };
}
```

- [ ] **Step 2: Add `'overview'` to `PopupSection` in `entrypoints/popup/stores/tabState.ts`**

Replace line 7 with:

```ts
export type PopupSection =
  | 'theme'
  | 'overview'
  | 'headings'
  | 'links'
  | 'assets'
  | 'images'
  | 'robots'
  | 'schema'
  | 'settings';
```

- [ ] **Step 3: Run existing tests to confirm nothing broke**

Run: `bun test`
Expected: all existing tests PASS (types are additive).

- [ ] **Step 4: Commit**

```bash
git add entrypoints/popup/utils/types.ts entrypoints/popup/stores/tabState.ts
git commit -m "feat(popup): add overview tab types and section id"
```

---

### Task 2: Analyzer part 1 — directives, URL normalization, canonical, title/description findings

**Files:**

- Create: `entrypoints/popup/utils/overview.ts`
- Test: `entrypoints/popup/tests/overview.test.ts`

**Interfaces:**

- Consumes: types from Task 1; nothing else.
- Produces (all exported from `overview.ts`):
  - `parseDirectives(raw: RawOverview | null, network: OverviewNetwork | null): RobotsDirective[]`
  - `hasNoindex(ds: RobotsDirective[]): boolean`, `hasNofollow(ds): boolean`, `hasNosnippet(ds): boolean`
  - `normalizeUrl(input: string): string`
  - `canonicalInfo(raw: RawOverview | null): CanonicalInfo`
  - `coreFindings(raw: RawOverview | null, canonical: CanonicalInfo): OverviewFinding[]`
  - Constants `TITLE_MIN = 30`, `TITLE_MAX = 60`, `DESC_MIN = 70`, `DESC_MAX = 160` (exported; SerpPreview and tests use them)

- [ ] **Step 1: Write the failing tests**

Create `entrypoints/popup/tests/overview.test.ts`:

```ts
import { describe, expect, test } from 'bun:test';
import {
  parseDirectives,
  hasNoindex,
  hasNosnippet,
  normalizeUrl,
  canonicalInfo,
  coreFindings
} from '../utils/overview';
import type { RawOverview, OverviewNetwork } from '../utils/types';

export const baseRaw = (over: Partial<RawOverview> = {}): RawOverview => ({
  url: 'https://shop.example.com/products/widget',
  titles: ['Widget — Example Shop, purveyor of fine widgets'],
  descriptions: ['A'.repeat(120)],
  robotsMeta: [],
  googlebotMeta: [],
  canonicals: [
    {
      raw: 'https://shop.example.com/products/widget',
      resolved: 'https://shop.example.com/products/widget',
      inHead: true
    }
  ],
  viewport: 'width=device-width, initial-scale=1',
  charset: 'UTF-8',
  lang: 'en',
  faviconHref: 'https://shop.example.com/favicon.ico',
  ogSiteName: 'Example Shop',
  publishedTime: null,
  modifiedTime: null,
  wordCount: 800,
  navStatus: 200,
  ...over
});

export const baseNetwork = (over: Partial<OverviewNetwork> = {}): OverviewNetwork => ({
  ok: true,
  status: 200,
  xRobotsTag: null,
  rawTitle: 'Widget — Example Shop, purveyor of fine widgets',
  rawDescription: 'A'.repeat(120),
  rawCanonical: 'https://shop.example.com/products/widget',
  rawRobotsMeta: null,
  llmsTxt: false,
  ...over
});

const codes = (findings: { code: string }[]) => findings.map((f) => f.code);

describe('parseDirectives', () => {
  test('splits comma-separated meta robots into named directives', () => {
    const ds = parseDirectives(baseRaw({ robotsMeta: ['noindex, nofollow'] }), null);
    expect(ds).toEqual([
      { name: 'noindex', value: null, source: 'meta' },
      { name: 'nofollow', value: null, source: 'meta' }
    ]);
  });

  test('captures values, including colons inside unavailable_after dates', () => {
    const ds = parseDirectives(
      baseRaw({ robotsMeta: ['max-snippet:20, unavailable_after: 2026-12-01T00:00:00Z'] }),
      null
    );
    expect(ds).toEqual([
      { name: 'max-snippet', value: '20', source: 'meta' },
      { name: 'unavailable_after', value: '2026-12-01T00:00:00Z', source: 'meta' }
    ]);
  });

  test('reads googlebot meta and X-Robots-Tag header sources', () => {
    const ds = parseDirectives(baseRaw({ googlebotMeta: ['noindex'] }), baseNetwork({ xRobotsTag: 'noarchive' }));
    expect(ds).toContainEqual({ name: 'noindex', value: null, source: 'googlebot' });
    expect(ds).toContainEqual({ name: 'noarchive', value: null, source: 'header' });
  });

  test('unwraps bot-scoped X-Robots-Tag form "googlebot: noindex"', () => {
    const ds = parseDirectives(baseRaw(), baseNetwork({ xRobotsTag: 'googlebot: noindex, nofollow' }));
    expect(ds).toContainEqual({ name: 'noindex', value: null, source: 'header' });
    expect(ds).toContainEqual({ name: 'nofollow', value: null, source: 'header' });
  });

  test('returns empty for null inputs', () => {
    expect(parseDirectives(null, null)).toEqual([]);
  });
});

describe('directive helpers', () => {
  test('hasNoindex matches noindex and none', () => {
    expect(hasNoindex([{ name: 'none', value: null, source: 'meta' }])).toBe(true);
    expect(hasNoindex([{ name: 'noindex', value: null, source: 'header' }])).toBe(true);
    expect(hasNoindex([{ name: 'nofollow', value: null, source: 'meta' }])).toBe(false);
  });

  test('hasNosnippet matches nosnippet and max-snippet:0', () => {
    expect(hasNosnippet([{ name: 'max-snippet', value: '0', source: 'meta' }])).toBe(true);
    expect(hasNosnippet([{ name: 'max-snippet', value: '20', source: 'meta' }])).toBe(false);
    expect(hasNosnippet([{ name: 'nosnippet', value: null, source: 'meta' }])).toBe(true);
  });
});

describe('normalizeUrl', () => {
  test('drops hash, collapses trailing slash, keeps query', () => {
    expect(normalizeUrl('https://a.com/path/#frag')).toBe('https://a.com/path');
    expect(normalizeUrl('https://a.com/')).toBe('https://a.com/');
    expect(normalizeUrl('https://a.com/p?page=2')).toBe('https://a.com/p?page=2');
  });
});

describe('canonicalInfo', () => {
  test('self when canonical matches the page URL', () => {
    expect(canonicalInfo(baseRaw())).toEqual({
      kind: 'self',
      href: 'https://shop.example.com/products/widget'
    });
  });

  test('elsewhere when same host, different path or query', () => {
    const raw = baseRaw({ url: 'https://shop.example.com/products/widget?variant=123' });
    expect(canonicalInfo(raw).kind).toBe('elsewhere');
  });

  test('cross-domain when host differs', () => {
    const raw = baseRaw({
      canonicals: [{ raw: 'https://other.com/x', resolved: 'https://other.com/x', inHead: true }]
    });
    expect(canonicalInfo(raw).kind).toBe('cross-domain');
  });

  test('missing when no canonical, multiple when conflicting targets', () => {
    expect(canonicalInfo(baseRaw({ canonicals: [] })).kind).toBe('missing');
    const raw = baseRaw({
      canonicals: [
        { raw: '/a', resolved: 'https://shop.example.com/a', inHead: true },
        { raw: '/b', resolved: 'https://shop.example.com/b', inHead: true }
      ]
    });
    expect(canonicalInfo(raw).kind).toBe('multiple');
  });

  test('duplicate canonicals pointing at the same URL are not "multiple"', () => {
    const raw = baseRaw({
      canonicals: [
        { raw: '/products/widget', resolved: 'https://shop.example.com/products/widget', inHead: true },
        { raw: '/products/widget', resolved: 'https://shop.example.com/products/widget', inHead: true }
      ]
    });
    expect(canonicalInfo(raw).kind).toBe('self');
  });
});

describe('coreFindings', () => {
  test('clean page produces no core findings', () => {
    const raw = baseRaw();
    expect(coreFindings(raw, canonicalInfo(raw))).toEqual([]);
  });

  test('flags missing title as error and short/long titles as warnings', () => {
    let raw = baseRaw({ titles: [] });
    expect(codes(coreFindings(raw, canonicalInfo(raw)))).toContain('title-missing');
    raw = baseRaw({ titles: ['Short'] });
    expect(codes(coreFindings(raw, canonicalInfo(raw)))).toContain('title-short');
    raw = baseRaw({ titles: ['X'.repeat(75)] });
    expect(codes(coreFindings(raw, canonicalInfo(raw)))).toContain('title-long');
  });

  test('flags multiple title tags as error', () => {
    const raw = baseRaw({ titles: ['One title that is long enough here', 'Second'] });
    expect(codes(coreFindings(raw, canonicalInfo(raw)))).toContain('title-multiple');
  });

  test('flags missing/short/long description', () => {
    expect(codes(coreFindings(baseRaw({ descriptions: [] }), canonicalInfo(baseRaw())))).toContain(
      'description-missing'
    );
    expect(codes(coreFindings(baseRaw({ descriptions: ['too short'] }), canonicalInfo(baseRaw())))).toContain(
      'description-short'
    );
    expect(codes(coreFindings(baseRaw({ descriptions: ['D'.repeat(200)] }), canonicalInfo(baseRaw())))).toContain(
      'description-long'
    );
  });

  test('flags canonical problems: relative, in body, http downgrade, multiple', () => {
    const relative = baseRaw({
      canonicals: [{ raw: '/products/widget', resolved: 'https://shop.example.com/products/widget', inHead: true }]
    });
    expect(codes(coreFindings(relative, canonicalInfo(relative)))).toContain('canonical-relative');

    const inBody = baseRaw({
      canonicals: [
        {
          raw: 'https://shop.example.com/products/widget',
          resolved: 'https://shop.example.com/products/widget',
          inHead: false
        }
      ]
    });
    expect(codes(coreFindings(inBody, canonicalInfo(inBody)))).toContain('canonical-in-body');

    const downgrade = baseRaw({
      canonicals: [
        {
          raw: 'http://shop.example.com/products/widget',
          resolved: 'http://shop.example.com/products/widget',
          inHead: true
        }
      ]
    });
    expect(codes(coreFindings(downgrade, canonicalInfo(downgrade)))).toContain('canonical-http-downgrade');

    const multi = baseRaw({
      canonicals: [
        { raw: '/a', resolved: 'https://shop.example.com/a', inHead: true },
        { raw: '/b', resolved: 'https://shop.example.com/b', inHead: true }
      ]
    });
    expect(codes(coreFindings(multi, canonicalInfo(multi)))).toContain('canonical-multiple');
  });

  test('canonical missing is info, elsewhere is info', () => {
    const missing = coreFindings(baseRaw({ canonicals: [] }), canonicalInfo(baseRaw({ canonicals: [] })));
    expect(missing.find((f) => f.code === 'canonical-missing')?.severity).toBe('info');
    const elsewhereRaw = baseRaw({ url: 'https://shop.example.com/products/widget?variant=1' });
    const elsewhere = coreFindings(elsewhereRaw, canonicalInfo(elsewhereRaw));
    expect(elsewhere.find((f) => f.code === 'canonical-elsewhere')?.severity).toBe('info');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `bun test entrypoints/popup/tests/overview.test.ts`
Expected: FAIL — cannot resolve `../utils/overview`.

- [ ] **Step 3: Create `entrypoints/popup/utils/overview.ts` with the part-1 implementation**

```ts
// Overview tab: DOM/meta extraction wrappers plus a pure analyzer. All
// analysis functions are browser-API-free so `bun test` covers them; the
// three getters at the bottom are the only content-script wrappers.
import type {
  RawOverview,
  OverviewNetwork,
  ShopifyContext,
  RobotsResponse,
  RawSchemaBlock,
  RawLink,
  RobotsDirective,
  CanonicalInfo,
  IndexabilityVerdict,
  OverviewFinding,
  OverviewAnalysis,
  SocialProfile
} from './types';
import { queryActiveTab } from './messaging';
import { parseRobots, isAllowed, looksLikeHtml } from './robots';

export const TITLE_MIN = 30;
export const TITLE_MAX = 60;
export const DESC_MIN = 70;
export const DESC_MAX = 160;

const KNOWN_DIRECTIVES = new Set([
  'all',
  'index',
  'follow',
  'noindex',
  'nofollow',
  'none',
  'noarchive',
  'nocache',
  'nosnippet',
  'notranslate',
  'noimageindex',
  'indexifembedded',
  'max-snippet',
  'max-image-preview',
  'max-video-preview',
  'unavailable_after',
  'noai',
  'noimageai'
]);

/**
 * Flattens meta robots, googlebot meta, and the X-Robots-Tag header into one
 * directive list. Handles the bot-scoped header form ("googlebot: noindex").
 */
export function parseDirectives(raw: RawOverview | null, network: OverviewNetwork | null): RobotsDirective[] {
  const out: RobotsDirective[] = [];
  const push = (content: string, source: RobotsDirective['source']) => {
    for (const part of content.split(',')) {
      const token = part.trim();
      if (!token) continue;
      const colon = token.indexOf(':');
      const name = (colon === -1 ? token : token.slice(0, colon)).trim().toLowerCase();
      const value = colon === -1 ? null : token.slice(colon + 1).trim();
      if (!name) continue;
      // X-Robots-Tag may scope directives to one bot: "googlebot: noindex".
      if (source === 'header' && value !== null && !KNOWN_DIRECTIVES.has(name)) {
        push(value, source);
        continue;
      }
      out.push({ name, value, source });
    }
  };
  for (const content of raw?.robotsMeta ?? []) push(content, 'meta');
  for (const content of raw?.googlebotMeta ?? []) push(content, 'googlebot');
  if (network?.xRobotsTag) push(network.xRobotsTag, 'header');
  return out;
}

export const hasNoindex = (ds: RobotsDirective[]): boolean => ds.some((d) => d.name === 'noindex' || d.name === 'none');

export const hasNofollow = (ds: RobotsDirective[]): boolean =>
  ds.some((d) => d.name === 'nofollow' || d.name === 'none');

export const hasNosnippet = (ds: RobotsDirective[]): boolean =>
  ds.some((d) => d.name === 'nosnippet' || (d.name === 'max-snippet' && d.value === '0'));

/** Comparable URL form: no hash, no trailing slash (except root), query kept. */
export function normalizeUrl(input: string): string {
  try {
    const u = new URL(input);
    let path = u.pathname.replace(/\/+$/, '');
    if (path === '') path = '/';
    return `${u.origin.toLowerCase()}${path}${u.search}`;
  } catch {
    return input;
  }
}

export function canonicalInfo(raw: RawOverview | null): CanonicalInfo {
  const canonicals = raw?.canonicals ?? [];
  if (!raw || canonicals.length === 0) return { kind: 'missing', href: null };
  const distinct = new Set(canonicals.map((c) => normalizeUrl(c.resolved)));
  const first = canonicals[0]!;
  if (distinct.size > 1) return { kind: 'multiple', href: first.resolved };
  let targetHost: string;
  try {
    targetHost = new URL(first.resolved).hostname;
  } catch {
    return { kind: 'multiple', href: first.resolved };
  }
  const pageHost = new URL(raw.url).hostname;
  if (targetHost !== pageHost) return { kind: 'cross-domain', href: first.resolved };
  return normalizeUrl(first.resolved) === normalizeUrl(raw.url)
    ? { kind: 'self', href: first.resolved }
    : { kind: 'elsewhere', href: first.resolved };
}

/** Title, description, and canonical findings. */
export function coreFindings(raw: RawOverview | null, canonical: CanonicalInfo): OverviewFinding[] {
  if (!raw) return [];
  const findings: OverviewFinding[] = [];
  const titles = raw.titles.filter((t) => t.length > 0);
  if (titles.length === 0) {
    findings.push({ severity: 'error', code: 'title-missing', message: 'Page has no <title> tag' });
  } else {
    if (raw.titles.length > 1) {
      findings.push({
        severity: 'error',
        code: 'title-multiple',
        message: `${raw.titles.length} <title> tags found — search engines may pick either one`
      });
    }
    const len = titles[0]!.length;
    if (len < TITLE_MIN) {
      findings.push({
        severity: 'warning',
        code: 'title-short',
        message: `Title is ${len} characters — under ${TITLE_MIN} is likely underoptimized`
      });
    } else if (len > TITLE_MAX) {
      findings.push({
        severity: 'warning',
        code: 'title-long',
        message: `Title is ${len} characters — over ${TITLE_MAX} risks truncation or rewriting by Google`
      });
    }
  }

  const descriptions = raw.descriptions.filter((d) => d.trim().length > 0);
  if (descriptions.length === 0) {
    findings.push({
      severity: 'error',
      code: 'description-missing',
      message: 'No meta description — Google will compose its own snippet'
    });
  } else {
    if (raw.descriptions.length > 1) {
      findings.push({
        severity: 'warning',
        code: 'description-multiple',
        message: `${raw.descriptions.length} meta description tags found`
      });
    }
    const len = descriptions[0]!.length;
    if (len < DESC_MIN) {
      findings.push({
        severity: 'warning',
        code: 'description-short',
        message: `Description is ${len} characters — under ${DESC_MIN} wastes snippet space`
      });
    } else if (len > DESC_MAX) {
      findings.push({
        severity: 'warning',
        code: 'description-long',
        message: `Description is ${len} characters — over ${DESC_MAX} will be truncated`
      });
    }
  }

  switch (canonical.kind) {
    case 'missing':
      findings.push({ severity: 'info', code: 'canonical-missing', message: 'No canonical URL declared' });
      break;
    case 'multiple':
      findings.push({
        severity: 'error',
        code: 'canonical-multiple',
        message: 'Multiple conflicting canonical tags — Google ignores all of them'
      });
      break;
    case 'cross-domain':
      findings.push({
        severity: 'warning',
        code: 'canonical-cross-domain',
        message: `Canonical points to another domain: ${canonical.href}`
      });
      break;
    case 'elsewhere':
      findings.push({
        severity: 'info',
        code: 'canonical-elsewhere',
        message: `Canonical points to a different URL: ${canonical.href}`
      });
      break;
  }

  const first = raw.canonicals[0];
  if (first) {
    if (!first.inHead) {
      findings.push({
        severity: 'warning',
        code: 'canonical-in-body',
        message: 'Canonical tag sits outside <head> — search engines ignore it there'
      });
    }
    if (first.raw && !/^https?:\/\//i.test(first.raw)) {
      findings.push({
        severity: 'warning',
        code: 'canonical-relative',
        message: 'Canonical href is relative — absolute URLs avoid resolution mistakes'
      });
    }
    if (raw.url.startsWith('https://') && first.resolved.startsWith('http://')) {
      findings.push({
        severity: 'warning',
        code: 'canonical-http-downgrade',
        message: 'Canonical points to http:// from an https:// page'
      });
    }
  }

  return findings;
}
```

(The imports for `ShopifyContext`, `RobotsResponse`, `RawSchemaBlock`, `RawLink`, `IndexabilityVerdict`, `OverviewAnalysis`, `SocialProfile`, `queryActiveTab`, `parseRobots`, `isAllowed`, `looksLikeHtml` are used by later tasks in this same file; TypeScript unused-import warnings are acceptable until Task 5 — or comment them in as they land if lint blocks.)

- [ ] **Step 4: Run tests to verify they pass**

Run: `bun test entrypoints/popup/tests/overview.test.ts`
Expected: PASS (all describe blocks).

- [ ] **Step 5: Commit**

```bash
git add entrypoints/popup/utils/overview.ts entrypoints/popup/tests/overview.test.ts
git commit -m "feat(popup): overview analyzer core — directives, canonical, title/description"
```

---

### Task 3: Analyzer part 2 — technical findings, raw-vs-rendered, robots.txt verdict, indexability

**Files:**

- Modify: `entrypoints/popup/utils/overview.ts` (append)
- Test: `entrypoints/popup/tests/overview.test.ts` (append)

**Interfaces:**

- Consumes: Task 2 exports; `parseRobots`, `isAllowed`, `looksLikeHtml` from `./robots`; `RobotsResponse` type.
- Produces:
  - `directiveFindings(ds: RobotsDirective[]): OverviewFinding[]`
  - `technicalFindings(raw: RawOverview | null, network: OverviewNetwork | null, shopify: ShopifyContext | null): OverviewFinding[]`
  - `rawVsRenderedFindings(raw: RawOverview | null, network: OverviewNetwork | null): OverviewFinding[]`
  - `robotsTxtAllows(robots: RobotsResponse | null, url: string): boolean | null` (null = unknown/no robots.txt)
  - `computeIndexability(raw, network, directives, canonical, robotsAllowed): IndexabilityVerdict`

- [ ] **Step 1: Append the failing tests to `overview.test.ts`**

```ts
import {
  directiveFindings,
  technicalFindings,
  rawVsRenderedFindings,
  robotsTxtAllows,
  computeIndexability,
  parseDirectives as pd
} from '../utils/overview';
import type { RobotsResponse, ShopifyContext } from '../utils/types';

const baseShopify = (over: Partial<ShopifyContext> = {}): ShopifyContext => ({
  isShopify: true,
  pageType: 'product',
  resourceId: '123',
  shop: 'example.myshopify.com',
  locale: 'en',
  currency: 'USD',
  country: 'US',
  marketRoot: '/',
  themeRole: 'main',
  designMode: false,
  ...over
});

const robotsResponse = (content: string): RobotsResponse => ({
  ok: true,
  status: 200,
  content,
  finalUrl: 'https://shop.example.com/robots.txt',
  size: content.length,
  truncated: false
});

describe('directiveFindings', () => {
  test('noindex is error; nofollow and nosnippet are warnings', () => {
    const f = directiveFindings(pd(baseRaw({ robotsMeta: ['noindex, nofollow, nosnippet'] }), null));
    expect(f.find((x) => x.code === 'noindex')?.severity).toBe('error');
    expect(f.find((x) => x.code === 'nofollow')?.severity).toBe('warning');
    expect(f.find((x) => x.code === 'nosnippet')?.severity).toBe('warning');
    expect(f.find((x) => x.code === 'nosnippet')?.message).toContain('AI Overviews');
  });

  test('unavailable_after warns with the date; noai is info', () => {
    const f = directiveFindings(pd(baseRaw({ robotsMeta: ['unavailable_after: 2026-12-01, noai'] }), null));
    expect(f.find((x) => x.code === 'unavailable-after')?.message).toContain('2026-12-01');
    expect(f.find((x) => x.code === 'noai')?.severity).toBe('info');
  });

  test('meta and header disagreement on noindex is flagged', () => {
    const f = directiveFindings(pd(baseRaw(), baseNetwork({ xRobotsTag: 'noindex' })));
    expect(f.map((x) => x.code)).toContain('robots-conflict');
  });

  test('clean directives produce nothing', () => {
    expect(directiveFindings(pd(baseRaw(), baseNetwork()))).toEqual([]);
  });
});

describe('technicalFindings', () => {
  test('clean page produces nothing', () => {
    expect(technicalFindings(baseRaw(), baseNetwork(), baseShopify())).toEqual([]);
  });

  test('missing viewport is error; user-scalable=no is warning', () => {
    expect(codes(technicalFindings(baseRaw({ viewport: null }), null, null))).toContain('viewport-missing');
    expect(
      codes(technicalFindings(baseRaw({ viewport: 'width=device-width, user-scalable=no' }), null, null))
    ).toContain('viewport-no-zoom');
  });

  test('missing lang and locale mismatch warn', () => {
    expect(codes(technicalFindings(baseRaw({ lang: '' }), null, null))).toContain('lang-missing');
    expect(codes(technicalFindings(baseRaw({ lang: 'de' }), null, baseShopify({ locale: 'en' })))).toContain(
      'lang-locale-mismatch'
    );
    expect(codes(technicalFindings(baseRaw({ lang: 'en-GB' }), null, baseShopify({ locale: 'en' })))).not.toContain(
      'lang-locale-mismatch'
    );
  });

  test('non-UTF8 charset and missing favicon warn', () => {
    expect(codes(technicalFindings(baseRaw({ charset: 'ISO-8859-1' }), null, null))).toContain('charset');
    expect(codes(technicalFindings(baseRaw({ faviconHref: null }), null, null))).toContain('favicon-missing');
  });

  test('word count bands: <100 warning, <300 info, 300+ nothing', () => {
    const thin = technicalFindings(baseRaw({ wordCount: 42 }), null, null);
    expect(thin.find((f) => f.code === 'thin-content')?.severity).toBe('warning');
    const light = technicalFindings(baseRaw({ wordCount: 200 }), null, null);
    expect(light.find((f) => f.code === 'thin-content')?.severity).toBe('info');
    expect(codes(technicalFindings(baseRaw({ wordCount: 500 }), null, null))).not.toContain('thin-content');
  });

  test('llms.txt presence is info; inverted dates are info', () => {
    expect(codes(technicalFindings(baseRaw(), baseNetwork({ llmsTxt: true }), null))).toContain('llms-txt');
    expect(
      codes(
        technicalFindings(
          baseRaw({ publishedTime: '2026-05-01T00:00:00Z', modifiedTime: '2026-01-01T00:00:00Z' }),
          null,
          null
        )
      )
    ).toContain('dates-inverted');
  });
});

describe('rawVsRenderedFindings', () => {
  test('identical raw and rendered produce nothing', () => {
    expect(rawVsRenderedFindings(baseRaw(), baseNetwork())).toEqual([]);
  });

  test('JS-modified title/description are info; canonical/robots are warnings', () => {
    const f = rawVsRenderedFindings(
      baseRaw({ robotsMeta: ['noindex'] }),
      baseNetwork({
        rawTitle: 'Original server title for the widget page',
        rawDescription: 'B'.repeat(120),
        rawCanonical: 'https://shop.example.com/products/other',
        rawRobotsMeta: null
      })
    );
    expect(f.find((x) => x.code === 'title-js-modified')?.severity).toBe('info');
    expect(f.find((x) => x.code === 'description-js-modified')?.severity).toBe('info');
    expect(f.find((x) => x.code === 'canonical-js-modified')?.severity).toBe('warning');
    expect(f.find((x) => x.code === 'robots-js-modified')?.severity).toBe('warning');
  });

  test('skips comparison when the refetch failed or was non-200', () => {
    expect(rawVsRenderedFindings(baseRaw(), baseNetwork({ ok: false, status: 0 }))).toEqual([]);
    expect(rawVsRenderedFindings(baseRaw(), baseNetwork({ status: 403, rawTitle: 'Blocked' }))).toEqual([]);
  });
});

describe('robotsTxtAllows', () => {
  test('null when robots.txt missing, non-2xx, or HTML', () => {
    expect(robotsTxtAllows(null, 'https://a.com/x')).toBe(null);
    expect(robotsTxtAllows({ ...robotsResponse(''), status: 404 }, 'https://a.com/x')).toBe(null);
    expect(robotsTxtAllows(robotsResponse('<!doctype html><html></html>'), 'https://a.com/x')).toBe(null);
  });

  test('applies Googlebot matching to the page path', () => {
    const robots = robotsResponse('User-agent: *\nDisallow: /private/');
    expect(robotsTxtAllows(robots, 'https://a.com/private/page')).toBe(false);
    expect(robotsTxtAllows(robots, 'https://a.com/public')).toBe(true);
  });
});

describe('computeIndexability', () => {
  const cleanDs = pd(baseRaw(), null);

  test('indexable for a clean 200 page', () => {
    const v = computeIndexability(baseRaw(), baseNetwork(), cleanDs, canonicalInfo(baseRaw()), true);
    expect(v.status).toBe('indexable');
  });

  test('non-2xx status wins', () => {
    const v = computeIndexability(baseRaw({ navStatus: 404 }), null, cleanDs, canonicalInfo(baseRaw()), true);
    expect(v.status).toBe('not-indexable');
    expect(v.reasons[0]).toContain('404');
  });

  test('noindex wins over canonical', () => {
    const ds = pd(baseRaw({ robotsMeta: ['noindex'] }), null);
    const v = computeIndexability(baseRaw(), baseNetwork(), ds, { kind: 'elsewhere', href: 'x' }, true);
    expect(v.status).toBe('not-indexable');
    expect(v.reasons[0]).toContain('noindex');
  });

  test('robots.txt block reports not-indexable with URL-only caveat', () => {
    const v = computeIndexability(baseRaw(), baseNetwork(), cleanDs, canonicalInfo(baseRaw()), false);
    expect(v.status).toBe('not-indexable');
    expect(v.reasons[0]).toContain('robots.txt');
  });

  test('canonical elsewhere yields canonicalized', () => {
    const v = computeIndexability(baseRaw(), baseNetwork(), cleanDs, { kind: 'elsewhere', href: 'x' }, true);
    expect(v.status).toBe('canonicalized');
  });

  test('unknown when raw data missing', () => {
    expect(computeIndexability(null, null, [], { kind: 'missing', href: null }, null).status).toBe('unknown');
  });
});
```

- [ ] **Step 2: Run tests to verify the new blocks fail**

Run: `bun test entrypoints/popup/tests/overview.test.ts`
Expected: FAIL — `directiveFindings` etc. not exported.

- [ ] **Step 3: Append the implementation to `overview.ts`**

```ts
/** Findings for individual robots directives, plus meta-vs-header conflicts. */
export function directiveFindings(ds: RobotsDirective[]): OverviewFinding[] {
  const findings: OverviewFinding[] = [];
  if (hasNoindex(ds)) {
    const src = ds.find((d) => d.name === 'noindex' || d.name === 'none')!;
    findings.push({
      severity: 'error',
      code: 'noindex',
      message: `noindex ${src.source === 'header' ? 'in X-Robots-Tag header' : 'in meta robots'} — page is excluded from search`
    });
  }
  if (hasNofollow(ds)) {
    findings.push({
      severity: 'warning',
      code: 'nofollow',
      message: 'nofollow — links on this page pass no signals'
    });
  }
  if (hasNosnippet(ds)) {
    findings.push({
      severity: 'warning',
      code: 'nosnippet',
      message: 'nosnippet — no text snippet in results, and content is excluded from Google AI Overviews'
    });
  }
  const unavailable = ds.find((d) => d.name === 'unavailable_after');
  if (unavailable?.value) {
    findings.push({
      severity: 'warning',
      code: 'unavailable-after',
      message: `unavailable_after: ${unavailable.value} — Google drops this page from results after that date`
    });
  }
  const infoDirectives: [string, string][] = [
    ['noarchive', 'noarchive — no cached copy is stored'],
    ['noimageindex', 'noimageindex — images on this page are not indexed'],
    ['notranslate', 'notranslate — no translation offered in results'],
    ['noai', 'noai — AI-training opt-out signal present (non-standard, inconsistently honored)'],
    ['noimageai', 'noimageai — image AI-training opt-out signal present (non-standard)']
  ];
  for (const [name, message] of infoDirectives) {
    if (ds.some((d) => d.name === name)) findings.push({ severity: 'info', code: name, message });
  }
  if (ds.some((d) => d.name === 'max-image-preview' && d.value === 'none')) {
    findings.push({
      severity: 'info',
      code: 'max-image-preview-none',
      message: 'max-image-preview:none — no image previews in results or Discover'
    });
  }
  const metaSide = ds.filter((d) => d.source !== 'header');
  const headerSide = ds.filter((d) => d.source === 'header');
  if (metaSide.length > 0 && headerSide.length > 0 && hasNoindex(metaSide) !== hasNoindex(headerSide)) {
    findings.push({
      severity: 'warning',
      code: 'robots-conflict',
      message: 'Meta robots and X-Robots-Tag disagree on noindex — Google applies the most restrictive'
    });
  } else if (headerSide.length > 0 && metaSide.length === 0 && hasNoindex(headerSide)) {
    // Header-only noindex is easy to miss in the DOM; the noindex finding above
    // already carries the header attribution, so nothing extra here.
  }
  return findings;
}

/** Viewport, lang, charset, favicon, word count, llms.txt, and date findings. */
export function technicalFindings(
  raw: RawOverview | null,
  network: OverviewNetwork | null,
  shopify: ShopifyContext | null
): OverviewFinding[] {
  if (!raw) return [];
  const findings: OverviewFinding[] = [];
  if (!raw.viewport) {
    findings.push({
      severity: 'error',
      code: 'viewport-missing',
      message: 'No viewport meta tag — page fails mobile usability'
    });
  } else if (/user-scalable\s*=\s*(no|0)/i.test(raw.viewport) || /maximum-scale\s*=\s*1(\.0*)?\b/i.test(raw.viewport)) {
    findings.push({
      severity: 'warning',
      code: 'viewport-no-zoom',
      message: 'Viewport blocks pinch-zoom — an accessibility failure'
    });
  }
  if (!raw.lang) {
    findings.push({
      severity: 'warning',
      code: 'lang-missing',
      message: 'No lang attribute on <html> — hurts accessibility and language targeting'
    });
  } else if (shopify?.locale) {
    const pageLang = raw.lang.toLowerCase().split('-')[0];
    const shopLang = shopify.locale.toLowerCase().split('-')[0];
    if (pageLang !== shopLang) {
      findings.push({
        severity: 'warning',
        code: 'lang-locale-mismatch',
        message: `<html lang="${raw.lang}"> does not match the store locale "${shopify.locale}"`
      });
    }
  }
  if (raw.charset && raw.charset.toUpperCase() !== 'UTF-8') {
    findings.push({
      severity: 'warning',
      code: 'charset',
      message: `Document charset is ${raw.charset} — UTF-8 is the modern default`
    });
  }
  if (!raw.faviconHref) {
    findings.push({
      severity: 'warning',
      code: 'favicon-missing',
      message: 'No favicon link — Google shows favicons on every result'
    });
  }
  if (raw.wordCount < 100) {
    findings.push({
      severity: 'warning',
      code: 'thin-content',
      message: `Only ${raw.wordCount} visible words — very thin content`
    });
  } else if (raw.wordCount < 300) {
    findings.push({
      severity: 'info',
      code: 'thin-content',
      message: `${raw.wordCount} visible words — on the thin side for a standard page`
    });
  }
  if (network?.llmsTxt) {
    findings.push({
      severity: 'info',
      code: 'llms-txt',
      message: 'Site publishes /llms.txt — an AI-crawler content guide'
    });
  }
  if (raw.publishedTime && raw.modifiedTime) {
    const published = Date.parse(raw.publishedTime);
    const modified = Date.parse(raw.modifiedTime);
    if (!Number.isNaN(published) && !Number.isNaN(modified) && modified < published) {
      findings.push({
        severity: 'info',
        code: 'dates-inverted',
        message: 'article:modified_time is earlier than article:published_time'
      });
    }
  }
  return findings;
}

const normalizeSpace = (s: string): string => s.replace(/\s+/g, ' ').trim();

/** Directive list in a comparable form: sorted "name" / "name:value" tokens. */
const directiveKey = (content: string | null): string =>
  (content ?? '')
    .split(',')
    .map((t) =>
      t
        .trim()
        .toLowerCase()
        .replace(/\s*:\s*/, ':')
    )
    .filter(Boolean)
    .sort()
    .join(',');

/**
 * Compares the server-rendered (raw HTML) head tags against the live DOM.
 * JS-swapped canonicals and robots directives are real SEO hazards because
 * Google's first-pass indexing reads the raw HTML.
 */
export function rawVsRenderedFindings(raw: RawOverview | null, network: OverviewNetwork | null): OverviewFinding[] {
  if (!raw || !network?.ok || network.status !== 200) return [];
  const findings: OverviewFinding[] = [];
  const renderedTitle = raw.titles[0] ?? null;
  if (
    network.rawTitle !== null &&
    renderedTitle !== null &&
    normalizeSpace(network.rawTitle) !== normalizeSpace(renderedTitle)
  ) {
    findings.push({
      severity: 'info',
      code: 'title-js-modified',
      message: 'Title differs between raw HTML and the rendered page (JavaScript rewrites it)'
    });
  }
  const renderedDescription = raw.descriptions[0] ?? null;
  if (
    network.rawDescription !== null &&
    renderedDescription !== null &&
    normalizeSpace(network.rawDescription) !== normalizeSpace(renderedDescription)
  ) {
    findings.push({
      severity: 'info',
      code: 'description-js-modified',
      message: 'Meta description differs between raw HTML and the rendered page'
    });
  }
  const renderedCanonical = raw.canonicals[0] ?? null;
  if (network.rawCanonical !== null && renderedCanonical !== null) {
    let rawResolved: string;
    try {
      rawResolved = new URL(network.rawCanonical, raw.url).href;
    } catch {
      rawResolved = network.rawCanonical;
    }
    if (normalizeUrl(rawResolved) !== normalizeUrl(renderedCanonical.resolved)) {
      findings.push({
        severity: 'warning',
        code: 'canonical-js-modified',
        message: 'Canonical differs between raw HTML and the rendered page — crawlers may read either'
      });
    }
  }
  if (directiveKey(network.rawRobotsMeta) !== directiveKey(raw.robotsMeta[0] ?? null)) {
    findings.push({
      severity: 'warning',
      code: 'robots-js-modified',
      message: 'Meta robots differs between raw HTML and the rendered page'
    });
  }
  return findings;
}

/**
 * Whether robots.txt lets Googlebot crawl the page. Null when there is no
 * usable robots.txt (missing, non-2xx, or an HTML error page) — treated as
 * fully allowed but not reported as a positive signal.
 */
export function robotsTxtAllows(robots: RobotsResponse | null, url: string): boolean | null {
  if (!robots?.ok || robots.status < 200 || robots.status >= 300 || !robots.content) return null;
  if (looksLikeHtml(robots.content)) return null;
  let path: string;
  try {
    const u = new URL(url);
    path = u.pathname + u.search;
  } catch {
    return null;
  }
  return isAllowed(parseRobots(robots.content), path, 'Googlebot').allowed;
}

/**
 * The verdict at the top of the tab. Precedence: HTTP status, then noindex,
 * then robots.txt crawl block, then canonical target.
 */
export function computeIndexability(
  raw: RawOverview | null,
  network: OverviewNetwork | null,
  directives: RobotsDirective[],
  canonical: CanonicalInfo,
  robotsAllowed: boolean | null
): IndexabilityVerdict {
  if (!raw) return { status: 'unknown', reasons: ['Page data unavailable'] };
  const status = raw.navStatus || (network?.ok ? network.status : 0);
  if (status && (status < 200 || status >= 300)) {
    return { status: 'not-indexable', reasons: [`Page returned HTTP ${status}`] };
  }
  if (hasNoindex(directives)) {
    const src = directives.find((d) => d.name === 'noindex' || d.name === 'none')!;
    return {
      status: 'not-indexable',
      reasons: [src.source === 'header' ? 'noindex in the X-Robots-Tag header' : 'noindex in meta robots']
    };
  }
  if (robotsAllowed === false) {
    return {
      status: 'not-indexable',
      reasons: ['Blocked by robots.txt — Google cannot crawl this page (the bare URL may still be indexed)']
    };
  }
  if (canonical.kind === 'elsewhere' || canonical.kind === 'cross-domain') {
    return { status: 'canonicalized', reasons: [`Canonical points to ${canonical.href}`] };
  }
  return {
    status: 'indexable',
    reasons: [`HTTP ${status || 200}, crawlable, no noindex, canonical OK`]
  };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `bun test entrypoints/popup/tests/overview.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add entrypoints/popup/utils/overview.ts entrypoints/popup/tests/overview.test.ts
git commit -m "feat(popup): overview analyzer — indexability, technical checks, raw-vs-rendered"
```

---

### Task 4: Analyzer part 3 — Shopify findings, page type, schema dates, social profiles, conflicts, orchestrator

**Files:**

- Modify: `entrypoints/popup/utils/overview.ts` (append)
- Test: `entrypoints/popup/tests/overview.test.ts` (append)

**Interfaces:**

- Consumes: Tasks 2–3 exports; `RawSchemaBlock`, `RawLink` types.
- Produces:
  - `detectPageType(url: string, shopifyPageType: string | null): string | null`
  - `shopifyFindings(raw: RawOverview | null, shopify: ShopifyContext | null, canonical: CanonicalInfo): OverviewFinding[]`
  - `schemaDates(schema: RawSchemaBlock[]): { published: string | null; modified: string | null }`
  - `socialProfiles(links: RawLink[]): SocialProfile[]`
  - `analyzeOverview(raw, network, shopify, robots, schema): OverviewAnalysis` — the single entry point App.svelte calls.

- [ ] **Step 1: Append the failing tests**

```ts
import { detectPageType, shopifyFindings, schemaDates, socialProfiles, analyzeOverview } from '../utils/overview';
import type { RawLink, RawSchemaBlock } from '../utils/types';

const mkLink = (href: string): RawLink => ({
  index: 0,
  href,
  text: '',
  rel: '',
  kind: 'external',
  isNofollow: false,
  isSponsored: false,
  isUgc: false,
  isImage: false,
  isHidden: false,
  isInsecure: false,
  isBrokenAnchor: false
});

const mkSchema = (raw: string): RawSchemaBlock => ({ index: 0, raw, parseError: null, placement: 'head' });

describe('detectPageType', () => {
  test('prefers the ShopifyAnalytics page type', () => {
    expect(detectPageType('https://a.com/whatever', 'collection')).toBe('collection');
  });

  test('falls back to URL patterns, including Markets locale prefixes', () => {
    expect(detectPageType('https://a.com/', null)).toBe('home');
    expect(detectPageType('https://a.com/products/x', null)).toBe('product');
    expect(detectPageType('https://a.com/collections/all/products/x', null)).toBe('product');
    expect(detectPageType('https://a.com/collections/sale', null)).toBe('collection');
    expect(detectPageType('https://a.com/blogs/news/hello-world', null)).toBe('article');
    expect(detectPageType('https://a.com/pages/about', null)).toBe('page');
    expect(detectPageType('https://a.com/cart', null)).toBe('cart');
    expect(detectPageType('https://a.com/password', null)).toBe('password');
    expect(detectPageType('https://a.com/fr/products/x', null)).toBe('product');
    expect(detectPageType('https://a.com/en-ca/', null)).toBe('home');
  });
});

describe('shopifyFindings', () => {
  test('empty for non-Shopify pages', () => {
    expect(shopifyFindings(baseRaw(), null, canonicalInfo(baseRaw()))).toEqual([]);
    expect(shopifyFindings(baseRaw(), baseShopify({ isShopify: false }), canonicalInfo(baseRaw()))).toEqual([]);
  });

  test('password page is an error', () => {
    const raw = baseRaw({ url: 'https://shop.example.com/password' });
    const f = shopifyFindings(raw, baseShopify({ pageType: 'password' }), canonicalInfo(raw));
    expect(f.find((x) => x.code === 'password-page')?.severity).toBe('error');
  });

  test('preview mode warns for preview_theme_id, non-main role, and design mode', () => {
    const previewUrl = baseRaw({ url: 'https://shop.example.com/?preview_theme_id=99' });
    expect(codes(shopifyFindings(previewUrl, baseShopify(), canonicalInfo(previewUrl)))).toContain('preview-mode');
    expect(
      codes(shopifyFindings(baseRaw(), baseShopify({ themeRole: 'unpublished' }), canonicalInfo(baseRaw())))
    ).toContain('preview-mode');
    expect(codes(shopifyFindings(baseRaw(), baseShopify({ designMode: true }), canonicalInfo(baseRaw())))).toContain(
      'preview-mode'
    );
  });

  test('warns when browsing on the myshopify.com domain', () => {
    const raw = baseRaw({
      url: 'https://example.myshopify.com/products/widget',
      canonicals: [{ raw: '/products/widget', resolved: 'https://example.myshopify.com/products/widget', inHead: true }]
    });
    expect(codes(shopifyFindings(raw, baseShopify(), canonicalInfo(raw)))).toContain('myshopify-domain');
  });

  test('collection-scoped product URL: info when canonical is bare, warning otherwise', () => {
    const good = baseRaw({
      url: 'https://shop.example.com/collections/sale/products/widget',
      canonicals: [{ raw: '/products/widget', resolved: 'https://shop.example.com/products/widget', inHead: true }]
    });
    expect(
      shopifyFindings(good, baseShopify(), canonicalInfo(good)).find((f) => f.code === 'nested-product-path')?.severity
    ).toBe('info');
    const bad = baseRaw({
      url: 'https://shop.example.com/collections/sale/products/widget',
      canonicals: [
        {
          raw: '/collections/sale/products/widget',
          resolved: 'https://shop.example.com/collections/sale/products/widget',
          inHead: true
        }
      ]
    });
    expect(codes(shopifyFindings(bad, baseShopify(), canonicalInfo(bad)))).toContain('nested-product-canonical');
  });

  test('warns when canonical keeps the variant parameter', () => {
    const raw = baseRaw({
      url: 'https://shop.example.com/products/widget?variant=42',
      canonicals: [
        {
          raw: '/products/widget?variant=42',
          resolved: 'https://shop.example.com/products/widget?variant=42',
          inHead: true
        }
      ]
    });
    expect(codes(shopifyFindings(raw, baseShopify(), canonicalInfo(raw)))).toContain('variant-canonical');
  });

  test('warns when page 2+ canonicalizes back to page 1', () => {
    const raw = baseRaw({
      url: 'https://shop.example.com/collections/sale?page=3',
      canonicals: [{ raw: '/collections/sale', resolved: 'https://shop.example.com/collections/sale', inHead: true }]
    });
    expect(codes(shopifyFindings(raw, baseShopify({ pageType: 'collection' }), canonicalInfo(raw)))).toContain(
      'pagination-canonical'
    );
    const selfCanonical = baseRaw({
      url: 'https://shop.example.com/collections/sale?page=3',
      canonicals: [
        { raw: '/collections/sale?page=3', resolved: 'https://shop.example.com/collections/sale?page=3', inHead: true }
      ]
    });
    expect(
      codes(shopifyFindings(selfCanonical, baseShopify({ pageType: 'collection' }), canonicalInfo(selfCanonical)))
    ).not.toContain('pagination-canonical');
  });

  test('filtered collection views are info', () => {
    const raw = baseRaw({ url: 'https://shop.example.com/collections/sale?filter.v.price.gte=10' });
    expect(codes(shopifyFindings(raw, baseShopify({ pageType: 'collection' }), canonicalInfo(raw)))).toContain(
      'filtered-collection'
    );
  });
});

describe('schemaDates', () => {
  test('finds dates nested inside @graph', () => {
    const block = mkSchema(
      JSON.stringify({
        '@graph': [{ '@type': 'Article', datePublished: '2026-01-01', dateModified: '2026-02-01' }]
      })
    );
    expect(schemaDates([block])).toEqual({ published: '2026-01-01', modified: '2026-02-01' });
  });

  test('returns nulls when absent and skips malformed blocks', () => {
    expect(schemaDates([])).toEqual({ published: null, modified: null });
    expect(schemaDates([{ index: 0, raw: '{bad', parseError: 'x', placement: 'head' }])).toEqual({
      published: null,
      modified: null
    });
  });
});

describe('socialProfiles', () => {
  test('detects profile links and dedupes per network', () => {
    const profiles = socialProfiles([
      mkLink('https://www.facebook.com/example'),
      mkLink('https://facebook.com/example-two'),
      mkLink('https://www.instagram.com/example/'),
      mkLink('https://x.com/example'),
      mkLink('https://www.youtube.com/@example'),
      mkLink('https://www.tiktok.com/@example')
    ]);
    expect(profiles.map((p) => p.network)).toEqual(['Facebook', 'Instagram', 'X (Twitter)', 'YouTube', 'TikTok']);
  });

  test('ignores bare domains and share/intent links', () => {
    expect(
      socialProfiles([
        mkLink('https://www.facebook.com/'),
        mkLink('https://www.facebook.com/sharer/sharer.php?u=x'),
        mkLink('https://x.com/intent/tweet?text=hi')
      ])
    ).toEqual([]);
  });
});

describe('analyzeOverview', () => {
  test('assembles a clean analysis with zero errors', () => {
    const analysis = analyzeOverview(
      baseRaw(),
      baseNetwork(),
      baseShopify(),
      robotsResponse('User-agent: *\nAllow: /'),
      []
    );
    expect(analysis.indexability.status).toBe('indexable');
    expect(analysis.errorCount).toBe(0);
    expect(analysis.pageType).toBe('product');
    expect(analysis.title.length).toBeGreaterThan(0);
  });

  test('counts error findings and sorts findings by severity', () => {
    const raw = baseRaw({ titles: [], descriptions: [], robotsMeta: ['noindex'] });
    const analysis = analyzeOverview(raw, null, null, null, []);
    expect(analysis.errorCount).toBe(3); // title-missing, description-missing, noindex
    const severities = analysis.findings.map((f) => f.severity);
    expect(severities.indexOf('info')).toBeGreaterThan(severities.lastIndexOf('error'));
  });

  test('flags the noindex + robots-block and noindex + canonical conflicts', () => {
    const blockedNoindex = analyzeOverview(
      baseRaw({ url: 'https://shop.example.com/private/x', robotsMeta: ['noindex'], canonicals: [] }),
      null,
      null,
      robotsResponse('User-agent: *\nDisallow: /private/'),
      []
    );
    expect(codes(blockedNoindex.findings)).toContain('robots-noindex-conflict');

    const noindexCanonical = analyzeOverview(
      baseRaw({ url: 'https://shop.example.com/products/widget?variant=1', robotsMeta: ['noindex'] }),
      null,
      null,
      null,
      []
    );
    expect(codes(noindexCanonical.findings)).toContain('noindex-canonical-conflict');
  });

  test('falls back to schema dates when article meta is absent', () => {
    const analysis = analyzeOverview(baseRaw(), null, null, null, [
      mkSchema(JSON.stringify({ '@type': 'Article', datePublished: '2026-03-01' }))
    ]);
    expect(analysis.dates.published).toBe('2026-03-01');
  });
});
```

- [ ] **Step 2: Run tests to verify the new blocks fail**

Run: `bun test entrypoints/popup/tests/overview.test.ts`
Expected: FAIL — missing exports.

- [ ] **Step 3: Append the implementation to `overview.ts`**

```ts
/**
 * Shopify page type: ShopifyAnalytics value when present, else URL patterns
 * (with Markets locale prefixes like /fr or /en-ca stripped first).
 */
export function detectPageType(url: string, shopifyPageType: string | null): string | null {
  if (shopifyPageType) return shopifyPageType;
  let path: string;
  try {
    path = new URL(url).pathname;
  } catch {
    return null;
  }
  path = path.replace(/^\/[a-z]{2}(-[a-zA-Z]{2})?(?=\/|$)/, '') || '/';
  if (path === '/') return 'home';
  if (/^\/collections\/[^/]+\/products\//.test(path) || path.startsWith('/products/')) return 'product';
  if (path === '/collections' || path === '/collections/') return 'list-collections';
  if (path.startsWith('/collections/')) return 'collection';
  if (/^\/blogs\/[^/]+\/./.test(path)) return 'article';
  if (path.startsWith('/blogs/')) return 'blog';
  if (path.startsWith('/pages/')) return 'page';
  if (path === '/cart') return 'cart';
  if (path === '/search') return 'searchresults';
  if (path === '/password') return 'password';
  return null;
}

/** Shopify-storefront-specific checks; empty on non-Shopify pages. */
export function shopifyFindings(
  raw: RawOverview | null,
  shopify: ShopifyContext | null,
  canonical: CanonicalInfo
): OverviewFinding[] {
  if (!raw || !shopify?.isShopify) return [];
  const findings: OverviewFinding[] = [];
  let url: URL;
  try {
    url = new URL(raw.url);
  } catch {
    return [];
  }
  const params = url.searchParams;

  if (shopify.pageType === 'password' || url.pathname === '/password') {
    findings.push({
      severity: 'error',
      code: 'password-page',
      message: 'Store is password-protected — nothing on it can be crawled or indexed'
    });
  }

  const isPreview =
    params.has('preview_theme_id') ||
    shopify.designMode ||
    url.hostname.endsWith('.shopifypreview.com') ||
    (shopify.themeRole !== null && shopify.themeRole !== 'main');
  if (isPreview) {
    findings.push({
      severity: 'warning',
      code: 'preview-mode',
      message: 'Viewing a theme preview, not the live theme — SEO data may not match production'
    });
  }

  if (url.hostname.endsWith('.myshopify.com')) {
    findings.push({
      severity: 'warning',
      code: 'myshopify-domain',
      message: 'Browsing the permanent .myshopify.com domain — a primary custom domain should 301 away from here'
    });
  }

  if (/^\/([a-z]{2}(-[a-zA-Z]{2})?\/)?collections\/[^/]+\/products\//.test(url.pathname)) {
    let canonicalIsBareProduct = false;
    if (canonical.href) {
      try {
        const canonicalPath = new URL(canonical.href).pathname;
        canonicalIsBareProduct = /\/products\/[^/]+/.test(canonicalPath) && !canonicalPath.includes('/collections/');
      } catch {
        canonicalIsBareProduct = false;
      }
    }
    if (canonicalIsBareProduct) {
      findings.push({
        severity: 'info',
        code: 'nested-product-path',
        message: 'Collection-scoped product URL — canonical correctly points to the bare /products/ URL'
      });
    } else {
      findings.push({
        severity: 'warning',
        code: 'nested-product-canonical',
        message: 'Collection-scoped product URL without a canonical to the bare /products/ URL — duplicate-content risk'
      });
    }
  }

  if (params.has('variant') && canonical.href?.includes('variant=')) {
    findings.push({
      severity: 'warning',
      code: 'variant-canonical',
      message: 'Canonical keeps the ?variant= parameter — variant URLs should canonicalize to the base product'
    });
  }

  const pageNumber = parseInt(params.get('page') ?? '', 10);
  if (pageNumber > 1 && canonical.href) {
    let canonicalPage: string | null = null;
    try {
      canonicalPage = new URL(canonical.href).searchParams.get('page');
    } catch {
      canonicalPage = null;
    }
    if (canonicalPage !== String(pageNumber)) {
      findings.push({
        severity: 'warning',
        code: 'pagination-canonical',
        message: `Page ${pageNumber} canonicalizes to ${canonicalPage === null ? 'page 1' : `page ${canonicalPage}`} — Google recommends paginated pages self-canonicalize`
      });
    }
  }

  const hasFilterParams = [...params.keys()].some(
    (k) => k.startsWith('filter.') || k === 'sort_by' || k.startsWith('pf_')
  );
  const isTagPath = /^\/collections\/[^/]+\/[^/]+$/.test(url.pathname) && !url.pathname.includes('/products/');
  if ((hasFilterParams || isTagPath) && detectPageType(raw.url, shopify.pageType) === 'collection') {
    findings.push({
      severity: 'info',
      code: 'filtered-collection',
      message: 'Filtered/sorted collection view — Shopify canonicalizes these to the base collection'
    });
  }

  return findings;
}

/** First datePublished/dateModified found anywhere in the JSON-LD blocks. */
export function schemaDates(schema: RawSchemaBlock[]): { published: string | null; modified: string | null } {
  let published: string | null = null;
  let modified: string | null = null;
  const visit = (node: unknown): void => {
    if (published && modified) return;
    if (Array.isArray(node)) {
      for (const item of node) visit(item);
      return;
    }
    if (!node || typeof node !== 'object') return;
    const obj = node as Record<string, unknown>;
    if (!published && typeof obj.datePublished === 'string') published = obj.datePublished;
    if (!modified && typeof obj.dateModified === 'string') modified = obj.dateModified;
    for (const value of Object.values(obj)) visit(value);
  };
  for (const block of schema) {
    if (block.parseError) continue;
    try {
      visit(JSON.parse(block.raw));
    } catch {
      // parseError should have caught this; skip defensively
    }
  }
  return { published, modified };
}

const SOCIAL_HOSTS: [RegExp, string][] = [
  [/(^|\.)facebook\.com$/, 'Facebook'],
  [/(^|\.)instagram\.com$/, 'Instagram'],
  [/(^|\.)(twitter|x)\.com$/, 'X (Twitter)'],
  [/(^|\.)youtube\.com$/, 'YouTube'],
  [/(^|\.)tiktok\.com$/, 'TikTok'],
  [/(^|\.)pinterest\.[a-z.]+$/, 'Pinterest'],
  [/(^|\.)linkedin\.com$/, 'LinkedIn'],
  [/(^|\.)threads\.(net|com)$/, 'Threads']
];

// Share/intent endpoints are outbound actions, not profiles.
const SHARE_PATH = /^\/(sharer|share|intent|shareArticle|pin\/create)/i;

/** Social profile links found on the page, first hit per network. */
export function socialProfiles(links: RawLink[]): SocialProfile[] {
  const found = new Map<string, string>();
  for (const link of links) {
    let host: string;
    let path: string;
    try {
      const u = new URL(link.href);
      host = u.hostname.toLowerCase();
      path = u.pathname;
    } catch {
      continue;
    }
    if (path.length <= 1 || SHARE_PATH.test(path)) continue;
    for (const [pattern, network] of SOCIAL_HOSTS) {
      if (pattern.test(host) && !found.has(network)) found.set(network, link.href);
    }
  }
  return [...found].map(([network, url]) => ({ network, url }));
}

const SEVERITY_ORDER: Record<OverviewFinding['severity'], number> = { error: 0, warning: 1, info: 2 };

/** Single entry point: combines every source into the tab's analysis. */
export function analyzeOverview(
  raw: RawOverview | null,
  network: OverviewNetwork | null,
  shopify: ShopifyContext | null,
  robots: RobotsResponse | null,
  schema: RawSchemaBlock[]
): OverviewAnalysis {
  const directives = parseDirectives(raw, network);
  const canonical = canonicalInfo(raw);
  const robotsAllowed = raw ? robotsTxtAllows(robots, raw.url) : null;
  const indexability = computeIndexability(raw, network, directives, canonical, robotsAllowed);

  const findings: OverviewFinding[] = [
    ...coreFindings(raw, canonical),
    ...directiveFindings(directives),
    ...technicalFindings(raw, network, shopify),
    ...rawVsRenderedFindings(raw, network),
    ...shopifyFindings(raw, shopify, canonical)
  ];

  if (raw) {
    const status = raw.navStatus || (network?.ok ? network.status : 0);
    if (status && (status < 200 || status >= 300)) {
      findings.push({ severity: 'error', code: 'http-status', message: `Page returned HTTP ${status}` });
    }
    if (robotsAllowed === false) {
      findings.push({
        severity: 'warning',
        code: 'robots-blocked',
        message: 'robots.txt blocks Googlebot from crawling this page'
      });
      if (hasNoindex(directives)) {
        findings.push({
          severity: 'warning',
          code: 'robots-noindex-conflict',
          message:
            'Blocked by robots.txt AND noindex — Google never crawls the page, so it never sees the noindex; the URL can stay indexed'
        });
      }
    }
    if (hasNoindex(directives) && (canonical.kind === 'elsewhere' || canonical.kind === 'cross-domain')) {
      findings.push({
        severity: 'warning',
        code: 'noindex-canonical-conflict',
        message: 'noindex combined with a canonical to another URL sends contradictory signals'
      });
    }
  }

  findings.sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity]);

  const fallbackDates = schemaDates(schema);
  const titleText = raw?.titles.find((t) => t.length > 0) ?? null;
  const descriptionText = raw?.descriptions.find((d) => d.trim().length > 0) ?? null;

  return {
    indexability,
    findings,
    errorCount: findings.filter((f) => f.severity === 'error').length,
    title: { text: titleText, length: titleText?.length ?? 0 },
    description: { text: descriptionText, length: descriptionText?.length ?? 0 },
    canonical,
    directives,
    pageType: raw ? detectPageType(raw.url, shopify?.pageType ?? null) : null,
    dates: {
      published: raw?.publishedTime ?? fallbackDates.published,
      modified: raw?.modifiedTime ?? fallbackDates.modified
    }
  };
}

/** Fetches the DOM-extracted overview snapshot from the active tab. */
export const getOverview = (): Promise<RawOverview | null> =>
  queryActiveTab<RawOverview | null>('get_overview', null, (r) => !!r && typeof (r as RawOverview).url === 'string');

/** Fetches the network-level overview data (status, headers, raw HTML head). */
export const getOverviewNetwork = (): Promise<OverviewNetwork | null> =>
  queryActiveTab<OverviewNetwork | null>(
    'get_overview_network',
    null,
    (r) => !!r && typeof (r as OverviewNetwork).status === 'number'
  );

/** Fetches the main-world Shopify globals snapshot. */
export const getShopifyContext = (): Promise<ShopifyContext | null> =>
  queryActiveTab<ShopifyContext | null>(
    'get_shopify_context',
    null,
    (r) => !!r && typeof (r as ShopifyContext).isShopify === 'boolean'
  );
```

- [ ] **Step 4: Run the full test suite**

Run: `bun test`
Expected: PASS (overview tests plus all existing suites).

- [ ] **Step 5: Commit**

```bash
git add entrypoints/popup/utils/overview.ts entrypoints/popup/tests/overview.test.ts
git commit -m "feat(popup): overview analyzer — shopify checks, social profiles, orchestrator"
```

---

### Task 5: Content-script handlers `get_overview` and `get_overview_network`

**Files:**

- Modify: `entrypoints/main.content.ts` (insert new handlers after the `get_robots` handler, around line 612)

**Interfaces:**

- Consumes: `looksLikeHtml` from `./popup/utils/robots` (add to the existing import if not present — `main.content.ts` already imports from popup utils at the top).
- Produces: message actions `get_overview` (returns `RawOverview`) and `get_overview_network` (returns `OverviewNetwork`), consumed by the Task 4 getters.

- [ ] **Step 1: Add `looksLikeHtml` import**

At the top of `entrypoints/main.content.ts`, alongside the existing popup-utils imports:

```ts
import { looksLikeHtml } from './popup/utils/robots';
```

- [ ] **Step 2: Insert the `get_overview` handler after the `get_robots` block**

```ts
/**
 * Extracts everything the Overview tab reads from the live DOM: head
 * meta, canonical links, document facts, visible word count, and the
 * navigation HTTP status.
 * @returns {import('./popup/utils/types').RawOverview}
 */
if (request.action === 'get_overview') {
  const metaContents = (name: string): string[] =>
    Array.from(document.querySelectorAll<HTMLMetaElement>(`meta[name="${name}" i]`)).map(
      (m) => m.getAttribute('content') ?? ''
    );
  const propContent = (prop: string): string | null =>
    document.querySelector<HTMLMetaElement>(`meta[property="${prop}" i]`)?.getAttribute('content') ?? null;
  const canonicals = Array.from(document.querySelectorAll<HTMLLinkElement>('link[rel="canonical" i]')).map((el) => ({
    raw: el.getAttribute('href') ?? '',
    resolved: el.href,
    inHead: document.head?.contains(el) ?? false
  }));
  const favicon = document.querySelector<HTMLLinkElement>('link[rel~="icon" i]');
  // innerText respects CSS visibility, so hidden text doesn't inflate the count.
  const textRoot = document.querySelector<HTMLElement>('main') ?? document.body;
  const wordCount = textRoot ? textRoot.innerText.trim().split(/\s+/).filter(Boolean).length : 0;
  let navStatus = 0;
  try {
    const nav = performance.getEntriesByType('navigation')[0] as
      | (PerformanceNavigationTiming & { responseStatus?: number })
      | undefined;
    navStatus = nav?.responseStatus ?? 0;
  } catch {
    // Navigation Timing unavailable; status stays unknown
  }
  sendResponse({
    url: location.href,
    titles: Array.from(document.querySelectorAll('title')).map((t) => t.textContent?.trim() ?? ''),
    descriptions: metaContents('description'),
    robotsMeta: metaContents('robots'),
    googlebotMeta: metaContents('googlebot'),
    canonicals,
    viewport: document.querySelector<HTMLMetaElement>('meta[name="viewport" i]')?.getAttribute('content') ?? null,
    charset: document.characterSet,
    lang: document.documentElement.lang,
    faviconHref: favicon?.href ?? null,
    ogSiteName: propContent('og:site_name'),
    publishedTime: propContent('article:published_time'),
    modifiedTime: propContent('article:modified_time'),
    wordCount,
    navStatus
  });
  return false;
}

/**
 * Network-level overview data: re-fetches the current URL from the page
 * context (rides its cache/cookies) for the HTTP status, X-Robots-Tag
 * header, and raw pre-JavaScript head tags, plus an /llms.txt probe.
 * @returns {import('./popup/utils/types').OverviewNetwork}
 */
if (request.action === 'get_overview_network') {
  const MAX_HTML_BYTES = 1024 * 1024;
  const pageFetch = fetch(location.href, { signal: AbortSignal.timeout(8000) })
    .then(async (res) => {
      const base = {
        ok: true,
        status: res.status,
        xRobotsTag: res.headers.get('x-robots-tag'),
        rawTitle: null as string | null,
        rawDescription: null as string | null,
        rawCanonical: null as string | null,
        rawRobotsMeta: null as string | null
      };
      try {
        const html = (await res.text()).slice(0, MAX_HTML_BYTES);
        const doc = new DOMParser().parseFromString(html, 'text/html');
        base.rawTitle = doc.querySelector('title')?.textContent?.trim() ?? null;
        base.rawDescription = doc.querySelector('meta[name="description" i]')?.getAttribute('content') ?? null;
        base.rawCanonical = doc.querySelector('link[rel="canonical" i]')?.getAttribute('href') ?? null;
        base.rawRobotsMeta = doc.querySelector('meta[name="robots" i]')?.getAttribute('content') ?? null;
      } catch {
        // Body unreadable; the header-level data is still useful
      }
      return base;
    })
    .catch(() => ({
      ok: false,
      status: 0,
      xRobotsTag: null,
      rawTitle: null,
      rawDescription: null,
      rawCanonical: null,
      rawRobotsMeta: null
    }));
  // SPA fallbacks serve HTML at any path with a 200, so a status check
  // alone would false-positive; require the body to not look like HTML.
  const llmsFetch = fetch(`${location.origin}/llms.txt`, { signal: AbortSignal.timeout(8000) })
    .then(async (res) => res.ok && !looksLikeHtml((await res.text()).slice(0, 4096)))
    .catch(() => false);
  Promise.all([pageFetch, llmsFetch]).then(([page, llmsTxt]) => sendResponse({ ...page, llmsTxt }));
  return true;
}
```

- [ ] **Step 3: Run the test suite (imports still resolve)**

Run: `bun test`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add entrypoints/main.content.ts
git commit -m "feat(content): get_overview and get_overview_network extraction handlers"
```

---

### Task 6: Main-world Shopify context + relay

**Files:**

- Modify: `entrypoints/alfred-main-world.ts` (extend the `_initThemeRequestHandler` message listener; add `getShopifyContext` method)
- Modify: `entrypoints/main.content.ts` (extend the postMessage relay listener around line 169; add a `get_shopify_context` handler mirroring `get_theme`)
- Modify: `global.d.ts:166-188` (add `getShopifyContext` to the `Alfred` interface)

**Interfaces:**

- Consumes: nothing new.
- Produces: message action `get_shopify_context` returning a `ShopifyContext` object; main-world postMessage types `alfred:request_shopify_context` / `alfred:shopify_context_response`.

- [ ] **Step 1: Add `getShopifyContext` to the main-world Alfred object in `entrypoints/alfred-main-world.ts`**

Insert after the existing `getTheme` method:

```ts
    /**
     * Snapshot of the Shopify globals the Overview tab reads. All fields are
     * defensive: themes and headless setups omit pieces of window.Shopify.
     */
    getShopifyContext: () => {
      const win = window as unknown as WindowWithAlfred;
      const shopify = win.Shopify as
        | {
            shop?: string;
            locale?: string;
            country?: string;
            designMode?: boolean;
            currency?: { active?: string };
            routes?: { root?: string };
            theme?: { role?: string };
          }
        | undefined;
      const analyticsPage = (
        window as unknown as {
          ShopifyAnalytics?: { meta?: { page?: { pageType?: string; resourceId?: number | string } } };
        }
      ).ShopifyAnalytics?.meta?.page;
      if (!shopify) {
        return {
          isShopify: false,
          pageType: null,
          resourceId: null,
          shop: null,
          locale: null,
          currency: null,
          country: null,
          marketRoot: null,
          themeRole: null,
          designMode: false
        };
      }
      return {
        isShopify: true,
        pageType: analyticsPage?.pageType ?? null,
        resourceId: analyticsPage?.resourceId != null ? String(analyticsPage.resourceId) : null,
        shop: shopify.shop ?? null,
        locale: shopify.locale ?? null,
        currency: shopify.currency?.active ?? null,
        country: shopify.country ?? null,
        marketRoot: shopify.routes?.root ?? null,
        themeRole: shopify.theme?.role ?? null,
        designMode: !!shopify.designMode
      };
    },
```

- [ ] **Step 2: Handle the request in the main-world message listener**

Inside `_initThemeRequestHandler`'s `window.addEventListener('message', ...)` callback, after the existing `alfred:request_theme` branch, add:

```ts
if (data?.type === 'alfred:request_shopify_context') {
  const requestId = data.requestId;
  if (requestId) {
    const context = (window as unknown as WindowWithAlfred).Alfred.getShopifyContext();
    window.postMessage(
      {
        type: 'alfred:shopify_context_response',
        requestId,
        data: JSON.parse(JSON.stringify(context)) as typeof context
      },
      '*'
    );
  }
}
```

- [ ] **Step 3: Extend the relay listener in `entrypoints/main.content.ts`**

In the `window.addEventListener('message', ...)` block (around line 169), after the `alfred:theme_response` branch, add:

```ts
if (event.data?.type === 'alfred:shopify_context_response') {
  const { requestId, data } = event.data;
  window.dispatchEvent(
    new CustomEvent(`alfred:shopify_context_response_${requestId}`, {
      detail: data
    })
  );
}
```

- [ ] **Step 4: Add the `get_shopify_context` runtime-message handler**

After the `get_theme` handler in `main.content.ts` (around line 259), add:

```ts
/**
 * Relays the Shopify-globals snapshot request to the main world.
 * @returns {import('./popup/utils/types').ShopifyContext}
 */
if (request.action === 'get_shopify_context') {
  const emptyContext = {
    isShopify: false,
    pageType: null,
    resourceId: null,
    shop: null,
    locale: null,
    currency: null,
    country: null,
    marketRoot: null,
    themeRole: null,
    designMode: false
  };
  const requestId = Date.now() + '_' + Math.random();
  let responseHandled = false;
  const handleContextResponse = (event: Event) => {
    if (responseHandled) return;
    responseHandled = true;
    window.removeEventListener(`alfred:shopify_context_response_${requestId}`, handleContextResponse);
    clearTimeout(contextTimeoutId);
    sendResponse((event as CustomEvent<unknown>).detail ?? emptyContext);
  };
  const contextTimeoutId = setTimeout(() => {
    if (responseHandled) return;
    responseHandled = true;
    window.removeEventListener(`alfred:shopify_context_response_${requestId}`, handleContextResponse);
    sendResponse(emptyContext);
  }, 200);
  window.addEventListener(`alfred:shopify_context_response_${requestId}`, handleContextResponse);
  window.postMessage({ type: 'alfred:request_shopify_context', requestId }, '*');
  return true;
}
```

- [ ] **Step 5: Add the method to the `Alfred` interface in `global.d.ts`**

Inside `declare interface WindowWithAlfred { Alfred: { ... } }`, after `getTheme`:

```ts
getShopifyContext: () => {
  isShopify: boolean;
  pageType: string | null;
  resourceId: string | null;
  shop: string | null;
  locale: string | null;
  currency: string | null;
  country: string | null;
  marketRoot: string | null;
  themeRole: string | null;
  designMode: boolean;
};
```

- [ ] **Step 6: Run tests**

Run: `bun test`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add entrypoints/alfred-main-world.ts entrypoints/main.content.ts global.d.ts
git commit -m "feat(content): relay shopify globals snapshot for overview tab"
```

---

### Task 7: SerpPreview component

**Files:**

- Create: `entrypoints/popup/SerpPreview.svelte`

**Interfaces:**

- Consumes: `TITLE_MAX`, `DESC_MAX` are not needed here; the component is self-contained. Props: `{ title: string; description: string; url: string; favicon: string | null; siteName: string | null }`.
- Produces: `<SerpPreview />` used by `Overview.svelte` (Task 8).

Google truncates desktop titles by pixel width (~600px at 20px Arial), not characters, so the preview measures with a canvas and shows a px counter. The preview imitates Google's result card, so its colors are intentionally fixed (light card) rather than themed.

- [ ] **Step 1: Create `entrypoints/popup/SerpPreview.svelte`**

```svelte
<script lang="ts">
  let {
    title,
    description,
    url,
    favicon,
    siteName
  }: {
    title: string;
    description: string;
    url: string;
    favicon: string | null;
    siteName: string | null;
  } = $props();

  // Google's desktop SERP title font; the ~600px cap is what actually truncates.
  const TITLE_FONT = '20px arial, sans-serif';
  const TITLE_MAX_PX = 600;
  const DESC_MAX_CHARS = 160;

  let measureCtx: CanvasRenderingContext2D | null = null;
  function textWidth(text: string): number {
    measureCtx ??= document.createElement('canvas').getContext('2d');
    if (!measureCtx) return 0;
    measureCtx.font = TITLE_FONT;
    return measureCtx.measureText(text).width;
  }

  const titleWidth = $derived(Math.round(textWidth(title)));

  const displayTitle = $derived.by(() => {
    if (!title) return '(no title)';
    if (titleWidth <= TITLE_MAX_PX) return title;
    let cut = title;
    while (cut.length > 0 && textWidth(cut.trimEnd() + ' ...') > TITLE_MAX_PX) cut = cut.slice(0, -1);
    return cut.trimEnd() + ' ...';
  });

  const displayDescription = $derived.by(() => {
    if (!description) return 'Google will generate a snippet from page content.';
    return description.length > DESC_MAX_CHARS
      ? description.slice(0, DESC_MAX_CHARS - 3).trimEnd() + ' ...'
      : description;
  });

  const parsed = $derived.by(() => {
    try {
      const u = new URL(url);
      const segments = u.pathname.split('/').filter(Boolean);
      return { host: u.hostname, breadcrumb: u.hostname + (segments.length ? ' › ' + segments.join(' › ') : '') };
    } catch {
      return { host: url, breadcrumb: url };
    }
  });
</script>

<div class="serp">
  <div class="serp__head">
    {#if favicon}
      <img class="serp__favicon" src={favicon} alt="" />
    {:else}
      <span class="serp__favicon serp__favicon--empty"></span>
    {/if}
    <div class="serp__source">
      <div class="serp__sitename">{siteName ?? parsed.host}</div>
      <div class="serp__breadcrumb">{parsed.breadcrumb}</div>
    </div>
  </div>
  <div class="serp__title">{displayTitle}</div>
  <div class="serp__desc">{displayDescription}</div>
</div>
<div class="serp-meta">
  <span class="serp-meta__px" class:serp-meta__px--over={titleWidth > TITLE_MAX_PX}>
    Title: {titleWidth}px / {TITLE_MAX_PX}px
  </span>
  <span class="serp-meta__px" class:serp-meta__px--over={description.length > DESC_MAX_CHARS}>
    Description: {description.length} / {DESC_MAX_CHARS} chars
  </span>
</div>

<style>
  /* Fixed light palette on purpose: this imitates Google's result card. */
  .serp { background: #fff; border: 1px solid var(--border); border-radius: 10px; padding: 14px 16px; font-family: arial, sans-serif; }
  .serp__head { display: flex; align-items: center; gap: 10px; margin-bottom: 6px; }
  .serp__favicon { width: 26px; height: 26px; border-radius: 50%; background: #f1f3f4; object-fit: contain; padding: 4px; box-sizing: border-box; border: 1px solid #ecedef; flex-shrink: 0; }
  .serp__favicon--empty { display: inline-block; }
  .serp__source { min-width: 0; }
  .serp__sitename { font-size: 13px; color: #202124; line-height: 1.3; }
  .serp__breadcrumb { font-size: 11px; color: #4d5156; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .serp__title { font-size: 18px; line-height: 1.3; color: #1a0dab; margin-bottom: 3px; cursor: pointer; }
  .serp__title:hover { text-decoration: underline; }
  .serp__desc { font-size: 13px; line-height: 1.55; color: #474747; }
  .serp-meta { display: flex; gap: 12px; padding: 6px 2px 0; }
  .serp-meta__px { font-size: 11px; color: var(--text-muted); font-variant-numeric: tabular-nums; }
  .serp-meta__px--over { color: var(--error-strong); font-weight: 600; }
</style>
```

- [ ] **Step 2: Commit**

```bash
git add entrypoints/popup/SerpPreview.svelte
git commit -m "feat(popup): google serp preview with pixel-width truncation"
```

---

### Task 8: Overview tab component

**Files:**

- Create: `entrypoints/popup/Overview.svelte`

**Interfaces:**

- Consumes: `OverviewAnalysis`, `RawOverview`, `OverviewNetwork`, `ShopifyContext`, `RawLink` types; `socialProfiles` from `./utils/overview`; `SerpPreview.svelte`; `trackAction` from `@/utils/analytics` (events land in Task 10).
- Produces: `<Overview raw network networkLoading shopify analysis links />` consumed by App.svelte (Task 9).

- [ ] **Step 1: Create `entrypoints/popup/Overview.svelte`**

```svelte
<script lang="ts">
  import type { OverviewAnalysis, OverviewNetwork, RawLink, RawOverview, ShopifyContext } from './utils/types';
  import { socialProfiles } from './utils/overview';
  import SerpPreview from './SerpPreview.svelte';
  import { trackAction } from '@/utils/analytics';
  import { untrack } from 'svelte';

  let {
    raw,
    network,
    networkLoading,
    shopify,
    analysis,
    links
  }: {
    raw: RawOverview | null;
    network: OverviewNetwork | null;
    networkLoading: boolean;
    shopify: ShopifyContext | null;
    analysis: OverviewAnalysis;
    links: RawLink[];
  } = $props();

  let tracked = false;
  $effect(() => {
    if (tracked || !raw) return;
    tracked = true;
    untrack(() => {
      trackAction('overview_view', {
        indexability: analysis.indexability.status,
        error_count: analysis.errorCount,
        finding_count: analysis.findings.length,
        is_shopify: shopify?.isShopify ?? false
      });
    });
  });

  const profiles = $derived(socialProfiles(links));
  const origin = $derived.by(() => {
    try {
      return raw ? new URL(raw.url).origin : null;
    } catch {
      return null;
    }
  });

  const previewFinding = $derived(analysis.findings.find((f) => f.code === 'preview-mode' || f.code === 'password-page'));
  const listedFindings = $derived(analysis.findings.filter((f) => f !== previewFinding));

  const verdictLabel: Record<string, string> = {
    indexable: 'Indexable',
    'not-indexable': 'Not indexable',
    canonicalized: 'Canonicalized',
    unknown: 'Unknown'
  };

  let copiedKey = $state<string | null>(null);
  async function copy(key: string, value: string) {
    try {
      await navigator.clipboard.writeText(value);
      copiedKey = key;
      trackAction('overview_copy', { field: key });
      setTimeout(() => (copiedKey = null), 1500);
    } catch {
      // silent fail
    }
  }

  function quickLink(name: string, url: string) {
    trackAction('overview_quick_link', { link: name });
    window.open(url, '_blank');
  }

  const directiveLabel = (d: { name: string; value: string | null; source: string }) =>
    `${d.name}${d.value !== null ? `:${d.value}` : ''}`;
</script>

{#if !raw}
  <div class="empty-state">
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" class="empty-state__icon"><path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>
    <p>Page data unavailable — reload the page and reopen Alfred</p>
  </div>
{:else}
  <div class="overview">
    {#if previewFinding}
      <div class="banner" class:banner--error={previewFinding.severity === 'error'}>
        <span class="banner__dot"></span>{previewFinding.message}
      </div>
    {/if}

    <!-- Verdict -->
    <div class="verdict verdict--{analysis.indexability.status}">
      <div class="verdict__status">
        <span class="verdict__dot"></span>
        {verdictLabel[analysis.indexability.status]}
      </div>
      <div class="verdict__reasons">
        {#each analysis.indexability.reasons as reason}
          <span>{reason}</span>
        {/each}
        {#if networkLoading}
          <span class="verdict__pending">checking headers…</span>
        {/if}
      </div>
    </div>

    <!-- SERP preview -->
    <div class="section">
      <div class="section__title">Search preview</div>
      <SerpPreview
        title={analysis.title.text ?? ''}
        description={analysis.description.text ?? ''}
        url={raw.url}
        favicon={raw.faviconHref}
        siteName={raw.ogSiteName}
      />
    </div>

    <!-- Core meta -->
    <div class="section">
      <div class="section__title">Core meta</div>
      <div class="row">
        <span class="row__label">Title</span>
        <span class="row__value">
          {#if analysis.title.text}
            <span class="row__text" title={analysis.title.text}>{analysis.title.text}</span>
            <span class="pill" class:pill--green={analysis.title.length >= 30 && analysis.title.length <= 60} class:pill--red={analysis.title.length < 30 || analysis.title.length > 60}>{analysis.title.length}/60</span>
          {:else}
            <span class="row__missing">Missing</span>
          {/if}
        </span>
      </div>
      <div class="row">
        <span class="row__label">Description</span>
        <span class="row__value">
          {#if analysis.description.text}
            <span class="row__text" title={analysis.description.text}>{analysis.description.text}</span>
            <span class="pill" class:pill--green={analysis.description.length >= 70 && analysis.description.length <= 160} class:pill--red={analysis.description.length < 70 || analysis.description.length > 160}>{analysis.description.length}/160</span>
          {:else}
            <span class="row__missing">Missing</span>
            <span class="pill pill--red">0/160</span>
          {/if}
        </span>
      </div>
      <div class="row">
        <span class="row__label">URL</span>
        <span class="row__value">
          <span class="row__text row__text--mono" title={raw.url}>{raw.url}</span>
          <button class="copy-btn" onclick={() => copy('url', raw.url)} aria-label="Copy URL">
            {#if copiedKey === 'url'}<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round"><polyline points="20 6 9 17 4 12"/></svg>{:else}<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/></svg>{/if}
          </button>
        </span>
      </div>
      <div class="row">
        <span class="row__label">Canonical</span>
        <span class="row__value">
          {#if analysis.canonical.href}
            <span class="row__text row__text--mono" title={analysis.canonical.href}>{analysis.canonical.href}</span>
          {/if}
          {#if analysis.canonical.kind === 'self'}<span class="pill pill--green">Self-ref</span>
          {:else if analysis.canonical.kind === 'elsewhere'}<span class="pill pill--yellow">Elsewhere</span>
          {:else if analysis.canonical.kind === 'cross-domain'}<span class="pill pill--red">Cross-domain</span>
          {:else if analysis.canonical.kind === 'multiple'}<span class="pill pill--red">Conflicting</span>
          {:else}<span class="pill pill--gray">Missing</span>{/if}
        </span>
      </div>
      <div class="row">
        <span class="row__label">Robots</span>
        <span class="row__value row__value--wrap">
          {#if analysis.directives.length === 0}
            <span class="row__muted">Not specified{networkLoading ? ' (checking header…)' : ''}</span>
          {:else}
            {#each analysis.directives as directive}
              <span
                class="chip"
                class:chip--red={directive.name === 'noindex' || directive.name === 'none'}
                title={directive.source === 'header' ? 'From X-Robots-Tag header' : `From meta ${directive.source}`}
              >{directiveLabel(directive)}{#if directive.source === 'header'}<span class="chip__src">hdr</span>{/if}</span>
            {/each}
          {/if}
        </span>
      </div>
    </div>

    <!-- Technical -->
    <div class="section">
      <div class="section__title">Technical</div>
      <div class="row"><span class="row__label">Language</span><span class="row__value">{raw.lang || '—'}</span></div>
      <div class="row"><span class="row__label">Charset</span><span class="row__value">{raw.charset}</span></div>
      <div class="row">
        <span class="row__label">Viewport</span>
        <span class="row__value"><span class="row__text row__text--mono">{raw.viewport ?? '—'}</span></span>
      </div>
      <div class="row"><span class="row__label">Word count</span><span class="row__value">{raw.wordCount.toLocaleString()}</span></div>
      {#if analysis.dates.published || analysis.dates.modified}
        <div class="row">
          <span class="row__label">Dates</span>
          <span class="row__value row__value--wrap">
            {#if analysis.dates.published}<span class="chip">published {analysis.dates.published.slice(0, 10)}</span>{/if}
            {#if analysis.dates.modified}<span class="chip">modified {analysis.dates.modified.slice(0, 10)}</span>{/if}
          </span>
        </div>
      {/if}
      {#if network?.llmsTxt}
        <div class="row"><span class="row__label">llms.txt</span><span class="row__value"><span class="pill pill--green">Present</span></span></div>
      {/if}
    </div>

    <!-- Shopify context -->
    {#if shopify?.isShopify}
      <div class="section">
        <div class="section__title">Shopify</div>
        <div class="row">
          <span class="row__label">Page type</span>
          <span class="row__value">
            <span class="pill pill--purple">{analysis.pageType ?? 'unknown'}</span>
            {#if shopify.resourceId}<span class="row__muted">#{shopify.resourceId}</span>{/if}
          </span>
        </div>
        {#if shopify.shop}
          <div class="row">
            <span class="row__label">Store</span>
            <span class="row__value">
              <span class="row__text row__text--mono">{shopify.shop}</span>
              <button class="copy-btn" onclick={() => copy('shop', shopify.shop ?? '')} aria-label="Copy store domain">
                {#if copiedKey === 'shop'}<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round"><polyline points="20 6 9 17 4 12"/></svg>{:else}<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/></svg>{/if}
              </button>
            </span>
          </div>
        {/if}
        <div class="row">
          <span class="row__label">Locale</span>
          <span class="row__value row__value--wrap">
            {#if shopify.locale}<span class="chip">{shopify.locale}</span>{/if}
            {#if shopify.country}<span class="chip">{shopify.country}</span>{/if}
            {#if shopify.currency}<span class="chip">{shopify.currency}</span>{/if}
            {#if shopify.marketRoot && shopify.marketRoot !== '/'}<span class="chip">market {shopify.marketRoot}</span>{/if}
          </span>
        </div>
      </div>
    {/if}

    <!-- Findings -->
    {#if listedFindings.length > 0}
      <div class="section">
        <div class="section__title">Findings <span class="section__count">{listedFindings.length}</span></div>
        {#each listedFindings as finding}
          <div class="finding">
            <span class="finding__dot finding__dot--{finding.severity}"></span>
            <span class="finding__msg">{finding.message}</span>
          </div>
        {/each}
      </div>
    {/if}

    <!-- Social profiles -->
    {#if profiles.length > 0}
      <div class="section">
        <div class="section__title">Social profiles</div>
        <div class="chips">
          {#each profiles as profile}
            <a class="quick-link" href={profile.url} target="_blank" rel="noopener">{profile.network}</a>
          {/each}
        </div>
      </div>
    {/if}

    <!-- Quick links -->
    <div class="section">
      <div class="section__title">Quick links</div>
      <div class="chips">
        {#if origin}
          <button class="quick-link" onclick={() => quickLink('robots', `${origin}/robots.txt`)}>robots.txt</button>
          <button class="quick-link" onclick={() => quickLink('sitemap', `${origin}/sitemap.xml`)}>sitemap.xml</button>
        {/if}
        <button class="quick-link" onclick={() => quickLink('rich-results', `https://search.google.com/test/rich-results?url=${encodeURIComponent(raw.url)}`)}>Rich Results Test</button>
        <button class="quick-link" onclick={() => quickLink('pagespeed', `https://pagespeed.web.dev/analysis?url=${encodeURIComponent(raw.url)}`)}>PageSpeed</button>
      </div>
    </div>
  </div>
{/if}

<style>
  .overview { padding: 20px 24px 28px; display: flex; flex-direction: column; gap: 18px; }

  .banner { display: flex; align-items: center; gap: 8px; padding: 9px 14px; border-radius: 10px; font-size: 12.5px; font-weight: 500; background: var(--warning-bg, var(--error-bg)); color: var(--warning-strong, var(--error-strong)); }
  .banner--error { background: var(--error-bg); color: var(--error-strong); }
  .banner__dot { width: 7px; height: 7px; border-radius: 50%; background: currentColor; flex-shrink: 0; }

  .verdict { border: 1px solid var(--border); border-radius: 10px; padding: 14px 16px; }
  .verdict__status { display: flex; align-items: center; gap: 8px; font-size: 15px; font-weight: 700; color: var(--text); }
  .verdict__dot { width: 9px; height: 9px; border-radius: 50%; }
  .verdict--indexable .verdict__dot { background: var(--success-strong); }
  .verdict--not-indexable .verdict__dot { background: var(--error-strong); }
  .verdict--canonicalized .verdict__dot { background: var(--warning-strong, var(--error-strong)); }
  .verdict--unknown .verdict__dot { background: var(--text-muted); }
  .verdict__reasons { margin-top: 4px; font-size: 12.5px; color: var(--text-muted); display: flex; flex-direction: column; gap: 2px; }
  .verdict__pending { font-style: italic; }

  .section__title { font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.06em; color: var(--text-label); margin-bottom: 8px; display: flex; align-items: center; gap: 6px; }
  .section__count { font-weight: 600; color: var(--text-muted); }

  .row { display: flex; justify-content: space-between; align-items: center; gap: 16px; padding: 8px 0; border-bottom: 1px solid var(--border); }
  .row:last-child { border-bottom: none; }
  .row__label { font-size: 13px; font-weight: 500; color: var(--text-muted); flex-shrink: 0; }
  .row__value { font-size: 13px; color: var(--text); font-weight: 500; display: flex; align-items: center; gap: 7px; justify-content: flex-end; overflow: hidden; min-width: 0; }
  .row__value--wrap { flex-wrap: wrap; }
  .row__text { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .row__text--mono { font-family: ui-monospace, monospace; font-size: 12px; }
  .row__missing { color: var(--error-strong); }
  .row__muted { color: var(--text-muted); font-weight: 400; }

  .pill { display: inline-flex; align-items: center; font-size: 11px; font-weight: 600; padding: 2px 8px; border-radius: 20px; white-space: nowrap; flex-shrink: 0; }
  .pill--green { background: var(--success-bg); color: var(--success-strong); }
  .pill--red { background: var(--error-bg); color: var(--error-strong); }
  .pill--yellow { background: var(--warning-bg, var(--error-bg)); color: var(--warning-strong, var(--error-strong)); }
  .pill--gray { background: var(--bg-raised); color: var(--text-muted); }
  .pill--purple { background: var(--bg-raised); color: var(--accent); }

  .chip { display: inline-flex; align-items: center; gap: 4px; font-size: 11.5px; font-weight: 500; font-family: ui-monospace, monospace; padding: 2px 8px; border-radius: 20px; border: 1px solid var(--border); color: var(--text-secondary); }
  .chip--red { background: var(--error-bg); border-color: transparent; color: var(--error-strong); }
  .chip__src { font-size: 9px; font-weight: 700; text-transform: uppercase; opacity: 0.6; }

  .finding { display: flex; align-items: baseline; gap: 10px; padding: 6px 0; border-bottom: 1px solid var(--border); font-size: 12.5px; color: var(--text-secondary); }
  .finding:last-child { border-bottom: none; }
  .finding__dot { width: 7px; height: 7px; border-radius: 50%; flex-shrink: 0; transform: translateY(-1px); }
  .finding__dot--error { background: var(--error-strong); }
  .finding__dot--warning { background: var(--warning-strong, #e8a13c); }
  .finding__dot--info { background: var(--text-muted); }
  .finding__msg { flex: 1; }

  .chips { display: flex; gap: 6px; flex-wrap: wrap; }
  .quick-link { display: inline-flex; align-items: center; gap: 5px; padding: 6px 11px; font-size: 11.5px; font-weight: 500; color: var(--text-secondary); background: var(--bg); border: 1px solid var(--border); border-radius: 6px; text-decoration: none; cursor: pointer; transition: all 0.12s; font-family: inherit; }
  .quick-link:hover { border-color: var(--text-muted); color: var(--text); }

  .copy-btn { background: none; border: none; cursor: pointer; color: var(--text-muted); padding: 2px; border-radius: 3px; line-height: 0; flex-shrink: 0; }
  .copy-btn:hover { color: var(--text); }
  .copy-btn svg { width: 13px; height: 13px; }

  .empty-state { display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100%; gap: 8px; color: var(--text-muted); font-size: 13px; }
  .empty-state__icon { width: 32px; height: 32px; opacity: 0.3; stroke-width: 1.5; }
</style>
```

Note for the implementer: before finishing, open one of the existing components (`Robots.svelte`) and confirm the token names used for warning colors; replace the `var(--warning-*, fallback)` pairs with the project's real tokens if they exist.

- [ ] **Step 2: Commit**

```bash
git add entrypoints/popup/Overview.svelte
git commit -m "feat(popup): overview tab component"
```

---

### Task 9: App.svelte wiring — tab, icon, badge, data flow

**Files:**

- Modify: `entrypoints/popup/App.svelte`

**Interfaces:**

- Consumes: `getOverview`, `getOverviewNetwork`, `getShopifyContext`, `analyzeOverview` from `./utils/overview`; `Overview.svelte`; types from Task 1.
- Produces: the Overview tab live in the sidebar as the first SEO tab, with a red error-count badge; non-Shopify pages land on Overview by default.

- [ ] **Step 1: Add imports**

In the `<script>` block of `entrypoints/popup/App.svelte`:

```ts
import { getOverview, getOverviewNetwork, getShopifyContext, analyzeOverview } from './utils/overview';
import Overview from './Overview.svelte';
```

and extend the type import line with `RawOverview, OverviewNetwork, ShopifyContext`.

- [ ] **Step 2: Add state and derived analysis**

After the existing `rawRobots` state declarations:

```ts
let rawOverview = $state<RawOverview | null>(null);
let overviewNetwork = $state<OverviewNetwork | null>(null);
let shopifyContext = $state<ShopifyContext | null>(null);
let overviewNetworkLoading = $state(true);
```

After the `robotsErrorCount` derived:

```ts
const overviewAnalysis = $derived(analyzeOverview(rawOverview, overviewNetwork, shopifyContext, rawRobots, rawSchema));
```

- [ ] **Step 3: Enable the tab with badge**

In `seoTabs`, replace the commented `// { id: 'overview', ... }` line with a real entry placed FIRST in the array (before headings):

```ts
    {
      id: 'overview' as TabId,
      label: 'Overview',
      icon: 'overview',
      ...(overviewAnalysis.errorCount > 0
        ? { badge: { count: overviewAnalysis.errorCount, color: 'red' as const } }
        : {})
    },
```

Remove the old commented line.

- [ ] **Step 4: Fetch the data**

In the `$effect` data-fetch block: the network refetch is slow-path like robots — add next to the `getRobots()` call:

```ts
getOverviewNetwork().then((networkData) => {
  overviewNetwork = networkData;
  overviewNetworkLoading = false;
});
```

Extend the fast-path `Promise.all` to include the two new getters:

```ts
const [storeData, headingsData, linksData, assetsData, imagesData, schemaData, overviewData, contextData] =
  await Promise.all([
    getTheme(),
    getHeadings(),
    getLinks(),
    getAssets(),
    getImages(),
    getSchema(),
    getOverview(),
    getShopifyContext(),
    tab?.id != null && tab.url ? tabState.hydrate(tab.id, tab.url) : Promise.resolve()
  ]);
```

and after the existing assignments:

```ts
rawOverview = overviewData;
shopifyContext = contextData;
```

Change the non-Shopify default section from `'headings'` to `'overview'`:

```ts
      } else if (!storeData?.isShopify) {
        activeTab = 'overview';
      }
```

- [ ] **Step 5: Uncomment the overview icon**

Move the `{:else if icon === 'overview'}` branch out of the comment block in the `tabIcon` snippet (keep the same SVG):

```svelte
  {:else if icon === 'overview'}
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round"><path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>
```

- [ ] **Step 6: Render the tab**

In the content area, before the `activeTab === 'headings'` branch:

```svelte
        {:else if activeTab === 'overview'}
          <Overview
            raw={rawOverview}
            network={overviewNetwork}
            networkLoading={overviewNetworkLoading}
            shopify={shopifyContext}
            analysis={overviewAnalysis}
            links={rawLinks}
          />
```

- [ ] **Step 7: Run tests**

Run: `bun test`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add entrypoints/popup/App.svelte
git commit -m "feat(popup): enable overview tab with indexability badge"
```

---

### Task 10: Analytics events

**Files:**

- Modify: `utils/analytics-actions.ts`
- Modify: `supabase/functions/track/index.ts`

**Interfaces:**

- Consumes: nothing.
- Produces: valid action names `overview_view`, `overview_copy`, `overview_quick_link` used by Overview.svelte (Task 8). The parity test in `utils/tests/` enforces both lists match.

- [ ] **Step 1: Add the three actions to `ANALYTICS_ACTIONS` in `utils/analytics-actions.ts`**

Append inside the array (near the other popup events):

```ts
  'overview_view',
  'overview_copy',
  'overview_quick_link',
```

- [ ] **Step 2: Add the same three strings to `VALID_ACTIONS` in `supabase/functions/track/index.ts`**

```ts
  'overview_view',
  'overview_copy',
  'overview_quick_link',
```

- [ ] **Step 3: Run the parity test**

Run: `bun test utils/tests`
Expected: PASS (the analytics parity test now sees both lists in sync).

- [ ] **Step 4: Commit**

```bash
git add utils/analytics-actions.ts supabase/functions/track/index.ts
git commit -m "feat(analytics): overview tab events"
```

---

### Task 11: Visual test pages

**Files:**

- Create: `test-pages/overview/clean.html`
- Create: `test-pages/overview/noindex.html`
- Create: `test-pages/overview/canonical-elsewhere.html`
- Create: `test-pages/overview/bad-meta.html`
- Create: `test-pages/overview/thin-content.html`

**Interfaces:**

- Consumes: the `test-pages/` conventions (blue `.expected` panel, no heading tags in page chrome — see `test-pages/README.md`; the index is auto-generated by `bun run testpages`).
- Produces: one fixture per scenario for manual QA of the Overview tab.

Before writing, read `test-pages/README.md` and one existing fixture (`test-pages/headings/clean.html`) and reuse its exact `.expected` panel styles. The fixtures below follow that structure.

- [ ] **Step 1: Create `test-pages/overview/clean.html`** (positive control)

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Clean overview page with a title in the optimal range</title>
    <meta
      name="description"
      content="A well-formed page for the Overview tab: optimal title and description lengths, self-referencing canonical, viewport, lang, charset, and favicon all present and correct." />
    <link rel="canonical" href="http://localhost:4242/overview/clean.html" />
    <link rel="icon" href="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg'/>" />
    <style>
      body {
        font:
          15px/1.7 system-ui,
          sans-serif;
        margin: 0;
        background: #fff;
        color: #222;
      }
      .expected {
        background: #eef4ff;
        border: 1px solid #c7d8f7;
        border-radius: 8px;
        margin: 16px;
        padding: 12px 16px;
        font-size: 13px;
      }
      .expected .t {
        font-weight: 700;
        margin-bottom: 4px;
      }
      .expected ul {
        margin: 0;
        padding-left: 18px;
      }
      main {
        max-width: 680px;
        margin: 24px auto 48px;
        padding: 0 16px;
      }
    </style>
  </head>
  <body>
    <aside class="expected">
      <div class="t">Expected — Overview tab</div>
      <ul>
        <li>Verdict: Indexable (green)</li>
        <li>Title pill green (53/60), description pill green (~150/160)</li>
        <li>Canonical: Self-ref (green pill)</li>
        <li>Robots row: "Not specified"</li>
        <li>No error badge on the sidebar tab; findings list empty or info-only</li>
        <li>SERP preview shows this title untruncated with px counter under 600px</li>
      </ul>
    </aside>
    <main>
      <p>
        This page intentionally exceeds three hundred visible words so the thin-content check stays quiet. The quick
        brown fox jumps over the lazy dog while the overview analyzer counts every visible word on the page, ignoring
        hidden text and script contents entirely. Repetition pads the count: analysis, verdict, canonical, description,
        robots, viewport, charset, favicon, language, snippet, preview, pixel, width, truncation, indexable, crawlable,
        directive, header, canonicalized, and finding.
      </p>
      <p>
        The quick brown fox jumps over the lazy dog. The quick brown fox jumps over the lazy dog. The quick brown fox
        jumps over the lazy dog. The quick brown fox jumps over the lazy dog. The quick brown fox jumps over the lazy
        dog. The quick brown fox jumps over the lazy dog. The quick brown fox jumps over the lazy dog. The quick brown
        fox jumps over the lazy dog. The quick brown fox jumps over the lazy dog. The quick brown fox jumps over the
        lazy dog.
      </p>
      <p>
        More filler continues here so that the total visible word count comfortably clears the three hundred word
        threshold used by the analyzer. Words words words words words words words words words words words words words
        words words words words words words words words words words words words words words words words words words
        words words words words words words words words words words words words words words words words words words
        words words words words words words words words words words words words words words words words words words
        words words.
      </p>
      <p>
        Final paragraph of padding to be safe: content content content content content content content content content
        content content content content content content content content content content content content content content
        content content content content content content content content content content content content content.
      </p>
    </main>
  </body>
</html>
```

- [ ] **Step 2: Create `test-pages/overview/noindex.html`**

Same skeleton; head differences and expected panel:

```html
<title>Noindex page — verdict must be Not indexable</title>
<meta
  name="description"
  content="This page carries a meta robots noindex, nofollow directive, so the Overview verdict must flip to Not indexable and the sidebar badge must count the error." />
<meta name="robots" content="noindex, nofollow" />
<link rel="canonical" href="http://localhost:4242/overview/noindex.html" />
```

Expected panel bullets:

```html
<li>Verdict: Not indexable (red) — reason "noindex in meta robots"</li>
<li>Robots row shows red noindex chip plus nofollow chip</li>
<li>Findings: noindex (error), nofollow (warning)</li>
<li>Sidebar Overview badge shows at least 1</li>
```

Body: reuse the >300-word filler from clean.html.

- [ ] **Step 3: Create `test-pages/overview/canonical-elsewhere.html`**

```html
<title>Canonicalized page pointing at the clean page instead</title>
<meta
  name="description"
  content="The canonical on this page points at clean.html rather than itself, so the verdict must read Canonicalized with a yellow Elsewhere pill on the canonical row." />
<link rel="canonical" href="http://localhost:4242/overview/clean.html" />
```

Expected panel bullets:

```html
<li>Verdict: Canonicalized (yellow) — reason shows the clean.html URL</li>
<li>Canonical row: Elsewhere (yellow pill)</li>
<li>Finding: canonical points to a different URL (info)</li>
```

Body: >300-word filler.

- [ ] **Step 4: Create `test-pages/overview/bad-meta.html`**

```html
<title>Bad</title>
<!-- no description, no canonical, no viewport, no favicon; html tag has no lang -->
```

(`<html>` deliberately without `lang`; omit viewport/description/canonical/icon links.)

Expected panel bullets:

```html
<li>Title pill red (3/60) with title-short warning</li>
<li>Description: Missing (red), description-missing error</li>
<li>Canonical: Missing (gray pill), info finding</li>
<li>Findings include: viewport missing (error), lang missing (warning), favicon missing (warning)</li>
<li>Sidebar badge counts 2+ errors</li>
<li>SERP preview description falls back to placeholder text</li>
```

Body: >300-word filler.

- [ ] **Step 5: Create `test-pages/overview/thin-content.html`**

Clean head (copy from clean.html, adjust title/canonical to this file's URL), body with fewer than 100 visible words.

Expected panel bullets:

```html
<li>Word count row shows a low number</li>
<li>Finding: thin content (warning, under 100 words)</li>
<li>Everything else clean; verdict Indexable</li>
```

Keep the expected-panel word count in mind: the `.expected` aside is visible text and counts toward the total, so keep the whole page under 100 words.

- [ ] **Step 6: Verify fixtures serve**

Run: `bun run testpages` then open http://localhost:4242 — the index should list the new `overview/` folder automatically. Stop the server after checking.

- [ ] **Step 7: Commit**

```bash
git add test-pages/overview
git commit -m "test: overview tab fixture pages"
```

---

### Task 12: Full-suite verification

**Files:** none (verification only)

- [ ] **Step 1: Run the entire test suite**

Run: `bun test`
Expected: PASS across all suites (overview, robots, headings, images, links, schema, assets, theme, tabState, format, analytics parity).

- [ ] **Step 2: Manual smoke check (user has HMR/dev running — do not start builds)**

Ask the user to open the extension popup on a Shopify storefront and on `http://localhost:4242/overview/clean.html` (via `bun run testpages`) and confirm:

- Overview appears first in the SEO group, selected by default on non-Shopify pages
- Verdict, SERP preview, meta rows, findings, Shopify section render
- Badge counts match the fixtures' expected panels

- [ ] **Step 3: Final commit if any fixups were needed, using `fix(popup): ...` messages**

---

## Self-Review Notes

- **Spec coverage:** verdict hero (Task 3/8), SERP preview with pixel width (Task 7), core meta incl. multiple-tag detection (Task 2), robots directives incl. AI-era notes + X-Robots-Tag + conflicts (Task 3), raw-vs-rendered (Tasks 3/5), llms.txt + noai (Tasks 3/5), technical rows (Tasks 3/8), Shopify context + all six storefront checks + preview banner (Tasks 4/6/8), social profiles + quick links (Tasks 4/8), badge (Task 9), analytics (Task 10), fixtures (Task 11). Meta keywords, text/HTML ratio, and keyword density intentionally excluded.
- **Type consistency:** `analyzeOverview(raw, network, shopify, robots, schema)` signature matches App.svelte's call; `RobotsDirective.source` union matches parse/push sites; `PopupSection` gains `'overview'` before App uses it.
- **Known judgment calls:** robots.txt block reports `not-indexable` (with URL-only caveat text); `canonicalized` only when kind is `elsewhere`/`cross-domain`; word-count severity bands 100/300.
