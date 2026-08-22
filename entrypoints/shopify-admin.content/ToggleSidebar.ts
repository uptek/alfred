import { getItem, setItem } from '~/utils/storage';
import { isEnabled, type ResolvedSettings } from '~/utils/settings';
import { sendTrackEvent } from '~/utils/analytics';

type SidebarState = 'collapsed' | 'expanded';

let SIDEBAR_STATE: SidebarState = 'expanded';
// The admin nav uses CSS-module classes whose hash suffix changes per Shopify
// deploy (_Section_xhno8_1285 → _Section_<newhash>_…), so every selector here
// matches on the stable prefix or a data attribute, never a full class name.
const TOGGLE_WRAPPER_SELECTOR = '#AppFrameNav ul[class*="_Section_"]:has(s-internal-icon[type*="home"])';
const TOGGLE_ELEMENT_ID = 'alfred-admin-sidebar-toggle';
const STYLE_TAG_ID = 'alfred-admin-sidebar-styles';
const STYLES = `
  :root {
    --pg-navigation-width: 4rem !important;
  }

  #AppFrameNav span[class*="_Text_"],
  #AppFrameNav div[class*="_Heading_"],
  #AppFrameNav div[class*="_Badge_"],
  #AppFrameNav [class*="_SecondaryAction"],
  #AppFrameNav li[class*="_ListItem_"]:has([class*="_subNavigationActive_"]) div[class*="_SecondaryNavigation_"] {
    display: none !important;
  }

  #AppFrameNav a[data-navitem="item"] {
    position: relative !important;
  }

  #AppFrameNav a[class*="_subNavigationActive_"]:before,
  #AppFrameNav a[class*="_Item-selected_"]:before {
    content: "•" !important;
    position: absolute !important;
    height: 1.5rem !important;
    left: 0 !important;
    top: 50% !important;
    transform: translateY(-50%) !important;
    opacity: 1 !important;
  }

  /* macOS Dock-like magnification effect */
  #AppFrameNav li[class*="_ListItem_"] {
    margin-bottom: var(--p-space-025);
  }

  #AppFrameNav li[class*="_ListItem_"] {
    transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1) !important;
    transform-origin: center !important;
  }

  #AppFrameNav li[class*="_ListItem_"]:hover {
    transform: scale(1.1) !important;
    z-index: 10 !important;
    position: relative !important;
  }

  #AppFrameNav li[class*="_ListItem_"]:hover + li[class*="_ListItem_"],
  #AppFrameNav li[class*="_ListItem_"]:has(+ li[class*="_ListItem_"]:hover) {
    transform: scale(1.05) !important;
    z-index: 5 !important;
    position: relative !important;
  }

  #AppFrameNav li[class*="_ListItem_"] div[class*="_Icon_"] {
    transition: transform 0.3s cubic-bezier(0.4, 0, 0.2, 1) !important;
  }

  #AppFrameNav li[class*="_ListItem_"]:hover div[class*="_Icon_"] {
    transform: scale(1.1) !important;
  }
`;

/**
 * Injects styles to the document
 */
const injectStyles = (): void => {
  if (SIDEBAR_STATE === 'expanded') return;

  if (!document.head) {
    setTimeout(injectStyles, 100);
    return;
  }

  const styleElement = document.createElement('style');
  styleElement.textContent = STYLES;
  styleElement.id = STYLE_TAG_ID;

  // Remove existing style if present
  removeStyles();

  // Append the style element to the head
  document.head.appendChild(styleElement);
};

/**
 * Removes the styles from the document
 */
const removeStyles = (): void => {
  const existing = document.getElementById(STYLE_TAG_ID);
  if (existing) {
    existing.remove();
  }
};

/**
 * Reads the class of the first element matching the selector inside the nav,
 * dropping state-variant tokens (selected/active/crossfade) so the toggle
 * inherits base styling only. Live class names are copied because the hash
 * part is not knowable ahead of time.
 */
const liveClass = (...selectors: string[]): string => {
  for (const selector of selectors) {
    const el = document.querySelector(`#AppFrameNav ${selector}`);
    if (!el) continue;
    return Array.from(el.classList)
      .filter((token) => !/selected|Active|crossfade/i.test(token))
      .join(' ');
  }
  return '';
};

/**
 * Injects the toggle element into the document
 */
const injectToggleElement = (): void => {
  const buildToggle = (): HTMLLIElement => {
    const toggleElement = document.createElement('li');
    toggleElement.id = TOGGLE_ELEMENT_ID;
    toggleElement.className = liveClass('li[class*="_ListItem_"]');
    toggleElement.setAttribute('data-state', SIDEBAR_STATE);
    toggleElement.innerHTML = `
    <div class="${liveClass('[data-navitem="item-wrapper"]', 'div[class*="_ItemWrapper_"]')}">
      <div class="${liveClass('[data-navitem="item-inner-wrapper"]', 'div[class*="_ItemInnerWrapper_"]')}">
        <a data-polaris-unstyled="true" class="${liveClass('a[data-navitem="item"]', 'a[class*="_Item_"]')}" tabindex="0" aria-disabled="false">
          <div class="${liveClass('div[class*="_Icon_"]')}"><svg ${SIDEBAR_STATE === 'expanded' ? 'style="transform: scale(-1, -1);"' : ''} xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" width="20" height="20"><path d="M4 4a1 1 0 0 1 1 1v4h5.336l-1.293-1.293a1 1 0 0 1 1.414-1.414l3 3a1 1 0 0 1 0 1.414l-3 3a1 1 0 0 1-1.414-1.414l1.293-1.293h-5.336v4a1 1 0 1 1-2 0v-10a1 1 0 0 1 1-1Z"/><path d="M16 4a1 1 0 0 1 1 1v10a1 1 0 1 1-2 0v-10a1 1 0 0 1 1-1Z"/></svg></div>
          <span class="${liveClass('span[class*="_Text_"]')}"><span class="Polaris-Text--root Polaris-Text--bodyMd Polaris-Text--semibold">Collapse</span></span>
        </a>
      </div>
    </div>
    `;

    // Handle toggle event
    toggleElement.addEventListener('click', () => {
      void (async () => {
        SIDEBAR_STATE = toggleElement.getAttribute('data-state') === 'collapsed' ? 'expanded' : 'collapsed';
        toggleElement.setAttribute('data-state', SIDEBAR_STATE);

        // Update the icon rotation
        const icon = toggleElement.querySelector('svg');
        if (icon) {
          icon.style.transform = SIDEBAR_STATE === 'expanded' ? 'scale(-1, -1)' : '';
        }

        if (SIDEBAR_STATE === 'collapsed') {
          injectStyles();
        } else {
          removeStyles();
        }

        // Save the state to storage
        await setItem('admin-sidebar-state', SIDEBAR_STATE);

        sendTrackEvent('toggle_admin_sidebar', { state: SIDEBAR_STATE });
      })();
    });

    return toggleElement;
  };

  const insertToggle = (): boolean => {
    const wrapper = document.querySelector(TOGGLE_WRAPPER_SELECTOR);
    if (!wrapper) return false;
    if (!document.getElementById(TOGGLE_ELEMENT_ID)) {
      // Built at insert time so liveClass can copy classes off the real nav.
      wrapper.prepend(buildToggle());
    }
    return true;
  };

  // The nav renders after document_end, and React re-renders it during
  // hydration and on SPA navigation, wiping foreign children. The observer
  // stays connected for the page's lifetime and re-inserts whenever the
  // toggle is gone; the cheap getElementById guard keeps the expensive
  // :has() query off the hot path.
  insertToggle();
  const observer = new MutationObserver(() => {
    if (!document.getElementById(TOGGLE_ELEMENT_ID)) {
      insertToggle();
    }
  });
  observer.observe(document.documentElement, { childList: true, subtree: true });
};

/**
 * Sets up the toggle sidebar feature
 * @returns {void}
 */
export const setupToggleSidebar = async (settings: ResolvedSettings): Promise<void> => {
  if (!isEnabled(settings.admin.collapsibleSidebar)) {
    return;
  }

  // Get saved state
  const savedState = await getItem<SidebarState>('admin-sidebar-state');
  if (savedState) {
    SIDEBAR_STATE = savedState;
  }

  injectStyles();
  injectToggleElement();
};
