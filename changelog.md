# Changelog

## 2026.08.08.2
@ 2026-08-08

### A Proper Dark Mode
Some products spend a quarter polishing dark mode while the bugs pile up. We fixed the bugs first, so we're allowed to have this: a calmer dark theme in the style of GitHub's soft dark, with clearer on/off states for buttons and easier-to-spot status badges.

- Fixed Alfred sometimes showing "Not a Shopify store" on slower stores. It now waits patiently for the store to finish loading before deciding.
- Every button, filter, and copy icon now shares one consistent hover style in both light and dark modes, and status pills got subtle borders so they read clearly at a glance.


## 2026.08.08.1
@ 2026-08-08

### Sitemaps: The Complete Toolkit
Alfred now handles everything sitemaps, on any website you visit. It discovers every sitemap automatically, checks their health, lets you search inside all of them at once, and exports whatever you find. No more opening raw XML files one by one.

- Every sitemap in one sortable table: type, URL count, last modified, and health status, with plain-language findings for anything broken or missing.
- Search any keyword or URL across all sitemaps at once and see exactly which sitemap each matching page lives in.
- One click answers whether the page open in the current tab is in a sitemap.
- Copy any sitemap's full URL list, or export everything as CSV, JSON, or text.
- Sidebar badge flags sitemap errors before you even open the tab.

<video controls muted playsinline src="https://bucket.alfred.uptek.com/alfred-sitemaps.mp4"></video>

## 2026.08.08
@ 2026-08-08

### Hreflangs Tab
A new Hreflangs tab lists every language and region alternate declared on the page and validates the whole set: invalid language codes, relative URLs, conflicting duplicates, tags outside the head, and missing self-reference or x-default.

- Sidebar badge counts hreflang errors at a glance.
- Copy the full set or export it as CSV.
- Summary bar shows alternate count, x-default, and self-referencing status.

<video controls muted playsinline src="https://bucket.alfred.uptek.com/alfred-hreflang-tab.mp4"></video>

## 2026.08.07
@ 2026-08-07

### Social Tab
A new Social tab shows exactly how your page will look when shared on Facebook, X, and LinkedIn, and catches the tag problems that break those previews.

- Live preview cards per platform, including X's small summary card when twitter:card asks for it.
- Missing tags render the mangled preview platforms would actually show, so the damage is visible before you share.
- Checks for missing or insecure og:image, wrong image size or ratio per platform, relative URLs, SVG images, double-encoded text, and over-long descriptions.
- The image is fetched and measured in the background, with declared og:image dimensions verified against the real file.
- A red badge on the tab counts tag errors, and a table lists every og:, twitter:, and fb: tag found on the page.

<video controls muted playsinline src="https://bucket.alfred.uptek.com/alfred-social-tab.mp4"></video>

## 2026.08.06
@ 2026-08-06

### Overview Tab
A new Overview tab gives you the page's SEO health at a glance, and it's now the first tab you see.

- Indexability verdict up top: HTTP status, noindex, robots.txt, and canonical checked in one call.
- Google search preview that truncates the title by pixel width, just like real results.
- Title, description, and canonical with status pills, plus one-click copy.
- Technical checks: robots directives, X-Robots-Tag, word count, and llms.txt.
- Issues surface through the verdict banner and status pills, with a red badge counting errors.
- Quick links to robots.txt, sitemap.xml, Rich Results Test, and PageSpeed Insights.
- Social profiles detected on the page, and Shopify-aware checks like .myshopify.com and variant canonicals.

<video controls muted playsinline src="https://bucket.alfred.uptek.com/alfred-overview-tab.mp4"></video>

## 2026.07.14
@ 2026-07-14

### Dark Mode
The popup now has a dark mode, so it no longer glares white when your browser is set to dark.

- Follows your system light/dark preference automatically.
- Prefer to lock it? Pick System, Light, or Dark under the popup's Settings tab.
- Every tab is tuned for dark: Theme inspector, Links, Images, Schema, Robots, and Settings all stay readable.

## 2026.07.10
@ 2026-07-10

### Compare Shopify Apps Side-by-Side
App comparison is back on the Shopify App Store. Collect apps while you browse and view them side-by-side at apps.shopify.com/compare.

- "Add to compare" buttons on search results and app listings. The app icon flies into a floating compare tray that follows you across pages.
- Compare up to 4 apps: screenshots, ratings with per-star breakdowns, pricing plans, free trial lengths, launch date and app age, languages, integrations, resource links, and the data each app can access.
- Built for Shopify apps wear their official badge.
- Toggle "Differences only" to hide rows where every app is identical.
- Reorder columns with a click; the whole column slides into place.
- Share a comparison with a link, copy it as Markdown, or download it as CSV or JSON. Shared links open for anyone with Alfred installed.
- Turn it off anytime under App Store settings.

<video controls muted playsinline src="https://bucket.alfred.uptek.com/alfred-compare-apps.mp4"></video>

## 2026.07.06
@ 2026-07-06

### Robots.txt Analyzer
New Robots.txt tab in the popup fetches and analyzes any site's robots.txt — not just the raw file, but what it actually means for crawlers.

- AI Crawler Access summary shows at a glance which AI bots (GPTBot, ClaudeBot, PerplexityBot, and 10 more) can access the current page — expandable into a full per-bot matrix grouped by training, AI search, and user-fetch crawlers.
- Issue detection catches common robots.txt mistakes: rules that crawlers silently ignore, retired directives like Noindex, site-wide blocks, blocked CSS/JS assets, misspellings, and more — each linked to the exact line.
- Shopify stores get a Default vs Customized badge, with customized lines highlighted in the source view.
- Syntax-highlighted source with line numbers, click-to-jump from any finding, line wrapping, and one-click copy or open.
- Friendly explanations for edge cases: missing robots.txt (404), server errors, and files that accidentally serve HTML.

<video controls muted playsinline src="https://bucket.alfred.uptek.com/alfred-robots-txt.mp4"></video>

## 2026.06.24
@ 2026-06-24

### Link Status Checker
The Links tab can now tell you whether each link actually works. Press the check button in the new Status column and Alfred checks every link, reporting whether it's live (2xx), redirecting (3xx), broken (4xx/5xx), or unreachable.

- Filter to just the failing links to track down broken links fast.
- Sort by status to bring the worst offenders to the top.

### The Popup Remembers Where You Left Off
Run a link or image check, set up filters, sort a column, or expand a section, then close the popup to click something on the page. Reopen it on the same page and everything is right where you left it, including the tab you had open.

- Link and image status results, filters, sorting, search, and highlights are all restored.
- Every browser tab keeps its own state, so different pages don't bleed into each other.
- State clears automatically when you navigate to a new page or close the tab.

<video controls muted playsinline src="https://bucket.alfred.uptek.com/alfred-links-status.mp4"></video>

## 2026.06.22
@ 2026-06-22
Fixed auto-submitting preset hotlinks sending the access request before every permission was added. The request now waits until all of the preset's permissions are applied, so collaborators get access to exactly what the preset specifies.


## 2026.06.20
@ 2026-06-20

### Schema Analyzer
A new Schema tab analyzes the JSON-LD structured data on your website — the markup Google reads for rich results — laid out as clean, readable tables.

![The new Schema tab showing structured data as readable tables](https://bucket.alfred.uptek.com/alfred-seo-schema.jpg)
- Entities bundled in a single @graph block are split out into separate, named types.
- Copy any single type's JSON with one click, or copy and export everything at once.

## 2026.06.17
@ 2026-06-17
A new General setting lets you stop the changelog from opening in a new tab every time Alfred updates. It stays on by default, so nothing changes unless you turn it off.


## 2026.06.15
@ 2026-06-15

### Smarter SEO Audits Across Every Tab
The Headings, Links, Assets, and Images tabs got a deep accuracy pass — fewer false alarms, more real findings.


### Headings
- Multiple H1s are reported as one issue instead of one alert per heading.
- Image-only headings now read their image's alt text instead of showing as empty.
- Hidden headings no longer skew the outline analysis.

### Links
- Links are classified as internal, external, mailto, tel, or other — with the www variant counting as the same site.
- Sponsored and UGC rel hints get their own pills and filters alongside nofollow.
- New badges flag insecure http links and broken #anchor targets; repeated links show a duplicate counter.
- Hidden links are surfaced with a toggle, and a summary bar totals the current view.

### Assets
- Scripts are classified by what they really are: modules, JSON-LD, import maps, speculation rules, or inert data blocks.
- Render-blocking detection now understands module scripts, nomodule fallbacks, media queries, and disabled or alternate stylesheets.
- A Flags filter pinpoints render-blocking, failed, and duplicate assets, and a summary bar totals counts and size.

### Images
- Decorative images with an empty alt are recognized as intentional instead of being flagged as missing alt.
- Oversized images — shipping far more pixels than they display — are detected, highlighted, and filterable.
- Data-URI images show a clean label instead of a wall of base64, and huge inline payloads no longer slow the popup.
- Multiple CSS backgrounds on one element are each listed, and a summary bar totals the view.

### Everywhere
- Searching, filtering, and sorting stay fast on link- and image-heavy pages.
- CSV and JSON exports carry the new fields and are hardened against spreadsheet formula injection.

## 2026.06.14
@ 2026-06-14

### Request store access from any storefront
Right-click any Shopify store and choose Request Store Access to open a collaborator access request with that store already filled in. Your saved permission presets show up in the menu too, so you can start one without leaving the page.

- Pick a preset from the menu to open the request and apply it automatically, or have it submit the request for you.
- Curate which presets appear in the menu, and in what order, from the options page.
- Alfred remembers your Shopify organization automatically the first time you open your dev dashboard, and you can change it in settings if you work across more than one organization.

<video controls muted playsinline src="https://bucket.alfred.uptek.com/alfred-storefront-collaborator-request.mp4"></video>

## 2026.06.11.1
@ 2026-06-11
Fixed auto-submit hotlinks: the prefilled store URL is now validated automatically, and the request is submitted as soon as the Request access button is ready. One-click hotlinks now go through reliably instead of stalling on an unvalidated store URL.


## 2026.06.11
@ 2026-06-11

### Permission Preset Hotlinks: Auto-Submit
The preset hotlink popup now has an Auto-submit option. When enabled, opening the hotlink fills in the permissions and message and sends the access request automatically, so you can go from link to submitted request in one click. It's off by default, so existing hotlinks still let you review before submitting.

- Permission presets now focus solely on the Shopify Dev Dashboard, with cleaner, more consistent buttons that match the dashboard's native styling.
- Hotlink URLs flash briefly when the auto-submit option changes them, so it's clear the link was updated before you copy it.
![undefined](https://bucket.alfred.uptek.com/alfred-preset-auto-submit.jpg)

## 2026.06.09
@ 2026-06-09

### SEO Images Analyzer
New Images tab in the popup audits every image on any page — for SEO, accessibility, and performance — in one sortable, filterable table.

- See every image in a table with a thumbnail, alt text, file size, format, dimensions, and loading strategy.
- Covers regular images, responsive picture/srcset images, and CSS background images (tagged separately).
- Missing alt text is flagged in red, and broken images are detected and labeled.
- Filter by Alt, Format, Loading, and Status, search by alt text or URL, and sort any column.
- Highlight all images on the page with color-coded outlines (green=ok, amber=missing alt, red=broken).
- Click any row to scroll to that image on the page with a brief highlight.
- Export everything as CSV or JSON, or copy all image URLs to your clipboard.
- Works on any website, not just Shopify stores.

<video controls muted playsinline src="https://bucket.alfred.uptek.com/alfred-images.mp4"></video>

## 2026.06.01.1
@ 2026-06-01

### Popup redesign for legibility and calm
The popup got a visual refresh focused on readability and a soothing feel, with no change to how anything works.

- A single calm indigo accent across links, filters, toggles, and active states.
- Higher text contrast throughout for easier reading, meeting WCAG AA.
- Softer off-white surfaces and gentler, cooler shadows that reduce glare.
- Clearer, consistent heading-level pills (H1 through H6) in the Headings tab.
- Crisper active tab and theme title, plus reduced-motion and keyboard-focus support.

## 2026.06.01
@ 2026-06-01

### Scripts & Styles Analyzer
Introducing the new Assets tab — it shows every script and stylesheet a page loads, with size, load time, and performance signals, so you can see exactly what's weighing a page down.

- See every script and stylesheet in one table: source, size, load time, type, and how it loads (async, defer, blocking, or inline).
- Filter by Type (scripts or styles), Source (external, inline, or browser extension), and Loading strategy — all combine together.
- Spot performance problems at a glance: render-blocking assets, duplicate loads, cached resources, and failed requests.
- Sort any column, search by URL or type, and click a row to open an external file in a new tab or expand inline code.
- Browser-extension assets injected into the page are detected and kept separate from the site's own assets.
- Export everything as CSV or JSON, or copy the source URLs to your clipboard.

<video controls muted playsinline src="https://bucket.alfred.uptek.com/alfred-assets.mp4"></video>

## 2026.05.31
@ 2026-05-31

### SEO Links Analyzer
New Links tab in the popup gives you a full picture of every link on any page — internal, external, dofollow, nofollow — with tools to search, filter, highlight, and export.

- See all links in a table with URL, anchor text, dofollow status, and internal/external type.
- Filter by Type (Internal/External), Follow (Dofollow/Nofollow), and Anchor (Text/Image/None) with separate dropdowns that stack together, and sort any column in the table.
- Search links by URL or anchor text with the built-in search bar.
- Highlight all links on the page with color-coded dashed outlines (green=internal, purple=external, red=nofollow).
- Click any row to scroll to that link on the page with a brief highlight.
- Image links are detected and labeled as [image]. Links with no anchor text are flagged.
- Duplicate links show a ×N badge so you can spot repeated nav/footer links.
- Export all links as CSV (all fields), JSON (all fields), or plain text (URLs only), or copy the URLs straight to your clipboard.

<video controls muted playsinline src="https://bucket.alfred.uptek.com/alfred-links.mp4"></video>

## 2026.05.26
@ 2026-05-26

### SEO Headings Analyzer
New Headings tab in the popup analyzes the heading structure (H1-H6) of any page for SEO and accessibility issues.

- See all headings in an indented tree view that shows the document outline at a glance.
- Issues are flagged automatically: missing H1, multiple H1s, skipped heading levels, empty headings, and H1 not appearing first.
- Hidden headings (display:none, visibility:hidden) are detected and dimmed with an eye icon. Filter them on or off.
- Click any heading to scroll to it on the page with a brief highlight.
- Copy the full heading structure to clipboard for audits and reports.
- Works on any website, not just Shopify stores. The popup now shows all tabs on every site with Shopify features gated contextually.

<video controls muted playsinline src="https://bucket.alfred.uptek.com/alfred-headings.mp4"></video>

## 2026.05.20
@ 2026-05-20

### Permission Preset Improvements
- Permission presets now appear correctly when navigating to a collaboration request via the Dev Dashboard sidebar.
- The hotlink modal now shows a direct auto-apply URL you can bookmark or share, in addition to the Mantle integration URL.
- Applying a preset scrolls to the bottom of the page so the Save preset and Request access buttons are visible.

## 2026.05.16
@ 2026-05-16
You can now opt out of anonymous usage analytics from Settings. When disabled, no data is sent externally — Alfred works fully offline.


## 2026.05.13
@ 2026-05-13
The store's .myshopify.com domain is now displayed in the popup, so you can quickly identify and copy it.

Improvements to analytics tracking so we can better understand how Alfred is being used and catch issues earlier.

- Added activation tracking to measure how many users open the popup after installing.
- Review prompt impressions are now tracked so we know how many users see the rating prompt.
- Preview URL copy from the popup is now tracked alongside the context menu.
- Fixed a rare issue where analytics could fragment a single user into multiple identities.
- Tracking events from content scripts now automatically retry if the background service is temporarily unavailable.

## 2026.05.11
@ 2026-05-11
Alfred is getting a big upgrade. We're building toward a full-featured dashboard that gives developers and merchants deeper insights into their Shopify store — SEO analysis, app detection, performance metrics, and more. This release is the first step in that direction.

- Redesigned popup with a new sidebar navigation layout, replacing the old pill tabs.
- Refreshed Theme tab with a new look — theme details, version status, and preview URL are easier to scan at a glance.
![undefined](https://bucket.alfred.uptek.com/alfred-popup-v2.png)

## 2026.05.05
@ 2026-05-05
Search and filter permissions on the Dev Dashboard's collaborator access page. Find the exact permission you need without expanding every section.

- Real-time permission search with multi-word matching (e.g. "order delete" finds Delete under Orders).
- Expand all / Collapse all buttons for the permission tree.
- Fixed a bug where permission preset features wouldn't load after navigating within the Dev Dashboard without a full page reload.

<video controls muted playsinline src="https://bucket.alfred.uptek.com/alfred-permissions-search.mp4"></video>

## 2026.04.30
@ 2026-04-30
Collaborator access presets now work on the new Shopify Dev Dashboard (dev.shopify.com) in addition to the Partner Dashboard.

- Save, apply, import, and export permission presets on the Dev Dashboard's collaborator access page.
- Native dark-themed UI that matches the Dev Dashboard's design language.
- Request collaborator access directly from Mantle or any custom dashboard with Preset Hotlinks
![undefined](https://bucket.alfred.uptek.com/alfred-dev-dashboard-collaborator-access-presets.png)

## 2026.04.21
@ 2026-04-21
Alfred is now open source. This is the first public release.


## 2026.04.18
@ 2026-04-18
Fixed an issue where copy, cut, and paste stopped working in Shopify admin pages like the custom pixel code editor. The restore-right-click feature was incorrectly activating on admin pages.


## 2026.04.06.1
@ 2026-04-06
Alfred now runs on a single UI framework (Svelte 5), replacing the previous Preact + Svelte split. Faster load times, smaller extension size, and a smoother experience across all features.

- Migrated popup, options page, and all content scripts to Svelte 5.
- Upgraded all dependencies to their latest versions.
- Reduced framework overhead by shipping one runtime instead of two.

## 2026.04.06
@ 2026-04-06
The Shopify Dev Dashboard now runs in light mode automatically, with a theme toggle in the header to switch between Light, Dark, and System. Your preference is remembered across sessions.


<video controls muted playsinline src="https://bucket.alfred.uptek.com/alfred-dev-dashboard-light-mode.mp4"></video>

## 2026.04.05
@ 2026-04-05
- Drag-to-resize sidebars and preview in the Theme Customizer, rebuilt for Shopify's latest editor.
- Live dimensions badge in the top bar shows the preview size in real time as you resize.

## 2026.03.27
@ 2026-03-27
Open in Customizer now preserves the ?view= parameter from the current URL, so alternate template views carry over into the theme editor.


## 2026.03.24
@ 2026-03-24
- Added a review CTA in the Theme Detector popup. If Alfred's been saving you time, leave a quick rating — it helps other Shopify developers find it.
- Fixed developer links in the theme popup opening to the wrong URL.

## 2026.03.23
@ 2026-03-23
Introducing Cartograph — a unified cart editor that lets you do everything that the Cart AJAX API offers and then some. Add items, switch variants, manage selling plans, apply discount codes, calculate shipping rates, and more — all without touching the API.

- Open via right-click > Alfred > Cartograph, or add ?alfred=cart to any store URL.
- JSON tab for viewing and copying the full cart payload.
- Light and dark theme with system preference detection.

<video controls muted playsinline src="https://bucket.alfred.uptek.com/alfred-cartograph.mp4"></video>

## 2026.03.15.1
@ 2026-03-15
Introducing preset hotlinks — generate a shareable URL for any preset that auto-applies the preset's permissions. Use it as a bookmark, a shared link, or a platform integration.

Mantle integration — preset hotlinks work as Mantle custom actions. Now you can request collaborator access right from your Mantle dashboard with the right permissions auto-applied for you.


<video controls muted playsinline src="https://bucket.alfred.uptek.com/alfred-preset-hotlinks.mp4"></video>

## 2026.03.15
@ 2026-03-15
Shopify Admin > Themes: Simplified the theme list utilities — replaced the info fields and action buttons with compact copy buttons for Theme ID and Preview URL.


## 2026.02.26
@ 2026-02-26
Theme data is now fetched from Alfred's CDN instead of being bundled with the extension, so theme information stays up to date automatically.


## 2026.02.25
@ 2026-02-25
Theme Detector now shows richer theme details — developer, price, latest version, and direct links to the Shopify Theme Store.


## 2026.02.23
@ 2026-02-23
- Shopify Admin > Themes: Added Preview and Edit Code buttons to each theme.
- Shopify Admin > Themes: Added Theme ID and Preview URL fields with one-click copy.

<video controls muted playsinline src="https://bucket.alfred.uptek.com/admin-themes-utils.mp4"></video>

## 2026.02.20
@ 2026-02-20
- Exit Theme Preview Shortcut: Added a new right-click shortcut to exit a Shopify theme preview and switch back to the live/published theme.
- Reorganized right-click menu shortcuts into categorized groups with visual separators for easier discovery.

## 2026.02.13
@ 2026-02-13
Storefront Password Redirect: Shopify redirects you to the home page after entering a store password, even if you were trying to visit a specific page. Alfred now remembers your intended destination and redirects you there after a successful password entry.


## 2026.02.03
@ 2026-02-03
Fixed an issue where React hydration errors occurred on Next.js sites.


## 2026.01.29
@ 2026-01-29
The right-click restore was conflicting with web apps that have their own custom context menus (like Google Docs). The restore feature is now limited to Shopify storefronts only.


## 2026.01.28
@ 2026-01-28
- Open Image in Admin Shortcut: Added a new right-click shortcut for images. Right-click any image on a Shopify storefront to quickly search for it in the store's Admin Files.
- New: Restore Right-Click. Alfred now automatically re-enables right-click context menus and text selection on websites that block them. This can be toggled off in Settings > General.

<video controls muted playsinline src="https://bucket.alfred.uptek.com/open-image-in-admin.mp4"></video>

## 2026.01.08
@ 2026-01-08
Added a warning dialog before closing the theme code editor page. This helps prevent accidental tab closures when using Cmd+W/Ctrl+W (a common VS Code habit).


## 2026.01.06
@ 2026-01-06
Added more theme details to the Theme Detector.

- Added Theme ID display with click-to-copy functionality.
- Added Theme name (internal) when it differs from the store theme name, also click-to-copy.

## 2025.10.06
@ 2025-10-06
Introducing Storefront Password Auto-fill! Save and automatically fill passwords for password-protected Shopify storefronts. Passwords are stored locally in your browser and can be managed from the extension popup or settings page.


<video controls muted playsinline src="https://bucket.alfred.uptek.com/storefront-password-autofill.mp4"></video>

## 2025.10.05
@ 2025-10-05
Improved Collaborator Access Presets UI/UX

- Removed the dropdown presets selector. It was redundant, use the Apply button in the table instead.
- Apply button in the table is more prominent now.
- Added icons to the buttons for better visual feedback.
- Long permission labels are now truncated for better table readability.
- Removed the message display from the table.

## 2025.09.30
@ 2025-09-30
You can now copy the theme preview URL from the Theme Detector popup, with an option to disable the preview bar.


<video controls muted playsinline src="https://bucket.alfred.uptek.com/theme-preview-url-gui.mp4"></video>

## 2025.09.15
@ 2025-09-15
- Fix: Improved theme detection for stores with strict security protocols.

## 2025.09.14
@ 2025-09-14
Introducing the Shopify Theme Detector! Instantly find out what Shopify theme a brand is using.

Navigate to a Shopify store and click the Alfred icon to see the theme information.

- View store URL, theme name, and version.
- Works automatically on any Shopify store, no external API required.

---
- Fix: Background service worker becoming inactive interrupting shortcuts.

## 2025.09.06
@ 2025-09-06
Added a public Feedback & Requests board, allowing users to submit feature requests and provide feedback. Be part of the journey!


## 2025.09.03
@ 2025-09-03
- Toast notifications: Fixed toast notifications positioning when the Shopify preview bar is present
- Admin sidebar: Fixed the sidebar when a sub navigation item is active
- Admin sidebar: Added active item dot indicator for better visual feedback
- Admin sidebar: Added macOS-like magnifying animation to on hover

## 2025.09.02
@ 2025-09-02
Added collapsible sidebar toggle to Shopify Admin. Hide the navigation sidebar to maximize your workspace, giving you more room to focus on managing your store.


<video controls muted playsinline src="https://bucket.alfred.uptek.com/alfred-admin-sidebar.mp4"></video>

## 2025.08.24
@ 2025-08-24
Added toast notifications for better user feedback. Success and error messages now display as visual toast notifications, providing improved UX.


<video controls muted playsinline src="https://bucket.alfred.uptek.com/alfred-notifications.mp4"></video>

## 2025.08.21
@ 2025-08-21
Major settings update! You now have granular control over Alfred's features through the new options page.

- Shortcuts: Choose which shortcuts appear in the right-click context menu
- Collaborator Access Presets: Enable/disable the collaborator access presets feature
- Enhanced Partner Pages: Toggle the enriched table view for app store partner pages
- App Store Search Indexing: Enable/disable position numbers in app store search results
- Customizer Resizers: Toggle individual resize handles for panels in the theme customizer

## 2025.08.12
@ 2025-08-12
- [BTS] Options page migrated to Preact for improved performance and maintainability

## 2025.08.10
@ 2025-08-10
- Fix changelog page on extension update

## 2025.08.09.1
@ 2025-08-09
This release introduces a new setting to manage the theme inspector in the Shopify theme editor. You can configure Alfred to:

- Disable the theme inspector completely
- Remember and restore its previous state automatically
- Keep the default behavior (Alfred will not interfere with the theme inspector)

<video controls muted playsinline src="https://bucket.alfred.uptek.com/theme-inspector.mp4"></video>

## 2025.08.09
@ 2025-08-09
This release introduces a new options page, which will serve as the central hub for all extension settings and preferences. Future releases will populate this page with more configuration options.

- New Options Page: A foundational page for future settings and preferences.
- New Changelog Page: Stay up-to-date with a detailed history of changes and new features.

---
- [BTS] Integrated a new build process to automatically generate and update the changelog.

## 2025.07.28
@ 2025-07-28
Add resizable panels in the theme editor for the primary sidebar, secondary sidebar, and main preview area. This allows for a more flexible and customizable workspace.

- Resizable primary sidebar
- Resizable secondary sidebar
- Resizable main preview area

<video controls muted playsinline src="https://bucket.alfred.uptek.com/resize-theme-editor.mp4"></video>

## 2025.07.22
@ 2025-07-22
- Add indexer for Shopify app search results

<video controls muted playsinline src="https://bucket.alfred.uptek.com/alfred-appstore-indexing.mp4"></video>

---
- [BTS] Switch to CalVer for versioning from SemVer 1.2.5

## 1.2.4
@ 2025-07-05
- Open Section shortcut: Add support for main sections by appending page type to the name

## 1.2.3
@ 2025-07-02
- Use `.shopify-section` to identify section wrapper for Open Section shortcut

## 1.2.2
@ 2025-07-01
- Add apply button to presets table actions column

## 1.2.1
@ 2025-06-27
- Add shortcut to open sections in code editor

<video controls muted playsinline src="https://bucket.alfred.uptek.com/alfred-open-section-in-code-editor.mp4"></video>

## 1.2.0
@ 2025-06-23
- Add import/export for permissions presets
- Add bulk delete for permissions presets

---
- [BTS] Fix analytics disabling in development

## 1.1.0
@ 2025-06-21
- Add custom message support in permission presets

<video controls muted playsinline src="https://bucket.alfred.uptek.com/alfred-permissions-presets-custom-message.mp4"></video>

---
- [BTS] Add analytics tracking system for user actions and time savings

## 1.0.8
@ 2025-06-19
- Rename extension to Alfred
- Add collaborator permission presets

<video controls muted playsinline src="https://bucket.alfred.uptek.com/collaborator-access-presets.mp4"></video>

## 1.0.7
@ 2025-06-15
- New Shortcut: Clear Cart

## 1.0.6
@ 2025-06-12
- New Shortcut: Copy Theme Preview URL

<video controls muted playsinline src="https://bucket.alfred.uptek.com/alfred-copy-theme-preview-url.mp4"></video>

---
- [BTS] Fix: Run main.content at document_start to avoid race condition

## 1.0.5
@ 2025-06-09
- Add context menu to copy cart JSON
- Add fallback for copying to clipboard
- Improve Shopify detection by checking for `window.__st`

## 1.0.4
@ 2025-06-01
- Add context menu to copy product JSON

## 1.0.3
@ 2025-05-25
- [BTS] Register context menu items on service worker startup
- [BTS] Refactor storefront data extraction in context menu
- [BTS] Upgrade packages

## 1.0.2
@ 2025-05-17
- Add context menu to open current page in admin
- Add context menu to open current page in customizer

## 1.0.1
@ 2025-05-09
- [BTS] Add @wxt-dev/auto-icons
- [BTS] Add Chrome extension icon