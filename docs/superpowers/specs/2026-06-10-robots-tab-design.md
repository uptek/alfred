# Robots.txt Tab — Design

Date: 2026-06-10
Status: Approved (scope confirmed by Junaid: all four features, mockup-first workflow)

## Goal

Add a "Robots.txt" tab to the Alfred popup that fetches the current site's
robots.txt and analyzes it: current-page crawlability verdict, AI crawler
access matrix, lint/validation findings, and Shopify default-vs-customized
detection, on top of the existing raw-file view with Open/Copy.

## Scope (v1)

1. **Current-page check** — _removed 2026-06-10 after implementation: the
   per-page crawlability verdict banner will live in the planned SEO Overview
   tab instead. The RFC 9309 matcher (`isAllowed`) stays in `robots.ts` — the
   AI matrix and the `site-blocked`/`blocks-assets` lint rules depend on it._
2. **AI crawler access matrix** — per-bot allowed/blocked chips for the
   current page, grouped by purpose (AI training / AI search / user fetch),
   with a one-line summary per group.
3. **Linting/validation** — findings list with severity (error/warning/info),
   message, and line number; clicking a finding highlights the line.
4. **Shopify default detection** — on Shopify stores, badge `Default Shopify`
   vs `Customized`, with added/removed lines flagged in the raw view.
5. Raw file view (upgraded from mockup): line numbers, directive syntax
   highlighting, clickable Sitemap links, highlight-on-click target.

Out of scope for v1: meta robots / X-Robots-Tag cross-check, what-if editor,
multi-URL bulk testing, sitemap HTTP status checks.

## Architecture

### Data flow

- New `get_robots` message handler in `entrypoints/main.content.ts`:
  `fetch(`${location.origin}/robots.txt`)` (same-origin from the page; no CORS
  issues). Returns:

  ```ts
  interface RobotsResponse {
    ok: boolean; // fetch succeeded (any HTTP status)
    status: number; // HTTP status; 0 on network error
    content: string; // raw text ('' when not 2xx)
    finalUrl: string; // after redirects
    size: number; // bytes of body
  }
  ```

- `getRobots()` helper in `entrypoints/popup/utils.ts` follows the existing
  `getLinks()` pattern (`browser.tabs.sendMessage(tab.id, { action: 'get_robots' })`).
- All parsing/analysis lives in a new pure module
  `entrypoints/popup/robots.ts` (no browser APIs → unit-testable with
  `bun test`).

### `robots.ts` exports

- `parseRobots(text: string): ParsedRobots` — line-preserving parser.
  Groups (user-agent tokens with line numbers, allow/disallow rules with line
  numbers, crawl-delay), sitemap lines, unknown/misspelled directives, parse
  errors. Directive names are case-insensitive; consecutive `User-agent`
  lines form one group; duplicate-token groups merge at evaluation time.
- `isAllowed(parsed, path, botToken): Verdict` — RFC 9309 semantics:
  - Group selection: longest user-agent token that is a case-insensitive
    prefix of `botToken`; fall back to `*`. Merge all groups with the
    selected token.
  - Path matching: `*` matches any chars, `$` anchors end; longest pattern
    (octet length) wins; tie → Allow. No matching rule → allowed.
  - Patterns are matched literally (no percent-decoding normalization) —
    documented simplification, consistent with mainstream tools; Shopify's
    own default duplicates `+`/`%2B` variants for this reason.
  - Returns `{ allowed: boolean; rule: { type, path, line } | null; group: string | null }`.
- `lintRobots(parsed, meta: { size, status }): LintFinding[]` — see rule
  table below. `LintFinding = { severity: 'error'|'warning'|'info', code,
message, line? }`.
- `detectShopifyDefault(parsed): ShopifyDiff` — see below.
- Constants: `AI_BOTS` (token, vendor, purpose), `SHOPIFY_DEFAULT_RULES`
  (normalized snapshot with placeholders).

### Lint rules

| Code              | Severity      | Check                                                                                                                                                                     |
| ----------------- | ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| rule-before-group | error         | Allow/Disallow/Crawl-delay before any User-agent line                                                                                                                     |
| unparseable       | error         | Non-comment, non-blank line without `:` separator                                                                                                                         |
| path-no-slash     | error         | Rule path not starting with `/` or `*`                                                                                                                                    |
| site-blocked      | error         | `Disallow: /` in the `*` or Googlebot-selected group                                                                                                                      |
| too-large         | error/warning | > 500 KiB (error, Google ignores the rest) / > 450 KiB (warning)                                                                                                          |
| full-url-path     | warning       | Rule path is an absolute URL                                                                                                                                              |
| misspelled        | warning       | `Dissallow`, `Disalow`, `User agent`, `Useragent`, etc.                                                                                                                   |
| unsupported       | warning       | `noindex`/`nofollow` (dead since Sept 2019), `host`, `clean-param`, etc. — ignored by Google                                                                              |
| crawl-delay       | info          | Ignored by Google; honored by Bing/Yandex (warning if value non-numeric)                                                                                                  |
| blocks-assets     | warning       | Pattern blocks representative CSS/JS asset paths for Googlebot (tested via the matcher against e.g. `/cdn/shop/t/1/assets/theme.css`, `/assets/app.js`) — harms rendering |
| sitemap-relative  | warning       | `Sitemap:` value not an absolute URL                                                                                                                                      |
| bom               | warning       | UTF-8 BOM at file start                                                                                                                                                   |
| empty-group       | info          | User-agent group with zero rules (= allow all; often unintended)                                                                                                          |
| duplicate-group   | info          | Same user-agent token in multiple groups (legal, merged; confusing)                                                                                                       |
| no-sitemap        | info          | No `Sitemap:` line present                                                                                                                                                |

HTTP-level handling (not lint findings; shown as page states):

- 404/other 4xx → friendly info state: "No robots.txt found (404). Crawlers
  can access everything." All bots show allowed.
- 5xx → warning state: "robots.txt returns a server error; Google pauses
  crawling when this persists."
- Network error / restricted page (chrome:// etc.) → empty state matching
  other tabs.
- Content sniff: response looks like HTML (`<html` in first 1 KiB) → warning
  "robots.txt serves HTML, crawlers may ignore it."

### AI bot list

| Purpose     | Tokens                                                                                       |
| ----------- | -------------------------------------------------------------------------------------------- |
| AI training | GPTBot, ClaudeBot, Google-Extended, Applebot-Extended, CCBot, Bytespider, Meta-ExternalAgent |
| AI search   | OAI-SearchBot, PerplexityBot, Claude-SearchBot                                               |
| User fetch  | ChatGPT-User, Claude-User, Perplexity-User                                                   |

Each evaluated against the current page path via `isAllowed`. Summary line
per group, e.g. "AI training: 3 of 7 blocked".

### Shopify default detection

- Only runs when the site is Shopify (existing `window.Shopify` detection).
- Bundle a normalized snapshot of the stock robots.txt **rules** (captured
  2026-06-10 from theme-dawn-demo.myshopify.com — the current default
  includes agent/UCP comments, an Allow set, an `adsbot-google` group, and a
  store-specific `Disallow: /<store-id>` line).
- Normalization: drop comments/blanks, lowercase directive names, collapse
  whitespace, replace store-specific tokens — numeric-only path
  (`/55192420441` → `/{store-id}`) and sitemap host (`{origin}`).
- Compare normalized rule sequences:
  - identical → `Default Shopify` badge.
  - else → `Customized` badge; lines present live but not in the default get
    a green gutter marker (added); default rules missing from the live file
    listed in a collapsible "removed from default" note.
- Known limitation: when Shopify ships a new default, stock stores will show
  `Customized` until we refresh the snapshot. The inline diff makes this
  self-explaining. Snapshot refresh is a documented maintenance task (same
  spirit as `themes.json` updates).

## UI layout (top → bottom)

1. **Header** — title "robots.txt", link to the live file, status pill
   (`200 · 1.4 KB`), Shopify badge (Default/Customized; Shopify only),
   Open + Copy action buttons (as in current mockup).
2. **Verdict banner** — green "This page is crawlable" / red "This page is
   blocked for Googlebot", subtitle shows matched rule + line; click scrolls
   raw view to the rule.
3. **AI crawler access** — three labeled rows of bot chips (green/red), each
   chip clickable → highlights its deciding rule; per-row summary count.
4. **Issues** — lint findings with severity dot + line number; single
   "No issues found" row when clean.
5. **Raw file** — `<pre>` with line-number gutter, syntax highlighting
   (directives bold, comments muted, sitemap URLs linked), diff gutter
   markers on Shopify-customized stores, flash-highlight target for clicks
   from sections 2–4.

States: loading (consistent with other tabs), 404/5xx/error states as above.

## Integration

- `App.svelte`: uncomment `robots` tab entry (icon already stubbed at
  line 115), add `rawRobots` state, fetch via `getRobots()` alongside the
  existing `Promise.all`, render `<Robots …/>`. Badge: red count of lint
  errors (severity `error` only), matching the Headings badge pattern.
- `types.ts`: `RobotsResponse` + popup-side types.
- Analytics: `trackAction('robots_view', { status, is_default, errors })` on
  first view, plus interaction events consistent with other tabs.

## Testing

- `entrypoints/popup/robots.test.ts` run with `bun test`: parser (groups,
  line numbers, merging, BOM), matcher (wildcards, `$`, longest-match,
  tie→allow, group selection precedence, no-group fallback), lint rules
  (one fixture per rule), Shopify diff (stock fixture → default; modified
  fixture → added/removed detection).
- UI verified visually via `designs/popup-mockup.html` first (mockup-first
  workflow), then in the running extension.

## Build order

1. Mockup: flesh out the robots tab in `designs/popup-mockup.html` with
   static sample data covering all states → visual review.
2. `robots.ts` + `robots.test.ts` (pure logic; UI-independent).
3. Content script handler + `getRobots()` + types.
4. `Robots.svelte` to match approved mockup; wire into `App.svelte`.
