/**
 * Alfred for Shopify - Options Page
 * Main TypeScript file for the extension options page
 * Handles initialization and loading states
 */

// Import HTML templates from the sections directory
import navHTML from './sections/nav.html?raw';
// import settingsHTML from './sections/settings.html?raw';
import changelogHTML from './sections/changelog.html?raw';

const defaultSection = 'changelog';

// Wait for DOM to be fully loaded before initializing
document.addEventListener('DOMContentLoaded', (): void => {
  init();
});

/**
 * Initialize the options page
 * Waits for Polaris components and removes loading state
 */
async function init(): Promise<void> {
  const sections = {
    nav: navHTML,
    // settings: settingsHTML,
    changelog: changelogHTML,
  };

  try {
    // Wait for Polaris web components to be ready
    await customElements.whenDefined('s-page');

    // Remove loading state to reveal the content
    const appContainer: HTMLElement | null = document.getElementById('app');
    if (appContainer) {
      appContainer.classList.remove('loading');
    }

    // Render sections
    Object.entries(sections).forEach(([id, content]) => {
      const container = document.getElementById(id);
      if (container) {
        container.innerHTML = content;
      }
    });

    setupNavigation();
  } catch (error) {
    console.error('Failed to initialize options page:', error);
  }
}

/**
 * Sets up navigation functionality for the options page.
 * Handles clicks on navigation links to show/hide content sections.
 */
function setupNavigation(): void {
  const navLinks = document.querySelectorAll<HTMLAnchorElement>('#nav a');
  const sections = document.querySelectorAll<HTMLElement>('.section');

  function showContent(targetId: string): void {
    sections.forEach(section => {
      section.hidden = section.id !== targetId;
    });
    navLinks.forEach(link => {
      link.classList.toggle('active', link.dataset.section === targetId);
    });
  }

  navLinks.forEach(link => {
    link.addEventListener('click', (event: MouseEvent) => {
      event.preventDefault();
      const targetId = link.dataset.section;
      if (targetId) {
        history.pushState({ section: targetId }, '', `?section=${targetId}`);
        showContent(targetId);
      }
    });
  });

  window.addEventListener('popstate', (event: PopStateEvent) => {
    const section = event.state?.section || defaultSection;
    showContent(section);
  });

  // Show initial content based on URL or fallback to default section
  const initialSection = new URLSearchParams(window.location.search).get('section') || defaultSection;
  showContent(initialSection);
}
