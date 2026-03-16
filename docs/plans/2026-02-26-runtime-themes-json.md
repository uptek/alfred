# Plan: Runtime-Fetched themes.json

## Context

`assets/data/themes.json` (~68KB, 294 themes) is currently bundled statically into the extension via `import themesData from '@/assets/data/themes.json'`. This means every data update requires a new extension release. Moving to runtime fetching allows theme data to stay fresh between releases.

The JSON will be hosted on `bucket.alfred.uptek.com` and cached locally via `chrome.storage.local` with a 24-hour TTL.

## Files to Change

| File                                    | Action                                                          |
| --------------------------------------- | --------------------------------------------------------------- |
| `utils/themesCache.ts`                  | **CREATE** — cache management (fetch, store, TTL, fallback)     |
| `entrypoints/popup/themeStoreLookup.ts` | **MODIFY** — remove static import, make async, use cache        |
| `entrypoints/popup/utils.ts`            | **MODIFY** — add `await` to `lookupThemeStoreEntry()` call      |
| `entrypoints/background/index.ts`       | **MODIFY** — add cache refresh on startup/install + daily alarm |
| `assets/data/themes.json`               | **DELETE** — no longer bundled                                  |

## Step 1: Create `utils/themesCache.ts`

New module with:

- `getThemes()` — returns cached themes if fresh, otherwise fetches from `https://bucket.alfred.uptek.com/themes.json`
- `fetchAndCacheThemes()` — fetches remote JSON, validates, stores in `chrome.storage.local`
- `refreshThemesCacheIfNeeded()` — for background script, silently refreshes if stale
- Cache schema: `{ themes: ThemeStoreEntry[], fetchedAt: number, version: string }`
- TTL: 24 hours
- Cache busts on extension version change
- Fallback: stale cache if fetch fails. If no cache at all, returns empty array.

## Step 2: Modify `entrypoints/background/index.ts`

- Import `refreshThemesCacheIfNeeded`
- Call on background script startup
- Call inside `onInstalled` listener (install + update)

## Step 3: Modify `entrypoints/popup/themeStoreLookup.ts`

- Remove `import themesData from '@/assets/data/themes.json'`
- Import `getThemes` from `@/utils/themesCache`
- Make `lookupThemeStoreEntry` async, call `await getThemes()` inside

## Step 4: Modify `entrypoints/popup/utils.ts`

- Add `await` before `lookupThemeStoreEntry(theme)` (line ~33)
- Function is already async, no other changes needed

## Step 5: Exclude `assets/data/themes.json` from bundle

Keep the file in the repo (used as source for R2 uploads and the `/prune-themes-json` skill) but exclude it from the WXT build so it's not bundled into the extension.

## Step 6: Create `/deploy-themes` skill

Create `.claude/skills/deploy-themes/SKILL.md` that:

- Runs the prune skill first (if data was freshly scraped)
- Uploads `assets/data/themes.json` to Cloudflare R2 via `wrangler r2 object put`

## Verification

1. Build the extension and confirm `themes.json` is not in the output bundle
2. Open popup on a Shopify store — should fetch, cache, and display theme data
3. Open popup again — should use cache (no network request)
4. Clear extension storage, disconnect network — should show graceful fallback (no crash)
5. Check background script logs for alarm registration and refresh
