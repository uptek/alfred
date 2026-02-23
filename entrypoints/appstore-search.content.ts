import { getItem } from '~/utils/storage';

export default defineContentScript({
  matches: ['https://apps.shopify.com/search?*'],
  async main(ctx) {
    // Check if search indexing is enabled
    const settings = await getItem<AlfredSettings>('settings');
    const isSearchIndexingEnabled = settings?.appStore?.searchIndexing !== false;

    if (!isSearchIndexingEnabled) {
      return; // Exit early if indexing is disabled
    }

    let globalIndex = 1;
    const observers: MutationObserver[] = [];

    function getCurrentPage() {
      const urlParams = new URLSearchParams(window.location.search);
      return parseInt(urlParams.get('page') ?? '1', 10);
    }

    function calculateStartingIndex() {
      const currentPage = getCurrentPage();
      globalIndex = (currentPage - 1) * 24 + 1;
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

    function observePageChanges() {
      const observer = new MutationObserver((mutations) => {
        mutations.forEach((mutation) => {
          if (mutation.type === 'childList' && mutation.addedNodes.length > 0) {
            const hasNewAppCards = Array.from(mutation.addedNodes).some(
              (node) =>
                node.nodeType === Node.ELEMENT_NODE &&
                ((node as Element).matches('[data-controller="app-card"]') ||
                  (node as Element).querySelector('[data-controller="app-card"]'))
            );

            if (hasNewAppCards) {
              setTimeout(addIndexesToAppCards, 100);
            }
          }
        });
      });

      observer.observe(document.body, {
        childList: true,
        subtree: true
      });

      observers.push(observer);
    }

    function observeUrlChanges() {
      let lastUrl = location.href;

      const urlObserver = new MutationObserver(() => {
        const url = location.href;
        if (url !== lastUrl) {
          lastUrl = url;
          calculateStartingIndex();
          setTimeout(addIndexesToAppCards, 500);
        }
      });

      urlObserver.observe(document, {
        subtree: true,
        childList: true
      });

      observers.push(urlObserver);
    }

    function init() {
      calculateStartingIndex();
      addIndexesToAppCards();
      observePageChanges();
      observeUrlChanges();
    }

    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', init);
    } else {
      init();
    }

    // Cleanup observers on unmount to prevent memory leaks
    ctx.onInvalidated(() => {
      observers.forEach((obs) => obs.disconnect());
    });
  }
});
