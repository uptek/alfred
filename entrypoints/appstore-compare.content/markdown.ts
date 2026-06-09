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
  [
    'Screenshots',
    (l) =>
      l.screenshots.length > 0
        ? l.screenshots.map((shot, index) => `[${index + 1}](${shot.split('?')[0]})`).join(' ')
        : '—'
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
            .map((access) => (access.summary ? `${access.group}: ${access.summary}` : access.group))
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
