import { getSearchStartingIndex } from '~/utils/appstore-search';
import { getSettings, isEnabled } from '~/utils/settings';

export default defineContentScript({
  matches: ['https://apps.shopify.com/search?*'],
  async main(ctx) {
    // Check if search indexing is enabled
    const settings = await getSettings();
    const isSearchIndexingEnabled = isEnabled(settings.appStore.searchIndexing);

    if (!isSearchIndexingEnabled) {
      return; // Exit early if indexing is disabled
    }

    let globalIndex = 1;
    const observers: MutationObserver[] = [];

    function calculateStartingIndex(url: URL | Location) {
      globalIndex = getSearchStartingIndex(url.search);
    }

    function addIndexesToAppCards() {
      const appCards = document.querySelectorAll<HTMLElement>(
        '[data-controller="app-card"][data-app-card-offer-token-value=""]'
      );

      appCards.forEach((card) => {
        if (card.dataset.alfredIndexed) {
          return;
        }

        const targetContainer = card.querySelector('figure')?.nextElementSibling;
        if (targetContainer) {
          const badgeElement = document.createElement('div');
          badgeElement.className =
            'tw-bg-canvas-accent-bfs tw-inline-flex tw-items-center tw-leading-xl tw-px-sm tw-py-3xs tw-rounded-xs tw-self-start tw-text-fg-primary tw-text-label-sm tw-whitespace-nowrap tw-border-[1px] tw-border-stroke-accent-blue';
          badgeElement.textContent = globalIndex.toString();

          targetContainer.appendChild(badgeElement);
          card.dataset.alfredIndexed = 'true';
          globalIndex++;
        }
      });
    }

    // One pending pass at a time: a mutation burst coalesces into a single run.
    let pendingIndexTimeout: number | undefined;
    function scheduleIndexing(delay: number) {
      clearTimeout(pendingIndexTimeout);
      pendingIndexTimeout = window.setTimeout(() => {
        pendingIndexTimeout = undefined;
        addIndexesToAppCards();
      }, delay);
    }

    function observePageChanges() {
      const observer = new MutationObserver((mutations) => {
        for (const mutation of mutations) {
          if (mutation.type !== 'childList' || mutation.addedNodes.length === 0) {
            continue;
          }
          for (const node of mutation.addedNodes) {
            if (
              node.nodeType === Node.ELEMENT_NODE &&
              ((node as Element).matches('[data-controller="app-card"]') ||
                (node as Element).querySelector('[data-controller="app-card"]'))
            ) {
              scheduleIndexing(100);
              return;
            }
          }
        }
      });

      observer.observe(document.body, {
        childList: true,
        subtree: true
      });

      observers.push(observer);
    }

    function init() {
      calculateStartingIndex(window.location);
      addIndexesToAppCards();
      observePageChanges();
    }

    // Fired from the Navigation API's navigate event, before the new URL is
    // committed: window.location still holds the previous page here.
    ctx.addEventListener(window, 'wxt:locationchange', ({ newUrl }) => {
      calculateStartingIndex(newUrl);
      scheduleIndexing(500);
    });

    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', init);
    } else {
      init();
    }

    // Cleanup observers on unmount to prevent memory leaks
    ctx.onInvalidated(() => {
      clearTimeout(pendingIndexTimeout);
      observers.forEach((obs) => obs.disconnect());
    });
  }
});
