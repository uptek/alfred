import { ContextMenu } from '../../utils/contextMenu';

export const registerActions = async () => {
  const contextMenu = new ContextMenu();

  // Remove all context menus
  await contextMenu.removeAll();

  // Create Shopkeeper menu
  const shopkeeperMenuId = contextMenu.create({
    title: 'Shopkeeper',
  });

  // Open in Admin
  contextMenu.create(
    {
      title: 'Open in Admin',
      parentId: shopkeeperMenuId,
    },
    async (info, tab) => {
      if (!tab || !tab.id) return;

      try {
        // Execute script in the current tab to get the necessary information
        const results = await browser.scripting.executeScript({
          target: { tabId: tab.id },
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
        const { rtyp, rid } = data.__st;

        if (['product', 'collection', 'page', 'article'].includes(rtyp)) {
          const url = `https://admin.shopify.com/store/${shopName}/${rtyp}s/${rid}`;
          await browser.tabs.create({ url: url });
        } else {
          alert('Unsupported resource type');
        }
      } catch (error) {
        console.error('Error opening in admin:', error);
      }
    }
  );

  // Create Open in Customizer
  contextMenu.create(
    {
      title: 'Open in Customizer',
      parentId: shopkeeperMenuId,
    },
    async (info, tab) => {
      if (!tab || !tab.id) return;

      try {
        // Execute script in the current tab to get the necessary information
        const results = await browser.scripting.executeScript({
          target: { tabId: tab.id },
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
