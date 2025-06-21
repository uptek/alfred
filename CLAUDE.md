# Project-Specific Instructions for Alfred

## Version Bumping Rules (Strict Semantic Versioning)

When bumping versions, follow strict semantic versioning (MAJOR.MINOR.PATCH):

### Version Bump Guidelines:
- **MAJOR (X.0.0)**: Breaking changes that are not backwards compatible
- **MINOR (x.X.0)**: New features or functionality that are backwards compatible
- **PATCH (x.x.X)**: Bug fixes, documentation updates, or refactoring with no new features

### Commit Type Mapping:
- `feat:` → MINOR version bump (x.X.0)
- `fix:` → PATCH version bump (x.x.X)
- `docs:` → PATCH version bump (x.x.X)
- `style:` → PATCH version bump (x.x.X)
- `refactor:` → PATCH version bump (x.x.X)
- `perf:` → PATCH version bump (x.x.X)
- `test:` → PATCH version bump (x.x.X)
- `chore:` → PATCH version bump (x.x.X)
- `build:` → PATCH version bump (x.x.X)
- Breaking changes (marked with `!` or `BREAKING CHANGE:`) → MAJOR version bump (X.0.0)

### Important:
- If unsure whether a change is a new feature, enhancement, or bug fix, ASK the user before bumping the version
- Always update package.json, wxt.config.ts, and changelog.md when bumping versions
- Use today's date in the changelog entry