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
