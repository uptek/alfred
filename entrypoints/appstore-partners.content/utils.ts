import { sendTrackEvent } from '@/utils/analytics';
import { formatAppAge, formatDetailedAppAge } from '@/utils/appListing';
import { withCsvCredit } from '@/utils/credit';
import { csvField, downloadFile } from '@/utils/export';
import defaultIcon from '@/assets/icon-default.svg';
import privacyIcon from '@/assets/icon-privacy.svg';
import tutorialIcon from '@/assets/icon-tutorial.svg';
import demoIcon from '@/assets/icon-demo.svg';
import docsIcon from '@/assets/icon-docs.svg';
import supportIcon from '@/assets/icon-support.svg';
import type { AppRaw, App, Resource } from './types';

/**
 * Fetch the app data
 * @param link {string} - The link to the app
 * @returns {AppRaw} The app data
 */
export const fetchAppData = async (link: string): Promise<AppRaw> => {
  const appData: AppRaw = {
    resources: [],
    developer: {
      website: null,
      address: null
    },
    launchDate: null,
    age: null,
    detailedAge: null
  };

  try {
    const response = await fetch(link);
    const html = await response.text();
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, 'text/html');
    const devSection = doc.querySelector('#adp-developer');

    if (!devSection) return appData;

    // Cache all heading elements to avoid repeated queries
    const headingElements = devSection.querySelectorAll('h3, p');

    // Extract Resources
    const resourcesElement = Array.from(headingElements).find((el) =>
      el.textContent?.trim().toLowerCase().includes('resources')
    );

    if (resourcesElement) {
      const resourcesSection = resourcesElement.parentElement;
      const resourceLinks = resourcesSection?.querySelectorAll('a');
      resourceLinks?.forEach((link) => {
        appData.resources.push({
          title: link.textContent?.trim() ?? '',
          url: link.href
        });
      });
    }

    // Extract Developer info
    const developerElement = Array.from(headingElements).find((el) =>
      el.textContent?.trim().toLowerCase().includes('developer')
    );

    if (developerElement) {
      const developerSection = developerElement.parentElement;

      // Find website link by text content
      const links = developerSection?.querySelectorAll('a');
      const websiteElement = Array.from(links ?? []).find((link) =>
        link.textContent?.trim().toLowerCase().includes('website')
      );

      if (websiteElement) {
        appData.developer.website = websiteElement.href ?? null;
      }

      // Find address (assumed to be the last paragraph)
      const paragraphs = developerSection?.querySelectorAll('p');
      if (paragraphs && paragraphs.length > 0) {
        const addressElement = paragraphs[paragraphs.length - 1];
        appData.developer.address = addressElement?.textContent?.trim() ?? null;
      }
    }

    // Extract Launch date
    const launchElement = Array.from(headingElements).find((el) =>
      el.textContent?.trim().toLowerCase().includes('launch')
    );

    if (launchElement) {
      const dateElement = launchElement.nextElementSibling;
      if (dateElement) {
        // Find the changelog link by its text content instead of href
        const anchors = dateElement.querySelectorAll('a');
        let changelogAnchor = null;
        for (const anchor of anchors) {
          if (anchor.textContent?.trim().toLowerCase() === 'changelog') {
            changelogAnchor = anchor;
            break;
          }
        }

        let launchDateText = dateElement.textContent?.trim() ?? '';

        // If we found a changelog link
        if (changelogAnchor) {
          // Extract only the date part (text before the anchor)
          const textContent = dateElement.textContent?.trim() ?? '';
          // Remove the anchor text and any separator (like "·") from the text content
          launchDateText = textContent?.split('·')[0]?.trim() ?? '';

          // Add the changelog link to resources
          appData.resources.push({
            title: 'Changelog',
            url: changelogAnchor.href
          });
        }

        appData.launchDate = launchDateText;
        appData.age = formatAppAge(launchDateText ?? '') ?? null;
        appData.detailedAge = formatDetailedAppAge(launchDateText ?? '') ?? null;
      }
    }
  } catch (error) {
    // Log error but don't throw to prevent Promise rejection
    console.error('Error fetching app data:', error);
  }

  return appData;
};

/**
 * Get the page title from the H1 element
 * @returns {string} The handleized page title
 */
const getPageTitle = () => {
  const h1 = document.querySelector('h1')?.textContent?.trim();
  const pageTitle = h1 ?? 'shopify';

  return pageTitle
    .toLowerCase()
    .replace('apps by', '')
    .replace(/[^\w\s-]/g, '') // Remove special characters
    .replace(/[\s_]+/g, '-') // Replace spaces and underscores with hyphens
    .replace(/^-+|-+$/g, ''); // Remove leading/trailing hyphens
};

/**
 * Convert the apps to a CSV string
 * @param apps {App[]} - The apps to convert
 * @returns {string} The CSV string
 */
const convertToCSV = (apps: App[]) => {
  // Define the columns we want to export
  const columns = [
    'Name',
    'Rating',
    'Reviews',
    'Pricing',
    'Launch Date',
    'Installed',
    'Built for Shopify',
    'Description',
    'App URL',
    'Website'
  ];

  // Create the CSV header row
  let csv = columns.join(',') + '\n';

  // Add each app as a row in the CSV
  apps.forEach((app) => {
    const values = [
      app.name ?? '',
      app.rating ?? 'N/A',
      app.reviewCount ?? '0',
      app.pricing ?? '',
      app.launchDate ?? '',
      app.isInstalled ? 'Yes' : 'No',
      app.isBuiltForShopify ? 'Yes' : 'No',
      app.description ?? '',
      app.link?.split('?')[0]?.split('#')[0] ?? '',
      app.developer?.website ?? ''
    ].map(csvField);

    csv += values.join(',') + '\n';
  });

  return csv;
};

/**
 * Download the CSV file
 * @param apps {App[]} - The apps to download
 */
export const downloadCSV = (apps: App[]) => {
  const csv = withCsvCredit(convertToCSV(apps));

  const pageTitle = getPageTitle();
  const date = new Date().toISOString().split('T')[0];
  downloadFile(csv, `shopify-alfred-${pageTitle}-${date}.csv`, 'text/csv;charset=utf-8;');

  sendTrackEvent('appstore_partner_table_export', {
    app_count: apps.length,
    page_url: window.location.href,
    page_type: 'appstore_partners'
  });
};

export const getResourceIcon = (resource: Resource) => {
  let icon = defaultIcon;
  const title = resource.title?.toLowerCase() ?? '';
  const url = resource.url?.toLowerCase() ?? '';

  // Determine icon type
  if (title.includes('privacy') || url.includes('privacy')) {
    icon = privacyIcon;
  } else if (
    title.includes('tutorial') ||
    title.includes('guide') ||
    title.includes('how to') ||
    title.includes('learn') ||
    title.includes('lesson')
  ) {
    icon = tutorialIcon;
  } else if (title.includes('demo') || title.includes('example')) {
    icon = demoIcon;
  } else if (title.includes('doc') || title.includes('manual')) {
    icon = docsIcon;
  } else if (title.includes('support') || title.includes('help') || title.includes('faq')) {
    icon = supportIcon;
  }

  return icon;
};
