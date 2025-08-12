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

## Version Bumping Rules (Semantic Versioning - SemVer)

This project uses Semantic Versioning (SemVer) with the format: MAJOR.MINOR.PATCH

### Version Format:
- **MAJOR**: Incompatible API changes or significant breaking changes
- **MINOR**: New functionality in a backward-compatible manner
- **PATCH**: Backward-compatible bug fixes and minor improvements

### Examples:
- Major release with breaking changes: `2.0.0`
- New feature added: `1.3.0`
- Bug fix or small improvement: `1.3.1`
- Pre-release version: `1.3.2-beta.1`

### When to increment:
- **MAJOR (X.0.0)**:
  - Breaking changes to existing features
  - Removal of deprecated features
  - Major architectural changes
- **MINOR (0.X.0)**:
  - New features or functionality
  - New settings or options
  - Deprecation of existing features (but not removal)
- **PATCH (0.0.X)**:
  - Bug fixes
  - Performance improvements
  - Documentation updates
  - Minor UI tweaks

### Important:
- Always update package.json, wxt.config.ts, and changelog.json when bumping versions
- Start from the current version and increment appropriately based on changes
- When in doubt, prefer incrementing MINOR over PATCH for user-visible changes
- Reset lower version numbers when incrementing higher ones (e.g., 1.2.3 → 2.0.0, not 2.2.3)

## Changelog Updates

Changelog entries are managed through `changelog.json`. This file is the single source of truth for generating `changelog.md` and the changelog displayed in the options page.

### How to Add a New Entry:

1.  **Open `changelog.json`:** Locate and open the `changelog.json` file in the root of the project.
2.  **Add a new JSON object:** Add a new object to the beginning of the JSON array. The object should have the following structure:
    ```json
    {
      "version": "X.Y.Z",
      "date": "YYYY-MM-DD",
      "changes": [
        //... changes go here
      ]
    }
    ```
3.  **Define Changes:** The `changes` array can contain a mix of paragraphs, lists, images, and videos.

    *   **Paragraph:**
        ```json
        {
          "type": "paragraph",
          "content": "Your changelog message here."
        }
        ```
    *   **List:**
        ```json
        {
          "type": "list",
          "content": [
            "List item 1",
            "List item 2"
          ]
        }
        ```
    *   **Image:**
        ```json
        {
          "type": "image",
          "content": "https://url.to/your/image.png",
          "alt": "Alt text for the image"
        }
        ```
    *   **Video:**
        ```json
        {
          "type": "video",
          "content": "https://url.to/your/video.mp4"
        }
        ```
4.  **Run the generator:** After saving your changes to `changelog.json`, the `dev` script will automatically regenerate the changelog files. You can also run it manually:
    ```bash
    bun run changelog:gen
    ```
