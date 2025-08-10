import { getItem, setItem } from '~/utils/storage';
import { waitForElement } from '~/utils/helpers';
import type { AlfredSettings } from '~/entrypoints/options/types';

const INSPECTOR_BUTTON_SELECTOR = 'div[class*="SidekickToggle"] + div button';
const INSPECTOR_STATE_KEY = 'theme-inspector-state';

export async function setupInspector(): Promise<void> {
  const settings = await getItem<AlfredSettings>('settings');
  const inspectorSetting = settings?.themeCustomizer?.inspector;

  if (!inspectorSetting || inspectorSetting === 'default') {
    return;
  }

  const inspectorButton = await waitForElement(INSPECTOR_BUTTON_SELECTOR);
  if (!inspectorButton) {
    return;
  }

  const isPressed = inspectorButton.getAttribute('aria-pressed') === 'true';

  if (inspectorSetting === 'disable') {
    if (isPressed) {
      (inspectorButton as HTMLButtonElement).click();

      // Track disable theme inspector action
      browser.runtime.sendMessage({
        type: "track_action",
        action: "disable_theme_inspector",
        metadata: {
          page_url: window.location.href,
          page_type: "theme_customizer",
        },
      });
    }
  } else if (inspectorSetting === 'restore') {
    const lastState = await getItem<boolean>(INSPECTOR_STATE_KEY);

    if (lastState !== null && lastState !== isPressed) {
      (inspectorButton as HTMLButtonElement).click();

      // Track disable theme inspector action
      if (!lastState) {
        browser.runtime.sendMessage({
          type: "track_action",
          action: "disable_theme_inspector",
          metadata: {
            page_url: window.location.href,
            page_type: "theme_customizer",
          },
        });
      }
    }
  }

  inspectorButton.addEventListener('click', async () => {
    const isPressed = inspectorButton.getAttribute('aria-pressed') !== 'true';
    await setItem(INSPECTOR_STATE_KEY, isPressed);
  });
}
