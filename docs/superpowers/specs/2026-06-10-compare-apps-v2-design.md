# Compare Apps v2 — Richer Comparison Rows — Design

GitHub issue: [#65](https://github.com/uptek/alfred/issues/65) (follow-on to the v1 spec)
Date: 2026-06-10
Status: Approved (row list dictated by Junaid)

## Goal

Not more data — more _decision value_. Rework the comparison table rows and add
two comparison features (differences-only toggle, per-row winner highlight).

## Row list (in order)

1. **Screenshots** — thumbnails of the listing's featured-gallery screenshots,
   each hyperlinked to the full-size image (new tab).
2. **Built for Shopify** — unchanged.
3. **Rating** — unchanged.
4. **Reviews** — total count, then the rating distribution underneath: count of
   5★/4★/3★/2★/1★ as Shopify displays them (abbreviated, e.g. "39K").
5. **Pricing** — the plan list (name + price). If an app has no plan cards,
   show its pricing summary (usually "Free"). The separate "Plans" row is
   removed; this row replaces both old rows.
6. **Free plan** — unchanged.
7. **Free trial** — "Yes (15 days)" when the trial length is parseable from the
   plan features (`N-day free trial`), otherwise plain Yes/No.
8. **Launched** — raw launch date, with the app's age on a second line
   (e.g. "June 25, 2015" / "10.9 years").
9. **Developer** — name linked to the developer's `apps.shopify.com/partners/…`
   page (already extracted).
10. **Languages** — unchanged text. (The listing DOM has no per-language links,
    so the "link to the language page" wish is not implementable — verified.)
11. **Links** — the listing's resource links: demo store, website, support,
    FAQ, changelog, privacy policy, tutorial, etc. Label + URL, deduped.
12. **Works with** — unchanged.
13. **Categories** — unchanged.
14. **Data access** — from `#adp-permissions`: each permission group heading
    ("View customer data", "View staff and contributor data", "View and edit
    store data") with its summary line ("Device and activity data", …).
    Confirmed parseable: groups are `h4` elements whose text ends with `:`,
    each followed by a sibling `<p>` summary.

## Features

- **"Differences only" toggle** — a switch in the page header; when on, rows
  where every app renders an identical value are hidden. Off by default.
  Needs ≥2 loaded columns to be meaningful; disabled otherwise.
- **Per-row winner highlight** — subtle highlight (background tint + small
  "best" marker) on: highest rating, most reviews, cheapest entry price
  (cheapest plan, Free = 0), most languages. Only when ≥2 columns are loaded
  and there is a strict winner (no tie).

## Data sourcing (all verified against live DOM)

| Field               | Source                                                                                                                                                                   |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Screenshots         | `#adp-details-section img[src*="_screenshot/"]`, dedupe by URL-without-query. Thumb = the `src` as-is; full size = URL without query (CDN serves the original).          |
| Rating distribution | Review-filter anchors `a[href*="ratings%5B%5D="]` scoped to `#adp-reviews` (fallback: document); anchor text is the per-star count ("39K", "679"). Missing anchor → "0". |
| Free trial days     | Regex `(\d+)[- ]day free trial` over the combined pricing text.                                                                                                          |
| Links               | Anchors in `#adp-developer` (resources + developer website) plus the hero "View demo store" link; label = link text, dedupe by URL, drop in-page anchors.                |
| Data access         | `#adp-permissions h4` ending with `:` → group; `nextElementSibling` `<p>` → summary. Apps without the section → empty list, row renders "—".                             |

## Type changes (`global.d.ts`)

```ts
declare interface AppListingLink {
  label: string;
  url: string;
}

declare interface AppListingDataAccess {
  group: string;
  summary?: string | undefined;
}

declare interface AppListingRatingCount {
  stars: number; // 5..1
  count: string; // as displayed, e.g. "39K"
}

// added to AppListing:
//   screenshots: string[];                       (thumbnail URLs, query stripped for full size)
//   ratingDistribution: AppListingRatingCount[]; (empty when reviews section missing)
//   freeTrialDays?: number | undefined;
//   links: AppListingLink[];
//   dataAccess: AppListingDataAccess[];
```

## Markdown export

Updated to the new row set. Screenshots row exports as markdown links
(`[1](url) [2](url)…`); distribution as `5★ 39K · 4★ 679 · …`; links as
`[label](url)` list; data access as `group: summary` list. Winner highlight and
the differences toggle are view-only (no markdown impact); export always
includes all rows.

## Out of scope

- Language page links (no such pages exist).
- Exact (non-abbreviated) star counts.
- Feature matrix / integration diff / reviews-per-month (future candidates).
