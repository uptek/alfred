# Enhanced Theme Details Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Show enriched theme metadata (developer, price, latest version, store link, status, last updated) in the popup by looking up the detected theme against the bundled `assets/data/themes.json`.

**Architecture:** Cascading lookup utility matches detected theme against themes.json by theme_store_id, then schema_name, then name. Matched data is passed to the Theme component which renders additional InfoItem rows. No match = no extra rows shown.

**Tech Stack:** Preact, TypeScript, WXT browser extension framework, Tailwind CSS

---

### Task 1: Add ThemeStoreEntry type

**Files:**

- Modify: `entrypoints/popup/types.ts`

**Step 1: Add the type**

Add to `entrypoints/popup/types.ts` after the existing `StoreInfo` interface:

```ts
export interface ThemeStoreEntry {
  source: string;
  name: string;
  theme_store_id: number;
  version: string;
  price: string;
  theme_url: string;
  preview_image_mobile: string;
  preview_image_desktop: string;
  developer: {
    name: string;
    url: string;
  };
  ratings: {
    count: number;
    rating: string;
  };
  last_updated: string;
  last_scraped: string;
  store_status: string;
}
```

**Step 2: Add optional themeStoreEntry to StoreInfo**

Add to the `StoreInfo` interface:

```ts
themeStoreEntry?: ThemeStoreEntry | null;
```

**Step 3: Commit**

```
git add entrypoints/popup/types.ts
git commit -m "feat: add ThemeStoreEntry type"
```

---

### Task 2: Add theme store lookup utility

**Files:**

- Create: `entrypoints/popup/themeStoreLookup.ts`

**Step 1: Create the lookup module**

Create `entrypoints/popup/themeStoreLookup.ts`:

```ts
import themesData from '@/assets/data/themes.json';
import type { Theme, ThemeStoreEntry } from './types';

const themes = themesData as ThemeStoreEntry[];

/**
 * Look up enriched theme data from the bundled themes.json.
 * Cascading strategy:
 * 1. Match by theme_store_id
 * 2. Match by schema_name against name
 * 3. Match by name against name
 */
export function lookupThemeStoreEntry(theme: Theme | null): ThemeStoreEntry | null {
  if (!theme) return null;

  // 1. Match by theme_store_id
  if (theme.theme_store_id) {
    const match = themes.find((t) => t.theme_store_id === theme.theme_store_id);
    if (match) return match;
  }

  // 2. Match by schema_name
  if (theme.schema_name) {
    const match = themes.find((t) => t.name.toLowerCase() === theme.schema_name!.toLowerCase());
    if (match) return match;
  }

  // 3. Match by name
  if (theme.name) {
    const match = themes.find((t) => t.name.toLowerCase() === theme.name!.toLowerCase());
    if (match) return match;
  }

  return null;
}
```

**Step 2: Commit**

```
git add entrypoints/popup/themeStoreLookup.ts
git commit -m "feat: add cascading theme store lookup utility"
```

---

### Task 3: Wire lookup into popup data flow

**Files:**

- Modify: `entrypoints/popup/utils.ts`

**Step 1: Import and call lookup**

In `entrypoints/popup/utils.ts`, import the lookup and call it after building the StoreInfo object. The function should return the `themeStoreEntry` as part of the StoreInfo:

```ts
import { lookupThemeStoreEntry } from './themeStoreLookup';
```

After `const theme = response?.theme ?? null;`, add the lookup call:

```ts
const themeStoreEntry = lookupThemeStoreEntry(response?.theme ?? null);
```

Add `themeStoreEntry` to the returned StoreInfo object.

**Step 2: Commit**

```
git add entrypoints/popup/utils.ts
git commit -m "feat: wire theme store lookup into popup data flow"
```

---

### Task 4: Display enriched fields in Theme component

**Files:**

- Modify: `entrypoints/popup/Theme.tsx`

**Step 1: Add a relative date helper**

Add at the top of the file (below imports):

```ts
function timeAgo(dateString: string): string {
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays < 1) return 'Today';
  if (diffDays < 30) return `${diffDays} day${diffDays !== 1 ? 's' : ''} ago`;
  const diffMonths = Math.floor(diffDays / 30);
  if (diffMonths < 12) return `${diffMonths} month${diffMonths !== 1 ? 's' : ''} ago`;
  const diffYears = Math.floor(diffMonths / 12);
  return `${diffYears} year${diffYears !== 1 ? 's' : ''} ago`;
}
```

**Step 2: Add enriched InfoItem rows**

After the existing InfoItem rows (after the conditional internal theme name row at ~line 93), add:

```tsx
{
  storeInfo.themeStoreEntry && (
    <>
      <InfoItem label="Developer:" value={storeInfo.themeStoreEntry.developer.name || 'N/A'} />
      <InfoItem
        label="Price:"
        value={
          storeInfo.themeStoreEntry.price === '0.00' || !storeInfo.themeStoreEntry.price
            ? 'Free'
            : `$${storeInfo.themeStoreEntry.price}`
        }
      />
      <InfoItem label="Latest version:" value={storeInfo.themeStoreEntry.version || 'N/A'} />
      <InfoItem label="Store status:" value={storeInfo.themeStoreEntry.store_status || 'N/A'} />
      <InfoItem
        label="Last updated:"
        value={storeInfo.themeStoreEntry.last_updated ? timeAgo(storeInfo.themeStoreEntry.last_updated) : 'N/A'}
      />
    </>
  );
}
```

**Step 3: Add theme store link**

Below the enriched InfoItems (still inside the `themeStoreEntry` conditional), add a link to the theme store listing:

```tsx
{
  storeInfo.themeStoreEntry.theme_url && (
    <div className="py-3.5 border-b border-slate-100">
      <a
        href={storeInfo.themeStoreEntry.theme_url}
        target="_blank"
        rel="noopener noreferrer"
        className="text-sm text-indigo-500 hover:text-indigo-600 font-semibold">
        View theme store listing
      </a>
    </div>
  );
}
```

**Step 4: Commit**

```
git add entrypoints/popup/Theme.tsx
git commit -m "feat: display enriched theme details in popup"
```

---

### Task 5: Manual verification

**Step 1: Ask user to build and test**

Ask the user to run `bun run dev` and test on a Shopify store with a known theme (e.g., Dawn by Shopify) to verify:

- Lookup by `theme_store_id` works
- Fallback to `schema_name` works
- Fallback to `name` works
- No match gracefully shows only existing fields
- All 6 new fields display correctly
- Theme store link opens in new tab

**Step 2: Final commit if any fixes needed**
