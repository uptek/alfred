const ACTIONS_ID = 'alfred-listing-actions';

/**
 * The App Store's own secondary pill button classes, copied from the
 * listing's "Write a review" button, so Alfred's buttons match the page and
 * follow its restyles. Swap `tw-button-secondary` for `tw-button-primary` to
 * show a selected state.
 */
export const LISTING_ACTION_CLASSES =
  'tw-inline-flex tw-items-center tw-justify-center tw-gap-xs tw-rounded-full tw-cursor-pointer tw-appearance-none tw-text-center tw-border tw-outline-3 tw-outline-button-outline-focus focus-visible:tw-outline tw-button-secondary tw-whitespace-nowrap tw-px-4 tw-py-xs tw-text-link-sm';

export const ICON_PATHS = {
  plus: 'M12 5v14M5 12h14',
  check: 'M5 13l4 4L19 7',
  copy: 'M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z'
};

/**
 * Stroke icon sized to the button text. Icons are SVG, not characters like
 * "✓": Inter lacks those glyphs, so Chrome flashes its hex-code placeholder
 * before falling back to a system font.
 */
export const icon = (path: string) =>
  `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" style="width:1.1em;height:1.1em;flex-shrink:0"><path d="${path}" /></svg>`;

/**
 * Shared row of Alfred buttons at the bottom of an App Store listing's hero,
 * below Install and "View demo store", so the title area stays untouched.
 * Created on first use by whichever content script needs it, and gone after
 * a Turbo visit swaps the body. Null when the page has no listing hero.
 */
export function getListingActions(): HTMLElement | null {
  const hero = document.getElementById('adp-hero');

  if (!hero) {
    return null;
  }

  let actions = document.getElementById(ACTIONS_ID);

  if (!actions) {
    actions = document.createElement('div');
    actions.id = ACTIONS_ID;
    actions.className =
      'tw-flex tw-flex-wrap tw-justify-center tw-gap-sm tw-mt-lg tw-pt-lg tw-border-t tw-border-t-stroke-secondary';
    // The "View demo store" link ends the hero with a bottom margin of its
    // own; dropping it keeps the divider 16px below the hero either way.
    hero.querySelector<HTMLElement>('#analytics-viewItem > :last-child')?.style.setProperty('margin-bottom', '0');
    hero.append(actions);
  }

  return actions;
}
