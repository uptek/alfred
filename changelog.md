# Changelog

## 2025.09.14
@ 2025-09-14
Introducing the Shopify Theme Detector! Instantly find out what Shopify theme a brand is using.

- View store URL, theme name, and version.
- Works automatically on any Shopify store, no external API required.

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