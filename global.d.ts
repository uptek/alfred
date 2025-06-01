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

type __st = {
  rid: number;
  p: string;
};

type Shopify = {
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

declare global {
  interface Window {
    __st?: __st;
    Shopify?: Shopify;
  }
}

type StorefrontData = {
  __st: __st;
  shopify: Shopify;
  shopName: string;
  pathname: string;
};
