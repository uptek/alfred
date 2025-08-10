/**
 * Alfred for Shopify - Options Page
 * Main TypeScript file for the extension options page
 * Handles initialization and loading states
 */

// Import HTML templates from the components directory
import navHTML from './components/nav.html?raw';
import settingsHTML from './components/settings.html?raw';
import changelogHTML from './components/changelog.html?raw';

import { getItem, setItem } from '~/utils/storage';
import { setChoiceListValue, onChoiceListChange } from '~/utils/polaris.polyfill';
import type { AlfredSettings } from './types';

const defaultSettings: AlfredSettings = {
  themeCustomizer: {
    inspector: 'default',
  },
};
const defaultPage = 'settings';

// Wait for DOM to be fully loaded before initializing
document.addEventListener('DOMContentLoaded', (): void => {
  init();
});

/**
 * Initialize the options page
 * Waits for Polaris components and removes loading state
 */
async function init(): Promise<void> {
  const components = {
    nav: navHTML,
    settings: settingsHTML,
    changelog: changelogHTML,
  };

  try {
    // Wait for Polaris web components to be ready
    await customElements.whenDefined('s-page');

    // Render components
    Object.entries(components).forEach(([id, content]) => {
      const container = document.getElementById(id);
      if (container) {
        container.innerHTML = content;
      }
    });

    setupNavigation();
    await loadSettings();
    setupEventListeners();

    setTimeout(() => {
      // Remove loading state to reveal the content
      const appContainer: HTMLElement | null = document.getElementById('app');
      if (appContainer) {
        appContainer.classList.remove('loading');
      }
    }, 100);
  } catch (error) {
    console.error('Failed to initialize options page:', error);
  }
}

/**
 * Sets up navigation functionality for the options page.
 * Handles clicks on navigation links to show/hide pages.
 */
function setupNavigation(): void {
  const navLinks = document.querySelectorAll<HTMLAnchorElement>('#nav a');
  const pages = document.querySelectorAll<HTMLElement>('.page');

  function showContent(targetId: string): void {
    pages.forEach(page => {
      page.hidden = page.id !== targetId;
    });
    navLinks.forEach(link => {
      link.classList.toggle('active', link.dataset.page === targetId);
    });
  }

  navLinks.forEach(link => {
    link.addEventListener('click', (event: MouseEvent) => {
      event.preventDefault();
      const targetId = link.dataset.page;
      if (targetId) {
        history.pushState({ page: targetId }, '', `?page=${targetId}`);
        showContent(targetId);
      }
    });
  });

  window.addEventListener('popstate', (event: PopStateEvent) => {
    const page = event.state?.page || defaultPage;
    showContent(page);
  });

  // Show initial content based on URL or fallback to default page
  const initialPage = new URLSearchParams(window.location.search).get('page') || defaultPage;
  showContent(initialPage);
}

/**
 * Loads settings from storage and updates the UI.
 */
async function loadSettings(): Promise<void> {
  const settings = await getItem<AlfredSettings>('settings');
  const mergedSettings = {
    themeCustomizer: {
      ...defaultSettings.themeCustomizer,
      ...settings?.themeCustomizer,
    },
  };

  // Set theme inspector choice
  const inspectorValue = mergedSettings.themeCustomizer?.inspector || 'default';
  setChoiceListValue('theme-inspector', inspectorValue);
}

/**
 * Sets up event listeners for the settings page.
 */
function setupEventListeners(): void {
  // Theme inspector choice list
  onChoiceListChange('theme-inspector', async (value) => {
    const settings = (await getItem<AlfredSettings>('settings')) || {};
    settings.themeCustomizer = {
      ...settings.themeCustomizer,
      inspector: value as 'default' | 'disable' | 'restore',
    };
    await setItem('settings', settings);
  });
}
