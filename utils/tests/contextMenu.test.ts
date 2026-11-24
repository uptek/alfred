import { afterAll, expect, it } from 'bun:test';

// browser is swapped on globalThis and restored after, since all test files share one process.
const g = globalThis as Record<string, unknown>;
const realBrowser = g.browser;
let click: (info: { menuItemId: string }, tab?: unknown) => void = () => {};
g.browser = {
  contextMenus: {
    create: () => {},
    removeAll: () => {},
    onClicked: { addListener: (listener: typeof click) => (click = listener) }
  }
};
afterAll(() => {
  g.browser = realBrowser;
});

const { create, holdClicksUntil, removeAll } = await import('../contextMenu');

it('runs a click that arrives mid-registration once its handler exists', async () => {
  const clicked: string[] = [];
  let finish = () => {};
  // The background wakes: it clears the menus, then awaits settings before recreating them
  removeAll();
  const registration = holdClicksUntil(
    new Promise<void>((resolve) => {
      finish = () => {
        create({ id: 'copy', title: 'Copy' }, () => clicked.push('copy'));
        resolve();
      };
    })
  );

  click({ menuItemId: 'copy' });
  await Promise.resolve();
  expect(clicked).toEqual([]);

  finish();
  await registration;
  await Promise.resolve();
  expect(clicked).toEqual(['copy']);
});
