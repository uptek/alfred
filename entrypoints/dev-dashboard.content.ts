export default defineContentScript({
  matches: ['https://dev.shopify.com/dashboard/*'],
  runAt: 'document_start',

  main() {
    // Switch to built-in light theme
    document.documentElement.classList.remove('dark');
    document.documentElement.classList.add('light');
    document.documentElement.style.colorScheme = 'light';

    document.documentElement.style.setProperty(
      '--color-background-surface-hover',
      '#f5f5f5',
    );

    // Fix the few things the built-in .light theme doesn't handle
    const style = document.createElement('style');
    style.textContent = `
      /* Sidebar container: right-side shadow */
      html.light .w-desktop-nav-sidebar {
        box-shadow: 1px 0px 1px #1f21241a !important;
        overflow: visible !important;
      }

      /* Store switcher popover shadow */
      html.light #store-switcher-popover {
        overflow: visible !important;
      }
      html.light #store-switcher-popover > div {
        box-shadow: 0px 3px 2px 0px #0000001a !important;
      }

      /* App icon SVGs: hardcoded dark teal bg */
      html.light svg[aria-label="Default app icon"] {
        background-color: #e3f1f3 !important;
      }
      html.light svg[aria-label="Default app icon"] path {
        fill: #4b6468 !important;
      }

      /* Table light mode */
      html.light .table,
      html.light .table thead,
      html.light .table tbody,
      html.light .table tr,
      html.light .table th,
      html.light .table td {
        background: transparent !important;
        border: none !important;
      }
      html.light .table {
        border-collapse: separate;
        border-spacing: 0;
        width: 100%;
        border: 1px solid #f5f5f5 !important;
        border-radius: 8px;
        overflow: hidden;
      }
      html.light .table th {
        color: #6d7175 !important;
        font-weight: 600;
        text-align: left;
        padding: 10px 16px;
        background-color: #f5f5f5 !important;
      }
      html.light .table td {
        color: #202223 !important;
        padding: 14px 16px;
        border-top: 1px solid #f0f0f0 !important;
      }
      html.light .table tbody tr:hover {
        background-color: #f5f5f5 !important;
      }

      /* Keep subdued/mono text gray */
      html.light .text-text-subdued {
        color: #6d7175 !important;
      }
      html.light .font-mono:not(a):not(a *) {
        color: #8c9196 !important;
      }
    `;
    // document.head may not exist yet at document_start
    const inject = () => {
      if (document.getElementById('alfred-dev-dashboard-light')) return;
      style.id = 'alfred-dev-dashboard-light';
      document.head.appendChild(style);
    };
    if (document.head) {
      inject();
    } else {
      document.addEventListener('DOMContentLoaded', inject, { once: true });
    }
  },
});
