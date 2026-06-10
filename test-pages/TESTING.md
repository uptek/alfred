# Manual test guide: Headings + Links tab updates

Checklist for verifying everything that changed on the `feat/popup-improvements`
branch: the three Headings fixes, the Links classification rework, and the
toolbar polish. Work top to bottom; every step says which page to open and what
to look for.

## Setup

1. Run the automated suite first. It covers the analyzers and link
   classification logic (71 tests):

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

- [ ] Header shows (18/18); the nav link is the 18th
- [ ] Type filter: Internal 10, External 5, **Other 3** (Other is a new option)
- [ ] Row 9 (`www.localhost`) is **Internal** and has no `http` badge
- [ ] Rows 15, 16, 17 show Type **Mailto**, **Tel**, **Other** and their full
      href in the URL cell

### Follow hints (sponsored/ugc are new)

- [ ] Row 5 (nofollow): red "No" pill
- [ ] Row 6 (sponsored): amber "Sponsored" pill
- [ ] Row 7 (ugc): amber "UGC" pill
- [ ] Follow filter shows Dofollow 15, Nofollow 1, Sponsored 1, UGC 1
- [ ] Sort by Dofollow ascending groups Yes → UGC → Sponsored → No

### Anchor text (alt and aria-label fallback)

- [ ] Row 10: anchor text "Image link" (from the img alt) plus a small "img"
      tag
- [ ] Row 11: "Shop the collection" on one line (multi-line markup collapsed),
      with the "img" tag; the text wins over the image
- [ ] Row 12: red italic "(image without alt text)"
- [ ] Row 13: "Theme fixture" (from aria-label)
- [ ] Anchor filter: Text 17, Image 3, None 1

### Badges

- [ ] Row 8: amber "http" badge (plain-http external link)
- [ ] Row 3: red "broken #" badge (`#nowhere` has no target)
- [ ] Row 2 (`#top`): no broken badge (target exists)
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
