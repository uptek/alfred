# Sitemaps Tab — Design

Last SEO tab from the popup redesign plan (Phase 6). Lists the site's sitemap
index and its child sitemaps with URL counts, lastmod, and health checks.

## Data flow

- `entrypoints/popup/utils/sitemaps.ts` exports `getSitemaps(...)`, called from
  `App.svelte` on popup open alongside `getRobots()` (Approach A: eager,
  parallel).
- **Discovery:** `Sitemap:` lines already parsed from robots.txt take priority;
  fall back to `origin/sitemap.xml`. If robots.txt lists sitemaps different
  from `/sitemap.xml`, show all discovered sitemaps.
- **Fetch:** fetch each discovered sitemap URL. If the document is a
  `<sitemapindex>`, fetch all children in parallel. A bare `<urlset>` (no
  index) renders as a single flat-sitemap row.
- **Counting:** count `<loc>` occurrences via regex, not full XML parsing.
  Cap each child read at ~5 MB; a truncated read shows its count as "N+".
- **State:** results snapshot into the per-tab session store
  (`tabState.svelte.ts`) like other tabs; busts on navigation.

## UI (entrypoints/popup/Sitemaps.svelte)

Baseline: sitemaps section of `designs/popup-mockup.html`, improved:

- Header: title, "N sitemaps · M URLs" subtitle, "Open sitemap.xml" action
  button (opens the index in a new tab).
- One card per child sitemap: colored type icon, filename, monospace clickable
  URL, category pill, URL count, lastmod (when present).
- Shopify categories: Products / Pages / Collections / Blogs / Discovery;
  generic "Sitemap" pill for non-Shopify or unrecognized names.
- Loading skeleton, dark mode support, staggered fadeUp animation, matching
  existing tabs.
- Markup is assembled and verified in `designs/popup-preview.html` on real CSS
  before the Svelte component is written (per UI migration workflow).

## Health checks

Analyzer in `sitemaps.ts` (mirroring `analyzeRobots`) produces findings:

- No sitemap found (404 / network error on all discovery candidates)
- XML parse failure (or HTML served instead of XML)
- Empty child sitemap (0 URLs)
- Child fetch failed (non-2xx / network error)
- robots.txt has no `Sitemap:` line

Error count renders as a red badge on the sidebar tab, same pipeline shape as
Robots (App badge and tab body derive from the same analyzer so they cannot
disagree). No current-page-in-sitemap check.

## Analytics

- `sitemaps_view` action fired once per popup load when data arrives (module
  guard like Robots), with status/error-count props.
- Added to both `ANALYTICS_ACTIONS` (`utils/analytics-actions.ts`) and
  `VALID_ACTIONS` (`supabase/functions/track/index.ts`) to keep the parity
  test green.

## Testing

- Unit tests for parsing, counting, and health findings in
  `entrypoints/popup/tests/sitemaps.test.ts` (Bun test runner).
- `test-pages/sitemaps/` fixture pages for visual QA: index with children,
  flat urlset, missing sitemap, HTML-instead-of-XML, empty child.

## Out of scope

- Browsing individual URLs inside a child sitemap (drill-down)
- Current-page-in-sitemap verdict
- Lazy per-child fetching
