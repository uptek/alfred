# Project-Specific Instructions for Alfred

## Important Commands

**NEVER run `bun run dev` directly. Always ask the user to run these commands for you.**

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
- Use Tailwind classes from Shopify's design system when styling elements

## Version Bumping & Changelog

When bumping the version or updating the changelog, use the `/version-bump`
skill. It handles CalVer format, file updates, and changelog entries.

## Analytics Events

When adding or removing values from the `AnalyticsAction` type in
`utils/analytics.ts`, also update the `VALID_ACTIONS` array in
`supabase/functions/track/index.ts` to match. Then deploy:

```bash
supabase functions deploy track --project-ref obrjirdnqoiailhbsnmu
```

## Pruning Theme Data

When `assets/data/themes.json` is updated with fresh scraped data, use the
`/prune-themes-json` skill to strip unused fields.

## Skill routing

When the user's request matches an available skill, ALWAYS invoke it using the Skill
tool as your FIRST action. Do NOT answer directly, do NOT use other tools first.
The skill has specialized workflows that produce better results than ad-hoc answers.

Key routing rules:
- Product ideas, "is this worth building", brainstorming → invoke office-hours
- Bugs, errors, "why is this broken", 500 errors → invoke investigate
- Ship, deploy, push, create PR → invoke ship
- QA, test the site, find bugs → invoke qa
- Code review, check my diff → invoke review
- Update docs after shipping → invoke document-release
- Weekly retro → invoke retro
- Design system, brand → invoke design-consultation
- Visual audit, design polish → invoke design-review
- Architecture review → invoke plan-eng-review
- Save progress, checkpoint, resume → invoke checkpoint
- Code quality, health check → invoke health
