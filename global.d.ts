/// <reference types="chrome" />

declare namespace ContextMenu {
  type ContextType = chrome.contextMenus.ContextType | 'all';

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

  type ClickHandler = (info: chrome.contextMenus.OnClickData, tab?: chrome.tabs.Tab) => void;
}

declare interface AlfredSettings {
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
  };
  appStore?: {
    searchIndexing?: boolean;
    enhancedPartnerPages?: boolean;
  };
  collaboratorAccess?: {
    presets?: boolean;
  };
}
