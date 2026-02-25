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

## Version Bumping Rules (Calendar Versioning - CalVer)

This project uses Calendar Versioning (CalVer) with the format: YYYY.MM.DD or
YYYY.MM.DD.MICRO

### Version Format:

- **YYYY**: 4-digit year (e.g., 2025)
- **MM**: 2-digit month (e.g., 01 for January, 12 for December)
- **DD**: 2-digit day (e.g., 01, 15, 31)
- **MICRO**: Sequential number for multiple releases on the same day (starts at
  1 for the second release)

### Examples:

- First release on January 21, 2025: `2025.01.21`
- Second release on January 21, 2025: `2025.01.21.1`
- Third release on January 21, 2025: `2025.01.21.2`
- First release on January 22, 2025: `2025.01.22`

### Important:

- Always update package.json, wxt.config.ts, and changelog.json when bumping
  versions
- Use the current date (from environment context) for the version - do NOT
  hardcode dates
- The date should come from "Today's date" in the environment context
- First release of the day uses YYYY.MM.DD format (no MICRO version)
- Additional releases on the same day add .MICRO starting at 1
- The MICRO version is omitted on the first release of a new day

## Changelog Updates

Changelog entries are managed through `changelog.json`. This file is the single
source of truth for generating `changelog.md` and the changelog displayed in the
options page.

### How to Add a New Entry:

1.  **Open `changelog.json`:** Locate and open the `changelog.json` file in the
    root of the project.
2.  **Add a new JSON object:** Add a new object to the beginning of the JSON
    array. The object should have the following structure:
    ```json
    {
      "version": "YYYY.MM.DD",
      "date": "YYYY-MM-DD",
      "changes": [
        //... changes go here
      ]
    }
    ```
3.  **Define Changes:** The `changes` array can contain a mix of paragraphs,
    lists, images, and videos.
    - **Paragraph:**
      ```json
      {
        "type": "paragraph",
        "content": "Your changelog message here."
      }
      ```
    - **List:**
      ```json
      {
        "type": "list",
        "content": ["List item 1", "List item 2"]
      }
      ```
    - **Image:**
      ```json
      {
        "type": "image",
        "content": "https://url.to/your/image.png",
        "alt": "Alt text for the image"
      }
      ```
    - **Video:**
      ```json
      {
        "type": "video",
        "content": "https://url.to/your/video.mp4"
      }
      ```

4.  **Run the generator:** After saving your changes to `changelog.json`, the
    `dev` script will automatically regenerate the changelog files. You can also
    run it manually:
    ```bash
    bun run changelog:gen
    ```

