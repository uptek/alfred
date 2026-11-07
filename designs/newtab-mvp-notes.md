# New tab MVP: notes to test in development

Prototype: `designs/newtab-mvp.html`, packed as `designs/newtab-mvp-ext/`.

## Risks

### "Change back to Google?" disables all of Alfred

The first time an extension replaces the new tab, Chrome shows its own prompt asking whether to keep the new page or change back. Choosing "Change back" disables the whole extension, not just the new tab override, so every admin feature goes off because someone didn't want the new tab. Verified on 2026-10-06 in Chrome for Testing 154 on macOS, updating a build without the override to one with it.

Chromium's `extension_settings_overridden_dialog.cc` matches: "Change back" calls `DisableExtension(id, DISABLE_USER_ACTION)`. The prompt shows on Mac, Windows and ChromeOS (not Linux), for store and unpacked installs alike, and is skipped only for policy force-installed extensions or once someone picks "Keep it". Closing it without choosing asks again next session. Existing users get it on the update that adds the override.

On macOS, Chrome quietly acknowledges every new tab extension already installed the first time a profile runs this check. A fresh profile with the override installed from the start never sees the prompt, so test it as an update.

The new tab can't ship inside Alfred as an override.

### Opting out can't restore another new tab extension

Chrome lets only one extension's override win, and an extension can't turn its own override off while it stays enabled. Opting out sends the tab to `chrome://new-tab-page/` (Chrome's built-in page), so someone who had another new tab extension before Alfred loses it while Alfred is installed. `chrome://newtab` loops back to Alfred. The `management` API lists extensions but not which one overrides the new tab.

A separate "Alfred New Tab" extension avoids this: uninstalling or disabling it hands the new tab back to whatever was there before.

## Known limits of the opt-out

- Every new tab still loads Alfred's page for a moment, then redirects to Chrome's page.
- The address bar shows `chrome://new-tab-page/` instead of staying empty.
- After opting out, people never see Alfred's page again, so the popup needs a "Turn the new tab back on" switch.

## Also to check

- v1 reads two changelogs live: changelog.shopify.com (Platform updates) and shopify.dev (Developer updates), fetched by the page itself, cached in extension storage (`chrome.storage.local`, about 1.4MB) and refreshed once the cache is 30 minutes old. The theme, sidebar state and saved stories live there too. Posts about Shopify Capital, Shopify Credit and Balance are left out (interest-based finance). Videos are built but hidden behind `SHOW_VIDEOS` in `entrypoints/newtab/feed.ts`, and `VIDEOS` stays empty until they get a source. shopify.dev pages frame as is. changelog.shopify.com sends `X-Frame-Options: DENY`, so a session rule scoped to Alfred's own pages removes it from those frames. YouTube embeds rely on one `declarativeNetRequest` session rule scoped to Alfred's own pages (`initiatorDomains: [chrome.runtime.id]`) that sets a `Referer` (they show Error 153 without it). Both rules need `declarativeNetRequestWithHostAccess`, which adds no install warning because Alfred already has `<all_urls>`.
- The `Referer` value for YouTube; the prototype uses `https://uptek.com/`.
- Analytics events: to be decided later.

## Reader idea: render posts from the RSS feed

Both feeds carry each post's full HTML in `<description>`, so the reader could show the post itself instead of framing the live page. That would drop the session rule that strips changelog.shopify.com's `X-Frame-Options: DENY` (which breaks if Shopify adds a CSP `frame-ancestors`, and which a store reviewer may question), work offline from the cache, and let the reader match Alfred's theme. It needs the HTML sanitized before rendering, links opened in a new tab, and relative image URLs resolved against the post's link. The reader frames the live page for now.

## Widget ideas for the widgetised version

Ideas for a later version where people pick the cards on their new tab. The page has to work for merchants, agencies and developers alike, so Home shouldn't lean on developer-only cards. Items 1 and 5 are already built for v1.

1. **Shopify status** (built: Home's rail). The public Statuspage API at `https://www.shopifystatus.com/api/v2/summary.json` gives the overall status, nine services (Admin, Checkout, Storefront, POS and so on), open incidents and scheduled maintenance. It's about 3 KB, allows any origin and is cached for 10 seconds, so every new tab asks again instead of showing a stale "all clear".
2. **This week at Shopify.** A digest of the last 7 days across both changelogs: the posts worth knowing about, and which areas got the most changes.
3. **Follow topics.** Pick areas such as POS, Markets, Checkout or Themes, and Home ranks or filters by them. Personal without an account.
4. **Role picker.** A first-run choice between merchant, agency and developer that decides Home's cards and the feed mix. Developers keep the API calendar.
5. **Search everything** (built: top of Home's feed). Searches every cached post from both changelogs, so it's instant and works offline. `/` focuses it and Enter opens the first result.
6. **Alfred tips.** One rotating card about an Alfred feature: copy buttons on the themes page, the App Store compare tray, storefront password autofill, the dev dashboard sidebar.
7. **Jump back into your stores.** Recently visited admin stores. Alfred only stores its settings today, so this needs new tracking and a privacy note. The biggest lift of the list.
8. **Commerce calendar.** Upcoming selling moments such as BFCM, Eid season, shipping cutoffs and Shopify Editions. The dates need hand upkeep, since Shopify doesn't publish Editions dates far ahead.

Developer-only cards already built, now in the Developer updates rail: the **API calendar** (next version, countdown, which version stops answering next) and **Action required** (the latest posts flagged that way).
