# Sitemaps Tab Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add the Sitemaps SEO tab to the popup: list the site's sitemap index and child sitemaps with URL counts, lastmod, category pills, and health findings, with a red error badge on the sidebar.

**Architecture:** A `get_sitemaps` content-script handler (page context, so fetches ride the page's HTTP cache/cookies and the test server's referer-based fixtures work) discovers sitemap URLs from robots.txt `Sitemap:` lines (fallback `/sitemap.xml`), fetches roots and index children in parallel with size caps, and returns compact stats — never full bodies — over `sendMessage`. Pure parsing/classification/analysis lives in `entrypoints/popup/utils/sitemaps.ts` (bun-testable, shared by the content script), mirroring the robots.ts pattern. `Sitemaps.svelte` renders from a single `analyzeSitemaps()` pipeline shared with the App.svelte badge.

**Tech Stack:** WXT, Svelte 5 runes, TypeScript, Bun test runner.

**Spec:** `docs/superpowers/specs/2026-08-08-sitemaps-tab-design.md`

## Global Constraints

- Commits: Conventional Commits, single line, imperative, under 72 chars. **No attribution lines of any kind** (no Co-Authored-By, no Generated-with).
- Comments: WHY not WHAT; default to no comment; never reference removed code or the change itself.
- Tests live in `entrypoints/popup/tests/` with `.test.ts` suffix — never beside source.
- Do NOT run `bun run dev`, builds, or standalone typechecks mid-iteration (the user has HMR running; the pre-commit hook runs oxlint, oxfmt, tsc, and bun test on every commit).
- Analytics actions must be added to BOTH `utils/analytics-actions.ts` and `VALID_ACTIONS` in `supabase/functions/track/index.ts` — a parity test fails otherwise.
- Svelte 5 Runes API only ($state, $props, $derived, $effect). CSS uses the existing custom-property tokens (`--bg`, `--border`, `--text`, `--error-bg`, …); component styles are scoped per component.

---

### Task 1: Pure sitemap parsing + analysis module

**Files:**

- Create: `entrypoints/popup/utils/sitemaps.ts`
- Test: `entrypoints/popup/tests/sitemaps.test.ts`

**Interfaces:**

- Consumes: `looksLikeHtml` and `LintSeverity` from `./robots`; `queryActiveTab` from `./messaging`.
- Produces (used by Tasks 2, 4, 5):
  - `type SitemapKind = 'index' | 'urlset' | 'html' | 'invalid'`
  - `interface SitemapNode { url: string; finalUrl: string; ok: boolean; status: number; kind: SitemapKind; urlCount: number; truncated: boolean; lastmod: string | null; children: SitemapNode[] }`
  - `interface SitemapsData { nodes: SitemapNode[]; robotsSitemaps: string[] }`
  - `classifySitemap(text: string): SitemapKind`
  - `parseIndexEntries(text: string): { loc: string; lastmod: string | null }[]`
  - `countUrls(text: string): number`
  - `extractRobotsSitemaps(robotsText: string): string[]`
  - `sitemapFilename(url: string): string`
  - `categorizeSitemap(url: string): { label: string; abbr: string; color: string }`
  - `interface SitemapFinding { severity: LintSeverity; code: string; message: string }`
  - `interface SitemapsAnalysis { ok: boolean; findings: SitemapFinding[]; errorCount: number; totalSitemaps: number; totalUrls: number }`
  - `analyzeSitemaps(data: SitemapsData | null): SitemapsAnalysis`
  - `getSitemaps(): Promise<SitemapsData | null>` (thin wrapper, not unit-tested)

- [ ] **Step 1: Write the failing tests**

Create `entrypoints/popup/tests/sitemaps.test.ts`:

```ts
import { describe, expect, it } from 'bun:test';
import {
  analyzeSitemaps,
  categorizeSitemap,
  classifySitemap,
  countUrls,
  extractRobotsSitemaps,
  parseIndexEntries,
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
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `bun test entrypoints/popup/tests/sitemaps.test.ts`
Expected: FAIL — module `../utils/sitemaps` not found.

- [ ] **Step 3: Implement the module**

Create `entrypoints/popup/utils/sitemaps.ts`:

```ts
// Sitemap discovery, classification, counting, and health analysis. All
// parsing is regex-based (never DOMParser) so it is pure and bun-testable,
// and so a multi-MB body costs one linear scan; `getSitemaps` is the lone
// content-script wrapper.
import { looksLikeHtml, type LintSeverity } from './robots';
import { queryActiveTab } from './messaging';

export type SitemapKind = 'index' | 'urlset' | 'html' | 'invalid';

export interface SitemapNode {
  url: string;
  /** URL after redirects; '' on network error. */
  finalUrl: string;
  /** Fetch reached the server with a 2xx. */
  ok: boolean;
  /** HTTP status; 0 on network error. */
  status: number;
  kind: SitemapKind;
  /** urlset: <loc> count in the (possibly capped) body; index: total children listed. */
  urlCount: number;
  /** Body exceeded the read cap — urlCount is a floor. */
  truncated: boolean;
  /** From the parent index's <lastmod>; null on roots. */
  lastmod: string | null;
  /** Fetched children (index roots only, depth 1, capped). */
  children: SitemapNode[];
}

export interface SitemapsData {
  nodes: SitemapNode[];
  /** Absolute Sitemap: URLs found in robots.txt. */
  robotsSitemaps: string[];
}

/**
 * Fetches and analyzes the site's sitemaps via the content script. Runs in
 * the page context so requests ride the page's HTTP cache and cookies.
 * @returns {Promise<SitemapsData | null>} Stats per sitemap, or null when the tab is unreachable.
 */
export const getSitemaps = (): Promise<SitemapsData | null> =>
  queryActiveTab<SitemapsData | null>(
    'get_sitemaps',
    null,
    (r) => !!r && Array.isArray((r as { nodes?: unknown }).nodes)
  );

export function classifySitemap(text: string): SitemapKind {
  if (looksLikeHtml(text)) return 'html';
  if (/<sitemapindex[\s>]/i.test(text)) return 'index';
  if (/<urlset[\s>]/i.test(text)) return 'urlset';
  return 'invalid';
}

function decodeXmlEntities(s: string): string {
  return s
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&');
}

const SITEMAP_BLOCK = /<sitemap[\s>][\s\S]*?<\/sitemap>/gi;
const LOC = /<loc[^>]*>([\s\S]*?)<\/loc>/i;
const LASTMOD = /<lastmod[^>]*>([\s\S]*?)<\/lastmod>/i;

export function parseIndexEntries(text: string): { loc: string; lastmod: string | null }[] {
  const entries: { loc: string; lastmod: string | null }[] = [];
  for (const block of text.match(SITEMAP_BLOCK) ?? []) {
    const loc = block.match(LOC)?.[1]?.trim();
    if (!loc) continue;
    entries.push({
      loc: decodeXmlEntities(loc),
      lastmod: block.match(LASTMOD)?.[1]?.trim() || null
    });
  }
  return entries;
}

export function countUrls(text: string): number {
  return text.match(/<loc[\s>]/gi)?.length ?? 0;
}

export function extractRobotsSitemaps(robotsText: string): string[] {
  return [...robotsText.matchAll(/^\s*sitemap\s*:\s*(\S+)\s*$/gim)]
    .map((m) => m[1]!)
    .filter((u) => /^https?:\/\//i.test(u));
}

export function sitemapFilename(url: string): string {
  try {
    const u = new URL(url);
    const segment = u.pathname.split('/').filter(Boolean).pop();
    return segment ?? u.host;
  } catch {
    return url;
  }
}

export interface SitemapCategory {
  label: string;
  abbr: string;
  color: string;
}

const CATEGORIES: { pattern: RegExp; category: SitemapCategory }[] = [
  { pattern: /product/, category: { label: 'Products', abbr: 'P', color: '#4a90d9' } },
  { pattern: /collection/, category: { label: 'Collections', abbr: 'C', color: '#5c6ac4' } },
  { pattern: /page/, category: { label: 'Pages', abbr: 'Pg', color: '#ff6b35' } },
  { pattern: /blog|article/, category: { label: 'Blogs', abbr: 'B', color: '#e84393' } },
  { pattern: /agentic|discovery|llm/, category: { label: 'Discovery', abbr: 'AI', color: '#12b886' } },
  { pattern: /image/, category: { label: 'Images', abbr: 'I', color: '#0ca678' } },
  { pattern: /video/, category: { label: 'Videos', abbr: 'V', color: '#f59f00' } },
  { pattern: /news/, category: { label: 'News', abbr: 'N', color: '#748ffc' } }
];

export function categorizeSitemap(url: string): SitemapCategory {
  const name = sitemapFilename(url).toLowerCase();
  return CATEGORIES.find((c) => c.pattern.test(name))?.category ?? { label: 'Sitemap', abbr: 'S', color: '#8a8f98' };
}

export interface SitemapFinding {
  severity: LintSeverity;
  code: string;
  message: string;
}

export interface SitemapsAnalysis {
  /** At least one root fetched with a 2xx. */
  ok: boolean;
  findings: SitemapFinding[];
  errorCount: number;
  /** Child sitemaps across all indexes; a flat urlset root counts as 1. */
  totalSitemaps: number;
  /** Sum of urlset URL counts (children + flat roots). */
  totalUrls: number;
}

/** Bound the findings list — a hostile index can list thousands of children. */
const MAX_FINDINGS = 50;

/**
 * Single analysis pipeline shared by the sidebar badge (App.svelte) and the
 * Sitemaps tab, so the two surfaces can never disagree about the same data.
 */
export function analyzeSitemaps(data: SitemapsData | null): SitemapsAnalysis {
  if (!data) return { ok: false, findings: [], errorCount: 0, totalSitemaps: 0, totalUrls: 0 };

  const findings: SitemapFinding[] = [];
  const ok = data.nodes.some((n) => n.ok);
  let totalSitemaps = 0;
  let totalUrls = 0;
  let anyTruncated = false;

  if (!ok) {
    const first = data.nodes[0];
    const detail = first
      ? first.status === 0
        ? 'the request failed'
        : `returned HTTP ${first.status}`
      : 'no candidates';
    findings.push({ severity: 'error', code: 'no-sitemap', message: `No sitemap found — ${detail}` });
  }

  const inspect = (n: SitemapNode, isChild: boolean) => {
    anyTruncated ||= n.truncated;
    if (!n.ok) {
      if (isChild) {
        const detail = n.status === 0 ? 'request failed' : `HTTP ${n.status}`;
        findings.push({
          severity: 'warning',
          code: 'child-fetch-failed',
          message: `${sitemapFilename(n.url)} could not be fetched (${detail})`
        });
      }
      return;
    }
    if (n.kind === 'html') {
      findings.push({
        severity: 'warning',
        code: 'serves-html',
        message: `${sitemapFilename(n.url)} serves HTML instead of XML — crawlers cannot read it`
      });
      return;
    }
    if (n.kind === 'invalid') {
      findings.push({
        severity: 'error',
        code: 'invalid-xml',
        message: `${sitemapFilename(n.url)} is not a valid sitemap (no <urlset> or <sitemapindex>)`
      });
      return;
    }
    if (n.kind === 'urlset') {
      totalSitemaps += 1;
      totalUrls += n.urlCount;
      if (n.urlCount === 0) {
        findings.push({
          severity: 'warning',
          code: 'empty-sitemap',
          message: `${sitemapFilename(n.url)} contains no URLs`
        });
      }
      return;
    }
    // index
    if (isChild) {
      // Depth-1 fetch: a nested index's own children were not followed.
      totalSitemaps += 1;
      return;
    }
    if (n.children.length === 0) {
      findings.push({
        severity: 'warning',
        code: 'empty-index',
        message: `${sitemapFilename(n.url)} is an index with no child sitemaps`
      });
    }
    for (const child of n.children) inspect(child, true);
  };

  for (const root of data.nodes) inspect(root, false);

  if (ok && data.robotsSitemaps.length === 0) {
    findings.push({
      severity: 'info',
      code: 'not-in-robots',
      message: 'robots.txt has no Sitemap: line — adding one helps crawlers discover it'
    });
  }
  if (anyTruncated) {
    findings.push({
      severity: 'info',
      code: 'truncated',
      message: 'Some sitemaps were larger than the read limit — URL counts are a minimum'
    });
  }

  const order: Record<LintSeverity, number> = { error: 0, warning: 1, info: 2 };
  const sorted = findings.sort((a, b) => order[a.severity] - order[b.severity]);
  const errorCount = sorted.reduce((n, f) => n + (f.severity === 'error' ? 1 : 0), 0);
  return { ok, findings: sorted.slice(0, MAX_FINDINGS), errorCount, totalSitemaps, totalUrls };
}
```

Note: `LintSeverity` must be exported from `./robots` already (it is — `export type LintSeverity`).

- [ ] **Step 4: Run tests to verify they pass**

Run: `bun test entrypoints/popup/tests/sitemaps.test.ts`
Expected: PASS (all).

- [ ] **Step 5: Commit**

```bash
git add entrypoints/popup/utils/sitemaps.ts entrypoints/popup/tests/sitemaps.test.ts
git commit -m "feat(popup): sitemap parsing and health analysis utils"
```

---

### Task 2: Content-script `get_sitemaps` handler

**Files:**

- Modify: `entrypoints/main.content.ts` — add handler after the `get_llms_txt` block (~line 847), and add imports.

**Interfaces:**

- Consumes: `classifySitemap`, `countUrls`, `extractRobotsSitemaps`, `parseIndexEntries` from `./popup/utils/sitemaps` (Task 1).
- Produces: message endpoint `get_sitemaps` → responds with `SitemapsData` (`{ nodes, robotsSitemaps }`). Task 5's `getSitemaps()` (already written in Task 1) calls it.

No unit test — the handler is browser-context glue like `get_robots`; the pure logic it calls is covered by Task 1, and end-to-end behavior is covered by the test pages (Task 6).

- [ ] **Step 1: Add imports**

In `entrypoints/main.content.ts`, next to the existing `./popup/utils/robots` import:

```ts
import { classifySitemap, countUrls, extractRobotsSitemaps, parseIndexEntries } from './popup/utils/sitemaps';
```

- [ ] **Step 2: Add the handler**

Insert after the `get_llms_txt` handler block, matching the surrounding JSDoc style:

```ts
/**
 * Discovers and fetches the site's sitemaps from the page context
 * (rides its HTTP cache and cookies): robots.txt Sitemap: lines first,
 * falling back to /sitemap.xml, then all index children in parallel.
 * Only compact stats cross runtime messaging — bodies are counted here
 * and discarded, so a 50 MB product sitemap never hits sendMessage.
 * @returns {import('./popup/utils/sitemaps').SitemapsData}
 */
if (request.action === 'get_sitemaps') {
  const MAX_SITEMAP_BYTES = 5 * 1024 * 1024;
  const MAX_ROOTS = 5;
  const MAX_CHILDREN = 50;

  const readCapped = async (res: Response): Promise<{ text: string; truncated: boolean }> => {
    const reader = res.body?.getReader();
    if (!reader) return { text: await res.text(), truncated: false };
    const decoder = new TextDecoder();
    let text = '';
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      text += decoder.decode(value, { stream: true });
      if (text.length > MAX_SITEMAP_BYTES) {
        reader.cancel().catch(() => {});
        return { text: text.slice(0, MAX_SITEMAP_BYTES), truncated: true };
      }
    }
    return { text, truncated: false };
  };

  // Body is returned separately so index roots can parse children
  // without the body ever entering the response payload.
  const fetchDoc = async (url: string, lastmod: string | null) => {
    const node = {
      url,
      finalUrl: '',
      ok: false,
      status: 0,
      kind: 'invalid' as ReturnType<typeof classifySitemap>,
      urlCount: 0,
      truncated: false,
      lastmod,
      children: [] as unknown[]
    };
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
      node.finalUrl = res.url;
      node.status = res.status;
      if (!res.ok) return { node, text: '' };
      const { text, truncated } = await readCapped(res);
      node.ok = true;
      node.truncated = truncated;
      node.kind = classifySitemap(text);
      if (node.kind === 'urlset' || node.kind === 'index') node.urlCount = countUrls(text);
      return { node, text: node.kind === 'index' ? text : '' };
    } catch {
      return { node, text: '' };
    }
  };

  (async () => {
    let robotsSitemaps: string[] = [];
    try {
      const res = await fetch(`${location.origin}/robots.txt`, { signal: AbortSignal.timeout(8000) });
      if (res.ok) robotsSitemaps = extractRobotsSitemaps((await res.text()).slice(0, 600 * 1024));
    } catch {
      // No robots.txt reachable — fall through to the /sitemap.xml convention.
    }
    const rootUrls = [
      ...new Set(robotsSitemaps.length > 0 ? robotsSitemaps : [`${location.origin}/sitemap.xml`])
    ].slice(0, MAX_ROOTS);

    const nodes = await Promise.all(
      rootUrls.map(async (rootUrl) => {
        const { node, text } = await fetchDoc(rootUrl, null);
        if (node.kind === 'index') {
          const entries = parseIndexEntries(text);
          node.urlCount = entries.length;
          node.children = (
            await Promise.all(entries.slice(0, MAX_CHILDREN).map((e) => fetchDoc(e.loc, e.lastmod)))
          ).map((c) => c.node);
        }
        return node;
      })
    );
    sendResponse({ nodes, robotsSitemaps });
  })();
  return true;
}
```

- [ ] **Step 3: Run the full test suite**

Run: `bun test`
Expected: PASS (no regressions; the handler itself has no unit tests).

- [ ] **Step 4: Commit**

```bash
git add entrypoints/main.content.ts
git commit -m "feat(content): get_sitemaps handler with capped parallel fetches"
```

---

### Task 3: Section registration + analytics actions

**Files:**

- Modify: `entrypoints/popup/stores/tabState.ts` — add `'sitemaps'` to `PopupSection`.
- Modify: `utils/analytics-actions.ts` — add `'sitemaps_view'`, `'sitemaps_open'` to `ANALYTICS_ACTIONS` and `TIME_SAVINGS`.
- Modify: `supabase/functions/track/index.ts` — add the same two actions to `VALID_ACTIONS`.

**Interfaces:**

- Produces: `PopupSection` now includes `'sitemaps'` (Task 5's `TabId` uses it); analytics actions `sitemaps_view` / `sitemaps_open` (Task 5 fires them).

- [ ] **Step 1: Extend PopupSection**

In `entrypoints/popup/stores/tabState.ts`, add to the union after `'social'`:

```ts
  | 'social'
  | 'sitemaps'
  | 'settings';
```

- [ ] **Step 2: Add analytics actions**

In `utils/analytics-actions.ts`, append after `'hreflangs_export'` in `ANALYTICS_ACTIONS`:

```ts
  'hreflangs_export',
  'sitemaps_view',
  'sitemaps_open'
] as const;
```

In `TIME_SAVINGS` (near `robots_view: 90` / `robots_open: 5`), add:

```ts
  sitemaps_view: 60,
  sitemaps_open: 5,
```

- [ ] **Step 3: Add to the edge function's VALID_ACTIONS**

In `supabase/functions/track/index.ts`, find `VALID_ACTIONS` and add `'sitemaps_view'` and `'sitemaps_open'` in the same position (after the hreflangs entries), matching the file's formatting.

- [ ] **Step 4: Run the full test suite (parity test must pass)**

Run: `bun test`
Expected: PASS — in particular the analytics parity test that diffs `ANALYTICS_ACTIONS` against `VALID_ACTIONS`.

- [ ] **Step 5: Commit**

```bash
git add entrypoints/popup/stores/tabState.ts utils/analytics-actions.ts supabase/functions/track/index.ts
git commit -m "feat(popup): register sitemaps section and analytics actions"
```

---

### Task 4: Design preview markup (verify before building the component)

**Files:**

- Modify: `designs/popup-preview.html` — add a Sitemaps tab section.

Per the project's UI workflow: assemble the tab's full markup on the real popup CSS in the preview file and verify it visually BEFORE writing the Svelte component. Never build the component blind.

- [ ] **Step 1: Study the preview file's structure**

Read `designs/popup-preview.html` — note how existing tabs (e.g. Hreflangs, Robots) are laid out: the sidebar, the tab-content containers, the shared class names and CSS custom properties, and how the file switches tabs.

- [ ] **Step 2: Add the Sitemaps section**

Add a `sitemaps` entry to the preview's sidebar and a tab-content section using the same class conventions as neighboring tabs. Content (populated with realistic Shopify demo data):

- Header row: left — title "Sitemaps" + subtitle "5 sitemaps · 5,384 URLs"; right — "Open sitemap.xml" action button (external-link icon, same button style as the Robots tab's open button).
- Findings list (borrow the Robots issues styling): one info row "robots.txt has no Sitemap: line …" to prove the row style works.
- Five sitemap cards, one per child: colored square icon with abbr (P/C/Pg/B/AI, colors `#4a90d9`, `#5c6ac4`, `#ff6b35`, `#e84393`, `#12b886`), filename in 12px semibold, monospace URL link below, right side: category pill + "4,982 URLs" count + "Aug 1, 2026" lastmod in muted 11px.
- Improvements over the mockup baseline: URL count and lastmod per card (the mockup had neither), findings section, and the count subtitle in the header.
- Include a dark-mode check: the preview file follows system preference; icon colors stay as-is (white abbr text on colored chips reads in both themes).

- [ ] **Step 3: Verify in the browser**

Open the file (`open designs/popup-preview.html`) and check: spacing matches neighboring tabs, both light and dark themes, no overflow with long filenames. Fix what looks off.

- [ ] **Step 4: Commit**

```bash
git add designs/popup-preview.html
git commit -m "feat(designs): sitemaps tab preview markup"
```

**CHECKPOINT:** Show the preview to the user for visual sign-off before Task 5.

---

### Task 5: Sitemaps.svelte + App.svelte wiring

**Files:**

- Create: `entrypoints/popup/Sitemaps.svelte`
- Modify: `entrypoints/popup/App.svelte` — state, badge, sidebar entry (uncomment), icon (uncomment), render branch.

**Interfaces:**

- Consumes: `getSitemaps`, `analyzeSitemaps`, `categorizeSitemap`, `sitemapFilename`, types from `./utils/sitemaps` (Task 1); `'sitemaps'` in `PopupSection` and analytics actions (Task 3); verified markup/classes from Task 4.
- Produces: `<Sitemaps data loading />` component; sitemaps sidebar tab with red error badge.

- [ ] **Step 1: Create Sitemaps.svelte**

Structure (exact classes/styles come from the Task 4 preview markup — translate it 1:1 into scoped Svelte CSS using the existing var tokens; copy the fadeUp stagger pattern from `Hreflangs.svelte`):

```svelte
<script lang="ts" module>
  // Module scope: once per popup load, not per tab-switch remount.
  let viewTracked = false;
</script>

<script lang="ts">
  import {
    analyzeSitemaps,
    categorizeSitemap,
    sitemapFilename,
    type SitemapNode,
    type SitemapsData
  } from './utils/sitemaps';
  import { trackAction } from '@/utils/analytics';
  import { untrack } from 'svelte';
  import ActionButton from './ActionButton.svelte';

  let { data, loading = false }: { data: SitemapsData | null; loading?: boolean } = $props();

  // Same pipeline as the App.svelte tab badge — the two can't disagree.
  const analysis = $derived(analyzeSitemaps(data));

  // Flatten for rendering: index children as rows; a flat urlset root is its own row.
  const rows = $derived.by(() => {
    if (!data) return [];
    const out: { node: SitemapNode; fromIndex: boolean }[] = [];
    for (const root of data.nodes) {
      if (!root.ok) continue;
      if (root.kind === 'index') {
        for (const child of root.children) out.push({ node: child, fromIndex: true });
      } else if (root.kind === 'urlset') {
        out.push({ node: root, fromIndex: false });
      }
    }
    return out;
  });

  const openUrl = $derived(data?.nodes.find((n) => n.ok)?.finalUrl ?? data?.nodes[0]?.url ?? null);

  function formatCount(n: SitemapNode): string {
    const count = n.urlCount.toLocaleString();
    return n.truncated ? `${count}+ URLs` : `${count} URLs`;
  }

  function formatLastmod(iso: string): string {
    const d = new Date(iso);
    return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
  }

  function openSitemap() {
    if (!openUrl) return;
    window.open(openUrl, '_blank');
    trackAction('sitemaps_open');
  }

  $effect(() => {
    if (viewTracked || data === null) return;
    viewTracked = true;
    untrack(() => {
      trackAction('sitemaps_view', {
        ok: analysis.ok,
        sitemap_count: analysis.totalSitemaps,
        url_count: analysis.totalUrls,
        error_count: analysis.errorCount
      });
    });
  });
</script>
```

Template states, in order:

1. `loading` → skeleton (match the pattern other tabs use while their fetch is pending).
2. `data === null` → muted empty state: "Couldn't reach this page — reload the tab and reopen Alfred."
3. `!analysis.ok` → error banner (Robots-tab banner style): "No sitemap found" + the `no-sitemap` finding message + still render the findings list.
4. Otherwise → header (title, `{analysis.totalSitemaps} sitemaps · {analysis.totalUrls.toLocaleString()} URLs`, `<ActionButton>` Open sitemap.xml wired to `openSitemap`), findings list (severity icon + message, Robots issues styling), then `{#each rows as { node } (node.url)}` cards: `categorizeSitemap(node.url)` for icon abbr/color/pill label, `sitemapFilename(node.url)`, link `href={node.finalUrl || node.url}` `target="_blank"`, `formatCount(node)`, `{#if node.lastmod}{formatLastmod(node.lastmod)}{/if}`. Child rows whose fetch failed still render (muted, with an inline "HTTP 500"-style note) so the list matches the index.

- Singular/plural: use `sitemap`/`sitemaps` correctly in the subtitle (`analysis.totalSitemaps === 1 ? 'sitemap' : 'sitemaps'`).

- [ ] **Step 2: Wire up App.svelte**

All edits to `entrypoints/popup/App.svelte`:

1. Imports:

```ts
import { getSitemaps, analyzeSitemaps } from './utils/sitemaps';
import Sitemaps from './Sitemaps.svelte';
import type { SitemapsData } from './utils/sitemaps';
```

2. Remove the now-stale `// Future tabs: 'apps' | 'products' | 'sitemaps'` comment's `'sitemaps'` mention (it's no longer future): update to `// Future tabs: 'apps' | 'products'`.
3. State, next to the robots state:

```ts
let rawSitemaps = $state<SitemapsData | null>(null);
let sitemapsLoading = $state(true);
```

4. Derived badge count, next to `robotsErrorCount`:

```ts
const sitemapsErrorCount = $derived(analyzeSitemaps(rawSitemaps).errorCount);
```

5. In `seoTabs`, replace the commented `// { id: 'sitemaps', ... }` line with a live entry (after `social`):

```ts
{
  id: 'sitemaps' as TabId,
  label: 'Sitemaps',
  icon: 'sitemaps',
  ...(sitemapsErrorCount > 0 ? { badge: { count: sitemapsErrorCount, color: 'red' as const } } : {})
}
```

6. In the data-loading `$effect`, next to the `getRobots()` call (same rationale — network fetches never gate first paint):

```ts
getSitemaps().then((sitemapsData) => {
  rawSitemaps = sitemapsData;
  sitemapsLoading = false;
});
```

7. Move the `sitemaps` icon SVG out of the commented "Future tab icons" block into the live `tabIcon` chain (keep `apps`/`products` commented):

```svelte
{:else if icon === 'sitemaps'}
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round"><path d="M3 6h18M3 12h18M3 18h18"/><circle cx="7" cy="6" r="1.5" fill="currentColor" stroke="none"/><circle cx="7" cy="12" r="1.5" fill="currentColor" stroke="none"/><circle cx="7" cy="18" r="1.5" fill="currentColor" stroke="none"/></svg>
```

8. Render branch, after the `robots` branch:

```svelte
{:else if activeTab === 'sitemaps'}
  <Sitemaps data={rawSitemaps} loading={sitemapsLoading} />
```

- [ ] **Step 3: Run the full test suite**

Run: `bun test`
Expected: PASS.

- [ ] **Step 4: Manual smoke check**

The user's HMR dev session is running — do NOT start dev/build. Ask the user to open the popup on a Shopify store and confirm: tab appears, cards render, badge behaves, "Open sitemap.xml" opens the index.

- [ ] **Step 5: Commit**

```bash
git add entrypoints/popup/Sitemaps.svelte entrypoints/popup/App.svelte
git commit -m "feat(popup): Sitemaps tab with child stats and health findings"
```

---

### Task 6: Test pages + server fixtures

**Files:**

- Modify: `test-pages/server.ts` — serve `/sitemap.xml` per-scenario via referer (same mechanism as `/robots.txt`), and ensure `.xml` is in the `MIME` map.
- Create: `test-pages/sitemaps/index-shopify.html`, `test-pages/sitemaps/flat.html`, `test-pages/sitemaps/missing.html`, `test-pages/sitemaps/html-page.html`, `test-pages/sitemaps/invalid-xml.html`, `test-pages/sitemaps/empty-child.html`
- Create: `test-pages/sitemaps/fixtures/` — one root fixture per scenario plus static child XML files.

**Interfaces:**

- Consumes: the referer-scenario pattern from `robotsResponse()` in `server.ts`; page conventions from `test-pages/README.md` (blue expected-output panel, no heading tags in page chrome).

- [ ] **Step 1: Read the conventions**

Read `test-pages/README.md` and one existing robots scenario page (e.g. `test-pages/robots/allow-all.html`) to copy the page chrome and blue expected-output panel exactly.

- [ ] **Step 2: Add server routing**

In `test-pages/server.ts`, next to `robotsResponse`:

```ts
async function sitemapResponse(referer: string | undefined): Promise<{ status: number; type: string; body: string }> {
  const scenario = referer?.match(/\/sitemaps\/([\w-]+)\.html/)?.[1] ?? 'index-shopify';
  if (scenario === 'missing') return { status: 404, type: 'text/plain', body: 'not found' };
  if (scenario === 'html-page') {
    return { status: 200, type: 'text/html', body: '<!doctype html><html><body>SPA fallback</body></html>' };
  }
  const body = await readFile(path.join(ROOT, 'sitemaps', 'fixtures', `${scenario}.xml`), 'utf8');
  return { status: 200, type: 'application/xml', body };
}
```

And in the request handler, after the `/robots.txt` branch:

```ts
if (url.pathname === '/sitemap.xml') {
  const { status, type, body } = await sitemapResponse(req.headers.referer);
  res.writeHead(status, { 'content-type': type });
  res.end(body);
  return;
}
```

Check the `MIME` map includes `'.xml': 'application/xml'`; add it if absent (child fixtures are served by the generic static-file branch).

- [ ] **Step 3: Create fixtures**

`test-pages/sitemaps/fixtures/index-shopify.xml` — a sitemapindex listing four children with absolute `http://localhost:4242/sitemaps/fixtures/children/...` locs and lastmods:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <sitemap>
    <loc>http://localhost:4242/sitemaps/fixtures/children/sitemap_products_1.xml</loc>
    <lastmod>2026-08-01T04:00:00Z</lastmod>
  </sitemap>
  <sitemap>
    <loc>http://localhost:4242/sitemaps/fixtures/children/sitemap_pages_1.xml</loc>
    <lastmod>2026-07-15T04:00:00Z</lastmod>
  </sitemap>
  <sitemap>
    <loc>http://localhost:4242/sitemaps/fixtures/children/sitemap_collections_1.xml</loc>
    <lastmod>2026-08-05T04:00:00Z</lastmod>
  </sitemap>
  <sitemap>
    <loc>http://localhost:4242/sitemaps/fixtures/children/sitemap_blogs_1.xml</loc>
  </sitemap>
</sitemapindex>
```

Children under `test-pages/sitemaps/fixtures/children/`: small urlsets — `sitemap_products_1.xml` (3 urls), `sitemap_pages_1.xml` (2 urls), `sitemap_collections_1.xml` (2 urls), `sitemap_blogs_1.xml` (1 url), e.g.:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url><loc>http://localhost:4242/products/a</loc><lastmod>2026-08-01</lastmod></url>
  <url><loc>http://localhost:4242/products/b</loc></url>
  <url><loc>http://localhost:4242/products/c</loc></url>
</urlset>
```

Other roots: `flat.xml` (a bare 3-url urlset), `invalid-xml.xml` (body `this is not xml`), `empty-child.xml` (index whose single child is `children/sitemap_empty.xml`, a urlset with zero `<url>` entries — create that child too).

- [ ] **Step 4: Create scenario pages**

One `.html` per scenario in `test-pages/sitemaps/`, copying the robots pages' chrome, each with a blue expected-output panel:

- `index-shopify.html` — expect: 4 sitemaps · 8 URLs, category pills Products/Pages/Collections/Blogs, lastmod on three cards, no error badge, info finding "robots.txt has no Sitemap: line" (the test server's robots fixtures don't reference the sitemap).
- `flat.html` — expect: 1 sitemap · 3 URLs, single generic "Sitemap" card.
- `missing.html` — expect: error banner "No sitemap found — returned HTTP 404", badge 1.
- `html-page.html` — expect: warning "serves HTML instead of XML", no cards.
- `invalid-xml.html` — expect: error "not a valid sitemap", badge 1.
- `empty-child.html` — expect: warning "contains no URLs" on the child card.

The index page at `/` is auto-generated — adding files is enough.

- [ ] **Step 5: Verify manually**

Run: `bun run testpages`, then ask the user (or use the isolated Playwright Chromium harness — NEVER the user's real Chrome) to open `http://localhost:4242/sitemaps/index-shopify.html` and the other scenarios with the extension loaded, checking each page's blue panel against the popup.

- [ ] **Step 6: Commit**

```bash
git add test-pages/server.ts test-pages/sitemaps
git commit -m "test(pages): sitemap fixture scenarios"
```

---

## Self-Review Notes

- Spec coverage: discovery (Task 2), regex counting + 5 MB cap (Tasks 1–2), eager parallel fetch (Task 2), UI + categories + preview-first workflow (Tasks 4–5), health checks + badge (Tasks 1, 5), analytics + parity (Task 3), unit tests (Task 1), test pages (Task 6). Session-store persistence: intentionally NOT wired for this tab — sitemap data is refetched per popup open like robots.txt (both ride the page HTTP cache), matching the Robots tab, which also skips `saveSection`. The spec's "snapshot into the per-tab session store" is satisfied for view state by `setActiveSection` (already global).
- Out of scope confirmed: no drill-down, no current-page check, no lazy fetching.
