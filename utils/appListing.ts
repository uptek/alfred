const APP_STORE_ORIGIN = 'https://apps.shopify.com';

interface ListingJsonLd {
  '@type'?: string;
  name?: string;
  description?: string;
  image?: string | string[];
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
 * holding the value, e.g. <p>Works with</p><ul>…</ul>. Scoped to the
 * containers where these rows live (pricing in the hero, works-with and
 * languages in the details section, launched in the developer section) to
 * avoid false matches in reviews or footer; falls back to the whole
 * document if none of the containers exist.
 */
function findLabelledSibling(doc: Document, label: string): Element | null {
  const roots: (Element | Document)[] = ['#adp-hero', '#adp-details-section', '#adp-developer']
    .map((selector) => doc.querySelector(selector))
    .filter((root): root is Element => root !== null);

  for (const root of roots.length > 0 ? roots : [doc]) {
    for (const el of root.querySelectorAll('p, dt')) {
      if (el.textContent?.trim().toLowerCase() === label) {
        return el.nextElementSibling;
      }
    }
  }

  return null;
}

function cleanText(value: string | null | undefined): string | undefined {
  const cleaned = value?.replace(/\s+/g, ' ').trim();
  return cleaned || undefined;
}

function safeUrl(href: string, base: string): string | undefined {
  try {
    const url = new URL(href, base);
    return url.protocol === 'https:' || url.protocol === 'http:' ? url.href : undefined;
  } catch {
    return undefined;
  }
}

/**
 * Parse a Shopify App Store listing page into structured data.
 * Resilient by design: every selector miss yields undefined/empty, never a throw.
 *
 * @param html - Raw listing page HTML
 * @param handle - The app's handle (URL slug)
 */
export function parseAppListing(html: string, handle: string): AppListing {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const jsonLd = parseJsonLd(doc);
  const hero = doc.querySelector('#adp-hero');

  const plans: AppListingPlan[] = Array.from(doc.querySelectorAll('#adp-pricing .app-details-pricing-plan-card')).map(
    (card): AppListingPlan => {
      const name = cleanText(card.querySelector('[data-test-id="name"]')?.textContent);
      const price =
        cleanText(card.querySelector('.app-details-pricing-format-group')?.getAttribute('aria-label')) ??
        cleanText(card.querySelector('[data-test-id="price"]')?.textContent);
      return {
        name,
        price,
        features: Array.from(card.querySelectorAll('[data-test-id="features"] li'))
          .map((li) => cleanText(li.textContent) ?? '')
          .filter(Boolean)
      };
    }
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

  // Featured-gallery images: the promotional image (first gallery tile) plus
  // desktop screenshots. Mobile screenshots are responsive duplicates of the
  // same content, so they are skipped. Thumbnails keep their sizing query;
  // the bare URL (query stripped) serves the original full-size image.
  const screenshots: string[] = [];
  const seenScreenshots = new Set<string>();
  for (const img of doc.querySelectorAll(
    '#adp-details-section img[src*="promotional_image/"], #adp-details-section img[src*="desktop_screenshot/"]'
  )) {
    const rawSrc = img.getAttribute('src');
    const src = rawSrc ? safeUrl(rawSrc, APP_STORE_ORIGIN) : undefined;
    const base = src?.split('?')[0];
    if (src && base && !seenScreenshots.has(base)) {
      seenScreenshots.add(base);
      screenshots.push(src);
    }
  }

  // Per-star review counts from the rating-filter anchors (text is the count
  // as displayed, e.g. "39K"). Absent section -> empty array.
  const reviewsRoot = doc.querySelector('#adp-reviews') ?? doc;
  const starAnchors = reviewsRoot.querySelectorAll('a[href*="ratings%5B%5D="]');
  const ratingDistribution: AppListingRatingCount[] = [];
  if (starAnchors.length > 0) {
    const counts = new Map<number, string>();
    for (const anchor of starAnchors) {
      const match = anchor.getAttribute('href')?.match(/ratings%5B%5D=(\d)/);
      const count = cleanText(anchor.textContent);
      if (match?.[1] && count && !counts.has(Number(match[1]))) {
        counts.set(Number(match[1]), count);
      }
    }
    // Bar widths come from the "98% of ratings are 5 stars" labels
    const percents = new Map<number, number>();
    for (const match of reviewsRoot.textContent?.matchAll(/(\d+)% of ratings are (\d) stars?/g) ?? []) {
      const stars = Number(match[2]);
      if (!percents.has(stars)) {
        percents.set(stars, Number(match[1]));
      }
    }
    for (const stars of [5, 4, 3, 2, 1]) {
      ratingDistribution.push({ stars, count: counts.get(stars) ?? '0', percent: percents.get(stars) ?? 0 });
    }
  }

  // Trial length lives in a plan-card footer <p>, not the feature bullets,
  // so scan the whole pricing section as well as the combined pricing text.
  const pricingSectionText = doc.querySelector('#adp-pricing')?.textContent?.toLowerCase() ?? '';
  const trialMatch = `${pricingText} ${pricingSectionText}`.match(/(\d+)[- ]day free trial/);
  const freeTrialDays = trialMatch?.[1] ? Number(trialMatch[1]) : undefined;

  // Resource links: demo store + everything in the developer section except
  // the partners link (that's the Developer row) and in-page anchors.
  const links: AppListingLink[] = [];
  const seenLinkUrls = new Set<string>();
  const addLink = (label: string | undefined, href: string | null | undefined) => {
    if (!label || !href || href.startsWith('#')) {
      return;
    }
    const url = safeUrl(href, APP_STORE_ORIGIN);
    if (!url || seenLinkUrls.has(url)) {
      return;
    }
    seenLinkUrls.add(url);
    links.push({ label, url });
  };

  for (const anchor of doc.querySelectorAll('a')) {
    if (cleanText(anchor.textContent)?.toLowerCase() === 'view demo store') {
      // Demo links carry tracking params (utm_*) — strip the query string
      addLink('Demo store', anchor.getAttribute('href')?.split('?')[0]);
      break;
    }
  }

  for (const anchor of doc.querySelectorAll('#adp-developer a')) {
    const href = anchor.getAttribute('href');
    if (href?.includes('/partners/')) {
      continue;
    }
    addLink(cleanText(anchor.textContent), href);
  }

  // Data access: each permission group is a div holding the group heading
  // (h4 ending with ':'), a summary <p>, and a <ul> of li > h4 (item name) +
  // p (item details) — e.g. "View products" -> "Products, product listings".
  const dataAccess: AppListingDataAccess[] = [];
  for (const heading of doc.querySelectorAll('#adp-permissions h4')) {
    const text = cleanText(heading.textContent);
    if (!text?.endsWith(':')) {
      continue;
    }
    const items = Array.from(heading.parentElement?.querySelectorAll('ul li') ?? [])
      .map(
        (item): AppListingDataAccessItem => ({
          name: cleanText(item.querySelector('h4')?.textContent) ?? '',
          details: cleanText(item.querySelector('p')?.textContent)
        })
      )
      .filter((item) => item.name);
    dataAccess.push({
      group: text.slice(0, -1),
      summary: cleanText(heading.nextElementSibling?.textContent),
      items
    });
  }

  const name = jsonLd?.name ?? cleanText(hero?.querySelector('h1')?.textContent);
  const tagline = jsonLd?.description;
  const rawIconUrl = Array.isArray(jsonLd?.image) ? jsonLd.image[0] : jsonLd?.image;
  const iconUrl = rawIconUrl ? safeUrl(rawIconUrl, APP_STORE_ORIGIN) : undefined;
  const developerName = typeof brand === 'string' ? brand : brand?.name;
  const developerUrl = developerHref ? safeUrl(developerHref, APP_STORE_ORIGIN) : undefined;
  const rating = jsonLd?.aggregateRating?.ratingValue;
  const reviewCount = jsonLd?.aggregateRating?.ratingCount;

  return {
    handle,
    url: `${APP_STORE_ORIGIN}/${handle}`,
    name,
    tagline,
    iconUrl,
    developerName,
    developerUrl,
    rating,
    reviewCount,
    builtForShopify: Boolean(hero?.querySelector('.built-for-shopify-badge-container')),
    pricingSummary,
    plans,
    hasFreePlan:
      (pricingSummary?.toLowerCase().includes('free plan') ?? false) ||
      pricingSummary?.toLowerCase() === 'free' || // fully free app, no plan cards
      plans.some((plan) => plan.price?.toLowerCase() === 'free'),
    hasFreeTrial: pricingText.includes('free trial') || pricingSectionText.includes('free trial'),
    worksWith,
    launchDate,
    languages,
    categories,
    screenshots,
    ratingDistribution,
    freeTrialDays,
    links,
    dataAccess
  };
}

/** Whole days between two dates, direction-agnostic. */
export const daysBetween = (a: Date, b: Date): number => Math.floor(Math.abs(a.getTime() - b.getTime()) / 86_400_000);

/**
 * Calendar year/month decomposition of the time since `launched`, shared by
 * both age formatters so short and detailed ages can never disagree. A month
 * only counts once its day-of-month has passed, so 15 days that straddle a
 * month boundary decompose to 0 months. Null when unparseable or future.
 */
function calendarAge(launchDate: string, now: Date): { launched: Date; years: number; months: number } | null {
  const launched = new Date(launchDate);

  if (isNaN(launched.getTime()) || launched.getTime() > now.getTime()) {
    return null;
  }

  let years = now.getFullYear() - launched.getFullYear();
  let months = now.getMonth() - launched.getMonth();
  if (now.getDate() < launched.getDate()) {
    months--;
  }
  if (months < 0) {
    years--;
    months += 12;
  }

  return { launched, years, months };
}

/**
 * Adds whole months, landing on the target month's last day when it is shorter
 * than the source day. Bare `setMonth` rolls Jan 31 + 1 month forward into
 * March, which would overshoot the anniversary and undercount leftover days.
 */
function addMonthsClamped(date: Date, months: number): Date {
  const result = new Date(date);
  result.setDate(1);
  result.setMonth(result.getMonth() + months);
  const lastDayOfMonth = new Date(result.getFullYear(), result.getMonth() + 1, 0).getDate();
  result.setDate(Math.min(date.getDate(), lastDayOfMonth));
  return result;
}

/**
 * Human-readable app age from a launch-date string, e.g. "Today", "3 days",
 * "5 months", "1 year", "1.5 years". Calendar year/month arithmetic, so a
 * whole year reads "1 year" rather than "1.0 years". Undefined when the date
 * can't be parsed or is in the future.
 */
export function formatAppAge(launchDate: string, now: Date = new Date()): string | undefined {
  const age = calendarAge(launchDate, now);
  if (!age) return undefined;
  const { launched, years, months } = age;

  if (years === 0 && months === 0) {
    const days = daysBetween(now, launched);
    return days === 0 ? 'Today' : `${days} day${days === 1 ? '' : 's'}`;
  }

  if (years === 0) {
    return `${months} month${months === 1 ? '' : 's'}`;
  }

  const decimal = months === 0 ? '' : (months / 12).toFixed(1).substring(1);
  return `${years}${decimal} ${years === 1 && months === 0 ? 'year' : 'years'}`;
}

/**
 * Long-form app age like "1 year, 2 months, 3 days". Same calendar
 * decomposition as formatAppAge. Undefined when the date can't be parsed or
 * is in the future.
 */
export function formatDetailedAppAge(launchDate: string, now: Date = new Date()): string | undefined {
  const age = calendarAge(launchDate, now);
  if (!age) return undefined;
  const { launched, years, months } = age;

  // Leftover days are measured from the last whole-month anniversary. Floored
  // at zero because a launch string parsed as UTC midnight can sit a few hours
  // ahead of a local-time anniversary.
  const anchor = addMonthsClamped(launched, years * 12 + months);
  const days = Math.max(0, Math.floor((now.getTime() - anchor.getTime()) / 86_400_000));

  const parts: string[] = [];
  if (years > 0) parts.push(`${years} ${years === 1 ? 'year' : 'years'}`);
  if (months > 0) parts.push(`${months} ${months === 1 ? 'month' : 'months'}`);
  if (days > 0 || parts.length === 0) parts.push(`${days} ${days === 1 ? 'day' : 'days'}`);
  return parts.join(', ');
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
