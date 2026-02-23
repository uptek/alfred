import { getItem } from '~/utils/storage';

const INJECTED_ATTR = 'data-alfred-theme-list';

const trackThemeListAction = (
  action: string,
  metadata: Record<string, unknown> = {}
) => {
  browser.runtime.sendMessage({
    type: 'track_action',
    action,
    metadata,
  });
};

interface ThemeData {
  themeId: string;
  storeName: string;
  themeName: string;
  previewUrl: string;
  codeEditorUrl: string;
}

const extractThemeData = (listItem: HTMLElement): ThemeData | null => {
  const editLink = listItem.querySelector<HTMLAnchorElement>(
    'a[href*="/themes/"][href*="/editor"]'
  );
  if (!editLink) {
    return null;
  }

  const href = editLink.getAttribute('href') ?? '';
  const themeId = /\/themes\/(\d+)\//.exec(href)?.[1] ?? '';
  const storeName = /\/store\/([^/]+)\//.exec(href)?.[1] ?? '';
  const themeName =
    listItem.querySelector('h3')?.textContent?.trim() ?? 'Unknown';

  const previewUrl = storeName
    ? `https://${storeName}.myshopify.com/?preview_theme_id=${themeId}`
    : '';

  const codeEditorUrl = storeName
    ? `https://admin.shopify.com/store/${storeName}/themes/${themeId}`
    : '';

  return { themeId, storeName, themeName, previewUrl, codeEditorUrl };
};

const html = (template: string): HTMLElement => {
  const container = document.createElement('div');
  container.innerHTML = template.trim();
  return container.firstElementChild as HTMLElement;
};

const createInfoRow = (
  label: string,
  value: string,
  minWidth = '0',
  trackingAction?: string
) => {
  const row = html(`
    <s-stack direction="inline" gap="small-200" alignItems="center">
      <span>${label}</span>
      <input type="text" readonly value="${value}" style="
        min-width:${minWidth};
        border:1px solid #c9cccf;
        border-radius:8px;
        padding:4px 8px;
        font-size:13px;
        font-family:ui-monospace,SFMono-Regular,monospace;
        color:#303030;
        background:#f6f6f7;
        line-height:20px;
      " />
      <s-button variant="tertiary" accessibilityLabel="Copy to clipboard" icon="clipboard" title="Copy to clipboard"></s-button>
    </s-stack>
  `);

  row
    .querySelector<HTMLElement>('[icon="clipboard"]')!
    .addEventListener('click', (e) => {
      e.stopPropagation();
      const btn = e.currentTarget as HTMLElement;
      navigator.clipboard.writeText(value);
      btn.setAttribute('icon', 'check');
      setTimeout(() => btn.setAttribute('icon', 'clipboard'), 1200);
      if (trackingAction) {
        trackThemeListAction(trackingAction);
      }
    });

  return row;
};

const createButtonRow = (data: ThemeData) => {
  const row = html(`
    <s-stack direction="inline" gap="small-200" justifyContent="end">
      <s-button variant="secondary" icon="external" href="${data.previewUrl}" target="_blank">Preview</s-button>
      <s-button variant="secondary" icon="code" href="${data.codeEditorUrl}" target="_top">Edit Code</s-button>
    </s-stack>
  `);

  row
    .querySelector<HTMLElement>('[icon="external"]')
    ?.addEventListener('click', () => {
      trackThemeListAction('theme_list_preview');
    });

  row
    .querySelector<HTMLElement>('[icon="code"]')
    ?.addEventListener('click', () => {
      trackThemeListAction('theme_list_edit_code');
    });

  return row;
};

const injectIntoThemeList = () => {
  const themeListItems = document.querySelectorAll<HTMLElement>(
    'ul[class*="ThemeList"] div[class*="ThemeListItem"]'
  );

  if (!themeListItems.length) {
    return false;
  }

  let injected = false;

  themeListItems.forEach((listItem) => {
    if (listItem.hasAttribute(INJECTED_ATTR)) {
      return;
    }

    const data = extractThemeData(listItem);
    if (!data) {
      return;
    }

    const contextProvider = listItem.querySelector(
      's-internal-context-provider'
    );
    if (contextProvider) {
      const wrapper = html(`
        <s-stack gap="small-200" block-align="end"></s-stack>
      `);
      contextProvider.replaceWith(wrapper);
      wrapper.appendChild(contextProvider);
      wrapper.appendChild(createButtonRow(data));
      wrapper.appendChild(
        createInfoRow('ID:', data.themeId, '0', 'theme_list_copy_id')
      );
      wrapper.appendChild(
        createInfoRow(
          'Preview URL:',
          data.previewUrl,
          '400px',
          'theme_list_copy_preview_url'
        )
      );
    }

    listItem.setAttribute(INJECTED_ATTR, 'true');
    listItem
      .querySelector<HTMLElement>(':scope > s-stack')
      ?.setAttribute('alignItems', 'end');
    injected = true;
  });

  return injected;
};

export const setupThemeList = async () => {
  if (!window.location.pathname.endsWith('/themes')) {
    return;
  }

  const settings = await getItem<AlfredSettings>('settings');
  if (settings?.admin?.themeListUtils === false) {
    return;
  }

  injectIntoThemeList();

  let queued = false;
  const observer = new MutationObserver(() => {
    if (queued) return;
    queued = true;
    requestAnimationFrame(() => {
      injectIntoThemeList();
      queued = false;
    });
  });

  observer.observe(document.body, {
    childList: true,
    subtree: true,
  });
};
