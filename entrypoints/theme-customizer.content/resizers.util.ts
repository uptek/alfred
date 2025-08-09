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
}

const MIN_SIDEBAR_WIDTH = 100;
const MIN_MAIN_WIDTH = 200;
const MIN_MAIN_HEIGHT = 100;
const RESIZERS_ATTACHED_ATTR = 'data-alfred-resizers-attached';

const BASE_DOT_STYLE: Partial<CSSStyleDeclaration> = {
  width: '8px',
  height: '20px',
  cursor: 'col-resize',
  backgroundImage: 'radial-gradient(circle, rgba(0,0,0,0.3) 1px, transparent 1px)',
  backgroundSize: '4px 4px',
};

const Resizers = () => {
  const frame = document.querySelector<HTMLElement>('[class^="Online-Store-UI-Frame_"]');
  const main = document.querySelector<HTMLElement>('[class*="Online-Store-UI-Preview__Interior_"]');
  const primarySidebar = document.querySelector<HTMLElement>('aside[class^="Online-Store-UI-Frame-Sidebar_"]');
  const secondarySidebar = document.querySelector<HTMLElement>('[class*="Online-Store-UI-Frame-Sidebar--secondary_"]');

  if (!frame || !main || !primarySidebar || !secondarySidebar) {
    return false;
  }

  // Check if resizers already attached
  if (frame.hasAttribute(RESIZERS_ATTACHED_ATTR)) {
    return true;
  }

  // Mark as attached to prevent duplicates
  frame.setAttribute(RESIZERS_ATTACHED_ATTR, 'true');

  let activeResizer: Resizer | null = null;
  let startCoords: { x: number; y: number } = { x: 0, y: 0 };
  let initialDimensions: Dimensions | null = null;
  let animationFrameId: number | null = null;

  const onMouseMove = (e: MouseEvent) => {
    if (!activeResizer || !initialDimensions) return;

    if (animationFrameId) {
      cancelAnimationFrame(animationFrameId);
    }

    animationFrameId = requestAnimationFrame(() => {
      if (!activeResizer || !initialDimensions) return;
      const dx = e.clientX - startCoords.x;
      const dy = e.clientY - startCoords.y;
      activeResizer.resize(dx, dy, initialDimensions);
    });
  };

  const onMouseUp = () => {
    if (animationFrameId) {
      cancelAnimationFrame(animationFrameId);
    }
    if (main && activeResizer?.isMainResizer) {
      main.style.pointerEvents = '';
    }
    activeResizer = null;
    document.body.style.cursor = '';
    document.body.style.userSelect = '';
    document.removeEventListener('mousemove', onMouseMove);
    document.removeEventListener('mouseup', onMouseUp);
  };

  const onMouseDown = (e: MouseEvent, resizer: Resizer) => {
    e.preventDefault();
    if (main && resizer.isMainResizer) {
      main.style.pointerEvents = 'none';
    }
    activeResizer = resizer;
    startCoords = { x: e.clientX, y: e.clientY };
    initialDimensions = {
      primary: primarySidebar.offsetWidth,
      secondary: secondarySidebar.offsetWidth,
      main: {
        width: main.offsetWidth,
        height: main.offsetHeight,
      },
    };

    document.body.style.cursor = window.getComputedStyle(e.target as Element).cursor;
    document.body.style.userSelect = 'none';
    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
  };

  const createResizer = (
    element: Element,
    styles: Partial<CSSStyleDeclaration>,
    resizeFn: (dx: number, dy: number, dims: Dimensions) => void,
    isMain = false
  ): Resizer => {
    const resizerEl = document.createElement('div');
    Object.assign(resizerEl.style, {
      position: 'absolute',
      zIndex: '50',
      ...styles,
    });
    element.appendChild(resizerEl);

    const resizer: Resizer = {
      element: resizerEl,
      resize: resizeFn,
      isMainResizer: isMain,
    };
    resizerEl.addEventListener('mousedown', (e) => onMouseDown(e, resizer));
    return resizer;
  };

  const createSidebarResizer = (sidebar: HTMLElement, isPrimary: boolean) => {
    const resizeFn = (dx: number, _dy: number, dims: Dimensions) => {
      const newWidth = isPrimary ? dims.primary + dx : dims.secondary - dx;
      if (newWidth < MIN_SIDEBAR_WIDTH) return;

      const panelArea = sidebar.querySelector<HTMLElement>('div[class*="Online-Store-UI-Frame-PanelArea_"]');
      if (panelArea) {
        const originalWidth = isPrimary ? dims.primary : dims.secondary;
        panelArea.style.width = newWidth === originalWidth ? '' : '100%';
      }

      if (isPrimary) {
        frame.style.gridTemplateColumns = `minmax(0, auto) ${newWidth}px 1fr ${dims.secondary}px`;
      } else {
        frame.style.gridTemplateColumns = `minmax(0, auto) ${dims.primary}px 1fr ${newWidth}px`;
      }
    };

    const styles: Partial<CSSStyleDeclaration> = {
      ...BASE_DOT_STYLE,
      top: isPrimary ? 'calc(var(--p-space-300) + var(--p-space-050))' : 'var(--p-space-300)',
    };

    if (isPrimary) {
      styles.right = 'var(--p-space-400)';
    } else {
      styles.left = '2px';
    }

    createResizer(sidebar, styles, resizeFn);
  };

  // Primary Sidebar Resizer
  if (primarySidebar) {
    createSidebarResizer(primarySidebar, true);
  }

  // Secondary Sidebar Resizer
  if (secondarySidebar) {
    createSidebarResizer(secondarySidebar, false);
  }

  if (main) {
    // Main Horizontal Resizer
    createResizer(
      main,
      {
        ...BASE_DOT_STYLE,
        top: '50%',
        right: '-8px',
        transform: 'translateY(-50%)',
        height: '40px',
      },
      (dx: number, _dy: number, dims: Dimensions) => {
        const newWidth = dims.main.width + dx;
        if (newWidth < MIN_MAIN_WIDTH) return;
        main.style.maxWidth = `${newWidth}px`;
      },
      true
    );

    // Main Vertical Resizer
    createResizer(
      main,
      {
        ...BASE_DOT_STYLE,
        top: '-8px',
        left: '50%',
        transform: 'translateX(-50%)',
        width: '40px',
        height: '8px',
        cursor: 'row-resize',
      },
      (_dx: number, dy: number, dims: Dimensions) => {
        const newHeight = dims.main.height - dy;
        if (newHeight < MIN_MAIN_HEIGHT) return;
        main.style.maxHeight = `${newHeight}px`;
      },
      true
    );
  }

  return true;
};

export const setupResizers = () => {
  // Try to initialize immediately
  if (Resizers()) {
    return;
  }

  // If elements not found, set up a mutation observer
  const observer = new MutationObserver(() => {
    if (Resizers()) {
      observer.disconnect();
    }
  });

  observer.observe(document.body, {
    childList: true,
    subtree: true,
  });

  // Also try again after a delay
  setTimeout(() => {
    if (Resizers()) {
      observer.disconnect();
    }
  }, 2000);
}
