# Alfred — Developer Tools for Shopify

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![CI](https://github.com/uptek/alfred/actions/workflows/ci.yml/badge.svg)](https://github.com/uptek/alfred/actions/workflows/ci.yml)
[![Chrome Web Store](https://img.shields.io/chrome-web-store/users/jbdcmokdibodbplhjcajgcbmnflcchbi)](https://chromewebstore.google.com/detail/jbdcmokdibodbplhjcajgcbmnflcchbi)

A browser extension that streamlines your Shopify workflow. Built by a developer
who got tired of clicking through endless menus.

## Features

- **Theme Inspector** — detect what theme any Shopify store is running, with
  links to the theme store listing, documentation, and demo
- **Smart Shortcuts**
  - Copy Theme Preview URL
  - Open in Admin (products, collections, pages, articles)
  - Open in Customizer with current page pre-loaded
  - Copy Product JSON / Cart JSON
  - Clear Cart
  - Open Section in Code Editor
- **Theme Customizer Enhancements**
  - Draggable panel resizers for the customizer layout
  - Theme inspector auto-toggle (always on/off/remember last state)
  - Theme list utilities — copy preview URLs, quick actions per theme
- **Admin Sidebar Collapse** — toggle the Shopify admin sidebar for more
  screen space
- **Code Editor Close Warning** — prevents accidental tab close (Cmd+W) in the
  theme code editor
- **Collaborator Permission Presets**
  - Save frequently used permissions as reusable presets
  - Apply presets instantly when requesting collaborator access
  - Import/export presets to share with your team
- **App Store Partner Page** — transform the partner page into a clean,
  scannable table
- **App Store Search Indexing** — adds position numbers to app search results
- **Storefront Password Autofill** — auto-fill storefront passwords on
  password-protected stores
- **Dev Dashboard Dark Mode** — adds a light/dark/system theme toggle to
  dev.shopify.com
- **Cartograph** — visual cart editor for inspecting and modifying cart contents,
  metadata, and shipping details

## Install

[Chrome Web Store](https://chromewebstore.google.com/detail/jbdcmokdibodbplhjcajgcbmnflcchbi)

## Development

### Prerequisites

- [Bun](https://bun.sh/) (v1.2+)
- Chrome

### Setup

```bash
git clone https://github.com/uptek/alfred.git
cd alfred
bun install
bun run dev
```

This opens Chrome with Alfred loaded and hot-reloading on file changes.

### Available Commands

| Command             | Description               |
| ------------------- | ------------------------- |
| `bun run dev`       | Development mode (Chrome) |
| `bun run build`     | Production build          |
| `bun run lint`      | Run linter (oxlint)       |
| `bun run format`    | Format code (oxfmt)       |
| `bun run typecheck` | TypeScript validation     |

### Project Structure

```
entrypoints/          # Extension entry points
  *.content.ts        # Content scripts (injected into web pages)
  *.content/          # Content scripts with UI (Svelte components)
  background/         # Background service worker
  popup/              # Extension popup UI
  options/            # Options/settings page
utils/                # Shared utilities
assets/               # Static assets (icons, data)
supabase/             # Edge functions and database views
```

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for setup instructions and guidelines.

## License

[MIT](LICENSE)
