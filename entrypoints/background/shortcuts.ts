import { create, removeAll } from '@/utils/contextMenu';

/**
 * Register shortcuts (context menu items) for the extension
 */
export const registerShortcuts = async () => {
  // Remove all context menus
  await removeAll();

  // Create Alfred menu
  const alfredMenuId = create({
    id: 'main',
    title: 'Alfred',
  });

  // Open in Admin
  create(
    {
      id: 'open-in-admin',
      title: 'Open in Admin',
      parentId: alfredMenuId,
    },
    async (info, tab: Browser.tabs.Tab) => {
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

  // Open in Customizer
  create(
    {
      id: 'open-in-customizer',
      title: 'Open in Customizer',
      parentId: alfredMenuId,
    },
    async (info, tab: Browser.tabs.Tab) => {
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

  // Copy Product JSON
  create(
    {
      id: 'copy-product-json',
      title: 'Copy Product JSON',
      parentId: alfredMenuId,
    },
    async (info, tab: Browser.tabs.Tab) => {
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

  // Copy Cart JSON
  create(
    {
      id: 'copy-cart-json',
      title: 'Copy Cart JSON',
      parentId: alfredMenuId,
    },
    async (info, tab: Browser.tabs.Tab) => {
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

  // Copy Theme Preview URL
  create(
    {
      id: 'copy-theme-preview-url',
      title: 'Copy Theme Preview URL',
      parentId: alfredMenuId,
    },
    async (info, tab: Browser.tabs.Tab) => {
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

  // Clear Cart
  create(
    {
      id: 'clear-cart',
      title: 'Clear Cart',
      parentId: alfredMenuId,
    },
    async (info, tab: Browser.tabs.Tab) => {
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

  // Open Section in Editor
  create(
    {
      id: 'open-section-in-editor',
      title: 'Open Section in Code Editor',
      parentId: alfredMenuId,
    },
    async (info, tab: Browser.tabs.Tab) => {
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
};
