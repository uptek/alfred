/**
 * Restore right-click and text selection on Shopify sites.
 * Some Shopify storefronts block these features, which can be frustrating for users.
 * This utility re-enables them by overriding event listeners and removing inline handlers.
 *
 * Note: Limited to Shopify sites only to avoid conflicts with apps like Google Docs
 * that have their own custom context menus.
 */

const blockedEvents = ['contextmenu', 'copy', 'cut', 'paste', 'selectstart', 'dragstart'];

/**
 * Early Shopify detection using HTML elements (available before JS globals).
 * This is more reliable than checking window.Shopify which loads later.
 */
const isShopifyEarly = (): boolean => {
  return (
    !!document.querySelector('link[href*="cdn.shopify.com"]') ||
    !!document.querySelector('meta[name="shopify-checkout-api-token"]')
  );
};

/**
 * Initialize the restore right-click functionality.
 * Must be called early (before site scripts run) to intercept addEventListener.
 */
export const initRestoreRightClick = (): void => {
  // Only run on Shopify sites to avoid conflicts with apps like Google Docs
  if (!isShopifyEarly()) {
    return;
  }

  // Override addEventListener IMMEDIATELY to intercept before site scripts run
  // eslint-disable-next-line @typescript-eslint/unbound-method
  const originalAddEventListener = EventTarget.prototype.addEventListener;
  EventTarget.prototype.addEventListener = function (
    type: string,
    listener: EventListenerOrEventListenerObject,
    options?: boolean | AddEventListenerOptions
  ) {
    if (blockedEvents.includes(type)) {
      return;
    }
    originalAddEventListener.call(this, type, listener, options);
  };

  // Capture and stop propagation for blocked events (also needs to be early)
  blockedEvents.forEach((eventType) => {
    document.addEventListener(eventType, (e) => e.stopPropagation(), true);
  });

  // These can wait for DOM to be ready
  const restoreRightClickDOM = () => {
    // Remove inline handlers
    document
      .querySelectorAll('[oncontextmenu], [oncopy], [oncut], [onpaste], [onselectstart], [ondragstart]')
      .forEach((el) => {
        el.removeAttribute('oncontextmenu');
        el.removeAttribute('oncopy');
        el.removeAttribute('oncut');
        el.removeAttribute('onpaste');
        el.removeAttribute('onselectstart');
        el.removeAttribute('ondragstart');
      });

    // Inject CSS to enable text selection
    const style = document.createElement('style');
    style.id = 'alfred-restore-right-click';
    style.textContent = `
      *, *::before, *::after {
        user-select: text !important;
        -webkit-user-select: text !important;
      }
    `;
    document.head.appendChild(style);
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', restoreRightClickDOM);
  } else {
    restoreRightClickDOM();
  }
};
