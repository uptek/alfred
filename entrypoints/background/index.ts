import { registerContextMenus } from "./shopkeeperContextMenus";

export default defineBackground(() => {
  browser.runtime.onInstalled.addListener(() => {
    registerContextMenus();
  });
});
