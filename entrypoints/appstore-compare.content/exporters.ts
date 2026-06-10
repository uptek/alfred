import { formatAppAge } from '~/utils/appListing';

function escapeCell(value: string): string {
  return value.replace(/\|/g, '\\|').replace(/\n/g, ' ');
}

type RowRenderer = (listing: AppListing) => string;

/**
 * Row labels + plain-text renderers, in display order. Shared by the
 * markdown export and the comparison page's "differences only" check.
 */
export const COMPARISON_ROWS: [string, RowRenderer][] = [
  // Full-size URLs (sizing query stripped), comma-separated with one per
  // line — CSV cells keep the newlines, the markdown table flattens them.
  [
    'Screenshots',
    (l) => (l.screenshots.length > 0 ? l.screenshots.map((shot) => shot.split('?')[0]).join(',\n') : '—')
  ],
  ['Built for Shopify', (l) => (l.builtForShopify ? 'Yes' : 'No')],
  ['Rating', (l) => (l.rating != null ? `${l.rating} ★` : '—')],
  [
    'Reviews',
    (l) => {
      if (l.reviewCount == null) {
        return '—';
      }
      const distribution = l.ratingDistribution.map((level) => `${level.stars}★ ${level.count}`).join(' · ');
      return distribution ? `${l.reviewCount.toLocaleString()} (${distribution})` : l.reviewCount.toLocaleString();
    }
  ],
  [
    'Pricing',
    (l) =>
      l.plans.length > 0
        ? l.plans.map((plan) => [plan.name, plan.price].filter(Boolean).join(': ')).join('; ')
        : (l.pricingSummary ?? '—')
  ],
  ['Free plan', (l) => (l.hasFreePlan ? 'Yes' : 'No')],
  ['Free trial', (l) => (l.hasFreeTrial ? (l.freeTrialDays ? `Yes (${l.freeTrialDays} days)` : 'Yes') : 'No')],
  [
    'Launched',
    (l) => {
      if (!l.launchDate) {
        return '—';
      }
      const age = formatAppAge(l.launchDate);
      return age ? `${l.launchDate} (${age})` : l.launchDate;
    }
  ],
  [
    'Developer',
    (l) => (l.developerName ? (l.developerUrl ? `[${l.developerName}](${l.developerUrl})` : l.developerName) : '—')
  ],
  ['Languages', (l) => l.languages ?? '—'],
  ['Links', (l) => (l.links.length > 0 ? l.links.map((link) => `[${link.label}](${link.url})`).join(', ') : '—')],
  ['Works with', (l) => (l.worksWith.length > 0 ? l.worksWith.join(', ') : '—')],
  ['Categories', (l) => (l.categories.length > 0 ? l.categories.join(', ') : '—')],
  [
    'Data access',
    (l) =>
      l.dataAccess.length > 0
        ? l.dataAccess
            .map((access) => {
              const detail =
                access.items.length > 0
                  ? access.items.map((item) => (item.details ? `${item.name} (${item.details})` : item.name)).join(', ')
                  : access.summary;
              return detail ? `${access.group}: ${detail}` : access.group;
            })
            .join('; ')
        : '—'
  ]
];

/**
 * Render loaded listings as a GitHub-flavored markdown comparison table.
 */
export function buildComparisonMarkdown(listings: AppListing[]): string {
  const header = ['', ...listings.map((l) => `[${escapeCell(l.name ?? l.handle)}](${l.url})`)];

  return [
    `| ${header.join(' | ')} |`,
    `| ${header.map(() => '---').join(' | ')} |`,
    ...COMPARISON_ROWS.map(
      ([label, render]) => `| ${[label, ...listings.map((l) => escapeCell(render(l)))].join(' | ')} |`
    )
  ].join('\n');
}

function csvCell(value: string): string {
  return `"${value.replace(/"/g, '""')}"`;
}

/** Flatten the renderers' markdown links for plain-text formats: [label](url) -> label (url) */
function plainText(value: string): string {
  return value.replace(/\[([^\]]*)\]\(([^)]*)\)/g, '$1 ($2)');
}

/**
 * Render loaded listings as a CSV comparison table (one row per attribute,
 * one column per app), reusing the shared row renderers.
 */
export function buildComparisonCsv(listings: AppListing[]): string {
  const header = ['Attribute', ...listings.map((l) => l.name ?? l.handle)];
  const lines = [header.map(csvCell).join(',')];

  for (const [label, render] of COMPARISON_ROWS) {
    lines.push([label, ...listings.map((l) => plainText(render(l)))].map(csvCell).join(','));
  }

  return lines.join('\n');
}

/**
 * Export the comparison as structured JSON: the full parsed listing data per
 * app, plus provenance metadata.
 */
export function buildComparisonJson(listings: AppListing[]): string {
  return JSON.stringify(
    {
      source: 'Alfred - Compare Shopify apps',
      url: window.location.href,
      exportedAt: new Date().toISOString(),
      apps: listings
    },
    null,
    2
  );
}
