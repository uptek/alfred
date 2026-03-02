# Task 02: Svelte Setup

**Phase**: 1 — UI Skeleton
**Files to modify**:
- `package.json`
- `wxt.config.ts`

## Objective

Add Svelte as a framework alongside the existing Preact setup. WXT + Vite supports multiple frameworks — `.svelte` files compile through the Svelte compiler while `.tsx` files continue through Preact. No existing code is affected.

## Steps

### 2.1 Install dependencies

```bash
bun add -d svelte @sveltejs/vite-plugin-svelte
```

### 2.2 Update `wxt.config.ts`

Add the Svelte Vite plugin alongside the existing Preact plugin:

```typescript
import { svelte } from '@sveltejs/vite-plugin-svelte';

export default defineConfig({
  // ... existing config ...
  vite: () => ({
    plugins: [preact(), tailwindcss(), svelte()],
  }),
});
```

**Important**: The Svelte plugin should work alongside the Preact plugin without conflicts. Vite routes files by extension — `.svelte` goes to Svelte, `.tsx` goes to Preact.

### 2.3 Add `cart-superpowers-world.js` to web_accessible_resources

In the `manifest.web_accessible_resources` array, add a new entry:

```typescript
{
  resources: ['cart-superpowers-world.js'],
  matches: ['<all_urls>'],
},
```

This makes the unlisted world script injectable via `injectScript()` when needed (Phase 2).

### 2.4 Verify the build

Run the build to confirm:
- Existing Preact entrypoints (popup, options, content scripts) still compile without errors
- The new Svelte plugin doesn't interfere with existing code
- No TypeScript errors introduced

## Acceptance Criteria

- `svelte` and `@sveltejs/vite-plugin-svelte` are in `devDependencies`
- `wxt.config.ts` has both `preact()` and `svelte()` plugins
- `cart-superpowers-world.js` is in `web_accessible_resources`
- Build succeeds with no regressions to existing entrypoints
- No changes to any existing component or content script files

## Notes

- We are NOT creating any Svelte components yet — just setting up the toolchain
- The Svelte plugin configuration may need `compilerOptions` for Svelte 5 runes mode — verify during setup
- If there are plugin ordering issues, try placing `svelte()` before `preact()` in the plugins array
