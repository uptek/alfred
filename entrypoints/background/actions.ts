import { create, removeAll } from '@/utils/contextMenu';

export const registerActions = async () => {
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
          // NOT SHOPIFY
          return;
        }

        const adminUrl = createAdminUrl(data);
        await browser.tabs.create({ url: adminUrl });
      } catch (error) {
        console.error('Error opening in admin:', error);
      }
    }
  );

  // Create Open in Customizer
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
};

const extractStorefrontData = async (tab: Browser.tabs.Tab): Promise<StorefrontData | null> => {
  // Add a small delay to ensure the page is loaded
  await new Promise((resolve) => setTimeout(resolve, 100));

  const results = await browser.scripting.executeScript({
    target: { tabId: tab.id! },
    func: () => {
      try {
        const isShopify = !!window.Shopify;

        return {
          isShopify,
          __st: isShopify ? (window.__st as Window['__st']) : null,
          shopify: isShopify ? (window.Shopify as Window['Shopify']) : null,
          pathname: window.location.pathname,
        };
      } catch (e) {
        console.error('Error accessing Shopify data:', e);
        return null;
      }
    },
    world: 'MAIN',
  });

  const data = results[0]?.result;

  if (!data || !data.isShopify || !data.shopify || !data.__st) {
    return null;
  }

  const shopName = data.shopify.shop.replace('.myshopify.com', '');

  return {
    ...data,
    shopName,
  };
};

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
