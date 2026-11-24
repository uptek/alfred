import { getItem, setItem } from '~/utils/storage';
import { getSettings } from '~/utils/settings';
import { waitForElement } from '~/utils/helpers';
import { sendTrackEvent } from '~/utils/analytics';

// The inspector toggle has no hook of its own. In the editor's top bar it sits right after the
// Sidekick toggle and right before the mobile preview toggle, which both do, so either finds it.
const SIDEKICK_SOURCE = '[data-component-extra-ui_interaction_source="sidekick"]';
const INSPECTOR_BUTTON_SELECTOR = [
  `span:has(> button${SIDEKICK_SOURCE}) + span > button[aria-pressed]`,
  `span:has(+ span > button s-internal-icon[type="mobile"]) > button[aria-pressed]:not(${SIDEKICK_SOURCE})`
].join(', ');
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

      sendTrackEvent('admin.theme_editor.inspector_disable');
    }
  } else if (inspectorSetting === 'restore') {
    const lastState = await getItem<boolean>(INSPECTOR_STATE_KEY);

    if (lastState !== null && lastState !== isPressed) {
      (inspectorButton as HTMLButtonElement).click();

      if (!lastState) {
        sendTrackEvent('admin.theme_editor.inspector_disable');
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
