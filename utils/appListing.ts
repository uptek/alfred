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

  // Featured-gallery screenshots: thumbnails keep their sizing query; the
  // bare URL (query stripped) serves the original full-size image.
  const screenshots: string[] = [];
  const seenScreenshots = new Set<string>();
  for (const img of doc.querySelectorAll('#adp-details-section img[src*="_screenshot/"]')) {
    const src = img.getAttribute('src');
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
    for (const stars of [5, 4, 3, 2, 1]) {
      ratingDistribution.push({ stars, count: counts.get(stars) ?? '0' });
    }
  }

  const trialMatch = pricingText.match(/(\d+)[- ]day free trial/);
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
      addLink('Demo store', anchor.getAttribute('href'));
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

  // Data access: permission group headings (h4 ending with ':') followed by a
  // sibling <p> summary, e.g. "View customer data" -> "Device and activity data".
  const dataAccess: AppListingDataAccess[] = [];
  for (const heading of doc.querySelectorAll('#adp-permissions h4')) {
    const text = cleanText(heading.textContent);
    if (!text?.endsWith(':')) {
      continue;
    }
    dataAccess.push({
      group: text.slice(0, -1),
      summary: cleanText(heading.nextElementSibling?.textContent)
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
    hasFreeTrial: pricingText.includes('free trial'),
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

/**
 * Human-readable app age from a launch-date string, e.g. "10.9 years",
 * "7 months", "12 days". Undefined when the date can't be parsed.
 */
export function formatAppAge(launchDate: string): string | undefined {
  const launched = new Date(launchDate);

  if (isNaN(launched.getTime())) {
    return undefined;
  }

  const days = Math.floor((Date.now() - launched.getTime()) / 86_400_000);

  if (days < 0) {
    return undefined;
  }

  if (days < 30) {
    return `${days} day${days === 1 ? '' : 's'}`;
  }

  const months = Math.floor(days / 30.44);

  if (months < 12) {
    return `${months} month${months === 1 ? '' : 's'}`;
  }

  return `${(days / 365.25).toFixed(1)} years`;
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
