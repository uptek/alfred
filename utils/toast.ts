// Define the custom element class
class AlfredToast extends HTMLElement {
  private timeout: ReturnType<typeof setTimeout> | null = null;

  disconnectedCallback() {
    // Cleanup when removed from DOM
    if (this.timeout) {
      clearTimeout(this.timeout);
      this.timeout = null;
    }
  }

  setAutoHide(duration: number) {
    if (this.timeout) {
      clearTimeout(this.timeout);
    }
    this.timeout = setTimeout(() => {
      this.hide();
    }, duration);
  }

  hide() {
    if (this.timeout) {
      clearTimeout(this.timeout);
      this.timeout = null;
    }

    // Add hiding animation
    const toast = this.shadowRoot?.querySelector('.alfred-toast');
    if (toast) {
      toast.classList.add('alfred-toast--hiding');
      setTimeout(() => {
        this.remove();
      }, 400);
    }
  }
}

export class Toast {
  private static toastCounter = 0;
  private static customElementDefined = false;

  private static defaults = {
    duration: 3000,
    hostTag: 'alfred-toast'
  };

  private static styles = `
    :host {
      position: fixed;
      bottom: 20px;
      left: 50%;
      transform: translateX(-50%);
      display: block;
      z-index: 2147483647;
      pointer-events: none;
    }

    .alfred-toast {
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
      transform: translateY(40px);
      opacity: 0;
      transition: transform 400ms cubic-bezier(0.19, 0.91, 0.38, 1), opacity 400ms cubic-bezier(0.19, 0.91, 0.38, 1);
      font-family: -apple-system, BlinkMacSystemFont, "San Francisco", "Segoe UI", Roboto, "Helvetica Neue", sans-serif;
      font-size: 14px;
      line-height: 1.5;
      box-sizing: border-box;
    }

    .alfred-toast * {
      box-sizing: border-box;
    }

    .alfred-toast--show {
      transform: translateY(0);
      opacity: 1;
    }

    .alfred-toast--hiding {
      transform: scale(0.8);
      opacity: 0;
    }

    .alfred-toast--error {
      background: rgb(199, 10, 36);
    }

    .alfred-toast__content {
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

  private static defineCustomElement() {
    if (!this.customElementDefined && !customElements.get(this.defaults.hostTag)) {
      customElements.define(this.defaults.hostTag, AlfredToast);
      this.customElementDefined = true;
    }
  }

  static show(message: string, type: 'success' | 'error' = 'success', duration: number = this.defaults.duration) {
    // Ensure custom element is defined
    this.defineCustomElement();

    // Hide any existing toasts
    const existingToasts = document.querySelectorAll(this.defaults.hostTag);

    // If there are existing toasts, wait for them to hide before showing new one
    if (existingToasts.length > 0) {
      existingToasts.forEach(toast => {
        (toast as AlfredToast).hide();
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
    const toastElement = document.createElement(this.defaults.hostTag) as AlfredToast;
    const toastId = `alfred-toast-${++this.toastCounter}`;
    toastElement.id = toastId;

    // Attach shadow root
    const shadowRoot = toastElement.attachShadow({ mode: 'open' });

    // Add styles
    const styleEl = document.createElement('style');
    styleEl.textContent = this.styles;
    shadowRoot.appendChild(styleEl);

    // Create toast container
    const toast = document.createElement('div');
    toast.className = `alfred-toast${type === 'error' ? ' alfred-toast--error' : ''}`;

    toast.innerHTML = `
      <div class="alfred-toast__content"></div>
      <button class="alfred-toast__close" aria-label="Close notification">
        <svg viewBox="1 1 18 18" fill="currentColor" focusable="false" aria-hidden="true">
          <path d="M12.72 13.78a.75.75 0 1 0 1.06-1.06l-2.72-2.72 2.72-2.72a.75.75 0 0 0-1.06-1.06l-2.72 2.72-2.72-2.72a.75.75 0 0 0-1.06 1.06l2.72 2.72-2.72 2.72a.75.75 0 1 0 1.06 1.06l2.72-2.72 2.72 2.72Z"></path>
        </svg>
      </button>
    `;

    // Use textContent to prevent XSS
    const content = toast.querySelector('.alfred-toast__content')!;
    content.textContent = message;

    // Add event listener to close button
    const closeBtn = toast.querySelector('.alfred-toast__close')!;
    closeBtn.addEventListener('click', () => toastElement.hide());

    shadowRoot.appendChild(toast);

    // Add to DOM
    document.body.appendChild(toastElement);

    // Trigger reflow to ensure the initial state is applied
    toast.offsetHeight;

    // Add show class to trigger transition
    toast.classList.add('alfred-toast--show');

    // Set auto-hide if duration is specified
    if (duration > 0) {
      toastElement.setAutoHide(duration);
    }
  }

  static success(message: string, duration?: number) {
    this.show(message, 'success', duration);
  }

  static error(message: string, duration?: number) {
    this.show(message, 'error', duration);
  }
}
