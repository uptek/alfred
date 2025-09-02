import { getItem, setItem } from '~/utils/storage';

type SidebarState = 'collapsed' | 'expanded';

let SIDEBAR_STATE: SidebarState = 'expanded';
const TOGGLE_WRAPPER_SELECTOR = '#AppFrameNav .Polaris-Navigation__Section:has(s-internal-icon[type="home"])';
const TOGGLE_ELEMENT_ID = 'alfred-admin-sidebar-toggle';
const STYLE_TAG_ID = 'alfred-admin-sidebar-styles';
const STYLES = `
  :root {
    --pg-navigation-width: 4rem !important;
  }

  #AppFrameNav .Polaris-Navigation__Text,
  #AppFrameNav .Polaris-Navigation ul div[class*="Heading"],
  #AppFrameNav .Polaris-Navigation__Badge,
  #AppFrameNav .Polaris-Navigation__SecondaryActions {
    display: none !important;
  }
`;

/**
 * Checks if the feature is enabled in settings
 * @returns {boolean}
 */
const isEnabled = async (): Promise<boolean> => {
  const DEFAULT_VALUE = true;
  const settings = await getItem<AlfredSettings>('settings');
  return settings?.admin?.collapsibleSidebar ?? DEFAULT_VALUE;
};

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
 * Injects the toggle element into the document
 */
const injectToggleElement = (): void => {
  if (!document.body || !(document as any).querySelector(TOGGLE_WRAPPER_SELECTOR)) {
    setTimeout(injectToggleElement, 100);
    return;
  }

  const toggleElement = document.createElement('li');
  toggleElement.id = TOGGLE_ELEMENT_ID;
  toggleElement.classList.add('Polaris-Navigation__ListItem');
  toggleElement.setAttribute('data-state', SIDEBAR_STATE);
  toggleElement.innerHTML = `
  <div class="Polaris-Navigation__ItemWrapper">
    <div class="Polaris-Navigation__ItemInnerWrapper">
      <a data-polaris-unstyled="true" class="Polaris-Navigation__Item Polaris-Navigation__Item--selected Polaris-Navigation--subNavigationActive" tabindex="0" aria-disabled="false">
        <div class="Polaris-Navigation__Icon"><svg ${SIDEBAR_STATE === 'expanded' ? 'style="transform: scale(-1, -1);"' : ''} xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" width="20" height="20"><path d="M4 4a1 1 0 0 1 1 1v4h5.336l-1.293-1.293a1 1 0 0 1 1.414-1.414l3 3a1 1 0 0 1 0 1.414l-3 3a1 1 0 0 1-1.414-1.414l1.293-1.293h-5.336v4a1 1 0 1 1-2 0v-10a1 1 0 0 1 1-1Z"/><path d="M16 4a1 1 0 0 1 1 1v10a1 1 0 1 1-2 0v-10a1 1 0 0 1 1-1Z"/></svg></div>
        <span class="Polaris-Navigation__Text"><span class="Polaris-Text--root Polaris-Text--bodyMd Polaris-Text--semibold">Collapse</span></span>
      </a>
    </div>
  </div>
  `;

  // Handle toggle event
  toggleElement.addEventListener('click', async () => {
    SIDEBAR_STATE = toggleElement.getAttribute('data-state') === 'collapsed' ? 'expanded' : 'collapsed';
    toggleElement.setAttribute('data-state', SIDEBAR_STATE);

    // Update the icon rotation
    const icon = toggleElement.querySelector('svg');
    if (icon) {
      icon.style.transform = SIDEBAR_STATE === 'expanded' ? 'scale(-1, -1)' : '';
    }

    (SIDEBAR_STATE === 'collapsed') ? injectStyles() : removeStyles();

    // Save the state to storage
    await setItem('admin-sidebar-state', SIDEBAR_STATE);

    // Track toggle admin sidebar event
    browser.runtime.sendMessage({
      type: 'track_action',
      action: 'toggle_admin_sidebar',
      metadata: {
        state: SIDEBAR_STATE
      },
    });
  });

  (document as any).querySelector(TOGGLE_WRAPPER_SELECTOR).prepend(toggleElement);
};

/**
 * Sets up the toggle sidebar feature
 * @returns {void}
 */
export const setupToggleSidebar = async (): Promise<void> => {
  // Check if the feature is enabled in settings
  const enabled = await isEnabled();

  if (!enabled) {
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
