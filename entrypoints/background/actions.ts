import { create, removeAll } from '../../utils/contextMenu';
import { Browser } from 'wxt/browser';

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
        // Execute script in the current tab to get the necessary information
        const results = await browser.scripting.executeScript({
          target: { tabId: tab.id! },
          func: () => {
            return {
              __st: window.__st,
              shopify: window.Shopify as Window['Shopify'],
              pathname: window.location.pathname,
            };
          },
          world: 'MAIN',
        });

        const data = results[0]?.result;
        if (!data || !data.shopify || !data.__st) {
          console.error('Could not find Shopify data on page');
          return;
        }

        const shopName = data.shopify.shop.replace('.myshopify.com', '');
        const { p, rid } = data.__st;
        let url = '';

        if (['home', 'cart'].includes(p)) {
          url = `https://admin.shopify.com/store/${shopName}`;
        } else if (['product', 'collection', 'page', 'article'].includes(p)) {
          url = `https://admin.shopify.com/store/${shopName}/${p}s/${rid}`;
        } else {
          console.error('Unsupported resource type');
        }

        if (url) {
          await browser.tabs.create({ url });
        }
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
        // Execute script in the current tab to get the necessary information
        const results = await browser.scripting.executeScript({
          target: { tabId: tab.id! },
          func: () => {
            return {
              shopify: window.Shopify as Window['Shopify'],
              pathname: window.location.pathname,
            };
          },
          world: 'MAIN',
        });

        const data = results[0]?.result;
        if (!data || !data.shopify) {
          console.error('Could not find Shopify data on page');
          return;
        }

        const shopName = data.shopify.shop.replace('.myshopify.com', '');
        const themeId = data.shopify.theme?.id;
        const previewPath = encodeURIComponent(data.pathname);
        const customizerUrl = `https://admin.shopify.com/store/${shopName}/themes/${themeId}/editor?previewPath=${previewPath}`;

        await browser.tabs.create({ url: customizerUrl });
      } catch (error) {
        console.error('Error opening customizer:', error);
      }
    }
  );
};
