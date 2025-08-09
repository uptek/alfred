import { getItem, setItem } from '~/utils/storage';
import { waitForElement } from '~/utils/helpers';
import { trackAction } from '~/utils/analytics';
import type { AlfredSettings } from '~/entrypoints/options/types';

const INSPECTOR_BUTTON_SELECTOR = 'button[aria-label*="inspector"]';
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
      trackAction('theme_inspector_auto_disabled');
    }
  } else if (inspectorSetting === 'restore') {
    const lastState = await getItem<boolean>(INSPECTOR_STATE_KEY);

    if (lastState !== null && lastState !== isPressed) {
      (inspectorButton as HTMLButtonElement).click();
      // Only track when restoring to disabled state (lastState === false)
      if (!lastState) {
        trackAction('theme_inspector_auto_disabled');
      }
    }
  }

  inspectorButton.addEventListener('click', async () => {
    const isPressed = inspectorButton.getAttribute('aria-pressed') !== 'true';
    await setItem(INSPECTOR_STATE_KEY, isPressed);
  });
}
