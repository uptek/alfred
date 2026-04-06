# Changelog

## 2026.04.06
@ 2026-04-06
The Shopify Dev Dashboard now runs in light mode automatically, with a theme toggle in the header to switch between Light, Dark, and System. Your preference is remembered across sessions.


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