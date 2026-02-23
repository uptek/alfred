import { type Browser } from 'wxt/browser';

// State to be shared across functions
const menus = new Map<string, ContextMenu.ClickHandler>();
let initialized = false;
const contexts = ['page', 'selection', 'image', 'video', 'audio', 'link', 'editable', 'frame'];

/**
 * Initialize the context menu manager
 */
function initialize(): void {
  if (initialized) return;

  // Set up the click listener
  browser.contextMenus.onClicked.addListener((info, tab) => {
    const handler = menus.get(info.menuItemId as string);
    if (handler) {
      handler(info, tab);
    }
  });

  initialized = true;
}

/**
 * Create a new context menu item
 */
export function create(options: ContextMenu.Options, handler?: ContextMenu.ClickHandler): string {
  if (!initialized) initialize();

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
 * Update an existing context menu item
 */
export function update(id: string, options: Partial<ContextMenu.Options>): boolean {
  if (!initialized) initialize();

  if (!menus.has(id)) {
    console.error(`Cannot update menu item: ${id} does not exist`);
    return false;
  }

  const updateProperties: Record<string, unknown> = {};

  if (options.title !== undefined) updateProperties.title = options.title;
  if (options.contexts !== undefined) updateProperties.contexts = options.contexts;
  if (options.parentId !== undefined) updateProperties.parentId = options.parentId;
  if (options.type !== undefined) updateProperties.type = options.type;
  if (options.documentUrlPatterns !== undefined) updateProperties.documentUrlPatterns = options.documentUrlPatterns;
  if (options.targetUrlPatterns !== undefined) updateProperties.targetUrlPatterns = options.targetUrlPatterns;
  if (options.enabled !== undefined) updateProperties.enabled = options.enabled;
  if (options.checked !== undefined) updateProperties.checked = options.checked;

  try {
    browser.contextMenus.update(id, updateProperties);
    return true;
  } catch (error) {
    console.error(`Failed to update context menu item ${id}:`, error);
    return false;
  }
}

/**
 * Remove a context menu item
 */
export function remove(id: string): boolean {
  if (!initialized) initialize();

  if (!menus.has(id)) {
    console.error(`Cannot remove menu item: ${id} does not exist`);
    return false;
  }

  try {
    browser.contextMenus.remove(id);
    menus.delete(id);
    return true;
  } catch (error) {
    console.error(`Failed to remove context menu item ${id}:`, error);
    return false;
  }
}

/**
 * Remove all context menu items
 */
export function removeAll(): void {
  if (!initialized) initialize();

  try {
    browser.contextMenus.removeAll();
    menus.clear();
  } catch (error) {
    console.error('Failed to remove all context menu items:', error);
  }
}

/**
 * Check if a menu item exists by ID
 */
export function exists(id: string): boolean {
  if (!initialized) initialize();
  return menus.has(id);
}

/**
 * Create a separator menu item
 */
export function createSeparator(id: string, parentId?: string): string {
  if (!initialized) initialize();

  const options = {
    id,
    type: 'separator',
    contexts: contexts
  } as Browser.contextMenus.CreateProperties;

  if (parentId) {
    options.parentId = parentId;
  }

  try {
    browser.contextMenus.create(options);
    // Add a dummy handler since separators don't have clicks
    menus.set(id, () => undefined);
  } catch (error) {
    console.error('Failed to create separator:', error);
  }

  return id;
}
