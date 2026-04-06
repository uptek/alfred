import { getItem, setItem } from '@/utils/storage';

type ThemeMode = 'light' | 'dark' | 'system';
const STORAGE_KEY = 'devDashboardTheme';

export default defineContentScript({
  matches: ['https://dev.shopify.com/dashboard/*'],
  runAt: 'document_start',

  async main() {
    const saved = await getItem<ThemeMode>(STORAGE_KEY);
    const mode = saved ?? 'system';

    applyTheme(mode);

    // Inject toggle and re-inject when SPA navigation rebuilds the header
    let injecting = false;
    const tryInject = async () => {
      if (injecting || document.getElementById('alfred-theme-toggle')) return;
      injecting = true;
      try {
        const current = (await getItem<ThemeMode>(STORAGE_KEY)) ?? 'system';
        applyTheme(current);
        injectToggle(current);
      } finally {
        injecting = false;
      }
    };

    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', () => tryInject(), { once: true });
    } else {
      tryInject();
    }

    // SPA navigation rebuilds the header, destroying our toggle.
    // Debounced observer avoids excessive checks on rapid DOM mutations.
    let debounceTimer: ReturnType<typeof setTimeout>;
    const observer = new MutationObserver(() => {
      if (document.getElementById('alfred-theme-toggle')) return;
      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(tryInject, 200);
    });
    observer.observe(document.documentElement, { childList: true, subtree: true });

    // Listen for system color scheme changes once (not per-injection)
    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', async () => {
      const current = (await getItem<ThemeMode>(STORAGE_KEY)) ?? 'system';
      if (current === 'system') {
        applyTheme('system');
      }
    });
  },
});

function applyTheme(mode: ThemeMode) {
  const resolved = mode === 'system' ? (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light') : mode;

  const html = document.documentElement;

  if (resolved === 'light') {
    html.classList.remove('dark');
    html.classList.add('light');
    html.style.colorScheme = 'light';
    html.style.setProperty('--color-background-surface-hover', '#f5f5f5');
    injectLightFixesCSS();
  } else {
    html.classList.remove('light');
    html.classList.add('dark');
    html.style.colorScheme = 'dark';
    html.style.removeProperty('--color-background-surface-hover');
    removeLightFixesCSS();
  }
}

function injectLightFixesCSS() {
  if (document.getElementById('alfred-dev-dashboard-light')) return;
  const style = document.createElement('style');
  style.id = 'alfred-dev-dashboard-light';
  style.textContent = `
    html.light .w-desktop-nav-sidebar {
      box-shadow: 1px 0px 1px #1f21241a !important;
      overflow: visible !important;
    }
    html.light #store-switcher-popover { overflow: visible !important; }
    html.light #store-switcher-popover > div { box-shadow: 0px 3px 2px 0px #0000001a !important; }
    html.light svg[aria-label="Default app icon"] { background-color: #e3f1f3 !important; }
    html.light svg[aria-label="Default app icon"] path { fill: #4b6468 !important; }
    html.light .table, html.light .table thead, html.light .table tbody,
    html.light .table tr, html.light .table th, html.light .table td {
      background: transparent !important; border: none !important;
    }
    html.light .table {
      border-collapse: separate; border-spacing: 0; width: 100%;
      border: 1px solid #f5f5f5 !important; border-radius: 8px; overflow: hidden;
    }
    html.light .table th {
      color: #6d7175 !important; font-weight: 600; text-align: left;
      padding: 10px 16px; background-color: #f5f5f5 !important;
    }
    html.light .table td {
      color: #202223 !important; padding: 14px 16px;
      border-top: 1px solid #f0f0f0 !important;
    }
    html.light .table tbody tr:hover { background-color: #f5f5f5 !important; }
    html.light .text-text-subdued { color: #6d7175 !important; }
    html.light .font-mono:not(a):not(a *) { color: #8c9196 !important; }
  `;
  const append = () => document.head.appendChild(style);
  if (document.head) append();
  else document.addEventListener('DOMContentLoaded', append, { once: true });
}

function removeLightFixesCSS() {
  document.getElementById('alfred-dev-dashboard-light')?.remove();
}

function injectToggle(currentMode: ThemeMode) {
  const headerLastDiv = document.querySelector('header > div:last-child');
  if (!headerLastDiv) return;

  const container = document.createElement('div');
  container.id = 'alfred-theme-toggle';
  container.style.cssText =
    'display:flex;align-items:center;gap:1px;margin-right:8px;padding:2px;border-radius:8px;background:var(--color-topnav-surface-active);position:relative;';

  // Sliding pill indicator
  const pill = document.createElement('div');
  pill.style.cssText = 'position:absolute;border-radius:6px;transition:left 0.25s cubic-bezier(0.4,0,0.2,1),width 0.25s cubic-bezier(0.4,0,0.2,1);pointer-events:none;top:2px;bottom:2px;z-index:0;';
  container.appendChild(pill);

  let active = currentMode;

  function updatePill() {
    const isLight = document.documentElement.classList.contains('light');
    const activeWrap = container.querySelector<HTMLElement>(`[data-wrap="${active}"]`);
    if (activeWrap) {
      const containerRect = container.getBoundingClientRect();
      const wrapRect = activeWrap.getBoundingClientRect();
      pill.style.left = (wrapRect.left - containerRect.left) + 'px';
      pill.style.width = wrapRect.width + 'px';
      pill.style.background = 'var(--color-topnav-background)';
      pill.style.boxShadow = isLight ? '0 1px 3px rgba(0,0,0,0.1)' : '0 1px 3px rgba(0,0,0,0.3)';
    }
  }

  function updateActive() {
    container.querySelectorAll<HTMLButtonElement>('button').forEach((b) => {
      const isActive = b.dataset.mode === active;
      b.style.cssText = `
        position:relative;z-index:1;
        border:none;cursor:pointer;padding:4px 10px;border-radius:6px;
        font-size:12px;font-weight:500;font-family:inherit;line-height:1.4;
        transition:opacity 0.15s ease;
        background:transparent;
        color:var(--color-topnav-text);
        opacity:${isActive ? '1' : '0.5'};
      `;
    });
    requestAnimationFrame(updatePill);
  }

  const ICONS: Record<ThemeMode, string> = {
    light:
      '<svg width="16" height="16" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><circle cx="10" cy="10" r="3.5"/><path d="M10 2.5v2M10 15.5v2M17.5 10h-2M4.5 10h-2M15.3 4.7l-1.4 1.4M6.1 13.9l-1.4 1.4M15.3 15.3l-1.4-1.4M6.1 6.1L4.7 4.7"/></svg>',
    dark: '<svg width="16" height="16" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M16.5 13.1A7 7 0 016.9 3.5a7 7 0 109.6 9.6z"/></svg>',
    system:
      '<svg width="16" height="16" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="10" cy="10" r="7"/><path d="M10 3v14" fill="currentColor"/><path d="M10 3a7 7 0 010 14z" fill="currentColor"/></svg>',
  };

  const modes: ThemeMode[] = ['light', 'dark', 'system'];

  modes.forEach((value) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.innerHTML = ICONS[value];
    btn.dataset.mode = value;

    // Wrap in a positioned container for tooltip
    const wrap = document.createElement('div');
    wrap.dataset.wrap = value;
    wrap.style.cssText = 'position:relative;display:flex;';

    const tooltip = document.createElement('span');
    tooltip.textContent = value.charAt(0).toUpperCase() + value.slice(1);
    tooltip.style.cssText = `
      position:absolute;top:100%;margin-top:10px;left:50%;transform:translateX(-50%);
      padding:4px 10px;border-radius:6px;font-size:11px;font-weight:500;
      white-space:nowrap;pointer-events:none;opacity:0;transition:opacity 0.15s;
      background:var(--color-background-surface-default);color:var(--color-text-default);
      box-shadow:0 2px 8px rgba(0,0,0,0.15);z-index:50;
    `;
    // Arrow
    const arrow = document.createElement('span');
    arrow.style.cssText = `
      position:absolute;top:-3px;left:50%;transform:translateX(-50%) rotate(45deg);
      width:8px;height:8px;border-radius:2px;
      background:var(--color-background-surface-default);
      box-shadow:-1px -1px 2px rgba(0,0,0,0.06);
      z-index:-1;
    `;
    tooltip.appendChild(arrow);
    wrap.appendChild(btn);
    wrap.appendChild(tooltip);
    wrap.addEventListener('mouseenter', () => {
      tooltip.style.opacity = '1';
      if (btn.dataset.mode !== active) {
        btn.style.background = 'var(--color-topnav-surface-hover)';
      }
    });
    wrap.addEventListener('mouseleave', () => {
      tooltip.style.opacity = '0';
      if (btn.dataset.mode !== active) {
        btn.style.background = 'transparent';
      }
    });

    btn.addEventListener('click', async () => {
      active = value;
      setItem(STORAGE_KEY, value);
      applyTheme(value);
      requestAnimationFrame(updateActive);
    });

    container.appendChild(wrap);
  });

  headerLastDiv.prepend(container);
  updateActive();
}
