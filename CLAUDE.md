# Project-Specific Instructions for Alfred

## Important Commands

**NEVER run `bun run dev` or `bun run build` directly. Always ask the user to
run these commands for you.**

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
- Use Tailwind classes from Shopify's design system when styling elements

## Version Bumping & Changelog

When bumping the version or updating the changelog, use the `/version-bump`
skill. It handles CalVer format, file updates, and changelog entries.

## Pruning Theme Data

When `assets/data/themes.json` is updated with fresh scraped data, use the
`/prune-themes-json` skill to strip unused fields.
