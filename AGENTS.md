## WXT

- Auto-imported types can't be used as global types: import them with
  `import type { ContentScriptContext } from '#imports'`

## Online Store Iframe

Admin's Online Store pages (themes list, theme editor) render inside a
cross-origin `online-store-web.shopifyapps.com` iframe, matched by
`theme-customizer.content` with `allFrames`. Browser automation can't read its
DOM, and opening its URL top-level redirects back to admin, so get markup by
running `copy(document.body.outerHTML)` in DevTools with that frame selected.
The iframe navigates client-side, so per-page features re-check the path on
`wxt:locationchange`.

## Dev & Build

- `bun run dev` launches `CHROME_TESTING_BINARY` (from `.env`) against the
  persistent profile `.wxt/chrome-data`. Chrome can't run a profile last
  opened by a newer major version: it crashes on startup with "CDP connection
  closed before response to Extensions.loadUnpacked". Never open that profile
  with another Chrome. To upgrade, run
  `bunx @puppeteer/browsers install chrome@stable --path <dir>` and point
  `.env` at the new binary
- `bun run build` starts with `rm -rf .output`, which also deletes the dev
  build (`.output/chrome-mv3-dev`) that Chrome may have loaded unpacked

## Testing

- Unit tests use Bun's built-in test runner: `bun test` (no package.json script
  needed)
- Test files live in a `tests/` subfolder beside the code they cover (e.g.
  `entrypoints/popup/tests/`, `utils/tests/`) with a `.test.ts` suffix
- Bun has no DOM. Tests that need one use `linkedom` (`parseHTML`): assign its
  globals to `globalThis` before importing the module under test and restore
  them in `afterAll`, since all test files share one process (see
  `utils/tests/toast.test.ts`)
- linkedom differs from browsers in ways tests have to work around: its
  MutationObserver reports attribute changes on descendants only when
  `childList` is observed too, `:disabled` doesn't match controls inside a
  disabled `<fieldset>`, and a `tabIndex` of 0 reads back as -1
- `bun run testpages` serves the visual fixture site in `test-pages/` at
  http://localhost:4242. See `test-pages/README.md` for conventions

## Analytics

Events live in `utils/analytics-actions.ts` (`ANALYTICS_ACTIONS`, the source of
truth). The extension posts them to `https://api.alfredext.com/track`. That
host is the `alfred-api` Cloudflare Worker (`worker/`, Uptek account), which
routes by path, so new server endpoints go there too. `/track` imports the same
list as its allowlist and writes to the D1 database `alfred-events`. CI runs
`bun run deploy:worker` (D1 migrations, then `wrangler deploy`) on every push
to `main`. Migrations apply while the previous Worker is still live, so keep
them additive: new columns need defaults, and drops or renames wait for a later
release. Query with `bunx wrangler d1 execute alfred-events --remote -c
worker/wrangler.jsonc --command "..."`, bounding `created_at` (ISO text) with
`strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '-7 days')`, not `datetime()`. Wrangler needs
`CLOUDFLARE_ACCOUNT_ID` in `.env` (see `.env.example`); Cloudflare account and
resource IDs never go in the repo.

## Version Bumping & Changelog

Use the `/version-bump` skill, including inside `/ship`.

Pushes to `main` that change the `package.json` version auto-publish to the
Chrome Web Store (`publish` job in `.github/workflows/ci.yml`, `wxt submit` on
CWS API v2 with a service account). Merges without a version bump skip it.
