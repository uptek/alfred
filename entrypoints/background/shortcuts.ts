import { create, removeAll } from '@/utils/contextMenu';

/**
 * Register shortcuts (context menu items) for the extension
 */
export const registerShortcuts = async () => {
  // Remove all context menus
  await removeAll();

  // Create Shopkeeper menu
  const shopkeeperMenuId = create({
    id: 'main',
    title: 'Shopkeeper',
  });

  // Open in Admin
  create(
    {
      id: 'open-in-admin',
      title: 'Open in Admin',
      parentId: shopkeeperMenuId,
    },
    async (info, tab: Browser.tabs.Tab) => {
      try {
        const data = await extractStorefrontData(tab);

        if (!data) {
          return;
        }

        const adminUrl = createAdminUrl(data);
        await browser.tabs.create({ url: adminUrl });
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
      parentId: shopkeeperMenuId,
    },
    async (info, tab: Browser.tabs.Tab) => {
      try {
        const data = await extractStorefrontData(tab);

        if (!data) {
          // NOT SHOPIFY
          return;
        }

        const customizerUrl = createCustomizerUrl(data);
        await browser.tabs.create({ url: customizerUrl });
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
      parentId: shopkeeperMenuId,
    },
    async (info, tab: Browser.tabs.Tab) => {
      try {
        await browser.scripting.executeScript({
          target: { tabId: tab.id! },
          func: async () => {
            return await (window as any).Shopkeeper.copyProductJson();
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
      parentId: shopkeeperMenuId,
    },
    async (info, tab: Browser.tabs.Tab) => {
      try {
        await browser.scripting.executeScript({
          target: { tabId: tab.id! },
          func: async () => {
            return await (window as any).Shopkeeper.copyCartJson();
          },
          world: 'MAIN',
        });
      } catch (error) {
        console.error('Error copying cart JSON:', error);
      }
    }
  );
};

/**
 * Extract storefront data from the current tab
 * @param {Browser.tabs.Tab} tab - The current tab
 * @returns {Promise<StorefrontData | null>} The storefront data
 */
const extractStorefrontData = async (tab: Browser.tabs.Tab): Promise<StorefrontData | null> => {
  const results = await browser.scripting.executeScript({
    target: { tabId: tab.id! },
    func: () => {
      try {
        // Check if this is a Shopify store
        if (!(window as any).Shopify || !(window as any).__st) {
          console.warn('Not a Shopify store');
          return null;
        }

        return {
          __st: (window as any).__st,
          shopify: (window as any).Shopify,
          pathname: window.location.pathname,
        };
      } catch (error) {
        console.error(error);
        return null;
      }
    },
    world: 'MAIN',
  });

  const data = results[0]?.result;

  if (!data || !data.shopify || !data.__st) {
    return null;
  }

  const shopName = data.shopify.shop.replace('.myshopify.com', '');

  return {
    ...data,
    shopName,
  };
};

/**
 * Create a Admin URL to open the current page in the admin editor
 * @param {StorefrontData} data - The storefront data
 * @returns {string} The admin url
 */
const createAdminUrl = (data: StorefrontData): string => {
  const {
    __st: { p, rid },
    shopName,
  } = data;
  let url = '';

  if (['home', 'cart'].includes(p)) {
    url = `https://admin.shopify.com/store/${shopName}`;
  } else if (['product', 'collection', 'page', 'article'].includes(p)) {
    url = `https://admin.shopify.com/store/${shopName}/${p}s/${rid}`;
  } else {
    throw new Error('Unsupported resource type');
  }

  return url;
};

/**
 * Create a Customizer URL to open the current page in the customizer
 * @param {StorefrontData} data - The storefront data
 * @returns {string} The customizer url
 */
const createCustomizerUrl = (data: StorefrontData): string => {
  const {
    shopify: {
      theme: { id },
    },
    shopName,
  } = data;

  const previewPath = encodeURIComponent(data.pathname);
  return `https://admin.shopify.com/store/${shopName}/themes/${id}/editor?previewPath=${previewPath}`;
};
