import { registerActions } from "./actions";

export default defineBackground(() => {
  browser.runtime.onInstalled.addListener(() => {
    registerActions();
  });
});
