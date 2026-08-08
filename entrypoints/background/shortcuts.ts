import { create, createSeparator, removeAll } from '@/utils/contextMenu';
import { getSettings, isEnabled, mergeSettings } from '@/utils/settings';
import { trackAction } from '@/utils/analytics';
import { sendTabMessage } from '@/utils/messages';
import {
  getPresets,
  normalizePresetHandle,
  openCollaborationRequest,
  type PermissionPreset
} from '@/entrypoints/collaborator-access.content/presets';

type AlfredMainWorldMethod =
  | 'openInAdmin'
  | 'openInCustomizer'
  | 'openSectionInCodeEditor'
  | 'copyThemePreviewUrl'
  | 'exitThemePreview'
  | 'copyProductJson'
  | 'copyCartJson'
  | 'clearCart';

/** Invoke a no-arg Alfred main-world method in the given tab. */
const execInMain = async (tabId: number, method: AlfredMainWorldMethod) => {
  await browser.scripting.executeScript({
    target: { tabId },
    func: (m: string) => {
      void (window as unknown as WindowWithAlfred).Alfred[m as AlfredMainWorldMethod]();
    },
    args: [method],
    world: 'MAIN'
  });
};

interface ShortcutMenuItem {
  settingKey: keyof NonNullable<AlfredSettings['shortcuts']>;
  id: string;
  title: string;
  method: AlfredMainWorldMethod;
  errorLabel: string;
}

const navigationItems: ShortcutMenuItem[] = [
  {
    settingKey: 'openInAdmin',
    id: 'open-in-admin',
    title: 'Open in Admin',
    method: 'openInAdmin',
    errorLabel: 'Error opening in admin:'
  },
  {
    settingKey: 'openInCustomizer',
    id: 'open-in-customizer',
    title: 'Open in Customizer',
    method: 'openInCustomizer',
    errorLabel: 'Error opening customizer:'
  },
  {
    settingKey: 'openSectionInCodeEditor',
    id: 'open-section-in-editor',
    title: 'Open Section in Code Editor',
    method: 'openSectionInCodeEditor',
    errorLabel: 'Error opening section in editor:'
  }
];

const themeItems: ShortcutMenuItem[] = [
  {
    settingKey: 'copyThemePreviewUrl',
    id: 'copy-theme-preview-url',
    title: 'Copy Theme Preview URL',
    method: 'copyThemePreviewUrl',
    errorLabel: 'Error copying theme preview URL:'
  },
  {
    settingKey: 'exitThemePreview',
    id: 'exit-theme-preview',
    title: 'Exit Theme Preview',
    method: 'exitThemePreview',
    errorLabel: 'Error exiting theme preview:'
  }
];

const dataItems: ShortcutMenuItem[] = [
  {
    settingKey: 'copyProductJson',
    id: 'copy-product-json',
    title: 'Copy Product JSON',
    method: 'copyProductJson',
    errorLabel: 'Error copying product JSON:'
  },
  {
    settingKey: 'copyCartJson',
    id: 'copy-cart-json',
    title: 'Copy Cart JSON',
    method: 'copyCartJson',
    errorLabel: 'Error copying cart JSON:'
  }
];

const clearCartItem: ShortcutMenuItem = {
  settingKey: 'clearCart',
  id: 'clear-cart',
  title: 'Clear Cart',
  method: 'clearCart',
  errorLabel: 'Error clearing cart:'
};

const registerItems = (
  items: ShortcutMenuItem[],
  shortcuts: NonNullable<AlfredSettings['shortcuts']>,
  parentId: string
) => {
  for (const item of items) {
    if (!isEnabled(shortcuts[item.settingKey])) continue;
    create(
      {
        id: item.id,
        title: item.title,
        parentId
      },
      (_info, tab: Browser.tabs.Tab) => {
        void (async () => {
          try {
            await execInMain(tab.id!, item.method);
          } catch (error) {
            console.error(item.errorLabel, error);
          }
        })();
      }
    );
  }
};

/**
 * Register shortcuts (context menu items) for the extension.
 * @param providedSettings - Pass when the caller already has fresh settings
 *   (e.g. a storage watcher) to avoid a redundant read.
 */
export const registerShortcuts = async (providedSettings?: AlfredSettings | null) => {
  // Remove all context menus
  removeAll();

  // Get settings to determine which shortcuts to show
  const settings = providedSettings !== undefined ? mergeSettings(providedSettings) : await getSettings();
  const shortcuts = settings.shortcuts;

  // Create main menu
  const alfredMenuId = create({
    id: 'main',
    title: 'Alfred'
  });

  // ── Navigation ──

  registerItems(navigationItems, shortcuts, alfredMenuId);

  // Open Image in Admin > Files
  if (isEnabled(shortcuts.openImageInAdmin)) {
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
  registerItems(themeItems, shortcuts, alfredMenuId);

  // ── Data ──

  createSeparator('separator-data', alfredMenuId);
  registerItems(dataItems, shortcuts, alfredMenuId);

  // ── Cart ──

  createSeparator('separator-cart', alfredMenuId);

  // Cartograph
  if (isEnabled(shortcuts.cartograph)) {
    create(
      {
        id: 'cartograph',
        title: 'Cartograph',
        parentId: alfredMenuId
      },
      (_info, tab: Browser.tabs.Tab) => {
        void (async () => {
          try {
            await sendTabMessage(tab.id!, 'open_cartograph');
          } catch (error) {
            console.error('Error opening Cartograph:', error);
          }
        })();
      }
    );
  }

  registerItems([clearCartItem], shortcuts, alfredMenuId);

  // ── Collaborator Access ──
  // Request store access for the storefront under the cursor, optionally with a preset.
  // Laid out as a flat group under the Alfred menu to match its separator-group idiom:
  // a general "Request Store Access" action, then each saved preset as a child-styled
  // item directly below it. It's a right-click shortcut, so it's gated by its shortcut flag.
  if (isEnabled(shortcuts.requestStoreAccess)) {
    createSeparator('separator-collab', alfredMenuId);

    create(
      {
        id: 'collab-request-general',
        title: 'Request Store Access',
        parentId: alfredMenuId
      },
      (_info, tab: Browser.tabs.Tab) => {
        void openCollaborationRequest(tab);
      }
    );

    const allPresets = await getPresets();

    // The presetMenuItemHandles field curates the menu: a comma-separated list of preset
    // handles. Empty → show every preset in stored order. Otherwise show only the listed
    // handles, in that order, skipping duplicates and any that don't match a saved preset.
    const requestedHandles = [
      ...new Set(
        (settings?.collaboratorAccess?.presetMenuItemHandles ?? '')
          .split(',')
          .map((handle) => normalizePresetHandle(handle))
          .filter((handle): handle is string => !!handle)
      )
    ];

    const menuPresets =
      requestedHandles.length === 0
        ? allPresets
        : requestedHandles
            .map((handle) => allPresets.find((preset) => preset.handle === handle))
            .filter((preset): preset is PermissionPreset => preset !== undefined);

    menuPresets.forEach((preset) => {
      create(
        {
          id: `collab-preset-${preset.id}`,
          title: `↳ ${preset.name}`,
          parentId: alfredMenuId
        },
        (_info, tab: Browser.tabs.Tab) => {
          void openCollaborationRequest(tab, preset);
        }
      );
    });
  }
};
