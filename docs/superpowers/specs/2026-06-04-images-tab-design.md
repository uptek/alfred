# Images Tab — Design Spec

**Date:** 2026-06-04
**Status:** Approved, pending implementation plan
**Author:** brainstormed with Claude

## Summary

Add an **Images** tab to the popup's SEO cluster — a per-page audit of every
image, surfacing alt-text coverage, file size, format, dimensions, loading
strategy, and broken/missing-alt status in a sortable, filterable table. It is
the structural twin of the existing **Links** tab and reuses the same
content-script → `utils.ts` → Svelte-tab pipeline.

The visual design is fixed by `designs/popup-mockup.html` (the `tab-images`
section), which matches the popup's current sidebar layout.

## Goals

- One comprehensive view of every image a page loads (SEO + accessibility +
  performance), with no new network requests.
- Flag the two highest-value problems at a glance: **missing alt text** and
  **broken images**.
- Match the established tab UX: filters, search, sort, page-highlight,
  row-click-to-scroll, and export (CSV / JSON / copy URLs).
- Drop into the already-stubbed `images` tab slot in `App.svelte` with zero
  layout work.

## Non-Goals

- No active network probing (no HEAD/range requests). File size and broken
  detection come from data already in the page (Resource Timing + decoded
  `<img>` state). Unknown values render as `—`.
- No CRUD or page mutation beyond the existing transient highlight/scroll.
- No inline `<svg>` / icon enumeration (high count, low value — excluded to keep
  the table clean).
- No served-format detection beyond URL parsing (a `.jpg` served as WebP via
  content negotiation is reported by its URL extension).

## Scope: what counts as an "image"

Rows are collected in DOM order from:

1. **`<img>` elements** — including the `<img>` inside a `<picture>`. The core
   case, with full metadata.
2. **`<picture>` / `srcset`** — folded into its inner `<img>`; we read
   `currentSrc` so the actually-resolved URL / format / size is what's shown.
   Flagged `isResponsive: true`.
3. **CSS background images** — elements whose computed `background-image`
   contains `url(...)`. Tagged with a small **`bg`** label. They have no
   `alt`/`loading` concept, so those columns render `—` and they are exempt from
   alt flagging.

Decisions captured during brainstorming:

- **Source scope:** all three above, with a `bg` type tag on background rows.
- **Broken status:** best-effort via `naturalWidth === 0` on a loaded `<img>`;
  lazy / not-yet-decoded images are not flagged broken.
- **Search:** included (filters by alt text or URL), consistent with Links /
  Assets, even though the mockup omits it.

## Data model (`entrypoints/popup/types.ts`)

```ts
export type ImageSource = 'img' | 'picture' | 'background';
export type ImageLoading = 'lazy' | 'eager' | 'none'; // 'none' = no loading attr; bg → 'none'
export type ImageStatus = 'ok' | 'missing-alt' | 'broken';

export interface RawImage {
  index: number; // stable key: index among collected image nodes in DOM order
  source: ImageSource;
  src: string; // resolved currentSrc (img/picture) or background-image URL
  alt: string | null; // null when source === 'background'; '' when attr present but empty
  lacksAlt: boolean; // missing OR empty alt (img/picture only) → red "Alt", feeds badge
  isResponsive: boolean; // had srcset, or was inside <picture>
  naturalWidth: number; // 0 if unknown (lazy / not decoded / background)
  naturalHeight: number;
  format: string; // parsed from src extension, query stripped: png|jpg|jpeg|webp|avif|gif|svg|''
  loading: ImageLoading;
  size: number; // bytes from Resource Timing; 0 = unknown
  cached: boolean; // Resource Timing transferSize === 0 && decodedBodySize > 0
  isExternal: boolean; // src host !== page host
  isHidden: boolean; // !checkVisibility()
  broken: boolean; // loaded <img> with naturalWidth === 0
}
```

Derived `status` (computed in `analyzeImages` / the component, not stored):
`broken` → `broken`; else `lacksAlt` (non-bg) → `missing-alt`; else `ok`.
Background images are never `missing-alt`.

### Alt-text semantics

`lacksAlt` is true when the alt attribute is **absent OR empty/whitespace** on an
`<img>`/`<picture>`. This matches the mockup, where the Alt filter's
"Empty (9)" set equals the sidebar badge of 9. Decorative `alt=""` images are
therefore surfaced — acceptable for a developer SEO tool, and documented here as
a deliberate choice rather than a bug.

## Extraction (`entrypoints/main.content.ts`)

New handler `get_images` (mirrors `get_links` / `get_assets`):

- `pageHost = location.hostname`; reuse the `isExternalUrl` helper pattern from
  `get_assets`.
- Build a `timingByUrl` map from `performance.getEntriesByType('resource')`
  (same approach as `get_assets`) to read `size`, `cached` per resolved URL.
- For each `<img>`: read `currentSrc || src`, `alt` (distinguish absent vs `''`),
  `loading`, `naturalWidth/Height`, `srcset`/`<picture>` parent → `isResponsive`,
  `complete && naturalWidth === 0` → `broken`, `checkVisibility()` → `isHidden`.
- For background images: walk elements, read computed `background-image`, extract
  the first `url(...)`, resolve against `location.href`. `source: 'background'`,
  `alt: null`, `loading: 'none'`.
- `format`: lowercase the resolved URL's pathname extension after stripping the
  query string.

New handlers `highlight_images` (toggle colored outlines on all collected images;
e.g. green = ok, amber = missing alt, red = broken) and `scroll_to_image`
(scroll to the node at `index` with a brief highlight) — mirror
`highlight_links` / `scroll_to_link`, including the same index contract so the
popup and content script agree on ordering.

## Popup glue (`entrypoints/popup/utils.ts`)

Add, mirroring the existing link helpers:

- `getImages(): Promise<RawImage[]>` — `sendMessage({ action: 'get_images' })`.
- `highlightImages(enabled: boolean): Promise<void>`.
- `scrollToImage(index: number): Promise<void>`.
- `analyzeImages(images: RawImage[]): number` — count of `lacksAlt` images
  (badge source). (Kept as a small pure function alongside `analyzeHeadings`.)

## Component (`entrypoints/popup/Images.svelte`)

Built from `Links.svelte` as the template. Props: `{ images: RawImage[]; domain: string | null }`.

Layout (per `designs/popup-mockup.html` `tab-images`):

- **Header row:** `Images · N` count + `Highlight` toggle + `Export` button.
- **Search input:** filters by alt text or URL substring.
- **Four filter dropdowns** (independent, stacking like Links):
  - **Alt:** All / Not empty / Empty
  - **Format:** All / PNG / JPG / WebP / SVG (+ any others present)
  - **Loading:** All / Lazy / Eager / None
  - **Status:** All / OK / Missing alt / Broken
- **Table — 6 columns**, each sortable:
  | Column | Source |
  |---------|--------|
  | Image | thumbnail (`<img>` of `src`, 36×36, object-fit cover) + alt text (red "Missing alt text" when `lacksAlt`) + truncated monospace URL (clickable → opens in new tab); `bg` tag when `source === 'background'` |
  | Size | `size` humanized (`7.5 KB`), `—` if 0 |
  | Fmt | `format` uppercased, `—` if empty |
  | Dims | `naturalWidth × naturalHeight`, `—` if 0 |
  | Load | `loading`; `eager` rendered amber as a soft warning; `—` for bg |
  | Status | pill: green `OK`, red `Alt`, red `Broken` |
- **Footer:** `Showing X of N images` (after filters/search).
- **Row click:** `scrollToImage(index)`.
- **Highlight toggle:** `highlightImages(on)`, auto-cleared on unmount.

Thumbnails use the live `src` directly; displaying a cross-origin image needs no
CORS. Hidden images are dimmed (reuse the Links hidden-row treatment).

### Export

Match the Links tab's richer export (the mockup's single "Export" button opens
the same menu):

- **CSV** — all `RawImage` fields.
- **JSON** — all fields.
- **Copy URLs** — newline-joined `src` list.

## App wiring (`entrypoints/popup/App.svelte`)

1. Add `'images'` to the `TabId` union (remove from the "Future tabs" comment).
2. Uncomment the `images` branch in the `tabIcon` snippet.
3. Add the `images` entry to the `seoTabs` `$derived` array, positioned after
   `assets` (mockup order: Headings, Links, Assets, …, Images), with a red badge
   when `analyzeImages(rawImages) > 0`.
4. Add `let rawImages = $state<RawImage[]>([])` and include `getImages()` in the
   `Promise.all` of the load `$effect`.
5. Add `{:else if activeTab === 'images'}` rendering
   `<Images images={rawImages} domain={storeInfo?.domain ?? null} />`.

## Edge cases

- **No images on page:** empty state (reuse Links empty-state pattern).
- **Lazy images not yet loaded:** `naturalWidth/Height = 0` → Dims `—`; status
  not marked broken; size may be `—` until loaded. Documented, not an error.
- **Cross-origin without Timing-Allow-Origin:** size `—` (opaque), as with the
  Assets tab.
- **`data:` / `blob:` URLs:** shown with `format` from the MIME if trivially
  parseable, else `—`; `isExternal: false`.
- **Duplicate images:** listed individually (no dedup) so highlight/scroll map
  1:1 to DOM nodes, matching Links behavior.
- **Background images set to `none`/gradients:** skipped (no `url(...)`).

## Testing

- Manual dogfood via `/browse` (or load unpacked) on: a Shopify storefront
  (Dawn), a page with missing-alt images, a page with `<picture>`/srcset, a page
  with CSS background heroes, and a non-Shopify page (tab must still work — the
  SEO tabs are not Shopify-gated).
- Verify: counts, badge, each filter, search, every sortable column, highlight
  on/off, row-click scroll, all three export formats, and the unknown-value `—`
  rendering for lazy/cross-origin images.
- `bun run typecheck` clean; `oxlint` clean.

## Files touched

| File                              | Change                                                           |
| --------------------------------- | ---------------------------------------------------------------- |
| `entrypoints/popup/types.ts`      | `RawImage`, `ImageSource`, `ImageLoading`, `ImageStatus`         |
| `entrypoints/main.content.ts`     | `get_images`, `highlight_images`, `scroll_to_image` handlers     |
| `entrypoints/popup/utils.ts`      | `getImages`, `highlightImages`, `scrollToImage`, `analyzeImages` |
| `entrypoints/popup/Images.svelte` | new tab component                                                |
| `entrypoints/popup/App.svelte`    | wire tab: type, icon, `seoTabs` entry, state, fetch, render      |
