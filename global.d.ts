/// <reference types="chrome" />

declare namespace ContextMenu {
  type ContextType =
    | 'all'
    | 'page'
    | 'frame'
    | 'selection'
    | 'link'
    | 'editable'
    | 'image'
    | 'video'
    | 'audio'
    | 'launcher'
    | 'browser_action'
    | 'page_action'
    | 'action'
    | 'all_frames';

  interface Options {
    id: string;
    title: string;
    contexts?: ContextType[];
    parentId?: string;
    type?: chrome.contextMenus.ItemType;
    documentUrlPatterns?: string[];
    targetUrlPatterns?: string[];
    enabled?: boolean;
    checked?: boolean;
  }

  type ClickHandler = (
    info: chrome.contextMenus.OnClickData,
    tab?: chrome.tabs.Tab
  ) => void;
}

declare interface AlfredSettings {
  general?: {
    restoreRightClick?: boolean;
  };
  themeCustomizer?: {
    inspector?: 'default' | 'disable' | 'restore';
    resizers?: {
      primarySidebar?: boolean;
      secondarySidebar?: boolean;
      previewHorizontal?: boolean;
      previewVertical?: boolean;
    };
  };
  shortcuts?: {
    openInAdmin?: boolean;
    openInCustomizer?: boolean;
    copyProductJson?: boolean;
    copyCartJson?: boolean;
    copyThemePreviewUrl?: boolean;
    clearCart?: boolean;
    openSectionInCodeEditor?: boolean;
    openImageInAdmin?: boolean;
  };
  appStore?: {
    searchIndexing?: boolean;
    enhancedPartnerPages?: boolean;
  };
  collaboratorAccess?: {
    presets?: boolean;
  };
  admin?: {
    collapsibleSidebar?: boolean;
    warnBeforeClosingCodeEditor?: boolean;
  };
}

declare interface SettingItem {
  key: string;
  label: string;
  details?: string;
  type?: 'checkbox' | 'switch' | 'choice' | 'text' | 'number'; // defaults to 'checkbox'
  choices?: { label: string; value: string; details?: string }[]; // for choice type
  defaultValue?: unknown;
  subSettingItems?: SettingItem[];
}

declare interface WindowWithAlfred {
  Shopify?: {
    shop?: string;
    theme?: {
      id?: string;
      [key: string]: unknown;
    };
    [key: string]: unknown;
  };
  __st?: {
    p?: string;
    rid?: string;
    [key: string]: unknown;
  };
  Alfred: {
    settings: AlfredSettings;
    Toast: unknown;
    _lastRightClickedElement: HTMLElement | null;
    _initContextMenuListener: () => void;
    _initThemeRequestHandler: () => void;
    isShopify: () => boolean;
    getTheme: () => {
      isShopify: boolean;
      theme: unknown;
      shop: unknown;
    };
    getShopName: () => string;
    writeToClipboard: (text: string) => Promise<boolean>;
    openInAdmin: () => boolean;
    openInCustomizer: () => boolean;
    copyProductJson: () => Promise<boolean>;
    copyCartJson: () => Promise<boolean>;
    copyThemePreviewUrl: (disablePreviewBar?: boolean) => Promise<boolean>;
    clearCart: () => Promise<boolean>;
    openSectionInCodeEditor: () => boolean;
  };
}
