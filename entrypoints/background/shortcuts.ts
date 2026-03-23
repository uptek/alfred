import { create, createSeparator, removeAll } from '@/utils/contextMenu';
import { getItem } from '@/utils/storage';
import { trackAction } from '@/utils/analytics';

/**
 * Register shortcuts (context menu items) for the extension
 */
export const registerShortcuts = async () => {
  // Remove all context menus
  removeAll();

  // Get settings to determine which shortcuts to show
  const settings = await getItem<AlfredSettings>('settings');
  const shortcuts = settings?.shortcuts ?? {
    openInAdmin: true,
    openInCustomizer: true,
    openSectionInCodeEditor: true,
    openImageInAdmin: true,
    copyThemePreviewUrl: true,
    exitThemePreview: true,
    copyProductJson: true,
    copyCartJson: true,
    clearCart: true,
    cartograph: true
  };

  // Create main menu
  const alfredMenuId = create({
    id: 'main',
    title: 'Alfred'
  });

  // ── Navigation ──

  // Open in Admin
  if (shortcuts.openInAdmin !== false) {
    create(
      {
        id: 'open-in-admin',
        title: 'Open in Admin',
        parentId: alfredMenuId
      },
      (_info, tab: Browser.tabs.Tab) => {
        void (async () => {
          try {
            await browser.scripting.executeScript({
              target: { tabId: tab.id! },
              func: () => {
                void (window as unknown as WindowWithAlfred).Alfred.openInAdmin();
              },
              world: 'MAIN'
            });
          } catch (error) {
            console.error('Error opening in admin:', error);
          }
        })();
      }
    );
  }

  // Open in Customizer
  if (shortcuts.openInCustomizer !== false) {
    create(
      {
        id: 'open-in-customizer',
        title: 'Open in Customizer',
        parentId: alfredMenuId
      },
      (_info, tab: Browser.tabs.Tab) => {
        void (async () => {
          try {
            await browser.scripting.executeScript({
              target: { tabId: tab.id! },
              func: () => {
                void (window as unknown as WindowWithAlfred).Alfred.openInCustomizer();
              },
              world: 'MAIN'
            });
          } catch (error) {
            console.error('Error opening customizer:', error);
          }
        })();
      }
    );
  }

  // Open Section in Editor
  if (shortcuts.openSectionInCodeEditor !== false) {
    create(
      {
        id: 'open-section-in-editor',
        title: 'Open Section in Code Editor',
        parentId: alfredMenuId
      },
      (_info, tab: Browser.tabs.Tab) => {
        void (async () => {
          try {
            await browser.scripting.executeScript({
              target: { tabId: tab.id! },
              func: () => {
                void (window as unknown as WindowWithAlfred).Alfred.openSectionInCodeEditor();
              },
              world: 'MAIN'
            });
          } catch (error) {
            console.error('Error opening section in editor:', error);
          }
        })();
      }
    );
  }

  // Open Image in Admin > Files
  if (shortcuts.openImageInAdmin !== false) {
    create(
      {
        id: 'open-image-in-admin',
        title: 'Open Image in Admin > Files',
        parentId: alfredMenuId,
        contexts: ['image']
      },
      (info: Browser.contextMenus.OnClickData, tab: Browser.tabs.Tab) => {
        void (async () => {
          try {
            const imageUrl = info.srcUrl;
            if (!imageUrl) return;

            // Extract filename from URL
            const url = new URL(imageUrl);
            const filename = url.pathname.split('/').pop() ?? '';

            // Get shop name from the page
            const results = await browser.scripting.executeScript({
              target: { tabId: tab.id! },
              func: () => {
                return (window as unknown as WindowWithAlfred).Alfred.getShopName();
              },
              world: 'MAIN'
            });

            const shopName = results?.[0]?.result;
            if (!shopName) return;

            const adminUrl = `https://admin.shopify.com/store/${shopName}/content/files?query=${filename}`;
            await browser.tabs.create({ url: adminUrl });

            trackAction('open_image_in_admin');
          } catch (error) {
            console.error('Error searching image in files:', error);
          }
        })();
      }
    );
  }

  // ── Theme ──

  createSeparator('separator-theme', alfredMenuId);

  // Copy Theme Preview URL
  if (shortcuts.copyThemePreviewUrl !== false) {
    create(
      {
        id: 'copy-theme-preview-url',
        title: 'Copy Theme Preview URL',
        parentId: alfredMenuId
      },
      (_info, tab: Browser.tabs.Tab) => {
        void (async () => {
          try {
            await browser.scripting.executeScript({
              target: { tabId: tab.id! },
              func: () => {
                void (window as unknown as WindowWithAlfred).Alfred.copyThemePreviewUrl();
              },
              world: 'MAIN'
            });
          } catch (error) {
            console.error('Error copying theme preview URL:', error);
          }
        })();
      }
    );
  }

  // Exit Theme Preview
  if (shortcuts.exitThemePreview !== false) {
    create(
      {
        id: 'exit-theme-preview',
        title: 'Exit Theme Preview',
        parentId: alfredMenuId
      },
      (_info, tab: Browser.tabs.Tab) => {
        void (async () => {
          try {
            await browser.scripting.executeScript({
              target: { tabId: tab.id! },
              func: () => {
                void (window as unknown as WindowWithAlfred).Alfred.exitThemePreview();
              },
              world: 'MAIN'
            });
          } catch (error) {
            console.error('Error exiting theme preview:', error);
          }
        })();
      }
    );
  }

  // ── Data ──

  createSeparator('separator-data', alfredMenuId);

  // Copy Product JSON
  if (shortcuts.copyProductJson !== false) {
    create(
      {
        id: 'copy-product-json',
        title: 'Copy Product JSON',
        parentId: alfredMenuId
      },
      (_info, tab: Browser.tabs.Tab) => {
        void (async () => {
          try {
            await browser.scripting.executeScript({
              target: { tabId: tab.id! },
              func: () => {
                void (window as unknown as WindowWithAlfred).Alfred.copyProductJson();
              },
              world: 'MAIN'
            });
          } catch (error) {
            console.error('Error copying product JSON:', error);
          }
        })();
      }
    );
  }

  // Copy Cart JSON
  if (shortcuts.copyCartJson !== false) {
    create(
      {
        id: 'copy-cart-json',
        title: 'Copy Cart JSON',
        parentId: alfredMenuId
      },
      (_info, tab: Browser.tabs.Tab) => {
        void (async () => {
          try {
            await browser.scripting.executeScript({
              target: { tabId: tab.id! },
              func: () => {
                void (window as unknown as WindowWithAlfred).Alfred.copyCartJson();
              },
              world: 'MAIN'
            });
          } catch (error) {
            console.error('Error copying cart JSON:', error);
          }
        })();
      }
    );
  }

  // ── Cart ──

  createSeparator('separator-cart', alfredMenuId);

  // Cartograph
  if (shortcuts.cartograph !== false) {
    create(
      {
        id: 'cartograph',
        title: 'Cartograph',
        parentId: alfredMenuId
      },
      (_info, tab: Browser.tabs.Tab) => {
        void (async () => {
          try {
            await browser.tabs.sendMessage(tab.id!, {
              action: 'open_cartograph'
            });
          } catch (error) {
            console.error('Error opening Cartograph:', error);
          }
        })();
      }
    );
  }

  // Clear Cart
  if (shortcuts.clearCart !== false) {
    create(
      {
        id: 'clear-cart',
        title: 'Clear Cart',
        parentId: alfredMenuId
      },
      (_info, tab: Browser.tabs.Tab) => {
        void (async () => {
          try {
            await browser.scripting.executeScript({
              target: { tabId: tab.id! },
              func: () => {
                void (window as unknown as WindowWithAlfred).Alfred.clearCart();
              },
              world: 'MAIN'
            });
          } catch (error) {
            console.error('Error clearing cart:', error);
          }
        })();
      }
    );
  }
};
