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
        await browser.scripting.executeScript({
          target: { tabId: tab.id! },
          func: async () => {
            return await (window as any).Shopkeeper.openInAdmin();
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
