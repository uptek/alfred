import { getItem, setItem } from '~/utils/storage';
import { getSettings } from '~/utils/settings';
import { waitForElement } from '~/utils/helpers';
import { sendTrackEvent } from '~/utils/analytics';

const INSPECTOR_BUTTON_SELECTOR = 'div[class*="SidekickToggle"] + div button';
const INSPECTOR_STATE_KEY = 'theme-inspector-state';

export async function setupInspector(): Promise<void> {
  const settings = await getSettings();
  const inspectorSetting = settings.themeCustomizer.inspector;

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

      sendTrackEvent('disable_theme_inspector');
    }
  } else if (inspectorSetting === 'restore') {
    const lastState = await getItem<boolean>(INSPECTOR_STATE_KEY);

    if (lastState !== null && lastState !== isPressed) {
      (inspectorButton as HTMLButtonElement).click();

      if (!lastState) {
        sendTrackEvent('disable_theme_inspector');
      }
    }
  }

  inspectorButton.addEventListener('click', () => {
    void (async () => {
      const isPressed = inspectorButton.getAttribute('aria-pressed') !== 'true';
      await setItem(INSPECTOR_STATE_KEY, isPressed);
    })();
  });
}
