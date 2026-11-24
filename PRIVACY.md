# Alfred extension privacy policy

Effective date: November 24, 2026. This policy covers Alfred - Shopify Theme Detector, the browser extension made by Uptek for Chrome, Edge and Firefox.

Your settings and saved data stay on your device. Alfred sends analytics about how its features are used, which you can turn off, as described under Analytics.

## Data stored on your device

Alfred stores your settings, your collaborator permission presets, a cached copy of a public list of Shopify themes, and a random user ID. If you use storefront password autofill, it also stores the storefront passwords you save, with the store domain they belong to. All of this is kept in the browser's local extension storage. It is not synced to an account and is not sent to the developer.

Alfred does not read your general browser history, your Shopify login, or your Shopify account password. A storefront password is the shared password of a password-protected store, not your account password.

## Requests Alfred makes

Alfred downloads a public list of Shopify themes, and the images and videos shown in its changelog, from bucket.alfred.uptek.com. When you use a feature that reads store or app data, such as Copy Product JSON, Copy Cart JSON, or comparing apps on the Shopify App Store, your browser requests that data from the Shopify site you are on. Like other web requests, these disclose your IP address and ordinary connection information to the receiving service. All executable code is bundled in the extension. Alfred loads no remote code.

## Analytics

To see which features work, Alfred sends analytics to the developer. Every event carries:

- A random user ID that is not tied to your name, email address or Shopify account
- The name of the feature you used, for example "copy theme preview URL"
- An estimate of the time that feature saved
- The Alfred version
- A few details about the action, such as the type of page, how many items were involved, or which filter or sort order you chose

On Chrome and Edge, some events also carry the address of the Shopify App Store page you were on, or the domain of the Shopify store you were working on. On Firefox, Alfred never sends page addresses or store domains.

When storefront password autofill runs, the event carries the length of the password. It never carries the password.

Alfred never sends:

- Your name, email address, or Shopify account details
- Storefront passwords, presets, or your settings
- The content of the pages you visit, or product, cart, or customer data

The random user ID is pseudonymous: it does not say who you are, but it links one browser profile's analytics over time.

Analytics go to api.alfredext.com, a service the developer runs on Cloudflare, and are stored in a Cloudflare database. The developer's database does not store your IP address.

On Chrome and Edge, sharing is on when you install Alfred. You can turn off "Share anonymous usage analytics" in Alfred's settings at any time; Alfred then stops sending immediately. On Firefox, sharing also needs the technical and interaction data permission, so nothing is sent until you grant it, at install or in Alfred's settings, and you can withdraw it there or in about:addons.

If you uninstall Alfred while sharing is on, your browser opens a page that records the uninstall with your random user ID and the Alfred version, then shows an optional feedback form.

## Sharing, sale, and advertising

The developer does not sell your data or share it with third parties, other than Cloudflare, which hosts the analytics service for the developer. Alfred does not include advertising SDKs, third-party analytics SDKs or tracking pixels. Data is used only to provide and improve the features described here, not for advertising, creditworthiness, lending, or unrelated profiling. Alfred will adhere to the Chrome Web Store User Data Policy, including the Limited Use requirements.

## Retention and deletion

Data on your device remains until you change it or uninstall the extension. You can delete saved storefront passwords in Alfred's settings.

## Permissions

Alfred needs access to all sites because a Shopify store can run on any domain. It uses that access to detect Shopify themes and to run the shortcuts you trigger. Context menus, tabs and scripting power the shortcuts. Storage keeps your settings. On Firefox, clipboard access lets the "Copy" shortcuts write to your clipboard.

## Support requests

If you email the developer or contact them through a store listing, the message and any details you choose to include are used to answer your request. Do not include passwords. Email <info@uptek.com> for support or privacy questions.

## Changes

This policy will be updated when Alfred's data practices change. Material changes will also be disclosed in the extension or listing as appropriate.
