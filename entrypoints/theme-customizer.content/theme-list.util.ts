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

const createCopyButton = (text: string) => {
  const btn = el('s-button', { variant: 'tertiary', icon: 'clipboard' });

  btn.addEventListener('click', (e) => {
    e.stopPropagation();
    navigator.clipboard.writeText(text);

    btn.setAttribute('icon', 'check');
    btn.setAttribute('tone', 'success');

    setTimeout(() => {
      btn.setAttribute('icon', 'clipboard');
      btn.removeAttribute('tone');
    }, 1500);
  });

  return btn;
};

const createInfoRow = (label: string, value: string) => {
  const labelEl = el('s-text', { variant: 'bodySm', tone: 'subdued' }, [
    label,
  ]);
  Object.assign(labelEl.style, { width: '56px', flexShrink: '0' });

  const valueEl = el('code', {}, [value]);
  Object.assign(valueEl.style, {
    fontSize: '12px',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
    flex: '1',
    minWidth: '0',
  });

  const row = el(
    's-stack',
    { direction: 'inline', gap: 'small-200', 'block-align': 'center' },
    [labelEl, valueEl, createCopyButton(value)]
  );
  Object.assign(row.style, { flexWrap: 'nowrap' });

  return row;
};

const createPanel = (data: ThemeData) => {
  // Badge
  const badge = el('s-badge', { tone: 'info' }, ['Alfred']);

  // Info rows
  const infoRows = el('s-stack', { gap: 'small' }, [
    createInfoRow('ID', data.themeId),
    createInfoRow('Preview', data.previewUrl),
  ]);

  // Divider
  const divider = el('s-divider');

  // Action buttons
  const previewBtn = el(
    's-button',
    { variant: 'secondary', icon: 'external' },
    ['Open Preview']
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

  const actions = el('s-stack', { direction: 'inline', gap: 'base' }, [
    previewBtn,
    codeBtn,
  ]);

  // Panel container
  const panel = el(
    's-box',
    {
      padding: 'base',
      background: 'subdued',
    },
    [
      el('s-stack', { gap: 'small-200' }, [
        badge,
        infoRows,
        divider,
        actions,
      ]),
    ]
  );

  panel.classList.add('alfred-theme-panel');

  return panel;
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

    const panel = createPanel(data);

    const parentBlock = listItem.closest('div[class*="BlockStack"]');
    if (parentBlock) {
      parentBlock.appendChild(panel);
    } else {
      listItem.appendChild(panel);
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
