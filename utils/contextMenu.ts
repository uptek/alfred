import { v4 as uuid } from 'uuid';
import { type Browser } from 'wxt/browser';

export class ContextMenu {
  private menus: Map<string, ContextMenu.ClickHandler> = new Map();
  private initialized: boolean = false;

  constructor() {
    this.initialize();
  }

  /**
   * Initialize the context menu manager
   */
  private initialize(): void {
    if (this.initialized) return;

    // Set up the click listener
    browser.contextMenus.onClicked.addListener((info, tab) => {
      const handler = this.menus.get(info.menuItemId as string);
      if (handler) {
        handler(info, tab);
      }
    });

    this.initialized = true;
  }

  /**
   * Create a new context menu item
   * @param options The options for the context menu item
   * @param handler The click handler for the menu item
   * @returns The ID of the created menu item
   */
  public create(
    options: ContextMenu.Options,
    handler?: ContextMenu.ClickHandler
  ): string {
    const id = options.id || uuid();
    const menuOptions = {
      id,
      title: options.title,
      contexts: options.contexts || ['all'],
      parentId: options.parentId,
      type: options.type || 'normal',
      documentUrlPatterns: options.documentUrlPatterns,
      targetUrlPatterns: options.targetUrlPatterns,
      enabled: options.enabled !== undefined ? options.enabled : true,
    } as Browser.contextMenus.CreateProperties;

    if (options.type === 'checkbox' || options.type === 'radio') {
      menuOptions.checked = options.checked;
    }

    try {
      browser.contextMenus.create(menuOptions);
      this.menus.set(id, handler || (() => {}));
    } catch (error) {
      console.error('Failed to create context menu item:', error);
    }

    return id;
  }

  /**
   * Update an existing context menu item
   * @param id The ID of the menu item to update
   * @param options The new options for the menu item
   * @returns A boolean indicating success
   */
  public update(id: string, options: Partial<ContextMenu.Options>): boolean {
    if (!this.menus.has(id)) {
      console.error(`Cannot update menu item: ${id} does not exist`);
      return false;
    }

    const updateProperties: Record<string, any> = {};

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
   * @param id The ID of the menu item to remove
   * @returns A boolean indicating success
   */
  public remove(id: string): boolean {
    if (!this.menus.has(id)) {
      console.error(`Cannot remove menu item: ${id} does not exist`);
      return false;
    }

    try {
      browser.contextMenus.remove(id);
      this.menus.delete(id);
      return true;
    } catch (error) {
      console.error(`Failed to remove context menu item ${id}:`, error);
      return false;
    }
  }

  /**
   * Remove all context menu items managed by this instance
   */
  public removeAll(): void {
    try {
      browser.contextMenus.removeAll();
      this.menus.clear();
    } catch (error) {
      console.error('Failed to remove all context menu items:', error);
    }
  }

  /**
   * Check if a menu item exists by ID
   * @param id The ID to check
   */
  public exists(id: string): boolean {
    return this.menus.has(id);
  }

  /**
   * Create a separator menu item
   * @param parentId Optional parent menu item ID
   * @returns The ID of the created separator
   */
  public createSeparator(parentId?: string): string {
    const id = uuid();
    const options = {
      id,
      type: 'separator',
      contexts: ['all']
    } as Browser.contextMenus.CreateProperties;

    if (parentId) {
      options.parentId = parentId;
    }

    try {
      browser.contextMenus.create(options);
      // Add a dummy handler since separators don't have clicks
      this.menus.set(id, () => {});
    } catch (error) {
      console.error('Failed to create separator:', error);
    }

    return id;
  }
}
