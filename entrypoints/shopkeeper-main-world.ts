export default defineUnlistedScript(() => {
  // Define shopkeeper utils in the global scope
  (window as any).Shopkeeper = {
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
        if (!(window as any).Shopkeeper.isShopify()) {
          console.warn('Not a Shopify store');
          return false;
        }

        const shopName = (window as any).Shopkeeper.getShopName();
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
        if (!(window as any).Shopkeeper.isShopify()) {
          console.warn('Not a Shopify store');
          return false;
        }

        const themeId = (window as any).Shopify.theme.id;
        const shopName = (window as any).Shopkeeper.getShopName();
        const previewPath = encodeURIComponent(window.location.pathname);
        const customizerUrl = `https://admin.shopify.com/store/${shopName}/themes/${themeId}/editor?previewPath=${previewPath}`;

        window.open(customizerUrl, '_blank');
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
        if (!(window as any).Shopkeeper.isShopify()) {
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
        return await (window as any).Shopkeeper.writeToClipboard(JSON.stringify(productData, null, 2));
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
        if (!(window as any).Shopkeeper.isShopify()) {
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
        return await (window as any).Shopkeeper.writeToClipboard(JSON.stringify(cartData, null, 2));
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
        if (!(window as any).Shopkeeper.isShopify()) {
          console.warn('Not a Shopify store');
          return false;
        }

        const themeId = (window as any).Shopify.theme.id;
        const url = new URL(window.location.href);

        // Add or update the preview_theme_id parameter
        url.searchParams.set('preview_theme_id', themeId);

        return await (window as any).Shopkeeper.writeToClipboard(url.toString());
      } catch (error) {
        console.error('Error copying preview URL:', error);
        return false;
      }
    },
  };
});
