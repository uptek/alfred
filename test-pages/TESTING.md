# Manual test guide: Headings + Links + Assets + Images tab updates

Checklist for verifying everything that changed on the `feat/popup-improvements`
branch: the three Headings fixes, the Links classification rework, the toolbar
polish, the Assets classification rework, and the Images alt/sizing rework.
Work top to bottom; every step says which page to open and what to look for.

## Setup

1. Run the automated suite first. It covers the analyzers, link
   classification, asset classification, and image classification logic
   (212 tests):

   ```sh
   bun test
   ```

2. Start the fixture server and have the extension loaded with your usual
   dev/HMR flow:

   ```sh
   bun run testpages   # → http://localhost:4242
   ```

3. For each step: open the fixture page, click the Alfred icon, switch to the
   named tab. Each page also has a blue "Expected" panel; this guide adds the
   behaviors that are new on this branch.

---

## Headings tab

What changed: multiple H1s are one deduped issue, image-only headings read
their img alt / aria-label instead of reporting "Empty", hidden headings are
excluded from analysis, and the scroll-to flash no longer breaks on rapid
clicks.

### `/headings/multiple-h1.html` (fix #1: dedupe)

- [ ] Issues panel shows a single line, "3 H1 tags found", not one row per H1
- [ ] Headings tab badge shows **1** (issue count, not H1 count)
- [ ] Every H1 row carries a red issue dot
- [ ] Clicking each H1 row scrolls the page to that heading

### `/headings/image-only-h1.html` (fix #2: accessible name)

- [ ] H1 row reads "Acme Outfitters" (from the img alt), not "(empty)"
- [ ] H2 row shows its aria-label text
- [ ] Only the H3 (image with no alt) is flagged: 1 issue, "Empty H3", badge 1

### `/headings/hidden-headings.html` (fix #3: hidden excluded)

- [ ] Exactly 1 issue: the H1 → H3 skip that passes through a hidden H2
- [ ] The hidden duplicate H1 does NOT trigger "multiple H1"
- [ ] The hidden empty H2 is NOT flagged as empty
- [ ] The hidden H6 does NOT create a skipped-level issue
- [ ] "3 hidden" toggle appears; hidden rows are dimmed with an eye icon
- [ ] Red dots still land on the correct rows with the toggle on and off

### `/headings/hidden-h1.html`

- [ ] "No H1 tag found" is reported even though an H1 exists (it is
      display:none)

### Quick sweep of the rest

- [ ] `/headings/clean.html`: no issues, no badge
- [ ] `/headings/no-headings.html`: empty state, no badge
- [ ] `/headings/missing-h1.html`: 1 issue
- [ ] `/headings/h1-not-first.html`: "H2 appears before H1"
- [ ] `/headings/empty-heading.html`: 2 issues ("Empty H2" twice, one of them
      is a non-breaking space)
- [ ] `/headings/skipped-level.html`: 2 skip issues
- [ ] `/headings/kitchen-sink.html`: 4 issues in the order listed on the page

### Regression: scroll flash

- [ ] Click the same heading row twice quickly: the green outline shows once,
      stays ~5s, fades, and no outline gets stuck or removed early

---

## Links tab

What changed: link kinds (internal/external/mailto/tel/other) with the www
variant counted internal, sponsored/ugc rel hints, anchor text with alt and
aria-label fallback, hidden links surfaced, insecure-http and broken-anchor
badges, hardened exports, sturdier scroll-to-link, and the compact toolbar.

Primary page: **`/links/mixed.html`**. The row numbers below match the
numbered links on that page.

### Counts and classification

- [ ] Header shows (21/21); the nav link is the 21st
- [ ] Type filter: Internal 13, External 5, **Other 3** (Other is a new option)
- [ ] Row 9 (`www.localhost`) is **Internal** and has no `http` badge
- [ ] Rows 15, 16, 17 show Type **Mailto**, **Tel**, **Other** and their full
      href in the URL cell

### Follow hints (sponsored/ugc are new)

- [ ] Row 5 (nofollow): red "No" pill
- [ ] Row 6 (sponsored): amber "Sponsored" pill
- [ ] Row 7 (ugc): amber "UGC" pill
- [ ] Follow filter shows Dofollow 18, Nofollow 1, Sponsored 1, UGC 1
- [ ] Sort by Dofollow ascending groups Yes → UGC → Sponsored → No

### Anchor text (alt and aria-label fallback)

- [ ] Row 10: anchor text "Image link" (from the img alt) plus a small "img"
      tag
- [ ] Row 11: "Shop the collection" on one line (multi-line markup collapsed),
      with the "img" tag; the text wins over the image
- [ ] Row 12: red italic "(image without alt text)"
- [ ] Row 13: "Theme fixture" (from aria-label)
- [ ] Anchor filter: Text 20, Image 3, None 1

### Badges

- [ ] Row 8: amber "http" badge (plain-http external link)
- [ ] Rows 3 (`#nowhere`) and 20 (`#viewport`): red "broken #" badge
- [ ] Row 2 (`#content`): no broken badge (an element carries that id)
- [ ] Row 18 (`#top`): no broken badge, even though nothing on the page has
      `id="top"` — browsers scroll to the document top for it
- [ ] Row 19 (`#legacy`): no broken badge (`<a name="legacy">` is a target);
      row 20 proves `name` on a non-anchor element (`<meta name="viewport">`)
      is not
- [ ] The three links to `/` (rows 10, 12, nav) each show a ×3 dup badge

### Hidden links (new surfacing)

- [ ] Toolbar shows the eye-off button with just the count ("1"); the whole
      toolbar sits on one row, Type/Follow/Anchor do not wrap (the alignment
      fix)
- [ ] Row 14 is dimmed with an eye icon at the end of the URL line
- [ ] Toggling the eye-off button hides the row (17/18) and the reset button
      appears; reset restores it

### Highlight overlay

- [ ] Toggle Highlight: green outlines on internal links, purple on external
      and other, **red on rows 5, 6, and 7** (sponsored/ugc now count, not
      just nofollow)

### Summary bar

- [ ] Bottom of the table reads "18 links · 5 external · 3 nofollow ·
      1 insecure http · 1 broken #" and updates when a filter is active

### Scroll to link

- [ ] Clicking a row scrolls the page to the link with a green flash
- [ ] Clicking the same row twice quickly does not strip the outline early
- [ ] Optional, on a real store: open the popup, then open/close a menu or
      slide a carousel (mutating the DOM), then click rows; they should still
      land on the right links thanks to the index stamped at snapshot time

### Exports

- [ ] CSV columns: URL, Anchor Text, Type, Dofollow, Rel, Is Image, Is
      Hidden, Insecure HTTP, Broken Anchor; opens fine in a spreadsheet
      (formula injection is neutralized in code and unit tests; nothing to do
      here beyond opening it)
- [ ] JSON has the same fields per link (url, anchorText, type, dofollow,
      rel, isImage, isHidden, isInsecure, isBrokenAnchor)
- [ ] Text export and Copy still give one URL per line

### Real-world spot check

- [ ] Open any live Shopify store: counts look sane, `www.` links to the same
      shop are Internal, mailto/tel sit under Other, the hidden count matches
      reality (mega menus produce many), no console errors in the popup or
      page

---

## Assets tab

What changed: script subtypes (Module/JSON/JSON-LD/Map/Rules) with correct
load semantics, render-blocking detection that understands modules, nomodule,
media queries, and disabled/alternate stylesheets, www-internal hosts,
path-only display for same-host sources, search inside inline source, a Flags
filter, a summary bar, media tags, MB sizes, and hardened CSV export.

### `/assets/mixed.html` (baseline)

- [ ] 7 scripts + 3 styles; same-host sources show path only (no
      `localhost` prefix)
- [ ] Inline module row shows Type **Module**; inline JSON shows **JSON**
- [ ] Render-blocking pills on exactly blocking.js and styles.css; Flags
      filter appears with Render-blocking 2
- [ ] print.css carries a gray "print" media tag and no render-blocking pill
- [ ] Summary bar reads "7 scripts · 3 styles · (size) · 2 render-blocking"
- [ ] Search for `alfredTestInlineClassic` finds the inline classic script
      (search now covers inline source)

### `/assets/modules-and-data.html` (module + data correctness)

- [ ] module.js: Load **defer**, Type **Module**, NOT render-blocking
- [ ] nomodule.js: NOT render-blocking, size/time both "—" (never fetched)
- [ ] Importmap, JSON-LD, and speculation-rules blocks show Types **Map**,
      **JSON-LD**, **Rules**, all load "inline", none flagged
- [ ] Only blocking.js is render-blocking; Flags shows Render-blocking 1

### `/assets/media-styles.html` (stylesheet applicability)

- [ ] Render-blocking on exactly styles.css and matching-mq.css
- [ ] print.css and nonmatching-mq.css show media tags, no flags
- [ ] disabled.css and alternate.css: no flags, no size/time (never fetched)
- [ ] Flags shows Render-blocking 2

### `/assets/broken-and-duplicate.html` (failures + duplicates)

- [ ] missing.js and missing.css show red **404** pills
- [ ] Both footer.js rows show **×2** duplicate badges
- [ ] Flags filter offers Render-blocking 2, Failed 2, Duplicate 2; each
      selection narrows the table correctly and the reset button restores

### `/assets/external-hosts.html` (host classification)

- [ ] Source filter: External 1 (only the 127.0.0.1 script)
- [ ] The www.localhost script counts as same-site (path-only source cell)
- [ ] The 127.0.0.1 row shows host + path and "—" size/status (opaque
      cross-origin)

### Load facet consistency

- [ ] On `/assets/media-styles.html`, filtering Load = Blocking shows no
      external stylesheets (their Load cell is "—"; they no longer match the
      Blocking filter)

### Exports

- [ ] CSV columns: Kind, Source, Type, Subtype, Load, Placement, Media, Size,
      Time, Status, Cached, Render-Blocking, Duplicate, Browser Extension
- [ ] JSON has the same fields per asset; Text/Copy give one URL per line

### Real-world spot check

- [ ] Open any live Shopify store: JSON-LD blocks show as JSON-LD (not
      Script), theme module scripts show Module/defer without render-blocking
      pills, cdn.shopify.com assets are External, the summary bar total looks
      plausible, no console errors

---

## Images tab

What changed: decorative `alt=""` is no longer flagged (only an absent alt
attribute counts, including in the badge and the on-page highlight), the Alt
filter gained Present/Decorative/Missing, oversized-image detection with a
Flags filter and amber Dims cell, a summary bar, data-URI sources collapse to
their MIME label, multiple backgrounds yield one row per url(), the
missing-alt pill turned amber, format detection reads data-URI MIMEs and
format/fm query params, the Loading filter excludes backgrounds, and CSV
export is hardened with Display Width/Height and Oversized columns.

### `/images/mixed.html` (baseline)

- [ ] 10 images; tab badge shows **1** (was 2: the empty-alt image no longer
      counts)
- [ ] Row 3 (empty alt) shows a gray "decorative" tag, status **OK**
- [ ] Alt filter: Present 7, Decorative 1, Missing 1
- [ ] Row 2 (no alt attribute) shows the **amber** "Alt" pill; only Broken is
      red
- [ ] Loading filter: the background row never matches Lazy/Eager/None (its
      Load cell is "—")
- [ ] No Flags filter on this page (nothing oversized, facet stays hidden)
- [ ] Highlight: the decorative image gets a green outline, only the
      missing-alt image is amber, the 404 image is red
- [ ] Summary bar: 10 images · (size) · 1 missing alt · 1 broken

### `/images/sizing.html` (oversized detection)

- [ ] wide.svg at 160×100: amber **1600×1000** in the Dims cell with a
      natural-vs-displayed tooltip
- [ ] wide.svg at 800×500 (exactly 2× per dimension) is NOT flagged
- [ ] photo.svg at its natural size is NOT flagged
- [ ] photo.svg shrunk to 32×20 is NOT flagged: small images never clear the
      waste floor, so icons/emoji (e.g. Reddit's 128px emoji at 20px) stay
      out of the Oversized flag
- [ ] Flags filter appears with Oversized 1; selecting it narrows to 1 row;
      reset restores
- [ ] Summary bar ends with "1 oversized"

### `/images/backgrounds-and-data.html` (backgrounds + data URIs)

- [ ] 5 images: the multi-background div contributes TWO bg rows (pixel.png
      and pixel.gif)
- [ ] The gradient+url element still yields its photo.svg row
- [ ] Data-URI image: filename reads `data:image/svg+xml`, Format SVG, thumb
      is not a link
- [ ] Badge 0; decorative row shows the gray "decorative" tag
- [ ] Format filter: SVG 3, PNG 1, GIF 1
- [ ] Search "pixel" matches the two background rows; a base64 fragment from
      the data URI matches nothing

### Exports

- [ ] CSV columns: URL, Alt, Source, Format, Width, Height, Display Width,
      Display Height, Size, Loading, Status, Oversized; opens fine in a
      spreadsheet (formula injection neutralized in code and unit tests)
- [ ] JSON has the same fields per image; Copy gives one URL per line

### Real-world spot check

- [ ] Open any live Shopify store: decorative logos/spacers with `alt=""`
      are not flagged, the badge matches truly missing alts, hero images
      sized by the theme are not falsely Oversized at your display's DPR,
      data-URI lazy-load placeholders show MIME labels instead of base64,
      scroll-to-image and Highlight still land correctly, no console errors
