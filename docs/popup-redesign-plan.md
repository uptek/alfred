# Popup Redesign: Migration Plan

Design mockup: `designs/popup-mockup.html`
Theme tab standalone mockup: `designs/popup-theme-v2.html`

## Goal

Port the new sidebar design system to the popup while preserving all existing
Theme + Settings functionality. No new features in Phase 1. SEO tabs and
Shopify-specific tabs come in later phases.

## Phase 1: Shell Layout + Theme Tab v2 (this PR)

Rewrite the popup layout from the current horizontal pill tabs (450px) to the
sidebar navigation (850x550px) matching the mockup. Only Theme and Settings tabs
are functional. All other tabs show a "Coming soon" placeholder.

### Files to modify

**`entrypoints/popup/index.html`**

- Width: 450px to 850px
- Height: min-height 200px to 550px fixed

**`entrypoints/popup/App.svelte`** (full rewrite)

- Top brand bar: Alfred logo left, star rating right (moved from Theme tab)
- Left sidebar (192px): Shopify section (Theme, Apps, Products), divider,
  SEO section (Overview, Headings, Links, Hreflangs, Images, Schema,
  Social, Robots.txt, Sitemaps), divider, Settings + "Suggest a feature" at bottom
- Sidebar tab icons: Feather-style SVGs, 15px, `aria-hidden`
- Active tab: white bg, subtle shadow, `text-shadow` bold trick (no layout shift)
- Shopify section label: inline SVG from `shopify-2.svg`
- Non-Shopify state: Shopify tabs dimmed/disabled, SEO tabs still show "Coming soon"
- Content area: renders active tab component
- Loading: skeleton shimmer in content area, sidebar visible immediately
- ARIA: `role="tablist"`, `role="tab"`, `aria-selected`, `role="tabpanel"`
- Tab switch animation: staggered fadeUp on child elements (40ms increments)

### Theme tab v2 design (from mockup)

The theme tab uses a redesigned layout with these sections:

**Hero area:**

- Instrument Serif display heading (theme name)
- Byline: "by {Developer}" (hyperlinked to Theme Store designer page) · Price · Version
- Action buttons: "Theme Store" (ghost) + "Demo" (primary, dark)

**Stats bar (4-column grid):**

- Theme ID (monospace, copy button)
- Version (installed vs latest, yellow "update available" badge)
- Status (green dot + "Published")
- Role ("Main")

**Sections below stats:**

- Internal Name — dashed-border strip with uppercase label, monospace value, copy button
- Preview URL — card with link icon, monospace URL input, Copy button; footer toggle for "Hide preview bar"
- Reviews — "35% positive" headline, "272 reviews" count, View all link; 3 horizontal bars with Shopify icons (thumbs up green, neutral face gray, thumbs down red) + absolute counts
- Quick Links — chip-style links: Docs, Support, More by Shopify

### Existing features to preserve (no regressions)

**Theme tab (from `Theme.svelte`):**

- Theme name linked to theme store with UTM params
- Developer name linked to Theme Store designer page with UTM
- Price + version display
- "Not listed on Shopify" fallback
- Theme ID with CopyIcon
- Internal theme name (shown when different from schema name)
- Latest version available with update badge
- Preview URL input with Copy button
- "Disable preview bar" toggle
- `trackAction('detect_theme', ...)` analytics on popup open

**New theme tab data sources:**

- Theme Store reviews: scrape/cache from `themes.shopify.com/themes/{handle}`
- Theme Store quick links: docs URL, support URL, designer page URL
- Demo store link: from Theme Store page

**Settings tab (from `Settings.svelte` + `StorefrontPassword.svelte`):**

- Storefront password input with save/delete
- Show/hide password toggle
- Auto-fill checkbox with enable/disable
- Loading + domain detection states

**InsightsCard (moved to brand bar):**

- 5-star rating: 5 stars opens CWS review URL, 1-4 opens Tally feedback URL
- `trackAction('review_nudge_clicked'/'review_nudge_dismissed')`

**CopyIcon:**

- Click to copy with checkmark feedback
- `role="button"`, keyboard accessible

### New components to create

- `ComingSoon.svelte` - centered placeholder with tab name

### Design tokens (from mockup CSS)

```
Sidebar bg:        #FAFAFA
Content bg:        #FFFFFF
Border:            1px solid #F0F0F0
Tab text:          #777 (inactive), #111 (active)
Tab hover bg:      #F0F0F0
Tab active bg:     #FFF with shadow
Section label:     10px uppercase, #B0B0B0
Row label:         13.5px, #999
Row value:         13.5px, #222
Section heading:   11.5px uppercase, #929292
Link color:        #7C3AED
Button bg:         #111
Pill green:        bg #DCFCE7, text #16A34A
Pill red:          bg #FEF2F2, text #EF4444
Pill yellow:       bg #FFFBEB, text #CA8A04
Pill gray:         bg #F5F5F5, text #888
Fonts:             Inter (body), Instrument Serif (theme name display)
```

### What NOT to do in Phase 1

- No SEO content script
- No new data extraction beyond Theme Store scraping
- No functional SEO/Apps/Products tabs
- No export/highlight features
- No robots.txt/sitemap fetching

---

## Phase 2: SEO Content Script + Overview Tab

- Create `entrypoints/seo-analyzer.content.ts` (runs on all pages, extracts
  PageAnalysis on demand via `get_seo_analysis` message)
- Create `entrypoints/popup/seo-types.ts` (PageAnalysis interface)
- Create `OverviewTab.svelte` matching mockup: Core Meta (title with char count
  badge, description, URL with Indexable badge, canonical with Self-ref badge),
  Technical (meta robots, favicon, keywords, publisher, lang, word count),
  Social Media (detected platform links with icons)
- Wire up parallel data loading in App.svelte: `getTheme()` + `get_seo_analysis`

## Phase 3: Headings + Images Tabs

- `HeadingsTab.svelte` - purple H-level pills, indented hierarchy, heading
  counts, Highlight + Export action buttons
- `ImagesTab.svelte` - table columns (Image, Size, Fmt, Dims, Load, Status),
  filter dropdowns (Alt, Format, Loading, Status), Highlight + Export buttons

## Phase 4: Links + Hreflangs Tabs

- `LinksTab.svelte` - inline stats (Total, Unique, Internal, External), filter
  pills, table with Follow/Type columns, action bar
- `HreflangsTab.svelte` - simple table with URL + hreflang badge

## Phase 5: Schema + Social Tabs

- `SchemaTab.svelte` - collapsible sections with separators, nested key-value tree
- `SocialTab.svelte` - collapsible OG + Twitter sections, right-aligned monospace
  keys, og:image preview with dimensions/size

## Phase 6: Shopify Tabs (Apps, Products, Robots.txt, Sitemaps)

- `AppsTab.svelte` - detect apps from loaded scripts, colored icon + category pill
- `ProductsTab.svelte` - table with expandable variants, filter dropdowns, stats
- `RobotsTab.svelte` - fetch /robots.txt, syntax-highlighted pre block
- `SitemapsTab.svelte` - parse /sitemap.xml index, list child sitemaps

## Shared Components (extract as needed)

- `Badge.svelte` - pill component (green/red/yellow/gray/purple)
- `ActionBar.svelte` - filters + action buttons
- `FilterDropdown.svelte` - styled select
- `SectionHeading.svelte` - uppercase section label
- `DataRow.svelte` - label + value row with optional copy
