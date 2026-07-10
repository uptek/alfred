# Compare Shopify Apps Side-by-Side — Design

GitHub issue: [#65](https://github.com/uptek/alfred/issues/65)
Date: 2026-06-10
Status: Approved

## Problem

Shopify removed the App Store's side-by-side app comparison. Evaluating apps now
means juggling tabs and holding ratings, pricing, and Built for Shopify status in
your head. Alfred already enhances the App Store (search indexing, enhanced
partner pages), so restoring comparison is a natural fit.

## Solution overview

Three pieces, all gated behind a new `appStore.compareApps` setting (default
`true`, consistent with `searchIndexing` and `enhancedPartnerPages`):

1. **Compare tray + "Add to compare" buttons** across App Store search results
   and listing pages, persisted in extension storage.
2. **Comparison page** that takes over the 404 page at
   `apps.shopify.com/compare/<handle1>,<handle2>,...` and renders a side-by-side
   table.
3. **Listing parser utility** that fetches a listing page same-origin and
   extracts structured data. Shared, reusable by #64 (copy listing as markdown).

### Key decisions

- **URL hijack, not extension page.** The comparison lives at an
  `apps.shopify.com/compare/...` URL so it is shareable and bookmarkable (for
  anyone with Alfred installed) and fetches to listing pages are same-origin.
  `apps.shopify.com/compare` itself 301-redirects to the homepage server-side,
  so the content script matches the sub-path `/compare/<handles>`, which returns
  a real 404 HTML page that content scripts run on. The script wipes the 404
  content and mounts the comparison UI.
- **One selection mechanism.** "Add to compare" buttons (on search-result cards
  and listing-page hero) feed a floating tray. No separate checkbox mechanism —
  redundant with the buttons.
- **Fetch fresh on comparison open.** The tray stores only `handle`, `name`,
  `icon` for display. The comparison page fetches each listing live with
  per-column loading states. No cache invalidation, always fresh, and shared
  URLs work for apps never added via the tray. The URL is the single source of
  truth for the comparison page; the tray is not required.
- **Markdown export in v1.** A "Copy as markdown" button renders the comparison
  as a markdown table. CSV deferred.

## Components

### `utils/appListing.ts`

- `parseAppListing(html: string, handle: string): AppListing` — parses with
  `DOMParser`. Sources: the embedded JSON-LD `SoftwareApplication` block (name,
  description, image, brand, aggregateRating) plus the stable `adp-*` DOM
  section IDs observed on listing pages (`adp-hero`, `adp-pricing`,
  `adp-details-section`, `adp-developer`, `adp-reviews`).
- `fetchAppListing(handle: string): Promise<AppListing>` — same-origin
  `fetch('https://apps.shopify.com/<handle>')`, then parse. Throws on network
  error or 404 (caller renders an error column).
- Extracted fields (all optional except `handle` and `url`): name, tagline,
  icon URL, developer name + link, rating, review count, Built for Shopify
  (boolean), pricing plans (array of `{ name, price, notes }`), free plan /
  free trial detection, works-with integrations, launch date, languages,
  categories.
- The parser never throws on missing selectors — absent fields are `undefined`
  and render as "—" in the table.

### `utils/compareTray.ts`

- Storage wrapper around a `compareTray` key holding
  `CompareTrayItem[]` (`{ handle, name, icon }`).
- API: `getTray()`, `addToTray(item)`, `removeFromTray(handle)`, `clearTray()`,
  `subscribeTray(cb)` (via `browser.storage.onChanged`) so tray UI stays in
  sync across tabs and pages.
- Cap: 4 apps. Adding a 5th shows a toast and is rejected.

### `entrypoints/appstore-compare-tray.content/`

Svelte app mounted via `createIntegratedUi`, matching `*://apps.shopify.com/*`.
Exits early when `appStore.compareApps` is `false`.

- **Button injection — search results:** reuses the
  `[data-controller="app-card"]` selector and MutationObserver pattern from
  `appstore-search.content.ts` to add an "Add to compare" control to each card
  (idempotent via a `data-alfred-*` marker). Toggles to "Remove" when the app is
  already in the tray.
- **Button injection — listing pages:** adds the same control near the hero
  (`#adp-hero`). Listing pages are detected by the presence of `adp-*` anchors,
  not by URL pattern.
- **Floating tray:** bottom-right pill, visible only when the tray has ≥ 1 app.
  Shows app icons, remove-on-hover per app, a "Compare" button (enabled at
  ≥ 2 apps) that navigates to `/compare/<handles>`, and a clear-all action.

### `entrypoints/appstore-compare.content/`

Svelte app matching `*://apps.shopify.com/compare/*`. Exits early when the
setting is off.

- Parses comma-separated handles from `location.pathname`.
- Replaces the 404 page content, sets `document.title` to "Compare apps".
- Fetches all listings in parallel via `fetchAppListing`; each column shows a
  skeleton until its fetch resolves.
- Table rows: rating, review count, Built for Shopify, pricing plans, free
  plan / trial, works with, launch date, developer, categories. One column per
  app with icon, name, tagline, and a link to the listing.
- Per-column remove updates the URL (and re-renders) so the comparison stays
  shareable.
- "Copy as markdown" renders the loaded columns as a markdown table and copies
  to the clipboard with a success toast.

### Settings & types

- `global.d.ts`: add `compareApps?: boolean` to `AlfredSettings['appStore']`;
  declare `AppListing` and `CompareTrayItem`.
- `entrypoints/options/stores/settings.svelte.ts`: add `compareApps: true` to
  defaults.
- Options page `App.svelte`: add a "Compare apps" toggle in the App Store
  section.

## Data flow

```
Add button click → addToTray() → browser.storage
                                   ↓ onChanged
                         tray UI re-renders (all tabs)

Tray "Compare" → navigate /compare/a,b,c → server 404
   → content script mounts → fetchAppListing() × n (parallel, same-origin)
   → comparison table
```

## Error handling

- Setting disabled → both content scripts return early (existing pattern).
- DOM drift: injection anchors missing → skip silently; parser fields missing
  → "—" in the table. No console spam, no thrown errors.
- Unknown handle in the URL → that column renders an error state with a retry
  button and a link to App Store search; other columns are unaffected.
- Tray storage corrupt/missing → treated as empty tray.

## Testing

Manual QA against the live App Store (no test runner in this repo):

1. Add/remove apps from search-result cards and from a listing page.
2. Tray persists across navigation and syncs across two open tabs.
3. Compare 2, 3, and 4 apps; verify all table rows against the live listings.
4. Open a shared `/compare/a,b` URL with empty tray storage — page works.
5. URL with a bogus handle — error column with retry; others load.
6. Toggle `appStore.compareApps` off — buttons, tray, and comparison page all
   inert.
7. "Copy as markdown" output pastes as a valid markdown table.

## Out of scope

- CSV export.
- Caching parsed listing data.
- Checkbox-based multi-select on search results.
- #64 (copy single listing as markdown) — but `utils/appListing.ts` is built to
  be reusable for it.
