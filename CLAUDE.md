# Project-Specific Instructions for Alfred

## WXT Framework

This project uses WXT - a modern framework for building browser extensions.

### Documentation
- Official WXT documentation: https://wxt.dev/guide/installation.html

### Key Points
- Content scripts are placed in `/entrypoints/` with `.content.ts` suffix
- Background scripts use `.background.ts` suffix
- WXT provides auto-imports for common utilities (defineContentScript, browser, etc.)
- TypeScript is fully supported with proper types
- Use Tailwind classes from Shopify's design system when styling elements

## Version Bumping Rules (Calendar Versioning - CalVer)

This project uses Calendar Versioning (CalVer) with the format: YYYY.MM.DD.MICRO

### Version Format:
- **YYYY**: 4-digit year (e.g., 2025)
- **MM**: 2-digit month (e.g., 01 for January, 12 for December)
- **DD**: 2-digit day (e.g., 01, 15, 31)
- **MICRO**: Sequential number for multiple releases on the same day (starts at 0)

### Examples:
- First release on January 21, 2025: `2025.01.21.0`
- Second release on January 21, 2025: `2025.01.21.1`
- First release on January 22, 2025: `2025.01.22.0`

### Important:
- Always update package.json, wxt.config.ts, and changelog.md when bumping versions
- Use the current date (from environment context) for the version - do NOT hardcode dates
- The date should come from "Today's date" in the environment context
- If multiple releases happen on the same day, increment the MICRO version
- The MICRO version resets to 0 on a new day