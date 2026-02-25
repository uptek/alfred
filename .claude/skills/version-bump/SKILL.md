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
4. Ask the user what changed (for the changelog entry)
5. Update all three files:
   - `package.json` → `"version": "NEW_VERSION"`
   - `wxt.config.ts` → `version: 'NEW_VERSION'`
   - `changelog.json` → prepend new entry to the array
6. Run `bun run changelog:gen` — **ask the user to run this command**
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
Prepend to the beginning of the array:
```json
{
  "version": "YYYY.MM.DD",
  "date": "YYYY-MM-DD",
  "changes": [
    { "type": "paragraph", "content": "..." },
    { "type": "list", "content": ["...", "..."] },
    { "type": "image", "content": "https://...", "alt": "..." },
    { "type": "video", "content": "https://..." }
  ]
}
```

## Important

- NEVER hardcode dates — always derive from environment context
- The `date` field in changelog.json uses `YYYY-MM-DD` (hyphens), the `version` field uses `YYYY.MM.DD` (dots)
- Ask the user to run `bun run changelog:gen` after updating
