import { create, removeAll } from '@/utils/contextMenu';
import { getItem } from '@/utils/storage';

/**
 * Register shortcuts (context menu items) for the extension
 */
export const registerShortcuts = async () => {
  // Remove all context menus
  await removeAll();

  // Get settings to determine which shortcuts to show
  const settings = await getItem<AlfredSettings>('settings');
  const shortcuts = settings?.shortcuts || {
    openInAdmin: true,
    openInCustomizer: true,
    copyProductJson: true,
    copyCartJson: true,
    copyThemePreviewUrl: true,
    clearCart: true,
    openSectionInCodeEditor: true,
  };

  // Create Alfred menu
  const alfredMenuId = create({
    id: 'main',
    title: 'Alfred',
  });

  // Open in Admin
  if (shortcuts.openInAdmin !== false) {
    create(
      {
        id: 'open-in-admin',
        title: 'Open in Admin',
        parentId: alfredMenuId,
      },
      async (_info, tab: Browser.tabs.Tab) => {
        try {
          await browser.scripting.executeScript({
            target: { tabId: tab.id! },
            func: async () => {
              return await (window as any).Alfred.openInAdmin();
            },
            world: 'MAIN',
          });
        } catch (error) {
          console.error('Error opening in admin:', error);
        }
      }
    );
  }

  // Open in Customizer
  if (shortcuts.openInCustomizer !== false) {
    create(
      {
        id: 'open-in-customizer',
        title: 'Open in Customizer',
        parentId: alfredMenuId,
      },
      async (_info, tab: Browser.tabs.Tab) => {
        try {
          await browser.scripting.executeScript({
            target: { tabId: tab.id! },
            func: async () => {
              return await (window as any).Alfred.openInCustomizer();
            },
            world: 'MAIN',
          });
        } catch (error) {
          console.error('Error opening customizer:', error);
        }
      }
    );
  }

  // Copy Product JSON
  if (shortcuts.copyProductJson !== false) {
    create(
      {
        id: 'copy-product-json',
        title: 'Copy Product JSON',
        parentId: alfredMenuId,
      },
      async (_info, tab: Browser.tabs.Tab) => {
        try {
          await browser.scripting.executeScript({
            target: { tabId: tab.id! },
            func: async () => {
              return await (window as any).Alfred.copyProductJson();
            },
            world: 'MAIN',
          });
        } catch (error) {
          console.error('Error copying product JSON:', error);
        }
      }
    );
  }

  // Copy Cart JSON
  if (shortcuts.copyCartJson !== false) {
    create(
      {
        id: 'copy-cart-json',
        title: 'Copy Cart JSON',
        parentId: alfredMenuId,
      },
      async (_info, tab: Browser.tabs.Tab) => {
        try {
          await browser.scripting.executeScript({
            target: { tabId: tab.id! },
            func: async () => {
              return await (window as any).Alfred.copyCartJson();
            },
            world: 'MAIN',
          });
        } catch (error) {
          console.error('Error copying cart JSON:', error);
        }
      }
    );
  }

  // Copy Theme Preview URL
  if (shortcuts.copyThemePreviewUrl !== false) {
    create(
      {
        id: 'copy-theme-preview-url',
        title: 'Copy Theme Preview URL',
        parentId: alfredMenuId,
      },
      async (_info, tab: Browser.tabs.Tab) => {
        try {
          await browser.scripting.executeScript({
            target: { tabId: tab.id! },
            func: async () => {
              return await (window as any).Alfred.copyThemePreviewUrl();
            },
            world: 'MAIN',
          });
        } catch (error) {
          console.error('Error copying theme preview URL:', error);
        }
      }
    );
  }

  // Clear Cart
  if (shortcuts.clearCart !== false) {
    create(
      {
        id: 'clear-cart',
        title: 'Clear Cart',
        parentId: alfredMenuId,
      },
      async (_info, tab: Browser.tabs.Tab) => {
        try {
          await browser.scripting.executeScript({
            target: { tabId: tab.id! },
            func: async () => {
              return await (window as any).Alfred.clearCart();
            },
            world: 'MAIN',
          });
        } catch (error) {
          console.error('Error clearing cart:', error);
        }
      }
    );
  }

  // Open Section in Editor
  if (shortcuts.openSectionInCodeEditor !== false) {
    create(
      {
        id: 'open-section-in-editor',
        title: 'Open Section in Code Editor',
        parentId: alfredMenuId,
      },
      async (_info, tab: Browser.tabs.Tab) => {
        try {
          await browser.scripting.executeScript({
            target: { tabId: tab.id! },
            func: async () => {
              return await (window as any).Alfred.openSectionInCodeEditor();
            },
            world: 'MAIN',
          });
        } catch (error) {
          console.error('Error opening section in editor:', error);
        }
      }
    );
  }
};
