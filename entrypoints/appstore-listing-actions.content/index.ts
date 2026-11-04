import { sendTrackEvent } from '@/utils/analytics';
import type { AnalyticsAction } from '~/utils/analytics-actions';
import { isAppHandle } from '~/utils/compareTray';
import { getListingActions, icon, ICON_PATHS, LISTING_ACTION_CLASSES } from '~/utils/listingActions';
import { getSettings, isEnabled } from '~/utils/settings';

const BUTTON_CLASS = 'alfred-copy-button';

interface CopyItem {
  label: string;
  ariaLabel: string;
  value: string;
  action: AnalyticsAction;
}

function getCopyItems(hero: Element, handle: string): CopyItem[] {
  // The Install button carries the app's API key, which is its client ID
  const clientId = hero.querySelector('[data-api-key]')?.getAttribute('data-api-key');

  const items: CopyItem[] = [
    {
      label: 'Review link',
      ariaLabel: 'Copy review link',
      // The hash opens the listing's "Write a review" modal on load
      value: `https://apps.shopify.com/${handle}#modal-show=WriteReviewModal`,
      action: 'apps.listing_actions.review_link_copy'
    }
  ];

  if (clientId) {
    items.push({
      label: 'Client ID',
      ariaLabel: 'Copy client ID',
      value: clientId,
      action: 'apps.listing_actions.client_id_copy'
    });
  }

  return items;
}

function createCopyButton(item: CopyItem, handle: string): HTMLButtonElement {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = `${BUTTON_CLASS} ${LISTING_ACTION_CLASSES}`;
  button.title = item.value;
  button.setAttribute('aria-label', item.ariaLabel);
  button.innerHTML = icon(ICON_PATHS.copy);
  button.append(item.label);

  const path = button.querySelector('path')!;
  let resetTimeout: number | undefined;

  // A failed write leaves the copy icon in place, which is the only signal
  button.addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(item.value);
    } catch {
      return;
    }
    path.setAttribute('d', ICON_PATHS.check);
    clearTimeout(resetTimeout);
    resetTimeout = window.setTimeout(() => path.setAttribute('d', ICON_PATHS.copy), 1500);
    sendTrackEvent(item.action, { handle });
  });

  return button;
}

export default defineContentScript({
  matches: ['*://apps.shopify.com/*'],
  async main(ctx) {
    const settings = await getSettings();

    if (!isEnabled(settings.appStore.listingActions)) {
      return;
    }

    const inject = () => {
      // Only individual listings live at a single-segment path like /judgeme
      const handle = window.location.pathname.slice(1);
      const hero = document.getElementById('adp-hero');
      const actions = hero && isAppHandle(handle) ? getListingActions() : null;

      if (!hero || !actions || actions.querySelector(`.${BUTTON_CLASS}`)) {
        return;
      }

      actions.append(...getCopyItems(hero, handle).map((item) => createCopyButton(item, handle)));
    };

    inject();
    // The App Store navigates with Turbo, which swaps the body without
    // reloading the content script.
    ctx.addEventListener(document, 'turbo:load', inject);
  }
});
