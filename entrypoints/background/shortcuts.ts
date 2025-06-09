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
        await copyProductJson(tab);
      } catch (error) {
        console.error('Error copying product JSON:', error);
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
        if (!window.Shopify || !window.__st) {
          console.warn('Not a Shopify store');
          return null;
        }

        return {
          __st: window.__st,
          shopify: window.Shopify,
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

/**
 * Copy the product JSON to the clipboard
 * @param {Browser.tabs.Tab} tab - The current tab
 * @returns {Promise<void>}
 */
const copyProductJson = async (tab: Browser.tabs.Tab): Promise<void> => {
  await browser.scripting.executeScript({
    target: { tabId: tab.id! },
    func: async () => {
      try {
        // Check if this is a Shopify store
        if (!window.Shopify) {
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
          console.warn('Definitly not a Shopify store');
          return false;

          // throw new Error(`Failed to fetch product JSON: ${response.status}`);
        }

        const productData = await response.json();
        await navigator.clipboard.writeText(JSON.stringify(productData, null, 2));

        return true;
      } catch (error) {
        console.error(error);
        return false;
      }
    },
    world: 'MAIN',
  });
};
