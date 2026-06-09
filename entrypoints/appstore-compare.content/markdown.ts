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
