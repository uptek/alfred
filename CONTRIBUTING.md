# Contributing to Alfred

Thanks for your interest in contributing to Alfred! This guide will help you get
started.

## Prerequisites

- [Bun](https://bun.sh/) (v1.4+)
- Chrome

## Development Setup

```bash
# Clone the repo
git clone https://github.com/uptek/alfred.git
cd alfred

# Install dependencies
bun install

# Start development (opens Chrome with the extension hot-reloading)
bun run dev
```

WXT handles the browser extension dev workflow — it opens a browser instance with
the extension loaded and hot-reloads on file changes.

## Project Structure

Alfred uses [WXT](https://wxt.dev), a modern framework for browser extensions.

```
entrypoints/          # Extension entry points
  *.content.ts        # Content scripts (injected into web pages)
  *.content/          # Content scripts with UI (Svelte components)
  background/         # Background service worker
  popup/              # Extension popup UI
  options/            # Options/settings page
utils/                # Shared utilities
assets/               # Static assets (icons, data)
supabase/             # Edge functions and database views
```

Key conventions:

- Content scripts use `.content.ts` suffix or `.content/` directories
- UI components are **Svelte 5** with Runes API (`$state`, `$props`, `$effect`)
- Styling uses Tailwind CSS classes

## Code Style

The project uses Rust-based tooling for speed:

```bash
# Lint
bun run lint

# Auto-fix lint issues
bun run lint:fix

# Format code
bun run format

# Check formatting without writing
bun run format:check

# Type check
bun run typecheck
```

Please run `bun run lint` and `bun run format` before submitting a PR.

## Testing

Unit tests use Bun's built-in test runner:

```bash
bun test
```

Test files live in a `tests/` subfolder beside the code they cover, with a
`.test.ts` suffix (e.g. `entrypoints/popup/tests/robots.test.ts`), and are
excluded from `tsconfig.json`. Bun has no DOM, so tests that need one build it
with [linkedom](https://github.com/WebReflection/linkedom): assign its globals to
`globalThis` before importing the module under test and restore them in
`afterAll`, since all test files share one process (see
`utils/tests/toast.test.ts`). linkedom differs from browsers in ways tests have
to work around: its MutationObserver reports attribute changes on descendants
only when `childList` is observed too, `:disabled` doesn't match controls inside
a disabled `<fieldset>`, and a `tabIndex` of 0 reads back as -1.

If you add, rename, or remove an analytics event in
`utils/analytics-actions.ts`, run `bun run track:gen` to regenerate
`supabase/functions/track/valid-actions.gen.ts`. A parity test fails `bun test`
when the generated file is stale.

## Submitting Changes

1. Fork the repo and create a branch from `main`
2. Make your changes
3. Run `bun run lint`, `bun run format`, and `bun test`
4. Commit using [Conventional Commits](https://www.conventionalcommits.org/):
   `feat: add new feature` / `fix: resolve bug` / `chore: update deps`
5. Open a pull request against `main`

## What to Expect in Review

- PRs are reviewed by maintainers for code quality and consistency
- We use squash merges to keep history clean
- Feedback is meant to be constructive — don't hesitate to ask questions

## Finding Things to Work On

Look for issues labeled [`good first issue`](https://github.com/uptek/alfred/labels/good%20first%20issue)
or [`help wanted`](https://github.com/uptek/alfred/labels/help%20wanted).

## Questions?

Open an [issue](https://github.com/uptek/alfred/issues) or comment on an
existing one.
