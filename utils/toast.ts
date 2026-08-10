import { sendTabMessage } from './messages';

// Define the custom element class
class AlfredToast extends HTMLElement {
  // Not private: Toast.setAutoHide writes this slot through the ToastElement
  // type, and disconnectedCallback below is what clears it.
  timeout: ReturnType<typeof setTimeout> | null = null;

  connectedCallback() {
    // Set popover attribute and class
    this.setAttribute('popover', 'manual');
    this.classList.add('alfred-toast');
  }

  disconnectedCallback() {
    // Clear the auto-hide timer Toast attached to this element
    if (this.timeout) {
      clearTimeout(this.timeout);
      this.timeout = null;
    }
  }
}

type ToastElement = HTMLElement & {
  timeout?: ReturnType<typeof setTimeout> | null;
};

export class Toast {
  private static toastCounter = 0;
  private static customElementDefined = false;

  private static defaults = {
    duration: 3000,
    hostTag: 'alfred-toast'
  };

  private static styles = `
    :host {
      top: auto;
      bottom: min(calc(29px + var(--alfred-toast-bottom-offset, 0px)), 79px);
      left: 50%;
      transform: translateX(-50%) translateY(40px);
      opacity: 0;
      pointer-events: none;
      transition: transform 400ms cubic-bezier(0.19, 0.91, 0.38, 1), opacity 400ms cubic-bezier(0.19, 0.91, 0.38, 1);
      margin: 0;
      padding: 0;
      border: none;
      background: none;
    }

    :host(.alfred-toast--show) {
      transform: translateX(-50%) translateY(0);
      opacity: 1;
    }

    :host(.alfred-toast--hide) {
      transform: translateX(-50%) scale(0.8);
      opacity: 0;
    }

    .alfred-toast__content, .alfred-toast__content * {
      box-sizing: border-box;
    }

    .alfred-toast__content {
      max-width: 500px;
      width: auto;
      background: rgb(26, 26, 26);
      border-radius: 8px;
      box-shadow: 0px 8px 16px -4px rgba(26, 26, 26, 0.52);
      padding: 12px;
      display: flex;
      align-items: flex-start;
      gap: 8px;
      pointer-events: auto;
      position: relative;
      color: rgb(227, 227, 227);
      font-family: -apple-system, BlinkMacSystemFont, "San Francisco", "Segoe UI", Roboto, "Helvetica Neue", sans-serif;
      font-size: 14px;
      line-height: 1.5;
    }

    .alfred-toast__content--error {
      background: rgb(199, 10, 36);
    }

    .alfred-toast__text {
      flex: 1;
      font-size: 13px;
      line-height: 20px;
      font-weight: 550;
      margin: 0;
      padding: 0;
      word-break: break-word;
    }

    .alfred-toast__close {
      width: 20px;
      height: 20px;
      background: none;
      border: none;
      cursor: pointer;
      color: inherit;
      padding: 0;
      margin: 0;
      display: flex;
      align-items: center;
      justify-content: center;
      flex-shrink: 0;
      outline: none;
      transition: opacity 200ms;
    }

    .alfred-toast__close:hover {
      opacity: 0.8;
    }

    .alfred-toast__close:focus-visible {
      outline: 2px solid rgba(255, 255, 255, 0.5);
      outline-offset: 2px;
      border-radius: 2px;
    }

    .alfred-toast__close svg {
      width: 100%;
      height: 100%;
      display: block;
    }
  `;

  private static getCustomElementRegistry(): CustomElementRegistry | null {
    return globalThis.customElements ?? document.defaultView?.customElements ?? null;
  }

  private static defineCustomElement() {
    const registry = this.getCustomElementRegistry();
    if (!registry) {
      return;
    }

    if (!this.customElementDefined && !registry.get(this.defaults.hostTag)) {
      registry.define(this.defaults.hostTag, AlfredToast);
      this.customElementDefined = true;
    }
  }

  private static setAutoHide(toastElement: ToastElement, duration: number) {
    if (toastElement.timeout) {
      clearTimeout(toastElement.timeout);
    }

    toastElement.timeout = setTimeout(() => {
      this.hideToast(toastElement);
    }, duration);
  }

  private static hideToast(toastElement: ToastElement) {
    if (toastElement.timeout) {
      clearTimeout(toastElement.timeout);
      toastElement.timeout = null;
    }

    toastElement.classList.remove('alfred-toast--show');
    toastElement.classList.add('alfred-toast--hide');

    setTimeout(() => {
      toastElement.hidePopover?.();
      toastElement.remove();
    }, 400);
  }

  static show(message: string, type: 'success' | 'error' = 'success', duration: number = this.defaults.duration) {
    // Ensure custom element is defined
    this.defineCustomElement();

    // Hide any existing toasts
    const existingToasts = document.querySelectorAll(this.defaults.hostTag);

    // If there are existing toasts, wait for them to hide before showing new one
    if (existingToasts.length > 0) {
      existingToasts.forEach((toast) => {
        this.hideToast(toast as ToastElement);
      });

      // Delay showing new toast until old one has mostly faded out
      setTimeout(() => {
        this.create(message, type, duration);
      }, 100);
      return;
    }

    // No existing toasts, show immediately
    this.create(message, type, duration);
  }

  private static create(message: string, type: 'success' | 'error', duration: number) {
    // Create new toast element
    const toastElement = document.createElement(this.defaults.hostTag) as ToastElement;
    const toastId = `alfred-toast-${++this.toastCounter}`;
    toastElement.id = toastId;
    toastElement.setAttribute('popover', 'manual');
    toastElement.classList.add('alfred-toast');

    // Check for PBarNextFrameWrapper and adjust bottom position
    const pBarWrapper = document.querySelector<HTMLElement>('#PBarNextFrameWrapper');
    if (pBarWrapper) {
      const height = pBarWrapper.offsetHeight;
      toastElement.style.setProperty('--alfred-toast-bottom-offset', `${height}px`);
    }

    // Attach shadow root
    const shadowRoot = toastElement.attachShadow({ mode: 'open' });

    // Add styles
    const styleEl = document.createElement('style');
    styleEl.textContent = this.styles;
    shadowRoot.appendChild(styleEl);

    // Create toast container
    const toast = document.createElement('div');
    toast.className = `alfred-toast__content${type === 'error' ? ' alfred-toast__content--error' : ''}`;

    toast.innerHTML = `
      <div class="alfred-toast__text"></div>
      <button class="alfred-toast__close" aria-label="Close notification">
        <svg viewBox="1 1 18 18" fill="currentColor" focusable="false" aria-hidden="true">
          <path d="M12.72 13.78a.75.75 0 1 0 1.06-1.06l-2.72-2.72 2.72-2.72a.75.75 0 0 0-1.06-1.06l-2.72 2.72-2.72-2.72a.75.75 0 0 0-1.06 1.06l2.72 2.72-2.72 2.72a.75.75 0 1 0 1.06 1.06l2.72-2.72 2.72 2.72Z"></path>
        </svg>
      </button>
    `;

    // Use textContent to prevent XSS
    const content = toast.querySelector('.alfred-toast__text')!;
    content.textContent = message;

    // Add event listener to close button
    const closeBtn = toast.querySelector('.alfred-toast__close')!;
    closeBtn.addEventListener('click', () => this.hideToast(toastElement));

    shadowRoot.appendChild(toast);

    // Add to DOM
    document.body.appendChild(toastElement);

    // Show popover
    toastElement.showPopover?.();

    // Add show class after next frame to trigger animation
    requestAnimationFrame(() => {
      toastElement.classList.add('alfred-toast--show');
    });

    // Set auto-hide if duration is specified
    if (duration > 0) {
      this.setAutoHide(toastElement, duration);
    }
  }

  static success(message: string, duration?: number) {
    this.show(message, 'success', duration);
  }

  static error(message: string, duration?: number) {
    this.show(message, 'error', duration);
  }
}

/**
 * Shows a toast inside a tab from a context that has no DOM of its own (e.g. the
 * background service worker) by messaging the tab's content script, which renders it via
 * {@link Toast}. Best-effort: silently no-ops if the tab has no Alfred content script to
 * receive the message (restricted pages, the web store, the extension's own pages).
 * @param tabId - The target tab. No-ops when undefined.
 * @param message - The toast text.
 * @param toastType - Toast styling; defaults to 'error'.
 */
export async function showTabToast(
  tabId: number | undefined,
  message: string,
  toastType: 'success' | 'error' = 'error'
): Promise<void> {
  if (tabId == null) return;
  try {
    await sendTabMessage(tabId, 'alfred_toast', { message, toastType });
  } catch {
    // No Alfred content script on this page to surface the toast.
  }
}
