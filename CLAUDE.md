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
- Options page uses Shopify Polaris web components (custom elements, not Svelte
  components) with polyfill helpers in `utils/polaris.polyfill.ts`

## Version Bumping & Changelog

When bumping the version or updating the changelog, use the `/version-bump`
skill. It handles CalVer format, file updates, and changelog entries.

## Pruning Theme Data

When `assets/data/themes.json` is updated with fresh scraped data, use the
`/prune-themes-json` skill to strip unused fields.
