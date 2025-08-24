export class Toast {
  private static toastCounter = 0;
  private static currentToastTimeout: ReturnType<typeof setTimeout> | null = null;
  private static isTransitioning = false;
  private static shadowHost: HTMLElement | null = null;
  private static shadowRoot: ShadowRoot | null = null;

  private static defaults = {
    duration: 3000,
    hostId: 'alfred-toast-host'
  };

  private static styles = `
    :host {
      position: fixed;
      bottom: 1.25rem;
      left: 50%;
      transform: translateX(-50%);
      pointer-events: none;
      display: flex;
      flex-direction: column-reverse;
      gap: 12px;
    }

    .alfred-toast {
      max-width: 31.25rem;
      width: auto;
      background: rgb(26, 26, 26);
      border-radius: 0.5rem;
      box-shadow: 0rem 0.5rem 1rem -0.25rem rgba(26, 26, 26, 0.22);
      padding: 0.75rem;
      display: flex;
      align-items: flex-start;
      gap: 0.5rem;
      pointer-events: auto;
      position: relative;
      color: rgb(227, 227, 227);
      transform: translateY(20px);
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
      font-size: 0.815rem;
      line-height: 1.25rem;
      font-weight: 550;
      margin: 0;
      padding: 0;
      word-break: break-word;
    }

    .alfred-toast__close {
      width: 1.25rem;
      height: 1.25rem;
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

  static init(options: Partial<typeof Toast.defaults> = {}) {
    Object.assign(this.defaults, options);
    this.initShadowContainer();
  }

  private static initShadowContainer() {
    if (!this.shadowHost) {
      // Check if host already exists
      this.shadowHost = document.getElementById(this.defaults.hostId);

      if (!this.shadowHost) {
        // Create shadow host
        this.shadowHost = document.createElement('div');
        this.shadowHost.id = this.defaults.hostId;
        // Only set essential styles - shadow DOM will isolate the rest
        this.shadowHost.style.position = 'fixed';
        this.shadowHost.style.zIndex = '2147483647';
        this.shadowHost.style.pointerEvents = 'none';
        document.body.appendChild(this.shadowHost);
      }

      // Create shadow root if it doesn't exist
      if (!this.shadowRoot) {
        this.shadowRoot = this.shadowHost.attachShadow({ mode: 'open' });

        // Add styles
        const styleEl = document.createElement('style');
        styleEl.textContent = this.styles;
        this.shadowRoot.appendChild(styleEl);
      }
    }
    return this.shadowRoot;
  }

  static show(message: string, type: 'success' | 'error' = 'success', duration: number = this.defaults.duration) {
    this.initShadowContainer();

    // Clear any existing timeout
    if (this.currentToastTimeout) {
      clearTimeout(this.currentToastTimeout);
      this.currentToastTimeout = null;
    }

    // Check if there's an existing toast
    const existingToasts = this.shadowRoot!.querySelectorAll('.alfred-toast:not(.alfred-toast--hiding)');

    if (existingToasts.length > 0) {
      // If we're already transitioning, ignore this call
      if (this.isTransitioning) return;

      this.isTransitioning = true;

      // Hide existing toasts immediately
      existingToasts.forEach(toast => {
        toast.classList.add('alfred-toast--hiding');
      });

      // Wait for animation to complete, then show new toast
      setTimeout(() => {
        // Remove old toasts
        const hidingToasts = this.shadowRoot!.querySelectorAll('.alfred-toast--hiding');
        hidingToasts.forEach(toast => toast.remove());

        // Create new toast
        this.createToast(message, type, duration);
        this.isTransitioning = false;
      }, 400);
    } else {
      // No existing toast, show immediately
      this.createToast(message, type, duration);
    }
  }

  private static createToast(message: string, type: 'success' | 'error', duration: number) {
    const toastId = `alfred-toast-${++this.toastCounter}`;

    const toast = document.createElement('div');
    toast.className = `alfred-toast${type === 'error' ? ' alfred-toast--error' : ''}`;
    toast.id = toastId;

    // Create content div
    const content = document.createElement('div');
    content.className = 'alfred-toast__content';
    content.textContent = message; // Use textContent to prevent XSS

    // Create close button
    const closeBtn = document.createElement('button');
    closeBtn.className = 'alfred-toast__close';
    closeBtn.setAttribute('aria-label', 'Close notification');
    closeBtn.innerHTML = `
      <svg viewBox="1 1 18 18" fill="currentColor" focusable="false" aria-hidden="true">
        <path d="M12.72 13.78a.75.75 0 1 0 1.06-1.06l-2.72-2.72 2.72-2.72a.75.75 0 0 0-1.06-1.06l-2.72 2.72-2.72-2.72a.75.75 0 0 0-1.06 1.06l2.72 2.72-2.72 2.72a.75.75 0 1 0 1.06 1.06l2.72-2.72 2.72 2.72Z"></path>
      </svg>
    `;

    // Add event listener to close button
    closeBtn.addEventListener('click', () => this.close(toastId));

    // Append elements
    toast.appendChild(content);
    toast.appendChild(closeBtn);
    this.shadowRoot!.appendChild(toast);

    // Trigger reflow to ensure the initial state is applied
    toast.offsetHeight;

    // Add show class to trigger transition
    toast.classList.add('alfred-toast--show');

    if (duration > 0) {
      this.currentToastTimeout = setTimeout(() => {
        this.close(toastId);
      }, duration);
    }
  }

  static close(toastId: string) {
    const toast = this.shadowRoot?.getElementById(toastId);
    if (toast && !toast.classList.contains('alfred-toast--hiding')) {
      toast.classList.add('alfred-toast--hiding');

      // Clear timeout if this is the current toast
      if (this.currentToastTimeout) {
        clearTimeout(this.currentToastTimeout);
        this.currentToastTimeout = null;
      }

      setTimeout(() => {
        if (toast.parentNode) {
          toast.parentNode.removeChild(toast);
        }
      }, 400);
    }
  }

  static success(message: string, duration?: number) {
    this.show(message, 'success', duration);
  }

  static error(message: string, duration?: number) {
    this.show(message, 'error', duration);
  }

  // Auto-initialize when DOM is ready
  static autoInit() {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', () => this.initShadowContainer());
    } else {
      this.initShadowContainer();
    }
  }
}
