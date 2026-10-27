/** The themes page's path, where the theme list features run. */
export const THEMES_PATH = /\/themes\/?$/;

interface ThemeData {
  themeId: string;
  previewUrl: string;
}

export interface ThemeElements extends ThemeData {
  name: string;
  actions: Element;
  more: HTMLButtonElement | null;
  card: HTMLElement;
  isPublished: boolean;
}

/**
 * Extracts theme ID and preview URL from a theme's "Edit theme" link.
 * The link points at `/themes/:id/editor`, or `/themes/:id/canvas` for Canvas themes.
 * @param editLink - The theme's "Edit theme" `<a>` element.
 * @returns The parsed theme data, or `null` if the link has no theme ID.
 */
const extractThemeData = (editLink: HTMLAnchorElement): ThemeData | null => {
  const href = editLink.getAttribute('href') ?? '';
  const themeId = /\/themes\/(\d+)/.exec(href)?.[1];
  if (!themeId) {
    return null;
  }

  const storeName = /\/store\/([^/]+)\//.exec(href)?.[1] ?? '';
  const previewUrl = storeName ? `https://${storeName}.myshopify.com/?preview_theme_id=${themeId}` : '';

  return { themeId, previewUrl };
};

/**
 * Parses an HTML string and returns the first element.
 * @param template - The HTML string to parse.
 * @returns The first child element of the parsed HTML.
 */
export const html = (template: string): HTMLElement => {
  const container = document.createElement('div');
  container.innerHTML = template.trim();
  return container.firstElementChild as HTMLElement;
};

/**
 * Walks the live theme card and each library theme item, pairing each "Edit theme" link with
 * its actions row, "more actions" button and enclosing card. The live theme sits in a
 * `[class*="PublishedTheme"]` card; library themes each sit in their own `<li>`.
 * @returns One entry per theme found on the page.
 */
export const collectThemeElements = (): ThemeElements[] => {
  const editLinks = document.querySelectorAll<HTMLAnchorElement>('a[class*="ThemeActionButton"][href*="/themes/"]');

  const themes: ThemeElements[] = [];

  editLinks.forEach((editLink) => {
    const actions = editLink.closest('.Polaris-InlineStack');
    if (!actions) {
      return;
    }

    const data = extractThemeData(editLink);
    if (!data) {
      return;
    }

    const publishedCard = editLink.closest<HTMLElement>('[class*="PublishedTheme"]');
    const card = publishedCard ?? editLink.closest<HTMLElement>('li');
    if (!card) {
      return;
    }

    const more = actions.querySelector<HTMLButtonElement>(':scope > button[command]');
    const name = card.querySelector('h3')?.textContent?.trim() ?? data.themeId;

    themes.push({ ...data, name, actions, more, card, isPublished: !!publishedCard });
  });

  return themes;
};
