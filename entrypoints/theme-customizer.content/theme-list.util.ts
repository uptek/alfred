const INJECTED_ATTR = 'data-alfred-theme-list';

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
  if (!editLink) return null;

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

const el = (
  tag: string,
  attrs: Record<string, string> = {},
  children: (HTMLElement | string)[] = []
): HTMLElement => {
  const element = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs)) {
    element.setAttribute(key, value);
  }
  for (const child of children) {
    if (typeof child === 'string') {
      element.appendChild(document.createTextNode(child));
    } else {
      element.appendChild(child);
    }
  }
  return element;
};

const createCopyField = (label: string, value: string) => {
  const copyBtn = el('s-button', { variant: 'tertiary', icon: 'clipboard' });
  copyBtn.title = 'Copy to clipboard';
  copyBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    navigator.clipboard.writeText(value);
    copyBtn.setAttribute('icon', 'check');
    setTimeout(() => {
      copyBtn.setAttribute('icon', 'clipboard');
    }, 1200);
  });

  const labelEl = el('s-text', { variant: 'bodySm', tone: 'subdued' }, [
    label,
  ]);
  Object.assign(labelEl.style, { flexShrink: '0' });

  const input = document.createElement('input');
  input.type = 'text';
  input.readOnly = true;
  input.value = value;
  Object.assign(input.style, {
    flex: '1',
    minWidth: '0',
    border: 'var(--p-border-width-025, 1px) solid var(--p-color-border, #8c9196)',
    borderRadius: 'var(--p-border-radius-150, 6px)',
    padding: 'var(--p-space-050, 2px) var(--p-space-200, 8px)',
    fontSize: 'var(--p-font-size-275, 12px)',
    fontFamily: 'ui-monospace, SFMono-Regular, monospace',
    color: 'var(--p-color-text, #303030)',
    background: 'var(--p-color-bg-surface-secondary, #f1f1f1)',
    outline: 'none',
    lineHeight: 'var(--p-font-line-height-400, 20px)',
  });

  return el(
    's-stack',
    { direction: 'inline', gap: 'small-200', 'block-align': 'center', wrap: 'nowrap' },
    [labelEl, input, copyBtn]
  );
};

const createButtonRow = (data: ThemeData) => {
  const previewBtn = el(
    's-button',
    { variant: 'secondary', icon: 'external' },
    ['Preview']
  );
  previewBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    window.open(data.previewUrl, '_blank');
  });

  const codeBtn = el('s-button', { variant: 'secondary', icon: 'code' }, [
    'Edit Code',
  ]);
  codeBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    window.open(data.codeEditorUrl, '_top');
  });

  return el(
    's-stack',
    { direction: 'inline', gap: 'base', 'block-align': 'center' },
    [previewBtn, codeBtn]
  );
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
    if (listItem.hasAttribute(INJECTED_ATTR)) return;

    const data = extractThemeData(listItem);
    if (!data) return;

    const contextProvider = listItem.querySelector(
      's-internal-context-provider'
    );
    if (contextProvider) {
      const wrapper = el('s-stack', {
        gap: 'small-200',
        'block-align': 'end',
      });
      contextProvider.replaceWith(wrapper);
      wrapper.appendChild(contextProvider);
      wrapper.appendChild(createButtonRow(data));
      wrapper.appendChild(createCopyField('ID', data.themeId));
      wrapper.appendChild(createCopyField('Preview', data.previewUrl));
    }

    listItem.setAttribute(INJECTED_ATTR, 'true');
    injected = true;
  });

  return injected;
};

export const setupThemeList = () => {
  if (!window.location.pathname.includes('/themes')) return;

  const success = injectIntoThemeList();
  if (success) return;

  const observer = new MutationObserver(() => {
    if (injectIntoThemeList()) {
      observer.disconnect();
    }
  });

  observer.observe(document.body, {
    childList: true,
    subtree: true,
  });

  setTimeout(() => {
    injectIntoThemeList();
    observer.disconnect();
  }, 5000);
};
