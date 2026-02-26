---
name: version-bump
description: Bump version using CalVer (YYYY.MM.DD) and add a changelog entry
---

## CalVer Format

`YYYY.MM.DD` or `YYYY.MM.DD.MICRO` for multiple releases on the same day.

## Steps

1. Get today's date from environment context (the `currentDate` field in CLAUDE.md)
2. Read current version from `package.json` (the `version` field)
3. Determine the new version:
   - If current version matches today's date → append `.MICRO` (starting at `.1`, incrementing if already has micro)
   - Otherwise → use `YYYY.MM.DD` (no micro)
4. Determine what changed by reviewing:
   - Staged and unstaged changes (`git diff --stat`)
   - Recent commits since last version tag (`git log`)
   - Recent entries in `changelog.json` to avoid duplicating already-recorded changes
   - Write a user-facing changelog summary from the changes (not technical commit messages)
5. Update all three files:
   - `package.json` → `"version": "NEW_VERSION"`
   - `wxt.config.ts` → `version: 'NEW_VERSION'`
   - `changelog.json` → prepend new entry to the array
6. Run `bun run changelog:gen` to regenerate changelog files
7. Report the version bump

## Files to update

### package.json
```json
"version": "YYYY.MM.DD"
```

### wxt.config.ts
```ts
version: 'YYYY.MM.DD',
```

### changelog.json

Prepend a new entry to the beginning of the array. The `changes` array supports
mixing the content block types below in any order.

#### Entry structure
```json
{
  "version": "YYYY.MM.DD",
  "date": "YYYY-MM-DD",
  "changes": [ /* content blocks */ ]
}
```

#### Content block types

**Paragraph** — a single descriptive sentence or short paragraph:
```json
{ "type": "paragraph", "content": "Theme data is now fetched at runtime." }
```

**List** — bullet points for multiple related changes:
```json
{ "type": "list", "content": ["Added X feature.", "Improved Y behavior."] }
```

**Image** — screenshot or visual with alt text:
```json
{ "type": "image", "content": "https://bucket.alfred.uptek.com/screenshot.png", "alt": "New feature screenshot" }
```

**Video** — demo video:
```json
{ "type": "video", "content": "https://bucket.alfred.uptek.com/demo.mp4" }
```

#### Typical patterns
- Single feature: one `paragraph`
- Multiple small changes: one `list`
- Feature with demo: `paragraph` + `video` or `paragraph` + `image`
- Mix as needed — the UI renders them in order

## Important

- NEVER hardcode dates — always derive from environment context
- The `date` field in changelog.json uses `YYYY-MM-DD` (hyphens), the `version` field uses `YYYY.MM.DD` (dots)
- Changelog entries should be user-facing (what the user gains), not developer-facing (what code changed)
