/// <reference types="chrome" />

declare namespace ContextMenu {
  type ContextType = chrome.contextMenus.ContextType | 'all';

  interface Options {
    id?: string;
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

interface Window {
  __st: {
    rid: number;
    p: string;
  };

  Shopify: {
    shop: string;
    theme: {
      handle: string;
      id: number;
      name: string;
      role: string;
      schema_name: string;
      schema_version: string;
      style: { id: number | null; handle: string | null };
      theme_store_id: number;
    };
  };
}
