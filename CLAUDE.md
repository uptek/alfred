## WXT Framework

This project uses WXT - a modern framework for building browser extensions.

### Documentation

- Official WXT documentation: https://wxt.dev/guide/installation.html

### Key Points

- Content scripts are placed in `/entrypoints/` with `.content.ts` suffix
- Background scripts use `.background.ts` suffix
- WXT provides auto-imports for common utilities (defineContentScript, browser,
  etc.)
- TypeScript is fully supported with proper types
- **UI framework: Svelte 5** with Runes API ($state, $props, $effect, $derived)
- All UI components use `.svelte` files — no JSX/TSX
- Uses `@wxt-dev/module-svelte` for WXT integration
- Content scripts use `mount()`/`unmount()` from Svelte with `createIntegratedUi`
  or `createShadowRootUi` from WXT
- Options page settings use a module-level Svelte store
  (`entrypoints/options/stores/settings.svelte.ts`)
- Popup per-tab view state uses a module-level Svelte store
  (`entrypoints/popup/stores/tabState.svelte.ts`) backed by
  `chrome.storage.session`, keyed by tab id and stamped with the page URL. App
  and tab components hydrate from it on open and push snapshots back; it busts on
  navigation and is cleared on tab close via `tabs.onRemoved` in the background
- Options page uses Shopify Polaris web components (custom elements, not Svelte
  components) with polyfill helpers in `utils/polaris.polyfill.ts`

## Visual Test Pages

`bun run testpages` serves `test-pages/` at http://localhost:4242 — a fixture
site with one folder per popup tab (headings, links, images, assets, theme,
robots) and one page per scenario. Each page states the expected popup output
in a blue panel. The index is auto-generated; adding a scenario is just adding
an `.html` file. See `test-pages/README.md` for conventions (no heading tags
in page chrome, referer-based robots.txt fixtures).

## Testing

- Unit tests use Bun's built-in test runner: `bun test` (no package.json script
  needed)
- Test files live in a `tests/` subfolder beside the code they cover (e.g.
  `entrypoints/popup/tests/`, `utils/tests/`) with a `.test.ts` suffix, and are
  excluded from `tsconfig.json`
- Analytics events live in `utils/analytics-actions.ts` (`ANALYTICS_ACTIONS`,
  the source of truth); the Supabase track function imports
  `valid-actions.gen.ts`, generated from it via `bun run track:gen` (run
  automatically by `bun run deploy:track`). A parity test fails `bun test`
  when the generated file is stale

## Version Bumping & Changelog

When bumping the version or updating the changelog, use the `/version-bump`
skill. It handles CalVer format, file updates, and changelog entries.

## Pruning Theme Data

When `assets/data/themes.json` is updated with fresh scraped data, use the
`/prune-themes-json` skill to strip unused fields.
