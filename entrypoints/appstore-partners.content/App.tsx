import { useEffect, useState } from 'preact/hooks';
import { fetchAppData, downloadCSV, getResourceIcon } from './utils';
import type { App, SortableHeaderProps, SummaryCardProps } from './types';

import styles from './App.module.css';
import builtForShopifyIcon from '@/assets/icon-built-for-shopify.svg';
import exportIcon from '@/assets/icon-export.svg';

const SortableHeader = ({ label, column, align = 'left', sortState, onSort }: SortableHeaderProps) => {
  return (
    <th
      className={`${styles.sortable} ${sortState.column === column ? styles.sortableActive : ''}`}
      style={{ textAlign: align }}
      onClick={() => onSort(column, sortState.direction === 'asc' ? 'desc' : 'asc')}
    >
      <div style={{ display: 'inline-flex', alignItems: 'center' }}>
        <span>{label}</span>
        <span className={sortState.column === column ?
          (sortState.direction === 'asc' ? styles.sortIconAsc : styles.sortIconDesc) :
          styles.sortIconBoth}></span>
      </div>
    </th>
  );
};

const SummaryCard = ({ app, className }: SummaryCardProps) => {
  return (
    <div className={className}>
      <div className={styles.summaryHeader}>
        <img src={app.iconUrl} alt={`${app.name} icon`} className={styles.summaryIcon} />
        <div className={styles.summaryAppName}>{app.name}</div>
      </div>
      <div className={styles.summarySection}>
        <div className={styles.summarySectionTitle}>App Details</div>
        <div className={styles.summaryDetail}>
          <div className={styles.summaryDetailLabel}>Launched:</div>
          <div className={styles.summaryDetailValue}>{app.launchDate}</div>
        </div>
        {app.detailedAge && (
          <div className={styles.summaryDetail}>
            <div className={styles.summaryDetailLabel}>Age:</div>
            <div className={styles.summaryDetailValue}>{app.detailedAge}</div>
          </div>
        )}
        {app.rating && app.rating !== 'N/A' && (
          <div className={styles.summaryDetail}>
            <div className={styles.summaryDetailLabel}>Rating:</div>
            <div className={styles.summaryDetailValue}>
              {app.rating} ({app.reviewCount.toLocaleString()} reviews)
            </div>
          </div>
        )}
        {app.pricing && (
          <div className={styles.summaryDetail}>
            <div className={styles.summaryDetailLabel}>Pricing:</div>
            <div className={styles.summaryDetailValue}>{app.pricing}</div>
          </div>
        )}
      </div>
      {app.developer && (app.developer.website || app.developer.address) && (
        <div className={styles.summarySection}>
          <div className={styles.summarySectionTitle}>Developer</div>
          {app.developer.website && (
            <div className={styles.summaryDetail}>
              <div className={styles.summaryDetailLabel}>Website:</div>
              <div className={styles.summaryDetailValue}>
                <a href={app.developer.website} target="_blank" style={{ color: 'rgb(44, 110, 203)', textDecoration: 'none' }}>
                  {app.developer.website}
                </a>
              </div>
            </div>
          )}
          {app.developer.address && (
            <div className={styles.summaryDetail}>
              <div className={styles.summaryDetailLabel}>Address:</div>
              <div className={styles.summaryDetailValue}>{app.developer.address}</div>
            </div>
          )}
        </div>
      )}
      <div className={styles.summarySection}>
        <div className={styles.summarySectionTitle}>Resources</div>
        <div className={styles.summaryResources}>
          {app.resources.map((resource) => (
            <a href={resource.url} target="_blank" className={styles.summaryResourceLink}>
              <span className={styles.summaryResourceIcon}>
                <img src={getResourceIcon(resource)} alt={resource.title} />
              </span>
              <span>{resource.title}</span>
            </a>
          ))}
        </div>
      </div>
    </div>
  );
};

function App() {
  const [apps, setApps] = useState<App[]>([]);
  const [sortState, setSortState] = useState<{
    column: keyof App | null;
    direction: 'asc' | 'desc' | null;
  }>({ column: null, direction: null });
  const [activeSummaryCard, setActiveSummaryCard] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchApps = async () => {
      try {
        setIsLoading(true);
        setError(null);

        // Find all app cards on the page
        const appCards = document.querySelectorAll(`[data-controller="app-card"]`);
        if (!appCards || appCards.length === 0) {
          setError('No app cards found on the page');
          return;
        }

        const appDataPromises = Array.from(appCards).map(async (card, index) => {
          // Extract app data from attributes
          const name = card.getAttribute('data-app-card-name-value') || '';
          const handle = card.getAttribute('data-app-card-handle-value') || '';
          const iconUrl = card.getAttribute('data-app-card-icon-url-value') || '';
          const link = card.getAttribute('data-app-card-app-link-value') || '';

          // Fetch additional app data
          const appData = link
            ? await fetchAppData(link)
            : {
                launchDate: null,
                age: null,
                detailedAge: null,
                developer: { website: null, address: null },
                resources: [],
              };

          // Extract UI elements
          const iconFigure = card.querySelector('figure') as HTMLElement | null;
          const infoRow = card.querySelector('div > div > div:nth-child(1) > div:nth-child(2)');
          const descriptionElement = card.querySelector('div > div > div:nth-child(1) > div:nth-child(3)');
          const installedElement = card.querySelector('div > div > div:nth-child(1) > div.tw-text-notifications-success-primary');
          const builtForShopifyElement = card.querySelector('.built-for-shopify-badge');

          // Extract rating, reviews, and pricing
          let rating = '—';
          let reviewCount = 0;
          let pricing = '—';

          if (infoRow) {
            const spansRow = infoRow.querySelector('div.tw-relative.tw-flex.tw-items-center');
            if (spansRow) {
              const spans = spansRow.querySelectorAll('span');
              if (spans.length > 0 && !spans[0].classList.contains('tw-overflow-hidden')) {
                const firstSpan = spans[0];
                const firstTextNode = Array.from(firstSpan.childNodes).find((n: any) => n.nodeType === Node.TEXT_NODE);
                rating = firstTextNode ? (firstTextNode as any).textContent?.trim() || 'N/A' : firstSpan.textContent?.trim() || 'N/A';
              }
              for (const span of spans) {
                if (span.classList.contains('tw-overflow-hidden')) {
                  pricing = span.textContent?.trim() || 'N/A';
                } else if (span.hasAttribute('aria-hidden') && /^\(.*\)$/.test(span.textContent?.trim() || '')) {
                  reviewCount = parseInt((span.textContent || '').replace(/[(),]/g, '').trim().replace(/,/g, ''), 10) || 0;
                }
              }
            }
          }

          return {
            index,
            data: {
              name,
              handle,
              iconUrl,
              link,
              iconFigure: iconFigure ? (iconFigure.cloneNode(true) as HTMLElement) : null,
              rating,
              reviewCount,
              pricing,
              description: descriptionElement?.textContent?.trim() || '',
              isInstalled: installedElement !== null,
              isBuiltForShopify: builtForShopifyElement !== null,
              launchDate: appData.launchDate,
              age: appData.age,
              detailedAge: appData.detailedAge,
              developer: appData.developer,
              resources: appData.resources,
            },
          };
        });

        const results = await Promise.all(appDataPromises);
        results.sort((a, b) => a.index - b.index);
        setApps(results.map((result) => result.data));
      } catch (err) {
        setError(err instanceof Error ? err.message : 'An error occurred while fetching app data');
      } finally {
        setIsLoading(false);
      }
    };

    fetchApps();
  }, []);

  const handleSort = (column: keyof App, direction: 'asc' | 'desc') => {
    setSortState({ column, direction });
    const sortedData = [...apps].sort((a, b) => {
      let aValue: any = a[column];
      let bValue: any = b[column];

      // Handle special cases
      if (column === 'rating') {
        aValue = parseFloat(a.rating) || 0;
        bValue = parseFloat(b.rating) || 0;
      } else if (column === 'isInstalled' || column === 'isBuiltForShopify') {
        aValue = a[column] ? 1 : 0;
        bValue = b[column] ? 1 : 0;
      } else if (column === 'age') {
        // Parse dates for comparison
        const aDate = a.launchDate ? new Date(a.launchDate) : new Date(0);
        const bDate = b.launchDate ? new Date(b.launchDate) : new Date(0);
        aValue = aDate.getTime();
        bValue = bDate.getTime();
      }

      // Sort based on direction
      if (aValue < bValue) return direction === 'asc' ? -1 : 1;
      if (aValue > bValue) return direction === 'asc' ? 1 : -1;
      return 0;
    });
    setApps(sortedData);
  };

  if (isLoading) {
    return <div className={styles.container}>Loading...</div>;
  }

  if (error) {
    return <div className={styles.container}>Error: {error}</div>;
  }

  return (
    <div className={styles.container}>
      <div className={styles.exportButtonContainer}>
        <button className={styles.exportButton} onClick={() => downloadCSV(apps)}>
          <img src={exportIcon} alt="Export to CSV" />
          Export to CSV
        </button>
      </div>
      <div className={styles.tableContainer}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th style={{ width: '50px' }}></th>
              <SortableHeader label="Name" column="name" sortState={sortState} onSort={handleSort} />
              <SortableHeader label="Rating" column="rating" sortState={sortState} onSort={handleSort} />
              <SortableHeader label="Reviews" column="reviewCount" sortState={sortState} onSort={handleSort} />
              <SortableHeader label="Pricing" column="pricing" sortState={sortState} onSort={handleSort} />
              <SortableHeader label="Age" column="age" sortState={sortState} onSort={handleSort} />
              <SortableHeader label="Installed" column="isInstalled" sortState={sortState} onSort={handleSort} />
              <SortableHeader label="Built for Shopify" column="isBuiltForShopify" sortState={sortState} onSort={handleSort} />
            </tr>
          </thead>
          <tbody>
            {apps.map((app) => (
              <tr key={app.handle}>
                <td>
                  {app.iconFigure ? (
                    <span
                      dangerouslySetInnerHTML={{
                        __html: app.iconFigure.outerHTML,
                      }}
                    />
                  ) : (
                    <img src={app.iconUrl} alt={`${app.name} icon`} className={styles.appIcon} />
                  )}
                </td>
                <td
                  onMouseEnter={() => setActiveSummaryCard(app.handle)}
                  onMouseLeave={() => setActiveSummaryCard(null)}
                  style={{ position: 'relative' }}
                >
                  <a href={app.link} className={styles.appName}>
                    {app.name}
                  </a>
                  <div className={styles.appDescription}>{app.description}</div>
                  <SummaryCard app={app} className={activeSummaryCard === app.handle ? styles.summaryCardActive : styles.summaryCard} />
                </td>
                <td style={{ textAlign: 'center' }}>
                  <div className={styles.ratingContainer}>{app.rating}</div>
                </td>
                <td style={{ textAlign: 'center' }}>{app.reviewCount.toLocaleString()}</td>
                <td>{app.pricing}</td>
                <td>
                  <span style={{ marginBottom: '2px' }}>{app.age}</span>
                  <div className={styles.appDescription}>{app.launchDate}</div>
                </td>
                <td style={{ textAlign: 'center' }}>
                  <span className={app.isInstalled ? styles.statusSuccess : styles.statusNeutral}>
                    {app.isInstalled ? '✓' : '—'}
                  </span>
                </td>
                <td style={{ textAlign: 'center' }}>
                  <span className={app.isBuiltForShopify ? styles.shopifyBadge : styles.statusNeutral}>
                    {app.isBuiltForShopify ? <img src={builtForShopifyIcon} alt="Built for Shopify" /> : '—'}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default App;
