import { type Browser } from 'wxt/browser';

// State to be shared across functions
const menus = new Map<string, ContextMenu.ClickHandler>();
let initialized = false;
let registration: Promise<unknown> = Promise.resolve();
const contexts = ['page', 'selection', 'image', 'video', 'audio', 'link', 'editable', 'frame'];

/**
 * Initialize the context menu manager
 */
function initialize(): void {
  if (initialized) return;

  // A click can be what wakes the background, arriving before its menus are registered again,
  // so the handler lookup waits for the registration in flight.
  browser.contextMenus.onClicked.addListener((info, tab) => {
    const dispatch = () => menus.get(info.menuItemId as string)?.(info, tab);
    void registration.then(dispatch, dispatch);
  });

  initialized = true;
}

/**
 * Hold clicks until an in-flight menu registration settles.
 * @param pending - The registration that creates the menu items and their handlers.
 */
export function holdClicksUntil<T>(pending: Promise<T>): Promise<T> {
  registration = pending;
  return pending;
}

/**
 * Create a new context menu item
 */
export function create(options: ContextMenu.Options, handler?: ContextMenu.ClickHandler): string {
  initialize();

  const id = options.id;
  const menuOptions = {
    id,
    title: options.title,
    contexts: options.contexts ?? contexts,
    parentId: options.parentId,
    type: (options.type ?? 'normal') as Browser.contextMenus.ItemType,
    documentUrlPatterns: options.documentUrlPatterns,
    targetUrlPatterns: options.targetUrlPatterns,
    enabled: options.enabled ?? true
  } as Browser.contextMenus.CreateProperties;

  if ((options.type === 'checkbox' || options.type === 'radio') && options.checked !== undefined) {
    menuOptions.checked = options.checked;
  }

  try {
    browser.contextMenus.create(menuOptions);
    menus.set(id, handler ?? (() => undefined));
  } catch (error) {
    console.error('Failed to create context menu item:', error);
  }

  return id;
}

/**
 * Remove all context menu items
 */
export function removeAll(): void {
  initialize();

  try {
    browser.contextMenus.removeAll();
    menus.clear();
  } catch (error) {
    console.error('Failed to remove all context menu items:', error);
  }
}

/**
 * Create a separator menu item
 */
export function createSeparator(id: string, parentId?: string): string {
  return create({ id, type: 'separator', ...(parentId !== undefined && { parentId }) });
}
