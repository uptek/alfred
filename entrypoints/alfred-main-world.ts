import { Toast } from '../utils/toast';

export default defineUnlistedScript(() => {
  // Define alfred utils in the global scope
  (window as unknown as WindowWithAlfred).Alfred = {
    // Toast notifications
    Toast,

    // Store the last right-clicked element
    _lastRightClickedElement: null as HTMLElement | null,

    // Initialize the context menu listener
    _initContextMenuListener: () => {
      document.addEventListener(
        'contextmenu',
        (event) => {
          (
            window as unknown as WindowWithAlfred
          ).Alfred._lastRightClickedElement = event.target as HTMLElement;
        },
        true
      );
    },

    _initThemeRequestHandler: () => {
      // Handle postMessage requests
      window.addEventListener('message', (event) => {
        if (event.source !== window) return;

        const data = event.data as { type?: string; requestId?: string };
        if (data && data.type === 'alfred:request_theme') {
          const requestId = data.requestId;
          if (requestId) {
            // Get theme data
            const themeData = (
              window as unknown as WindowWithAlfred
            ).Alfred.getTheme();

            // Serialize the data to avoid DataCloneError
            const serializedData = JSON.parse(
              JSON.stringify(themeData)
            ) as typeof themeData;

            // Send response back via postMessage
            window.postMessage(
              {
                type: 'alfred:theme_response',
                requestId,
                data: serializedData,
              },
              '*'
            );
          }
        }
      });
    },

    /**
     * Check if the current page is a Shopify store
     * @returns {boolean}
     */
    isShopify: () => {
      const win = window as unknown as WindowWithAlfred;
      return !!win.Shopify && !!win.__st;
    },

    /**
     * Get Shopify theme information
     * @returns {object} Theme information object
     */
    getTheme: () => {
      const win = window as unknown as WindowWithAlfred;
      if (!win.Alfred.isShopify()) {
        return {
          isShopify: false,
          theme: null,
          shop: null,
        };
      }

      const shopify = win.Shopify;

      // Return the theme data directly from Shopify global object
      return {
        isShopify: true,
        theme: shopify?.theme ?? null,
        shop: shopify?.shop ?? null,
      };
    },

    /**
     * Get the shop name from the Shopify domain
     * @returns {string} Shop name
     */
    getShopName: () => {
      const win = window as unknown as WindowWithAlfred;
      return (win.Shopify?.shop ?? '').replace('.myshopify.com', '');
    },

    /**
     * Write text to clipboard with fallback method
     * @param {string} text - The text to write to clipboard
     * @returns {Promise<boolean>}
     */
    writeToClipboard: async (text: string): Promise<boolean> => {
      try {
        // Focus the document before writing to clipboard
        if (!document.hasFocus()) {
          window.focus();
        }

        // Use a fallback method if clipboard.writeText fails
        try {
          await navigator.clipboard.writeText(text);
          return true;
        } catch {
          // Fallback: Create a textarea, select it, and use document.execCommand
          const textArea = document.createElement('textarea');
          textArea.value = text;
          textArea.style.position = 'fixed';
          textArea.style.opacity = '0';
          document.body.appendChild(textArea);
          textArea.select();
          document.execCommand('copy');
          document.body.removeChild(textArea);
          return true;
        }
      } catch (error) {
        console.error('Error writing to clipboard:', error);
        return false;
      }
    },

    /**
     * Open the current page in the admin editor
     * @returns {Promise<boolean>}
     */
    openInAdmin: (): boolean => {
      try {
        const win = window as unknown as WindowWithAlfred;
        // Check if this is a Shopify store
        if (!win.Alfred.isShopify()) {
          (win.Alfred.Toast as { error: (msg: string) => void }).error(
            'Not a Shopify store'
          );
          return false;
        }

        const shopName = win.Alfred.getShopName();
        const { p, rid } = win.__st ?? {};
        let url = '';

        if (p && ['home', 'cart'].includes(p)) {
          url = `https://admin.shopify.com/store/${shopName}`;
        } else if (
          p &&
          rid &&
          ['product', 'collection', 'page', 'article'].includes(p)
        ) {
          url = `https://admin.shopify.com/store/${shopName}/${p}s/${rid}`;
        } else {
          (win.Alfred.Toast as { error: (msg: string) => void }).error(
            'Page type not supported'
          );
          return false;
        }

        (win.Alfred.Toast as { success: (msg: string) => void }).success(
          'Opening admin...'
        );
        window.open(url, '_blank');

        // Track the action
        window.dispatchEvent(
          new CustomEvent('alfred:track', {
            detail: {
              action: 'open_in_admin',
              metadata: {
                page_url: window.location.href,
                page_type: p || 'other',
                shop_domain: window.location.hostname,
              },
            },
          })
        );

        return true;
      } catch (error) {
        console.error('Error opening in admin:', error);
        const win = window as unknown as WindowWithAlfred;
        (win.Alfred.Toast as { error: (msg: string) => void }).error(
          'Failed to open admin'
        );
        return false;
      }
    },

    /**
     * Open the current page in the customizer
     * @returns {Promise<boolean>}
     */
    openInCustomizer: (): boolean => {
      try {
        const win = window as unknown as WindowWithAlfred;
        // Check if this is a Shopify store
        if (!win.Alfred.isShopify()) {
          (win.Alfred.Toast as { error: (msg: string) => void }).error(
            'Not a Shopify store'
          );
          return false;
        }

        const themeId = win.Shopify?.theme?.id;
        const shopName = win.Alfred.getShopName();
        const previewPath = encodeURIComponent(window.location.pathname);
        const customizerUrl = `https://admin.shopify.com/store/${shopName}/themes/${themeId}/editor?previewPath=${previewPath}`;

        (win.Alfred.Toast as { success: (msg: string) => void }).success(
          'Opening customizer...'
        );
        window.open(customizerUrl, '_blank');

        // Track the action
        window.dispatchEvent(
          new CustomEvent('alfred:track', {
            detail: {
              action: 'open_in_customizer',
              metadata: {
                page_url: window.location.href,
                page_type: win.__st?.p ?? 'other',
                shop_domain: window.location.hostname,
              },
            },
          })
        );

        return true;
      } catch (error) {
        console.error('Error opening in customizer:', error);
        const win = window as unknown as WindowWithAlfred;
        (win.Alfred.Toast as { error: (msg: string) => void }).error(
          'Failed to open in customizer'
        );
        return false;
      }
    },

    /**
     * Fetch and copy product JSON to clipboard
     * @returns {Promise<boolean>}
     */
    copyProductJson: async (): Promise<boolean> => {
      try {
        const win = window as unknown as WindowWithAlfred;
        // Check if this is a Shopify store
        if (!win.Alfred.isShopify()) {
          (win.Alfred.Toast as { error: (msg: string) => void }).error(
            'Not a Shopify store'
          );
          return false;
        }

        // Check if this is a product page
        if (!window.location.pathname.includes('/products/')) {
          (win.Alfred.Toast as { error: (msg: string) => void }).error(
            'Not a product page'
          );
          return false;
        }

        const url = new URL(window.location.href);
        const pathname = url.pathname.replace(/\/$/, '');
        const jsonUrl = `${url.origin}${pathname}.js`;

        const response = await fetch(jsonUrl);

        if (!response.ok) {
          (win.Alfred.Toast as { error: (msg: string) => void }).error(
            'Failed to fetch product data'
          );
          return false;
        }

        const productData = (await response.json()) as unknown;
        const copiedToClipboard = await win.Alfred.writeToClipboard(
          JSON.stringify(productData, null, 2)
        );

        // If successful, show toast and dispatch event for tracking
        if (copiedToClipboard) {
          (win.Alfred.Toast as { success: (msg: string) => void }).success(
            'Product JSON copied'
          );

          window.dispatchEvent(
            new CustomEvent('alfred:track', {
              detail: {
                action: 'copy_product_json',
                metadata: {
                  page_url: window.location.href,
                  page_type: 'product',
                  shop_domain: window.location.hostname,
                },
              },
            })
          );
        } else {
          (win.Alfred.Toast as { error: (msg: string) => void }).error(
            'Failed to copy product JSON'
          );
        }

        return copiedToClipboard;
      } catch (error) {
        console.error('Error copying product JSON:', error);
        const win = window as unknown as WindowWithAlfred;
        (win.Alfred.Toast as { error: (msg: string) => void }).error(
          'Failed to copy product JSON'
        );
        return false;
      }
    },

    /**
     * Fetch and copy cart JSON to clipboard
     * @returns {Promise<boolean>}
     */
    copyCartJson: async (): Promise<boolean> => {
      try {
        const win = window as unknown as WindowWithAlfred;
        // Check if this is a Shopify store
        if (!win.Alfred.isShopify()) {
          (win.Alfred.Toast as { error: (msg: string) => void }).error(
            'Not a Shopify store'
          );
          return false;
        }

        // Fetch cart data using Shopify's cart.js API
        const response = await fetch('/cart.js');

        if (!response.ok) {
          (win.Alfred.Toast as { error: (msg: string) => void }).error(
            'Failed to fetch cart data'
          );
          return false;
        }

        const cartData = (await response.json()) as unknown;
        const copiedToClipboard = await win.Alfred.writeToClipboard(
          JSON.stringify(cartData, null, 2)
        );

        // If successful, show toast and dispatch event for tracking
        if (copiedToClipboard) {
          (win.Alfred.Toast as { success: (msg: string) => void }).success(
            'Cart JSON copied'
          );

          window.dispatchEvent(
            new CustomEvent('alfred:track', {
              detail: {
                action: 'copy_cart_json',
                metadata: {
                  page_url: window.location.href,
                  page_type:
                    (window as unknown as WindowWithAlfred).__st?.p ?? 'other',
                  shop_domain: window.location.hostname,
                },
              },
            })
          );
        } else {
          (win.Alfred.Toast as { error: (msg: string) => void }).error(
            'Failed to copy cart JSON'
          );
        }

        return copiedToClipboard;
      } catch (error) {
        console.error('Error copying cart JSON:', error);
        const win = window as unknown as WindowWithAlfred;
        (win.Alfred.Toast as { error: (msg: string) => void }).error(
          'Failed to copy cart JSON'
        );
        return false;
      }
    },

    /**
     * Copy theme preview URL to clipboard
     * @param {boolean} disablePreviewBar - Whether to disable the preview bar (adds pb=0)
     * @returns {Promise<boolean>}
     */
    copyThemePreviewUrl: async (
      disablePreviewBar = false
    ): Promise<boolean> => {
      try {
        const win = window as unknown as WindowWithAlfred;
        // Check if this is a Shopify store
        if (!win.Alfred.isShopify()) {
          (win.Alfred.Toast as { error: (msg: string) => void }).error(
            'Not a Shopify store'
          );
          return false;
        }

        const themeId = win.Shopify?.theme?.id ?? '';
        const url = new URL(window.location.href);

        // Add or update the preview_theme_id parameter
        url.searchParams.set('preview_theme_id', themeId);

        // Add pb=0 to disable preview bar if requested
        if (disablePreviewBar) {
          url.searchParams.set('pb', '0');
        }

        const copiedToClipboard = await win.Alfred.writeToClipboard(
          url.toString()
        );

        // If successful, show toast and dispatch event for tracking
        if (copiedToClipboard) {
          (win.Alfred.Toast as { success: (msg: string) => void }).success(
            'Preview URL copied!'
          );

          window.dispatchEvent(
            new CustomEvent('alfred:track', {
              detail: {
                action: 'copy_theme_preview_url',
                metadata: {
                  page_url: window.location.href,
                  page_type: win.__st?.p ?? 'other',
                  shop_domain: window.location.hostname,
                  disable_preview_bar: disablePreviewBar,
                },
              },
            })
          );
        } else {
          (win.Alfred.Toast as { error: (msg: string) => void }).error(
            'Failed to copy theme preview URL'
          );
        }

        return copiedToClipboard;
      } catch (error) {
        console.error('Error copying preview URL:', error);
        const win = window as unknown as WindowWithAlfred;
        (win.Alfred.Toast as { error: (msg: string) => void }).error(
          'Failed to copy theme preview URL'
        );
        return false;
      }
    },

    /**
     * Clear the shopping cart
     * @returns {Promise<boolean>}
     */
    clearCart: async (): Promise<boolean> => {
      try {
        const win = window as unknown as WindowWithAlfred;
        // Check if this is a Shopify store
        if (!win.Alfred.isShopify()) {
          (win.Alfred.Toast as { error: (msg: string) => void }).error(
            'Not a Shopify store'
          );
          return false;
        }

        (win.Alfred.Toast as { success: (msg: string) => void }).success(
          'Clearing cart...'
        );

        // Clear cart
        const response = await fetch('/cart/clear');

        if (!response.ok) {
          (win.Alfred.Toast as { error: (msg: string) => void }).error(
            'Failed to clear cart'
          );
          return false;
        }

        (win.Alfred.Toast as { success: (msg: string) => void }).success(
          'Cart cleared'
        );

        // Track the action before reload
        window.dispatchEvent(
          new CustomEvent('alfred:track', {
            detail: {
              action: 'clear_cart',
              metadata: {
                page_url: window.location.href,
                page_type: win.__st?.p ?? 'other',
                shop_domain: window.location.hostname,
              },
            },
          })
        );

        // Reload the page to reflect the empty cart
        window.location.reload();
        return true;
      } catch (error) {
        console.error('Error clearing cart:', error);
        const win = window as unknown as WindowWithAlfred;
        (win.Alfred.Toast as { error: (msg: string) => void }).error(
          'Failed to clear cart'
        );
        return false;
      }
    },

    /**
     * Open the current section in the code editor
     * @returns {Promise<boolean>}
     */
    openSectionInCodeEditor: (): boolean => {
      try {
        const win = window as unknown as WindowWithAlfred;
        // Check if this is a Shopify store
        if (!win.Alfred.isShopify()) {
          (win.Alfred.Toast as { error: (msg: string) => void }).error(
            'Not a Shopify store'
          );
          return false;
        }

        // Use the last right-clicked element
        const target = win.Alfred._lastRightClickedElement;

        if (!target) {
          (win.Alfred.Toast as { error: (msg: string) => void }).error(
            'Invalid section'
          );
          return false;
        }

        // Find the parent section element
        const sectionElement = target.closest('.shopify-section')!;

        if (!sectionElement) {
          (win.Alfred.Toast as { error: (msg: string) => void }).error(
            'Invalid section'
          );
          return false;
        }

        // Extract section ID
        const sectionId = sectionElement.id;
        if (!sectionId?.includes('__')) {
          (win.Alfred.Toast as { error: (msg: string) => void }).error(
            'Invalid section'
          );
          return false;
        }

        // Extract section name from the ID
        // Handle both formats:
        // 1. "shopify-section-template--<id>__rich_text" -> "rich_text"
        // 2. "shopify-section-template--<id>__image_banner_zBNR7B" -> "image_banner"
        const parts = sectionId.split('__');
        if (parts.length < 2) {
          (win.Alfred.Toast as { error: (msg: string) => void }).error(
            'Section not recognized'
          );
          return false;
        }

        // Get the part after __ and remove any unique identifier suffix
        let sectionName = parts[1];

        if (!sectionName) {
          (win.Alfred.Toast as { error: (msg: string) => void }).error(
            'Section not recognized'
          );
          return false;
        }

        // Check if there are multiple sections with the same base pattern
        const basePattern = sectionId.split('__')[0] + '__';
        const allSections = document.querySelectorAll(`[id^="${basePattern}"]`);

        if (allSections.length > 1) {
          // Multiple instances detected - remove the unique suffix after the last underscore
          const lastUnderscore = sectionName.lastIndexOf('_');
          if (lastUnderscore > 0) {
            sectionName = sectionName.substring(0, lastUnderscore);
          }
        }

        if (!sectionName) {
          (win.Alfred.Toast as { error: (msg: string) => void }).error(
            'Section not recognized'
          );
          return false;
        }

        sectionName = sectionName.replace(/_/g, '-');

        // If section name is "main", concatenate with the current page's ptype
        if (sectionName === 'main') {
          const pageType = win.__st?.p;
          if (pageType) {
            sectionName = `main-${pageType}`;
          }
        }

        const shopName = win.Alfred.getShopName();
        const themeId = win.Shopify?.theme?.id;

        // Construct the code editor URL
        const editorUrl = `https://admin.shopify.com/store/${shopName}/themes/${themeId}?key=sections/${sectionName}.liquid`;

        // Open in new tab
        window.open(editorUrl, '_blank');
        (win.Alfred.Toast as { success: (msg: string) => void }).success(
          `Opening ${sectionName}.liquid`
        );

        // Track the action
        window.dispatchEvent(
          new CustomEvent('alfred:track', {
            detail: {
              action: 'open_section_in_code_editor',
              metadata: {
                page_url: window.location.href,
                page_type: win.__st?.p ?? 'other',
                shop_domain: window.location.hostname,
              },
            },
          })
        );

        return true;
      } catch (error) {
        console.error('Error opening section in editor:', error);
        const win = window as unknown as WindowWithAlfred;
        (win.Alfred.Toast as { error: (msg: string) => void }).error(
          'Failed to open section in editor'
        );
        return false;
      }
    },
  };

  // Initialize the context menu listener
  const win = window as unknown as WindowWithAlfred;
  win.Alfred._initContextMenuListener();
  win.Alfred._initThemeRequestHandler();
});
