import { render } from "preact";
import { createIntegratedUi } from "#imports";
import App from "./App.tsx";
import "./style.css";

export default defineContentScript({
  matches: ["*://apps.shopify.com/partners/*"],
  async main(ctx) {
    console.log("Hello content script.");

    const ui = await createIntegratedUi(ctx, {
      position: "inline",
      anchor: "body",
      append: "first",
      onMount: (container) => {
        console.log("App mounted");
        // Don't mount preact app directly on <body>
        const wrapper = document.createElement("div");
        wrapper.classList.add("wxt-preact-example");
        container.append(wrapper);

        render(<App />, wrapper);
        return { wrapper };
      },
      onRemove: (elements) => {
        if (elements?.wrapper) {
          render(null, elements.wrapper);
          elements.wrapper.remove();
        }
      },
    });

    // Explicitly mount the UI
    ui.mount();

    browser.runtime.onMessage.addListener((event) => {
      if (event.type === "MOUNT_UI") {
        // dynamic mount by user action via messaging.
        ui.mount();
      }
    });
  },
});
