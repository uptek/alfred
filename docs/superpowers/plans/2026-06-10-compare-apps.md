# Compare Shopify Apps Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let users collect Shopify apps into a persistent tray while browsing the App Store and view them side-by-side at `apps.shopify.com/compare/<handle1>,<handle2>`, with markdown export.

**Architecture:** Two new WXT content scripts (a tray/buttons script matching all of `apps.shopify.com`, and a comparison page script that takes over the server's 404 page at `/compare/<handles>`), plus two shared utils (`appListing.ts` listing fetcher/parser, `compareTray.ts` storage wrapper). Everything is gated behind a new `appStore.compareApps` setting. The comparison URL is the single source of truth; listings are fetched fresh (same-origin) when the page opens.

**Tech Stack:** WXT, Svelte 5 (Runes), TypeScript, `wxt/utils/storage` (via `utils/storage.ts`), vanilla DOM injection for buttons (matching `appstore-search.content.ts` patterns).

**Spec:** `docs/superpowers/specs/2026-06-10-compare-apps-design.md`

**Verified DOM/data anchors (probed live 2026-06-10):**

- `apps.shopify.com/compare` 301-redirects to `/`; `/compare/<anything>` returns a 404 HTML page with site `<header>`, `<nav>`, and `<main class="tw-grow">` intact. Content scripts run on it.
- Listing pages embed JSON-LD `SoftwareApplication` (`name`, `description`, `image[]`, `brand`, `aggregateRating.ratingValue/ratingCount`).
- Stable listing section IDs: `#adp-hero`, `#adp-pricing`, `#adp-details-section`, `#adp-developer`, `#adp-reviews`.
- Pricing plan cards: `#adp-pricing .app-details-pricing-plan-card` with `[data-test-id="name"]`, `h3.app-details-pricing-format-group[aria-label]` (e.g. `"$15/month"`, `"Free"`), `[data-test-id="price"]`, `[data-test-id="features"] li`. Free apps have NO plan cards — the hero `<dl>` has `<dt>Pricing</dt><dd>…Free…</dd>` instead.
- Hero: `<h1>` app name; `.built-for-shopify-badge-container` present only for BFS apps (scope to `#adp-hero` — similar-apps cards elsewhere use `.built-for-shopify-badge`).
- Detail rows are `<p>Label</p>` followed by a sibling element: `Works with` → `<ul>` of links, `Languages` → `<div><p>text</p></div>`, `Launched` → `<p>June 25, 2015 · <a>changelog</a></p>`.
- Category links: `#adp-details-section a[href*="/categories/"]` (do NOT query document-wide — the nav menu also links to categories).
- Search/partner-page cards: `[data-controller="app-card"]` with `data-app-card-handle-value`, `data-app-card-name-value`, `data-app-card-icon-url-value`; the existing index badge appends into `card.querySelector('figure')?.nextElementSibling`.

**Conventions:** single-line conventional commits, no attribution lines. Do NOT run `bun run dev` or `bun run build` — the user has HMR running. `bun run typecheck` / `bun run lint` are the commit gates. No test runner exists in this repo; verification is typecheck + lint + the manual QA task at the end.

---

### Task 1: Setting + types plumbing

**Files:**

- Modify: `global.d.ts:61-64` (appStore block) and append new interfaces after `AlfredSettings`
- Modify: `entrypoints/options/stores/settings.svelte.ts:30-33` (defaults)
- Modify: `entrypoints/options/components/settings/AppStoreSettings.svelte:6-9` (settings list)

- [ ] **Step 1: Add `compareApps` to `AlfredSettings.appStore` in `global.d.ts`**

Replace the `appStore` block:

```ts
  appStore?: {
    searchIndexing?: boolean;
    enhancedPartnerPages?: boolean;
    compareApps?: boolean;
  };
```

- [ ] **Step 2: Declare the compare data interfaces in `global.d.ts`**

Insert after the closing brace of `declare interface AlfredSettings { … }` (currently line 73):

```ts
declare interface AppListingPlan {
  name?: string;
  price?: string;
  features: string[];
}

declare interface AppListing {
  handle: string;
  url: string;
  name?: string;
  tagline?: string;
  iconUrl?: string;
  developerName?: string;
  developerUrl?: string;
  rating?: number;
  reviewCount?: number;
  builtForShopify: boolean;
  pricingSummary?: string;
  plans: AppListingPlan[];
  hasFreePlan: boolean;
  hasFreeTrial: boolean;
  worksWith: string[];
  launchDate?: string;
  languages?: string;
  categories: string[];
}

declare interface CompareTrayItem {
  handle: string;
  name: string;
  iconUrl?: string;
}
```

- [ ] **Step 3: Add the default in `entrypoints/options/stores/settings.svelte.ts`**

```ts
  appStore: {
    searchIndexing: true,
    enhancedPartnerPages: true,
    compareApps: true
  },
```

- [ ] **Step 4: Add the options toggle in `AppStoreSettings.svelte`**

Append to the `settingsItems` array:

```ts
    {
      key: 'compareApps',
      label: 'Compare Apps',
      details: 'Adds "Add to compare" buttons to app cards and listings, with a side-by-side comparison view'
    }
```

- [ ] **Step 5: Verify**

Run: `bun run typecheck`
Expected: exit 0.

- [ ] **Step 6: Commit**

```bash
git add global.d.ts entrypoints/options/stores/settings.svelte.ts entrypoints/options/components/settings/AppStoreSettings.svelte
git commit -m "feat(appstore): add compareApps setting and compare types"
```

---

### Task 2: Analytics actions

**Files:**

- Modify: `utils/analytics.ts` (three exhaustive maps — typecheck fails if any is missed)

- [ ] **Step 1: Extend the `AnalyticsAction` union**

After `| 'appstore_partner_table_export'` (line 21) add:

```ts
  | 'compare_add_app'
  | 'compare_view'
  | 'compare_export_markdown'
```

- [ ] **Step 2: Add `TIME_SAVINGS` entries**

After the `appstore_partner_table_export` entry (line 101) add:

```ts
  compare_add_app: 5,
  compare_view: (metadata) => Number(metadata?.app_count ?? 0) * 45,
  compare_export_markdown: 60,
```

- [ ] **Step 3: Add `ACTION_CATEGORIES` entries**

After `appstore_partner_table_export: 'App Store',` (line 222) add:

```ts
  compare_add_app: 'App Store',
  compare_view: 'App Store',
  compare_export_markdown: 'App Store',
```

- [ ] **Step 4: Verify**

Run: `bun run typecheck`
Expected: exit 0 (the `Record<AnalyticsAction, …>` types enforce completeness).

- [ ] **Step 5: Commit**

```bash
git add utils/analytics.ts
git commit -m "feat(analytics): add compare apps tracking actions"
```

---

### Task 3: Compare tray storage util

**Files:**

- Create: `utils/compareTray.ts`

- [ ] **Step 1: Write `utils/compareTray.ts`**

```ts
import { storage } from '#imports';
import { getItem, setItem } from '~/utils/storage';

export const COMPARE_TRAY_KEY = 'compareTray';
export const COMPARE_TRAY_LIMIT = 4;

export type AddToTrayResult = 'added' | 'duplicate' | 'full';

/**
 * Get the current compare tray contents. A missing or corrupt value is
 * treated as an empty tray.
 */
export async function getTray(): Promise<CompareTrayItem[]> {
  const items = await getItem<CompareTrayItem[]>(COMPARE_TRAY_KEY);
  return Array.isArray(items) ? items : [];
}

/**
 * Add an app to the compare tray.
 * @returns 'added' on success, 'duplicate' if already present, 'full' at the limit
 */
export async function addToTray(item: CompareTrayItem): Promise<AddToTrayResult> {
  const items = await getTray();

  if (items.some((existing) => existing.handle === item.handle)) {
    return 'duplicate';
  }

  if (items.length >= COMPARE_TRAY_LIMIT) {
    return 'full';
  }

  await setItem(COMPARE_TRAY_KEY, [...items, item]);
  return 'added';
}

export async function removeFromTray(handle: string): Promise<void> {
  const items = await getTray();
  await setItem(
    COMPARE_TRAY_KEY,
    items.filter((item) => item.handle !== handle)
  );
}

export async function clearTray(): Promise<void> {
  await setItem(COMPARE_TRAY_KEY, []);
}

/**
 * Watch the tray for changes (fires across tabs via storage events).
 * @returns unwatch function
 */
export function watchTray(callback: (items: CompareTrayItem[]) => void): () => void {
  return storage.watch<CompareTrayItem[]>(`local:${COMPARE_TRAY_KEY}`, (items) => {
    callback(Array.isArray(items) ? items : []);
  });
}
```

- [ ] **Step 2: Verify**

Run: `bun run typecheck`
Expected: exit 0.

- [ ] **Step 3: Commit**

```bash
git add utils/compareTray.ts
git commit -m "feat(appstore): add compare tray storage util"
```

---

### Task 4: App listing fetcher/parser

**Files:**

- Create: `utils/appListing.ts`

- [ ] **Step 1: Write `utils/appListing.ts`**

```ts
const APP_STORE_ORIGIN = 'https://apps.shopify.com';

interface ListingJsonLd {
  '@type'?: string;
  name?: string;
  description?: string;
  image?: string[];
  brand?: string | { name?: string };
  aggregateRating?: { ratingValue?: number; ratingCount?: number };
}

function parseJsonLd(doc: Document): ListingJsonLd | null {
  const scripts = doc.querySelectorAll('script[type="application/ld+json"]');

  for (const script of scripts) {
    try {
      const data = JSON.parse(script.textContent ?? '') as ListingJsonLd;
      if (data['@type'] === 'SoftwareApplication') {
        return data;
      }
    } catch {
      // Malformed JSON-LD block — keep looking
    }
  }

  return null;
}

/**
 * Listing detail rows are a label element (<p>/<dt>) followed by a sibling
 * holding the value, e.g. <p>Works with</p><ul>…</ul>. Returns the sibling.
 */
function findLabelledSibling(doc: Document, label: string): Element | null {
  for (const el of doc.querySelectorAll('p, dt')) {
    if (el.textContent?.trim().toLowerCase() === label) {
      return el.nextElementSibling;
    }
  }
  return null;
}

function cleanText(value: string | null | undefined): string | undefined {
  const cleaned = value?.replace(/\s+/g, ' ').trim();
  return cleaned || undefined;
}

/**
 * Parse a Shopify App Store listing page into structured data.
 * Resilient by design: every selector miss yields undefined/empty, never a throw.
 */
export function parseAppListing(html: string, handle: string): AppListing {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const jsonLd = parseJsonLd(doc);
  const hero = doc.querySelector('#adp-hero');

  const plans: AppListingPlan[] = Array.from(doc.querySelectorAll('#adp-pricing .app-details-pricing-plan-card')).map(
    (card) => ({
      name: cleanText(card.querySelector('[data-test-id="name"]')?.textContent),
      price:
        cleanText(card.querySelector('.app-details-pricing-format-group')?.getAttribute('aria-label')) ??
        cleanText(card.querySelector('[data-test-id="price"]')?.textContent),
      features: Array.from(card.querySelectorAll('[data-test-id="features"] li'))
        .map((li) => cleanText(li.textContent) ?? '')
        .filter(Boolean)
    })
  );

  // Free apps have no plan cards; the hero <dl> carries a pricing summary
  // (duplicated in two responsive <div>s — take the first).
  const pricingDd = findLabelledSibling(doc, 'pricing');
  const pricingSummary = cleanText((pricingDd?.querySelector('div') ?? pricingDd)?.textContent);

  const launchDate = cleanText(findLabelledSibling(doc, 'launched')?.textContent?.split('·')[0]);

  const worksWith = Array.from(findLabelledSibling(doc, 'works with')?.querySelectorAll('li') ?? [])
    .map((li) => cleanText(li.textContent) ?? '')
    .filter(Boolean);

  const languages = cleanText(findLabelledSibling(doc, 'languages')?.textContent);

  const categories = [
    ...new Set(
      Array.from(doc.querySelectorAll('#adp-details-section a[href*="/categories/"]'))
        .map((a) => cleanText(a.textContent) ?? '')
        .filter(Boolean)
    )
  ];

  const developerHref = doc.querySelector('#adp-developer a[href*="/partners/"]')?.getAttribute('href');
  const brand = jsonLd?.brand;

  const pricingText = [pricingSummary, ...plans.flatMap((plan) => [plan.price, ...plan.features])]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();

  return {
    handle,
    url: `${APP_STORE_ORIGIN}/${handle}`,
    name: jsonLd?.name ?? cleanText(hero?.querySelector('h1')?.textContent),
    tagline: jsonLd?.description,
    iconUrl: jsonLd?.image?.[0],
    developerName: typeof brand === 'string' ? brand : brand?.name,
    developerUrl: developerHref ? new URL(developerHref, APP_STORE_ORIGIN).href : undefined,
    rating: jsonLd?.aggregateRating?.ratingValue,
    reviewCount: jsonLd?.aggregateRating?.ratingCount,
    builtForShopify: Boolean(hero?.querySelector('.built-for-shopify-badge-container')),
    pricingSummary,
    plans,
    hasFreePlan: pricingText.includes('free plan') || plans.some((plan) => plan.price?.toLowerCase() === 'free'),
    hasFreeTrial: pricingText.includes('free trial'),
    worksWith,
    launchDate,
    languages,
    categories
  };
}

/**
 * Fetch and parse a listing. Same-origin when called from an
 * apps.shopify.com content script. Throws on HTTP/network failure
 * (callers render an error column).
 */
export async function fetchAppListing(handle: string): Promise<AppListing> {
  const response = await fetch(`${APP_STORE_ORIGIN}/${handle}`, {
    headers: { Accept: 'text/html' }
  });

  if (!response.ok) {
    throw new Error(`Could not load listing for "${handle}" (HTTP ${response.status})`);
  }

  return parseAppListing(await response.text(), handle);
}
```

- [ ] **Step 2: Verify**

Run: `bun run typecheck`
Expected: exit 0. (Functional verification happens in Task 7 against live listings — one free app like `magic-bundles`, one paid BFS app like `judgeme`.)

- [ ] **Step 3: Commit**

```bash
git add utils/appListing.ts
git commit -m "feat(appstore): add app listing fetcher and parser"
```

---

### Task 5: Tray + add-to-compare buttons content script

**Files:**

- Create: `entrypoints/appstore-compare-tray.content/index.ts`
- Create: `entrypoints/appstore-compare-tray.content/buttons.ts`
- Create: `entrypoints/appstore-compare-tray.content/Tray.svelte`

- [ ] **Step 1: Write `entrypoints/appstore-compare-tray.content/buttons.ts`** (vanilla DOM injection, mirroring `appstore-search.content.ts`)

```ts
import { sendTrackEvent } from '@/utils/analytics';
import { addToTray, removeFromTray, getTray, watchTray, COMPARE_TRAY_LIMIT } from '~/utils/compareTray';
import { Toast } from '~/utils/toast';

const BUTTON_CLASS = 'alfred-compare-button';
const STYLE_ID = 'alfred-compare-button-styles';

const BUTTON_STYLES = `
  .${BUTTON_CLASS} {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    align-self: start;
    padding: 2px 8px;
    border: 1px solid rgba(26, 26, 26, 0.3);
    border-radius: 4px;
    background: #ffffff;
    color: #1a1a1a;
    font-size: 12px;
    font-weight: 550;
    line-height: 18px;
    cursor: pointer;
    white-space: nowrap;
    transition: background 150ms ease, border-color 150ms ease;
  }

  .${BUTTON_CLASS}:hover {
    background: #f1f1f1;
  }

  .${BUTTON_CLASS}--active {
    background: #1a1a1a;
    border-color: #1a1a1a;
    color: #ffffff;
  }

  .${BUTTON_CLASS}--active:hover {
    background: #303030;
  }

  .${BUTTON_CLASS}--listing {
    margin-top: 8px;
    font-size: 13px;
    padding: 4px 12px;
  }
`;

let trayHandles = new Set<string>();

function injectStyles() {
  if (document.getElementById(STYLE_ID)) {
    return;
  }

  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = BUTTON_STYLES;
  document.head.appendChild(style);
}

function applyButtonState(button: HTMLButtonElement) {
  const inTray = trayHandles.has(button.dataset.handle ?? '');
  button.textContent = inTray ? '✓ Compare' : '+ Compare';
  button.classList.toggle(`${BUTTON_CLASS}--active`, inTray);
  button.title = inTray ? 'Remove from comparison' : 'Add to comparison';
}

function refreshButtons() {
  document.querySelectorAll<HTMLButtonElement>(`.${BUTTON_CLASS}`).forEach(applyButtonState);
}

function createButton(item: CompareTrayItem): HTMLButtonElement {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = BUTTON_CLASS;
  button.dataset.handle = item.handle;
  applyButtonState(button);

  button.addEventListener('click', async (event) => {
    // Cards are wrapped in links — keep the click from navigating
    event.preventDefault();
    event.stopPropagation();

    if (trayHandles.has(item.handle)) {
      await removeFromTray(item.handle);
      return;
    }

    const result = await addToTray(item);

    if (result === 'full') {
      Toast.error(`You can compare up to ${COMPARE_TRAY_LIMIT} apps`);
    } else if (result === 'added') {
      sendTrackEvent('compare_add_app', {
        handle: item.handle,
        page_url: window.location.href
      });
    }
  });

  return button;
}

function injectCardButtons() {
  const cards = document.querySelectorAll<HTMLElement>('[data-controller="app-card"]');

  cards.forEach((card) => {
    if (card.dataset.alfredCompare) {
      return;
    }

    const handle = card.getAttribute('data-app-card-handle-value');
    const name = card.getAttribute('data-app-card-name-value');
    const target = card.querySelector('figure')?.nextElementSibling;

    if (!handle || !name || !target) {
      return;
    }

    target.appendChild(
      createButton({
        handle,
        name,
        iconUrl: card.getAttribute('data-app-card-icon-url-value') ?? undefined
      })
    );
    card.dataset.alfredCompare = 'true';
  });
}

function getListingIconUrl(): string | undefined {
  try {
    const script = document.querySelector('script[type="application/ld+json"]');
    const data = JSON.parse(script?.textContent ?? '') as { image?: string[] };
    return Array.isArray(data.image) ? data.image[0] : undefined;
  } catch {
    return undefined;
  }
}

function injectListingButton() {
  const hero = document.querySelector('#adp-hero');

  if (!hero || hero.querySelector(`.${BUTTON_CLASS}`)) {
    return;
  }

  // Only individual listings live at a single-segment path like /judgeme
  const match = window.location.pathname.match(/^\/([a-z0-9][a-z0-9_-]*)$/);
  const h1 = hero.querySelector('h1');

  if (!match?.[1] || !h1) {
    return;
  }

  const button = createButton({
    handle: match[1],
    name: h1.textContent?.trim() ?? match[1],
    iconUrl: getListingIconUrl()
  });
  button.classList.add(`${BUTTON_CLASS}--listing`);
  h1.parentElement?.appendChild(button);
}

export function initCompareButtons(): () => void {
  injectStyles();

  const injectAll = () => {
    injectCardButtons();
    injectListingButton();
  };

  getTray().then((items) => {
    trayHandles = new Set(items.map((item) => item.handle));
    injectAll();
    refreshButtons();
  });

  const unwatch = watchTray((items) => {
    trayHandles = new Set(items.map((item) => item.handle));
    refreshButtons();
  });

  const observer = new MutationObserver((mutations) => {
    const hasNewCards = mutations.some(
      (mutation) =>
        mutation.type === 'childList' &&
        Array.from(mutation.addedNodes).some(
          (node) =>
            node.nodeType === Node.ELEMENT_NODE &&
            ((node as Element).matches('[data-controller="app-card"]') ||
              (node as Element).querySelector('[data-controller="app-card"]') !== null)
        )
    );

    if (hasNewCards) {
      setTimeout(injectAll, 100);
    }
  });

  observer.observe(document.body, { childList: true, subtree: true });

  return () => {
    observer.disconnect();
    unwatch();
  };
}
```

- [ ] **Step 2: Write `entrypoints/appstore-compare-tray.content/Tray.svelte`**

```svelte
<script lang="ts">
  import { getTray, removeFromTray, clearTray, watchTray } from '~/utils/compareTray';

  let items = $state.raw<CompareTrayItem[]>([]);

  $effect(() => {
    getTray().then((stored) => {
      items = stored;
    });

    return watchTray((stored) => {
      items = stored;
    });
  });

  function openComparison() {
    const handles = items.map((item) => item.handle).join(',');
    window.location.href = `https://apps.shopify.com/compare/${handles}`;
  }
</script>

{#if items.length > 0}
  <aside class="tray" aria-label="Compare apps tray">
    <ul class="tray-items">
      {#each items as item (item.handle)}
        <li class="tray-item" title={item.name}>
          {#if item.iconUrl}
            <img class="tray-icon" src={item.iconUrl} alt={item.name} />
          {:else}
            <span class="tray-icon tray-icon-placeholder">{item.name.slice(0, 1).toUpperCase()}</span>
          {/if}
          <button
            class="tray-remove"
            aria-label={`Remove ${item.name} from comparison`}
            onclick={() => removeFromTray(item.handle)}
          >
            ×
          </button>
        </li>
      {/each}
    </ul>
    <button class="tray-compare" disabled={items.length < 2} onclick={openComparison}>
      Compare ({items.length})
    </button>
    <button class="tray-clear" onclick={() => clearTray()}>Clear</button>
  </aside>
{/if}

<style>
  .tray {
    position: fixed;
    right: 20px;
    bottom: 20px;
    z-index: 2147483000;
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 10px 12px;
    background: #ffffff;
    border: 1px solid rgba(26, 26, 26, 0.15);
    border-radius: 12px;
    box-shadow: 0 8px 24px rgba(26, 26, 26, 0.2);
    font-family:
      -apple-system, BlinkMacSystemFont, 'San Francisco', 'Segoe UI', Roboto, 'Helvetica Neue', sans-serif;
  }

  .tray-items {
    display: flex;
    gap: 8px;
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .tray-item {
    position: relative;
  }

  .tray-icon {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 36px;
    height: 36px;
    border-radius: 8px;
    border: 1px solid rgba(26, 26, 26, 0.15);
    object-fit: cover;
  }

  .tray-icon-placeholder {
    background: #f1f1f1;
    color: #1a1a1a;
    font-size: 16px;
    font-weight: 600;
  }

  .tray-remove {
    position: absolute;
    top: -6px;
    right: -6px;
    display: none;
    align-items: center;
    justify-content: center;
    width: 16px;
    height: 16px;
    padding: 0;
    border: none;
    border-radius: 50%;
    background: #1a1a1a;
    color: #ffffff;
    font-size: 11px;
    line-height: 1;
    cursor: pointer;
  }

  .tray-item:hover .tray-remove {
    display: flex;
  }

  .tray-compare {
    padding: 8px 14px;
    border: none;
    border-radius: 8px;
    background: #1a1a1a;
    color: #ffffff;
    font-size: 13px;
    font-weight: 600;
    cursor: pointer;
  }

  .tray-compare:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }

  .tray-clear {
    padding: 8px 4px;
    border: none;
    background: none;
    color: #616161;
    font-size: 12px;
    cursor: pointer;
    text-decoration: underline;
  }
</style>
```

- [ ] **Step 3: Write `entrypoints/appstore-compare-tray.content/index.ts`**

```ts
import { createIntegratedUi } from '#imports';
import { mount, unmount } from 'svelte';
import { getItem } from '~/utils/storage';
import { initCompareButtons } from './buttons';
import Tray from './Tray.svelte';

export default defineContentScript({
  matches: ['*://apps.shopify.com/*'],
  async main(ctx) {
    // Check if compare apps is enabled
    const settings = await getItem<AlfredSettings>('settings');
    const isCompareAppsEnabled = settings?.appStore?.compareApps !== false;

    if (!isCompareAppsEnabled) {
      return; // Exit early if compare apps is disabled
    }

    let app: Record<string, unknown> | undefined;

    const ui = createIntegratedUi(ctx, {
      position: 'inline',
      anchor: 'body',
      append: 'last',
      onMount: (container) => {
        app = mount(Tray, { target: container });
        return container;
      },
      onRemove: () => {
        if (app) {
          unmount(app);
          app = undefined;
        }
      }
    });

    ui.mount();

    const cleanupButtons = initCompareButtons();

    ctx.onInvalidated(() => {
      cleanupButtons();
    });
  }
});
```

- [ ] **Step 4: Verify**

Run: `bun run typecheck && bun run lint`
Expected: both exit 0. Then in the HMR dev browser: open `https://apps.shopify.com/search?q=reviews` — each card shows "+ Compare"; clicking toggles it to "✓ Compare" and the tray pill appears bottom-right. Open `https://apps.shopify.com/judgeme` — button appears under the title block.

- [ ] **Step 5: Commit**

```bash
git add entrypoints/appstore-compare-tray.content/
git commit -m "feat(appstore): add compare tray and add-to-compare buttons"
```

---

### Task 6: Comparison page content script

**Files:**

- Create: `entrypoints/appstore-compare.content/index.ts`
- Create: `entrypoints/appstore-compare.content/markdown.ts`
- Create: `entrypoints/appstore-compare.content/App.svelte`

- [ ] **Step 1: Write `entrypoints/appstore-compare.content/markdown.ts`**

```ts
function escapeCell(value: string): string {
  return value.replace(/\|/g, '\\|').replace(/\n/g, ' ');
}

type RowRenderer = (listing: AppListing) => string;

const ROWS: [string, RowRenderer][] = [
  ['Rating', (l) => (l.rating != null ? `${l.rating} ★` : '—')],
  ['Reviews', (l) => (l.reviewCount != null ? l.reviewCount.toLocaleString() : '—')],
  ['Built for Shopify', (l) => (l.builtForShopify ? 'Yes' : 'No')],
  ['Pricing', (l) => l.pricingSummary ?? '—'],
  [
    'Plans',
    (l) =>
      l.plans.length > 0 ? l.plans.map((plan) => [plan.name, plan.price].filter(Boolean).join(': ')).join('; ') : '—'
  ],
  ['Free plan', (l) => (l.hasFreePlan ? 'Yes' : 'No')],
  ['Free trial', (l) => (l.hasFreeTrial ? 'Yes' : 'No')],
  ['Works with', (l) => (l.worksWith.length > 0 ? l.worksWith.join(', ') : '—')],
  ['Launched', (l) => l.launchDate ?? '—'],
  ['Developer', (l) => l.developerName ?? '—'],
  ['Languages', (l) => l.languages ?? '—'],
  ['Categories', (l) => (l.categories.length > 0 ? l.categories.join(', ') : '—')]
];

/**
 * Render loaded listings as a GitHub-flavored markdown comparison table.
 */
export function buildComparisonMarkdown(listings: AppListing[]): string {
  const header = ['', ...listings.map((l) => `[${escapeCell(l.name ?? l.handle)}](${l.url})`)];

  return [
    `| ${header.join(' | ')} |`,
    `| ${header.map(() => '---').join(' | ')} |`,
    ...ROWS.map(([label, render]) => `| ${[label, ...listings.map((l) => escapeCell(render(l)))].join(' | ')} |`)
  ].join('\n');
}
```

- [ ] **Step 2: Write `entrypoints/appstore-compare.content/App.svelte`**

```svelte
<script lang="ts">
  import { fetchAppListing } from '~/utils/appListing';
  import { sendTrackEvent } from '@/utils/analytics';
  import { Toast } from '~/utils/toast';
  import { buildComparisonMarkdown } from './markdown';

  type Column = {
    handle: string;
    status: 'loading' | 'loaded' | 'error';
    listing?: AppListing;
    error?: string;
  };

  let { handles }: { handles: string[] } = $props();

  let columns = $state.raw<Column[]>(handles.map((handle) => ({ handle, status: 'loading' })));

  const loadedListings = $derived(
    columns.flatMap((column) => (column.status === 'loaded' && column.listing ? [column.listing] : []))
  );

  $effect(() => {
    sendTrackEvent('compare_view', { app_count: handles.length, page_url: window.location.href });

    for (const handle of handles) {
      void loadColumn(handle);
    }
  });

  async function loadColumn(handle: string) {
    columns = columns.map((column) => (column.handle === handle ? { handle, status: 'loading' } : column));

    try {
      const listing = await fetchAppListing(handle);
      columns = columns.map((column) =>
        column.handle === handle ? { handle, status: 'loaded', listing } : column
      );
    } catch (error) {
      columns = columns.map((column) =>
        column.handle === handle
          ? {
              handle,
              status: 'error',
              error: error instanceof Error ? error.message : 'Failed to load listing'
            }
          : column
      );
    }
  }

  function removeColumn(handle: string) {
    columns = columns.filter((column) => column.handle !== handle);
    window.history.replaceState(null, '', `/compare/${columns.map((column) => column.handle).join(',')}`);
  }

  async function copyMarkdown() {
    try {
      await navigator.clipboard.writeText(buildComparisonMarkdown(loadedListings));
      Toast.success('Comparison copied as markdown');
      sendTrackEvent('compare_export_markdown', { app_count: loadedListings.length });
    } catch {
      Toast.error('Could not copy to clipboard');
    }
  }
</script>

<div class="compare">
  <header class="compare-header">
    <h1>Compare apps</h1>
    <button class="compare-export" disabled={loadedListings.length === 0} onclick={copyMarkdown}>
      Copy as markdown
    </button>
  </header>

  {#if columns.length === 0}
    <p class="compare-empty">
      No apps to compare. <a href="https://apps.shopify.com/">Browse the App Store</a> to add some.
    </p>
  {:else}
    <div class="compare-scroll">
      <table class="compare-table">
        <thead>
          <tr>
            <td class="compare-label"></td>
            {#each columns as column (column.handle)}
              <th class="compare-app" scope="col">
                {#if column.status === 'loaded' && column.listing}
                  {@const listing = column.listing}
                  <div class="compare-app-card">
                    {#if listing.iconUrl}
                      <img class="compare-app-icon" src={listing.iconUrl} alt={listing.name ?? column.handle} />
                    {/if}
                    <a class="compare-app-name" href={listing.url}>{listing.name ?? column.handle}</a>
                    {#if listing.tagline}
                      <p class="compare-app-tagline">{listing.tagline}</p>
                    {/if}
                    <button class="compare-app-remove" onclick={() => removeColumn(column.handle)}>
                      Remove
                    </button>
                  </div>
                {:else if column.status === 'loading'}
                  <div class="compare-app-card compare-app-loading" aria-busy="true">
                    <span class="compare-skeleton compare-skeleton-icon"></span>
                    <span class="compare-skeleton compare-skeleton-line"></span>
                    <span class="compare-skeleton compare-skeleton-line"></span>
                  </div>
                {:else}
                  <div class="compare-app-card compare-app-error">
                    <p>Couldn't load <strong>{column.handle}</strong></p>
                    <p class="compare-error-detail">{column.error}</p>
                    <button onclick={() => loadColumn(column.handle)}>Retry</button>
                    <button onclick={() => removeColumn(column.handle)}>Remove</button>
                  </div>
                {/if}
              </th>
            {/each}
          </tr>
        </thead>
        <tbody>
          <tr>
            <th class="compare-label" scope="row">Rating</th>
            {#each columns as column (column.handle)}
              <td>{column.listing?.rating != null ? `${column.listing.rating} ★` : '—'}</td>
            {/each}
          </tr>
          <tr>
            <th class="compare-label" scope="row">Reviews</th>
            {#each columns as column (column.handle)}
              <td>{column.listing?.reviewCount != null ? column.listing.reviewCount.toLocaleString() : '—'}</td>
            {/each}
          </tr>
          <tr>
            <th class="compare-label" scope="row">Built for Shopify</th>
            {#each columns as column (column.handle)}
              <td>{column.listing ? (column.listing.builtForShopify ? '✓ Yes' : 'No') : '—'}</td>
            {/each}
          </tr>
          <tr>
            <th class="compare-label" scope="row">Pricing</th>
            {#each columns as column (column.handle)}
              <td>{column.listing?.pricingSummary ?? '—'}</td>
            {/each}
          </tr>
          <tr>
            <th class="compare-label" scope="row">Plans</th>
            {#each columns as column (column.handle)}
              <td>
                {#if column.listing && column.listing.plans.length > 0}
                  <ul class="compare-plans">
                    {#each column.listing.plans as plan}
                      <li>
                        <strong>{plan.name ?? 'Plan'}</strong>
                        {#if plan.price}<span class="compare-plan-price">{plan.price}</span>{/if}
                      </li>
                    {/each}
                  </ul>
                {:else}
                  —
                {/if}
              </td>
            {/each}
          </tr>
          <tr>
            <th class="compare-label" scope="row">Free plan</th>
            {#each columns as column (column.handle)}
              <td>{column.listing ? (column.listing.hasFreePlan ? 'Yes' : 'No') : '—'}</td>
            {/each}
          </tr>
          <tr>
            <th class="compare-label" scope="row">Free trial</th>
            {#each columns as column (column.handle)}
              <td>{column.listing ? (column.listing.hasFreeTrial ? 'Yes' : 'No') : '—'}</td>
            {/each}
          </tr>
          <tr>
            <th class="compare-label" scope="row">Works with</th>
            {#each columns as column (column.handle)}
              <td>{column.listing?.worksWith.length ? column.listing.worksWith.join(', ') : '—'}</td>
            {/each}
          </tr>
          <tr>
            <th class="compare-label" scope="row">Launched</th>
            {#each columns as column (column.handle)}
              <td>{column.listing?.launchDate ?? '—'}</td>
            {/each}
          </tr>
          <tr>
            <th class="compare-label" scope="row">Developer</th>
            {#each columns as column (column.handle)}
              <td>
                {#if column.listing?.developerName}
                  {#if column.listing.developerUrl}
                    <a href={column.listing.developerUrl}>{column.listing.developerName}</a>
                  {:else}
                    {column.listing.developerName}
                  {/if}
                {:else}
                  —
                {/if}
              </td>
            {/each}
          </tr>
          <tr>
            <th class="compare-label" scope="row">Languages</th>
            {#each columns as column (column.handle)}
              <td>{column.listing?.languages ?? '—'}</td>
            {/each}
          </tr>
          <tr>
            <th class="compare-label" scope="row">Categories</th>
            {#each columns as column (column.handle)}
              <td>{column.listing?.categories.length ? column.listing.categories.join(', ') : '—'}</td>
            {/each}
          </tr>
        </tbody>
      </table>
    </div>
  {/if}
</div>

<style>
  .compare {
    max-width: 1200px;
    margin: 0 auto;
    padding: 32px 20px 64px;
    color: #1a1a1a;
    font-family:
      -apple-system, BlinkMacSystemFont, 'San Francisco', 'Segoe UI', Roboto, 'Helvetica Neue', sans-serif;
  }

  .compare-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 16px;
    margin-bottom: 24px;
  }

  .compare-header h1 {
    margin: 0;
    font-size: 28px;
    font-weight: 700;
  }

  .compare-export {
    padding: 8px 14px;
    border: 1px solid rgba(26, 26, 26, 0.3);
    border-radius: 8px;
    background: #ffffff;
    font-size: 13px;
    font-weight: 600;
    cursor: pointer;
  }

  .compare-export:hover:not(:disabled) {
    background: #f1f1f1;
  }

  .compare-export:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }

  .compare-empty {
    font-size: 15px;
  }

  .compare-scroll {
    overflow-x: auto;
  }

  .compare-table {
    width: 100%;
    border-collapse: collapse;
    font-size: 14px;
  }

  .compare-table td,
  .compare-table th {
    padding: 12px 16px;
    border-top: 1px solid rgba(26, 26, 26, 0.12);
    text-align: left;
    vertical-align: top;
    min-width: 180px;
  }

  thead td,
  thead th {
    border-top: none;
  }

  .compare-label {
    min-width: 130px;
    width: 130px;
    font-weight: 600;
    color: #616161;
    white-space: nowrap;
  }

  .compare-app-card {
    display: flex;
    flex-direction: column;
    gap: 8px;
    align-items: flex-start;
  }

  .compare-app-icon {
    width: 56px;
    height: 56px;
    border-radius: 12px;
    border: 1px solid rgba(26, 26, 26, 0.12);
  }

  .compare-app-name {
    font-size: 16px;
    font-weight: 650;
    color: #1a1a1a;
  }

  .compare-app-tagline {
    margin: 0;
    font-size: 12px;
    font-weight: 450;
    color: #616161;
  }

  .compare-app-remove,
  .compare-app-error button {
    padding: 4px 10px;
    border: 1px solid rgba(26, 26, 26, 0.3);
    border-radius: 6px;
    background: #ffffff;
    font-size: 12px;
    cursor: pointer;
  }

  .compare-app-remove:hover,
  .compare-app-error button:hover {
    background: #f1f1f1;
  }

  .compare-app-error p {
    margin: 0 0 4px;
    font-weight: 450;
  }

  .compare-error-detail {
    font-size: 12px;
    color: #8a1f11;
  }

  .compare-skeleton {
    display: block;
    border-radius: 8px;
    background: rgba(26, 26, 26, 0.08);
    animation: compare-pulse 1.2s ease-in-out infinite;
  }

  .compare-skeleton-icon {
    width: 56px;
    height: 56px;
  }

  .compare-skeleton-line {
    width: 140px;
    height: 12px;
  }

  @keyframes compare-pulse {
    0%,
    100% {
      opacity: 1;
    }
    50% {
      opacity: 0.5;
    }
  }

  .compare-plans {
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .compare-plans li {
    margin-bottom: 4px;
  }

  .compare-plan-price {
    margin-left: 6px;
    color: #616161;
  }
</style>
```

- [ ] **Step 3: Write `entrypoints/appstore-compare.content/index.ts`**

```ts
import { createIntegratedUi } from '#imports';
import { mount, unmount } from 'svelte';
import { getItem } from '~/utils/storage';
import App from './App.svelte';

const HANDLE_PATTERN = /^[a-z0-9][a-z0-9_-]*$/;
const MAX_COMPARE_APPS = 8;

export default defineContentScript({
  matches: ['*://apps.shopify.com/compare/*'],
  async main(ctx) {
    // Check if compare apps is enabled
    const settings = await getItem<AlfredSettings>('settings');
    const isCompareAppsEnabled = settings?.appStore?.compareApps !== false;

    if (!isCompareAppsEnabled) {
      return; // Exit early if compare apps is disabled
    }

    const handles = [
      ...new Set(
        window.location.pathname
          .replace(/^\/compare\//, '')
          .split(',')
          .map((handle) => decodeURIComponent(handle).trim().toLowerCase())
          .filter((handle) => HANDLE_PATTERN.test(handle))
      )
    ].slice(0, MAX_COMPARE_APPS);

    if (handles.length === 0) {
      return; // Leave the native 404 page untouched
    }

    // Take over the 404 page: keep the App Store header/footer, replace <main>
    const main = document.querySelector('main');

    if (!main) {
      return;
    }

    main.replaceChildren();
    document.title = 'Compare apps · Shopify App Store';

    let app: Record<string, unknown> | undefined;

    const ui = createIntegratedUi(ctx, {
      position: 'inline',
      anchor: 'main',
      append: 'first',
      onMount: (container) => {
        app = mount(App, { target: container, props: { handles } });
        return container;
      },
      onRemove: () => {
        if (app) {
          unmount(app);
          app = undefined;
        }
      }
    });

    ui.mount();
  }
});
```

- [ ] **Step 4: Verify**

Run: `bun run typecheck && bun run lint`
Expected: both exit 0. In the dev browser: visit `https://apps.shopify.com/compare/judgeme,loox` — the 404 content is replaced by the comparison table with the site header intact, both columns load, and "Copy as markdown" puts a valid table on the clipboard.

- [ ] **Step 5: Commit**

```bash
git add entrypoints/appstore-compare.content/
git commit -m "feat(appstore): add side-by-side app comparison page"
```

---

### Task 7: Manual QA + cleanup

**Files:** none new — fixes only if QA finds issues.

- [ ] **Step 1: Run the spec's QA checklist in the dev browser**

1. Add/remove apps from search-result cards (`/search?q=reviews`) and from a listing page (`/judgeme`). Buttons toggle state; tray updates.
2. Tray persists across navigation; open a second tab — add/remove syncs between tabs.
3. Compare 2, 3, and 4 apps; spot-check every row against the live listings. Include one free app (`magic-bundles` — pricing summary row, no plan cards) and one paid BFS app (`judgeme`).
4. Adding a 5th app shows the "up to 4 apps" error toast.
5. Open `/compare/judgeme,loox` in a fresh profile/empty tray — page renders (URL is source of truth).
6. `/compare/judgeme,this-handle-does-not-exist-xyz` — error column with Retry/Remove; other column loads.
7. `/compare/` and `/compare/!!!` — native 404 left untouched.
8. Toggle "Compare Apps" off in options, reload — no buttons, no tray, comparison URL shows native 404.
9. "Copy as markdown" pastes a valid table into a markdown editor.
10. Column "Remove" updates the URL in place; removing down to zero shows the empty state.

- [ ] **Step 2: Final gates**

Run: `bun run typecheck && bun run lint && bun run format:check`
Expected: all exit 0 (run `bun run format` if the format check fails).

- [ ] **Step 3: Commit any QA fixes**

```bash
git add -A
git commit -m "fix(appstore): address compare apps QA findings"
```

(Skip if QA was clean.)

---

### After the plan

Shipping is a separate step (not part of this plan): bump the version and changelog with the `/version-bump` skill, then use `/ship` to push and open the PR referencing issue #65.
