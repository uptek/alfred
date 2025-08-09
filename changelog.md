# Changelog

## 2025.07.28.1
@ 2025-07-28
This release introduces a new options page, which will serve as the central hub for all extension settings and preferences. Future releases will populate this page with more configuration options.

- New Options Page: A foundational page for future settings and preferences.
- New Changelog Page: Stay up-to-date with a detailed history of changes and new features.

---
- [DEV] Integrated a new build process to automatically generate and update the changelog.

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
- Switch to CalVer for versioning

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

## 1.2.0
@ 2025-06-23
- Add import/export for permissions presets
- Add bulk delete for permissions presets
- Fix analytics disabling in development

## 1.1.0
@ 2025-06-21
- Add analytics tracking system for user actions and time savings
- Add custom message support in permission presets

## 1.0.8
@ 2025-06-19
- Rename extension to Alfred
- Add collaborator permission presets

## 1.0.7
@ 2025-06-15
- New Shortcut: Clear Cart

## 1.0.6
@ 2025-06-12
- New Shortcut: Copy Theme Preview URL
- Fix: Run main.content at document_start to avoid race condition

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
- Register context menu items on service worker startup
- Refactor storefront data extraction in context menu
- Upgrade packages

## 1.0.2
@ 2025-05-17
- Add context menu to open current page in admin
- Add context menu to open current page in customizer

## 1.0.1
@ 2025-05-09
- Add @wxt-dev/auto-icons
- Add Chrome extension icon