export default defineUnlistedScript(() => {
  // Define alfred utils in the global scope
  (window as any).Alfred = {
    // Store the last right-clicked element
    _lastRightClickedElement: null as HTMLElement | null,

    // Initialize the context menu listener
    _initContextMenuListener: () => {
      document.addEventListener('contextmenu', (event) => {
        (window as any).Alfred._lastRightClickedElement = event.target as HTMLElement;
      }, true);
    },

    /**
     * Check if the current page is a Shopify store
     * @returns {boolean}
     */
    isShopify: () => {
      return !!(window as any).Shopify && !!(window as any).__st;
    },

    /**
     * Get the shop name from the Shopify domain
     * @returns {string} Shop name
     */
    getShopName: () => {
      return (window as any).Shopify.shop.replace('.myshopify.com', '');
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
        } catch (clipboardError) {
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
    openInAdmin: async (): Promise<boolean> => {
      try {
        // Check if this is a Shopify store
        if (!(window as any).Alfred.isShopify()) {
          console.warn('Not a Shopify store');
          return false;
        }

        const shopName = (window as any).Alfred.getShopName();
        const { p, rid } = (window as any).__st;
        let url = '';

        if (['home', 'cart'].includes(p)) {
          url = `https://admin.shopify.com/store/${shopName}`;
        } else if (['product', 'collection', 'page', 'article'].includes(p)) {
          url = `https://admin.shopify.com/store/${shopName}/${p}s/${rid}`;
        } else {
          throw new Error('Unsupported resource type');
        }

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
        return false;
      }
    },

    /**
     * Open the current page in the customizer
     * @returns {Promise<boolean>}
     */
    openInCustomizer: async (): Promise<boolean> => {
      try {
        // Check if this is a Shopify store
        if (!(window as any).Alfred.isShopify()) {
          console.warn('Not a Shopify store');
          return false;
        }

        const themeId = (window as any).Shopify.theme.id;
        const shopName = (window as any).Alfred.getShopName();
        const previewPath = encodeURIComponent(window.location.pathname);
        const customizerUrl = `https://admin.shopify.com/store/${shopName}/themes/${themeId}/editor?previewPath=${previewPath}`;

        window.open(customizerUrl, '_blank');

        // Track the action
        window.dispatchEvent(
          new CustomEvent('alfred:track', {
            detail: {
              action: 'open_in_customizer',
              metadata: {
                page_url: window.location.href,
                page_type: (window as any).__st?.p || 'other',
                shop_domain: window.location.hostname,
              },
            },
          })
        );

        return true;
      } catch (error) {
        console.error('Error opening in customizer:', error);
        return false;
      }
    },

    /**
     * Fetch and copy product JSON to clipboard
     * @returns {Promise<boolean>}
     */
    copyProductJson: async (): Promise<boolean> => {
      try {
        // Check if this is a Shopify store
        if (!(window as any).Alfred.isShopify()) {
          console.warn('Not a Shopify store');
          return false;
        }

        // Check if this is a product page
        if (!window.location.pathname.includes('/products/')) {
          console.warn('Not a product page');
          return false;
        }

        const url = new URL(window.location.href);
        const pathname = url.pathname.replace(/\/$/, '');
        const jsonUrl = `${url.origin}${pathname}.js`;

        const response = await fetch(jsonUrl);

        if (!response.ok) {
          console.warn('Failed to fetch product JSON');
          return false;
        }

        const productData = await response.json();
        const copiedToClipboard = await (window as any).Alfred.writeToClipboard(JSON.stringify(productData, null, 2));

        // If successful, dispatch event for tracking
        if (copiedToClipboard) {
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
        }

        return copiedToClipboard;
      } catch (error) {
        console.error('Error copying product JSON:', error);
        return false;
      }
    },

    /**
     * Fetch and copy cart JSON to clipboard
     * @returns {Promise<boolean>}
     */
    copyCartJson: async (): Promise<boolean> => {
      try {
        // Check if this is a Shopify store
        if (!(window as any).Alfred.isShopify()) {
          console.warn('Not a Shopify store');
          return false;
        }

        // Fetch cart data using Shopify's cart.js API
        const response = await fetch('/cart.js');

        if (!response.ok) {
          console.warn('Failed to fetch cart JSON');
          return false;
        }

        const cartData = await response.json();
        const copiedToClipboard = await (window as any).Alfred.writeToClipboard(JSON.stringify(cartData, null, 2));

        // If successful, dispatch event for tracking
        if (copiedToClipboard) {
          window.dispatchEvent(
            new CustomEvent('alfred:track', {
              detail: {
                action: 'copy_cart_json',
                metadata: {
                  page_url: window.location.href,
                  page_type: (window as any).__st?.p || 'other',
                  shop_domain: window.location.hostname,
                },
              },
            })
          );
        }

        return copiedToClipboard;
      } catch (error) {
        console.error('Error copying cart JSON:', error);
        return false;
      }
    },

    /**
     * Copy theme preview URL to clipboard
     * @returns {Promise<boolean>}
     */
    copyThemePreviewUrl: async (): Promise<boolean> => {
      try {
        // Check if this is a Shopify store
        if (!(window as any).Alfred.isShopify()) {
          console.warn('Not a Shopify store');
          return false;
        }

        const themeId = (window as any).Shopify.theme.id;
        const url = new URL(window.location.href);

        // Add or update the preview_theme_id parameter
        url.searchParams.set('preview_theme_id', themeId);

        const copiedToClipboard = await (window as any).Alfred.writeToClipboard(url.toString());

        // If successful, dispatch event for tracking
        if (copiedToClipboard) {
          window.dispatchEvent(
            new CustomEvent('alfred:track', {
              detail: {
                action: 'copy_theme_preview_url',
                metadata: {
                  page_url: window.location.href,
                  page_type: (window as any).__st?.p || 'other',
                  shop_domain: window.location.hostname,
                },
              },
            })
          );
        }

        return copiedToClipboard;
      } catch (error) {
        console.error('Error copying preview URL:', error);
        return false;
      }
    },

    /**
     * Clear the shopping cart
     * @returns {Promise<boolean>}
     */
    clearCart: async (): Promise<boolean> => {
      try {
        // Check if this is a Shopify store
        if (!(window as any).Alfred.isShopify()) {
          console.warn('Not a Shopify store');
          return false;
        }

        // Clear cart
        const response = await fetch('/cart/clear');

        if (!response.ok) {
          console.warn('Failed to clear cart');
          return false;
        }

        // Track the action before reload
        window.dispatchEvent(
          new CustomEvent('alfred:track', {
            detail: {
              action: 'clear_cart',
              metadata: {
                page_url: window.location.href,
                page_type: (window as any).__st?.p || 'other',
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
        return false;
      }
    },

    /**
     * Open the current section in the code editor
     * @returns {Promise<boolean>}
     */
    openSectionInEditor: async (): Promise<boolean> => {
      try {
        // Check if this is a Shopify store
        if (!(window as any).Alfred.isShopify()) {
          console.warn('Not a Shopify store');
          return false;
        }

        // Use the last right-clicked element
        const target = (window as any).Alfred._lastRightClickedElement;

        if (!target) {
          console.warn('No right-clicked element found');
          return false;
        }

        // Find the parent section element
        let sectionElement = target.closest('.section.shopify-section') as HTMLElement;

        if (!sectionElement) {
          console.warn('No Shopify section found');
          return false;
        }

        // Extract section ID
        const sectionId = sectionElement.id;
        if (!sectionId || !sectionId.includes('__')) {
          console.warn('Invalid section ID format');
          return false;
        }

        // Extract section name from the ID
        // Handle both formats:
        // 1. "shopify-section-template--15968257704025__rich_text" -> "rich_text"
        // 2. "shopify-section-template--18968196514006__image_lelele_zBNR7B" -> "image_lelele"
        const parts = sectionId.split('__');
        if (parts.length < 2) {
          console.warn('Could not extract section name');
          return false;
        }

        // Get the part after __ and remove any unique identifier suffix
        let sectionName = parts[1];

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
          console.warn('Could not extract section name');
          return false;
        }

        sectionName = sectionName.replace(/_/g, '-');
        const shopName = (window as any).Alfred.getShopName();
        const themeId = (window as any).Shopify.theme.id;

        // Construct the code editor URL
        const editorUrl = `https://admin.shopify.com/store/${shopName}/themes/${themeId}?key=sections/${sectionName}.liquid`;

        // Open in new tab
        window.open(editorUrl, '_blank');

        // Track the action
        window.dispatchEvent(
          new CustomEvent('alfred:track', {
            detail: {
              action: 'open_section_in_code_editor',
              metadata: {
                page_url: window.location.href,
                page_type: (window as any).__st?.p || 'other',
                shop_domain: window.location.hostname,
              },
            },
          })
        );

        return true;
      } catch (error) {
        console.error('Error opening section in editor:', error);
        return false;
      }
    },
  };

  // Initialize the context menu listener
  (window as any).Alfred._initContextMenuListener();
});
