import { getItem } from '~/utils/storage';

interface Dimensions {
  primary: number;
  secondary: number;
  main: {
    width: number;
    height: number;
  };
}

interface Resizer {
  element: HTMLDivElement;
  resize: (dx: number, dy: number, dimensions: Dimensions) => void;
  isMainResizer: boolean;
  type: 'primary' | 'secondary' | 'main-horizontal' | 'main-vertical';
}

const MIN_SIDEBAR_WIDTH = 100;
const MIN_MAIN_WIDTH = 200;
const MIN_MAIN_HEIGHT = 100;
const RESIZER_ATTR_PREFIX = 'data-alfred-resizer-';
const DIMENSIONS_BADGE_ATTR = 'data-alfred-dimensions-badge';

const BASE_DOT_STYLE: Partial<CSSStyleDeclaration> = {
  width: '8px',
  height: '20px',
  cursor: 'col-resize',
  backgroundImage: 'radial-gradient(circle, rgba(0,0,0,0.3) 1px, transparent 1px)',
  backgroundSize: '4px 4px'
};

const SELECTORS = {
  frame: '[class^="Online-Store-UI-PowerFrame__MainInterior_"]',
  main: '[class*="Online-Store-UI-Preview__Interior_"]',
  primarySidebar: '#PowerFrame-PortalArea-PrimaryPanel',
  secondarySidebar: '#PowerFrame-PortalArea-SecondaryPanel'
} as const;

let activeResizer: Resizer | null = null;
let startCoords = { x: 0, y: 0 };
let initialDimensions: Dimensions | null = null;
let animationFrameId: number | null = null;

const queryElements = () => ({
  frame: document.querySelector<HTMLElement>(SELECTORS.frame),
  main: document.querySelector<HTMLElement>(SELECTORS.main),
  primarySidebar: document.querySelector<HTMLElement>(SELECTORS.primarySidebar),
  secondarySidebar: document.querySelector<HTMLElement>(SELECTORS.secondarySidebar)
});

const onMouseMove = (e: MouseEvent) => {
  if (!activeResizer || !initialDimensions) return;
  if (animationFrameId) cancelAnimationFrame(animationFrameId);
  animationFrameId = requestAnimationFrame(() => {
    if (!activeResizer || !initialDimensions) return;
    activeResizer.resize(e.clientX - startCoords.x, e.clientY - startCoords.y, initialDimensions);
  });
};

const onMouseUp = () => {
  if (animationFrameId) cancelAnimationFrame(animationFrameId);
  const { main, frame } = queryElements();
  if (activeResizer?.isMainResizer && main) {
    main.style.pointerEvents = '';
  }
  if (!activeResizer?.isMainResizer && frame) {
    frame.style.transition = '';
  }
  activeResizer = null;
  document.body.style.cursor = '';
  document.body.style.userSelect = '';
  document.removeEventListener('mousemove', onMouseMove);
  document.removeEventListener('mouseup', onMouseUp);
};

const onMouseDown = (e: MouseEvent, resizer: Resizer) => {
  e.preventDefault();
  const { main, primarySidebar, secondarySidebar } = queryElements();
  const { frame } = queryElements();
  if (main && resizer.isMainResizer) main.style.pointerEvents = 'none';
  if (!resizer.isMainResizer && frame) frame.style.transition = 'none';
  activeResizer = resizer;
  startCoords = { x: e.clientX, y: e.clientY };
  initialDimensions = {
    primary: primarySidebar?.offsetWidth ?? 0,
    secondary: secondarySidebar?.offsetWidth ?? 0,
    main: {
      width: main?.offsetWidth ?? 0,
      height: main?.offsetHeight ?? 0
    }
  };

  browser.runtime.sendMessage({
    type: 'track_action',
    action: 'resize_theme_customizer',
    metadata: {
      type: resizer.type || 'unknown',
      page_type: 'theme_customizer'
    }
  });

  document.body.style.cursor = window.getComputedStyle(e.target as Element).cursor;
  document.body.style.userSelect = 'none';
  document.addEventListener('mousemove', onMouseMove);
  document.addEventListener('mouseup', onMouseUp);
};

const createResizer = (
  element: Element,
  styles: Partial<CSSStyleDeclaration>,
  resizeFn: (dx: number, dy: number, dims: Dimensions) => void,
  isMain = false,
  type?: 'primary' | 'secondary' | 'main-horizontal' | 'main-vertical'
): Resizer => {
  const resizerEl = document.createElement('div');
  Object.assign(resizerEl.style, {
    position: 'absolute',
    zIndex: '50',
    ...styles
  });
  element.appendChild(resizerEl);
  console.log(`[Alfred Resizers] Created resizer: ${type ?? 'primary'}`);

  const resizer: Resizer = {
    element: resizerEl,
    resize: resizeFn,
    isMainResizer: isMain,
    type: type ?? 'primary'
  };
  resizerEl.addEventListener('mousedown', (e) => onMouseDown(e, resizer));
  return resizer;
};

const createSidebarResizer = (frame: HTMLElement, sidebar: HTMLElement, isPrimary: boolean) => {
  const resizeVar = isPrimary ? '--power-frame-resize-left' : '--power-frame-resize-right';
  const gridColVar = isPrimary ? '--power-frame-grid-col-left' : '--power-frame-grid-col-right';

  const resizeFn = (dx: number, _dy: number, dims: Dimensions) => {
    const newWidth = isPrimary ? dims.primary + dx : dims.secondary - dx;
    if (newWidth < MIN_SIDEBAR_WIDTH) return;

    const panelArea = sidebar.querySelector<HTMLElement>('div[class*="Online-Store-UI-Frame-PanelArea_"]');
    if (panelArea) {
      const originalWidth = isPrimary ? dims.primary : dims.secondary;
      panelArea.style.width = newWidth === originalWidth ? '' : '100%';
    }

    // Set both: resize var for panel width, grid-col var for grid column
    frame.style.setProperty(resizeVar, `${newWidth}px`);
    frame.style.setProperty(gridColVar, `${newWidth}px`);
  };

  const styles: Partial<CSSStyleDeclaration> = {
    ...BASE_DOT_STYLE,
    top: '0.5rem'
  };

  if (isPrimary) {
    styles.right = '0.75rem';
  } else {
    styles.left = '5px';
  }

  createResizer(sidebar, styles, resizeFn, false, isPrimary ? 'primary' : 'secondary');
};

const createDimensionsBadge = (main: HTMLElement) => {
  const topBarSlot = document.querySelector<HTMLElement>('[class^="Online-Store-UI-TopBar_"] > div:nth-child(3)');
  if (!topBarSlot) return;

  const badge = document.createElement('span');
  badge.setAttribute(DIMENSIONS_BADGE_ATTR, 'true');
  // Corner-only frame around the dimensions text
  const c = 'rgba(138,138,138,0.6)';
  const s = '4px';
  const g = `linear-gradient(${c},${c})`;
  const bg = [
    `${g} 0 0/${s} 1px no-repeat`,
    `${g} 0 0/1px ${s} no-repeat`,
    `${g} 100% 0/${s} 1px no-repeat`,
    `${g} 100% 0/1px ${s} no-repeat`,
    `${g} 0 100%/${s} 1px no-repeat`,
    `${g} 0 100%/1px ${s} no-repeat`,
    `${g} 100% 100%/${s} 1px no-repeat`,
    `${g} 100% 100%/1px ${s} no-repeat`
  ].join(',');
  badge.innerHTML = `<span data-alfred-dim-value style="display:inline-block;background:${bg};padding:0 8px;line-height:1.6"></span>`;
  topBarSlot.prepend(badge);

  const valueEl = badge.querySelector('[data-alfred-dim-value]')!;
  const update = () => {
    const w = Math.round(main.offsetWidth);
    const h = Math.round(main.offsetHeight);
    valueEl.textContent = `${w} × ${h}`;
  };

  update();
  const ro = new ResizeObserver(update);
  ro.observe(main);
};

let settingsCache: Record<string, boolean> | null = null;

const getResizerSettings = async () => {
  if (!settingsCache) {
    const settings = await getItem<AlfredSettings>('settings');
    settingsCache = settings?.themeCustomizer?.resizers ?? {
      primarySidebar: true,
      secondarySidebar: true,
      previewHorizontal: true,
      previewVertical: true
    };
  }
  return settingsCache;
};

const Resizers = async () => {
  const { frame, main, primarySidebar, secondarySidebar } = queryElements();

  console.log('[Alfred Resizers] Element check:', {
    frame: !!frame,
    main: !!main,
    primarySidebar: !!primarySidebar,
    secondarySidebar: !!secondarySidebar
  });

  if (!frame && !main) return false;

  // Allow the 1fr main column to shrink past its content's min-width.
  // Shopify's default `1fr` has implicit min-width:auto which causes overflow.
  if (frame && !frame.hasAttribute(`${RESIZER_ATTR_PREFIX}grid-fixed`)) {
    frame.setAttribute(`${RESIZER_ATTR_PREFIX}grid-fixed`, 'true');
    frame.style.gridTemplateColumns =
      'var(--power-frame-grid-col-left) minmax(0, 1fr) var(--power-frame-grid-col-right) 0';
  }

  const resizerSettings = await getResizerSettings();
  let newlyAttached = false;

  // Primary Sidebar Resizer
  if (
    frame &&
    primarySidebar &&
    resizerSettings.primarySidebar !== false &&
    !primarySidebar.hasAttribute(`${RESIZER_ATTR_PREFIX}primary`)
  ) {
    primarySidebar.setAttribute(`${RESIZER_ATTR_PREFIX}primary`, 'true');
    createSidebarResizer(frame, primarySidebar, true);
    newlyAttached = true;
  }

  // Secondary Sidebar Resizer
  if (
    frame &&
    secondarySidebar &&
    resizerSettings.secondarySidebar !== false &&
    !secondarySidebar.hasAttribute(`${RESIZER_ATTR_PREFIX}secondary`)
  ) {
    secondarySidebar.setAttribute(`${RESIZER_ATTR_PREFIX}secondary`, 'true');
    createSidebarResizer(frame, secondarySidebar, false);
    newlyAttached = true;
  }

  // Main Horizontal Resizer
  if (main && resizerSettings.previewHorizontal !== false && !main.hasAttribute(`${RESIZER_ATTR_PREFIX}horizontal`)) {
    main.setAttribute(`${RESIZER_ATTR_PREFIX}horizontal`, 'true');
    createResizer(
      main,
      {
        ...BASE_DOT_STYLE,
        top: '50%',
        right: '-8px',
        transform: 'translateY(-50%)',
        height: '40px'
      },
      (dx: number, _dy: number, dims: Dimensions) => {
        const newWidth = dims.main.width + dx;
        if (newWidth < MIN_MAIN_WIDTH) return;
        main.style.maxWidth = `${newWidth}px`;
      },
      true,
      'main-horizontal'
    );
    newlyAttached = true;
  }

  // Main Vertical Resizer
  if (main && resizerSettings.previewVertical !== false && !main.hasAttribute(`${RESIZER_ATTR_PREFIX}vertical`)) {
    main.setAttribute(`${RESIZER_ATTR_PREFIX}vertical`, 'true');
    createResizer(
      main,
      {
        ...BASE_DOT_STYLE,
        top: '-8px',
        left: '50%',
        transform: 'translateX(-50%)',
        width: '40px',
        height: '8px',
        cursor: 'row-resize'
      },
      (_dx: number, dy: number, dims: Dimensions) => {
        const newHeight = dims.main.height - dy;
        if (newHeight < MIN_MAIN_HEIGHT) return;
        main.style.maxHeight = `${newHeight}px`;
      },
      true,
      'main-vertical'
    );
    newlyAttached = true;
  }

  // Dimensions badge in top bar
  if (main && !document.querySelector(`[${DIMENSIONS_BADGE_ATTR}]`)) {
    createDimensionsBadge(main);
  }

  if (newlyAttached) {
    console.log('[Alfred Resizers] Attached new resizers');
  }
  return true;
};

export const setupResizers = async () => {
  console.log('[Alfred Resizers] setupResizers called');
  await Resizers();

  // Keep watching permanently. Shopify's React app destroys and recreates
  // sidebar panels when they hide/show, so we need to re-attach resizers.
  let debounceTimer: ReturnType<typeof setTimeout> | null = null;
  const observer = new MutationObserver(() => {
    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      void Resizers();
    }, 100);
  });

  observer.observe(document.body, {
    childList: true,
    subtree: true
  });
};
