import { render } from "preact";
import { createIntegratedUi } from "#imports";
import App from "./App.tsx";

export default defineContentScript({
  matches: ["*://apps.shopify.com/partners/*"],
  async main(ctx) {
    const ui = await createIntegratedUi(ctx, {
      position: "inline",
      anchor: "body",
      append: "first",
      onMount: (container) => {
        const target = document.querySelector(
          "#PartnersShow > main > div > section > div:nth-child(1)"
        );

        if (!target) {
          return;
        }

        if (target.nextSibling) {
          target.parentNode?.insertBefore(container, target.nextSibling);
        } else {
          target.parentNode?.appendChild(container);
        }

        render(<App />, container);
        return { container };
      },
      onRemove: (elements) => {
        if (elements?.container) {
          render(null, elements.container);
          elements.container.remove();
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
