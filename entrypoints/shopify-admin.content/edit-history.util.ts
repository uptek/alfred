import { getItem } from '~/utils/storage';
import { formatTimeAgo } from '~/utils/helpers';
import { sendTrackEvent } from '~/utils/analytics';
import {
  getDisplaySubjectType,
  getEventDetail,
  getEventsUrl,
  getEventTimestampMs,
  getVerbBadgeClass,
  groupEditEvents,
  isEditHistoryPage,
  parseEventsResponse,
  eventsForDisplay,
  formatEventClockTime,
  formatEventDescription,
  formatTargetGroupDescription,
  formatVerbLabel,
  isShopifyAuthor,
  type DisplayEvent,
  type ShopifyEditEvent
} from './edit-history.logic';

export {
  extractMarketName,
  formatEventClockTime,
  formatVerbLabel,
  getEventDetail,
  getEventTimestampMs,
  getEventsUrl,
  getVerbBadgeClass,
  groupEditEvents,
  isEditHistoryPage,
  isMarketPublishEvent,
  isSalesChannelUnpublishEvent,
  isShopifyAuthor,
  parseEventsResponse,
  eventsForDisplay,
  formatEventDescription,
  formatMarketList,
  formatTargetGroupDescription,
  formatTargetList,
  formatPublishTargetList,
  type DisplayEvent,
  type ShopifyEditEvent
} from './edit-history.logic';

const ROOT_ATTR = 'data-alfred-edit-history';
const STYLE_ID = 'alfred-edit-history-styles-v2';

const formatTimestamp = (event: ShopifyEditEvent): string => formatTimeAgo(getEventTimestampMs(event) ?? Number.NaN);

const createTextEl = (tag: string, className: string, text: string): HTMLElement => {
  const element = document.createElement(tag);
  element.className = className;
  element.textContent = text;
  return element;
};

const itemClass = (author: string): string =>
  `alfred-edit-history__item${isShopifyAuthor(author) ? ' alfred-edit-history__item--shopify' : ''}`;

const appendAuthorMeta = (parent: HTMLElement, event: ShopifyEditEvent): void => {
  const time = formatEventClockTime(event);
  const label = time ? `${event.author} • ${time}` : event.author;
  parent.append(createTextEl('p', 'alfred-edit-history__meta', label));
};

const createEventListItem = (display: DisplayEvent): HTMLLIElement => {
  const li = document.createElement('li');

  if (display.kind === 'target-group') {
    const anchor = display.events[0]!;
    li.className = itemClass(display.author);

    const row = document.createElement('div');
    row.className = 'alfred-edit-history__row';
    row.append(
      createTextEl(
        'span',
        `alfred-edit-history__badge ${getVerbBadgeClass(display.groupVerb)}`,
        formatVerbLabel(display.groupVerb)
      ),
      createTextEl('span', 'alfred-edit-history__time', formatTimestamp(anchor))
    );
    li.append(row);

    li.append(
      createTextEl(
        'p',
        'alfred-edit-history__description',
        formatTargetGroupDescription(display.groupVerb, display.targetKind, display.targets)
      )
    );
    appendAuthorMeta(li, anchor);
    return li;
  }

  const { event } = display;
  li.className = itemClass(event.author);

  const row = document.createElement('div');
  row.className = 'alfred-edit-history__row';
  row.append(
    createTextEl('span', `alfred-edit-history__badge ${getVerbBadgeClass(event.verb)}`, formatVerbLabel(event.verb)),
    createTextEl('span', 'alfred-edit-history__time', formatTimestamp(event))
  );
  li.append(row);

  li.append(createTextEl('p', 'alfred-edit-history__description', formatEventDescription(event.description)));

  const detail = getEventDetail(event);
  if (detail) {
    li.append(createTextEl('p', 'alfred-edit-history__detail', detail));
  }

  appendAuthorMeta(li, event);
  return li;
};

const setBodyStatus = (container: HTMLElement, text: string): HTMLElement => {
  container.replaceChildren();
  const status = document.createElement('p');
  status.className = 'alfred-edit-history__status';
  status.textContent = text;
  container.append(status);
  return status;
};

const ensureStyles = (): void => {
  document.getElementById('alfred-edit-history-styles')?.remove();

  let style = document.getElementById(STYLE_ID) as HTMLStyleElement | null;
  if (!style) {
    style = document.createElement('style');
    style.id = STYLE_ID;
    document.head.appendChild(style);
  }

  style.textContent = `
    [${ROOT_ATTR}] {
      margin-bottom: 16px;
    }

    .alfred-edit-history__card {
      border: 1px solid var(--p-color-border, #e3e3e3);
      border-radius: 12px;
      background: var(--p-color-bg-surface, #fff);
      overflow: hidden;
    }

    .alfred-edit-history__summary {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 8px;
      padding: 12px 14px;
      cursor: pointer;
      list-style: none;
      font-size: 13px;
      font-weight: 600;
      color: var(--p-color-text, #303030);
    }

    .alfred-edit-history__summary::-webkit-details-marker {
      display: none;
    }

    .alfred-edit-history__summary::after {
      content: '';
      width: 8px;
      height: 8px;
      border-right: 2px solid var(--p-color-icon-secondary, #8a8a8a);
      border-bottom: 2px solid var(--p-color-icon-secondary, #8a8a8a);
      transform: rotate(45deg);
      transition: transform 0.15s ease;
      flex-shrink: 0;
    }

    .alfred-edit-history__card[open] .alfred-edit-history__summary::after {
      transform: rotate(-135deg);
      margin-top: 4px;
    }

    .alfred-edit-history__body {
      border-top: 1px solid var(--p-color-border, #e3e3e3);
      padding: 10px 14px 14px;
    }

    .alfred-edit-history__status {
      margin: 0;
      font-size: 12px;
      color: var(--p-color-text-secondary, #616161);
    }

    .alfred-edit-history__list {
      list-style: none;
      margin: 0;
      padding: 0;
      display: flex;
      flex-direction: column;
      gap: 12px;
    }

    .alfred-edit-history__item {
      padding-bottom: 12px;
      border-bottom: 1px solid var(--p-color-border-secondary, #ebebeb);
    }

    [${ROOT_ATTR}] .alfred-edit-history__item--shopify {
      margin: 0 -8px;
      padding: 10px 8px 12px;
      border-bottom: none;
      border-radius: 8px;
      background-color: #fff6ee;
      box-shadow: inset 3px 0 0 #ffd6a4;
    }

    .alfred-edit-history__item:last-child {
      padding-bottom: 0;
      border-bottom: none;
    }

    .alfred-edit-history__row {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 8px;
      margin-bottom: 4px;
    }

    .alfred-edit-history__badge {
      display: inline-flex;
      align-items: center;
      padding: 2px 8px;
      border-radius: 999px;
      font-size: 11px;
      font-weight: 600;
      line-height: 1.4;
      background: var(--p-color-bg-surface-secondary, #f3f3f3);
      color: var(--p-color-text, #303030);
    }

    .alfred-edit-history__badge--create {
      background: #e3f1df;
      color: #014b40;
    }

    .alfred-edit-history__badge--update {
      background: #eaf4ff;
      color: #003d7a;
    }

    .alfred-edit-history__badge--published {
      background: #f4f0ff;
      color: #4a0082;
    }

    .alfred-edit-history__badge--unpublished {
      background: #fff1e3;
      color: #7a4300;
    }

    .alfred-edit-history__badge--statuschanged {
      background: #eef3ff;
      color: #1f5199;
    }

    .alfred-edit-history__badge--destroy,
    .alfred-edit-history__badge--delete {
      background: #feecec;
      color: #8e0b21;
    }

    .alfred-edit-history__time {
      font-size: 11px;
      color: var(--p-color-text-secondary, #616161);
      white-space: nowrap;
    }

    .alfred-edit-history__description {
      margin: 0;
      font-size: 12px;
      line-height: 1.45;
      color: var(--p-color-text, #303030);
    }

    .alfred-edit-history__detail {
      margin: 4px 0 0;
      font-size: 11px;
      line-height: 1.4;
      color: var(--p-color-text-secondary, #616161);
    }

    .alfred-edit-history__meta {
      margin: 4px 0 0;
      font-size: 11px;
      color: var(--p-color-text-secondary, #616161);
    }
  `;
};

const findSidebarAnchor = (): HTMLElement | null => {
  const sections = document.querySelectorAll<HTMLElement>(
    '.Polaris-Layout__Section--oneThird, [class*="Layout__Section--oneThird"]'
  );

  for (const section of sections) {
    if (/Status|Publishing|Theme template|Product organization/i.test(section.textContent ?? '')) {
      return section;
    }
  }

  return sections[0] ?? null;
};

const createActivityRoot = (): { root: HTMLElement; body: HTMLElement; details: HTMLDetailsElement } | null => {
  const root = document.createElement('div');
  root.setAttribute(ROOT_ATTR, 'true');

  const details = document.createElement('details');
  details.className = 'alfred-edit-history__card';

  const summary = document.createElement('summary');
  summary.className = 'alfred-edit-history__summary';
  summary.textContent = 'Activity';

  const body = document.createElement('div');
  body.className = 'alfred-edit-history__body';

  const status = document.createElement('p');
  status.className = 'alfred-edit-history__status';
  status.textContent = 'Expand to load activity.';

  body.append(status);
  details.append(summary, body);
  root.append(details);

  return { root, body, details };
};

const loadEvents = async (container: HTMLElement): Promise<void> => {
  ensureStyles();
  const status = setBodyStatus(container, 'Loading activity…');

  try {
    const response = await fetch(getEventsUrl(window.location.pathname, window.location.origin), {
      credentials: 'include'
    });

    if (!response.ok) {
      status.textContent = response.status === 404 ? 'No activity found.' : 'Could not load activity.';
      return;
    }

    const events = groupEditEvents(eventsForDisplay(parseEventsResponse(await response.json())));

    if (!events.length) {
      status.textContent = 'No activity recorded yet.';
      return;
    }

    const list = document.createElement('ul');
    list.className = 'alfred-edit-history__list';
    for (const display of events) {
      list.append(createEventListItem(display));
    }
    status.replaceWith(list);

    sendTrackEvent('edit_history_view', {
      subject_type: getDisplaySubjectType(events),
      event_count: events.length
    });
  } catch (error) {
    console.error('[alfred] activity log failed', error);
    status.textContent = 'Could not load activity.';
  }
};

const injectEditHistory = (): boolean => {
  if (!isEditHistoryPage(window.location.pathname)) {
    document.querySelector(`[${ROOT_ATTR}]`)?.remove();
    return false;
  }

  const sidebar = findSidebarAnchor();
  if (!sidebar) {
    return false;
  }

  const existing = document.querySelector(`[${ROOT_ATTR}]`) as HTMLElement | null;
  if (existing) {
    const alreadyFirst = existing.parentElement === sidebar && sidebar.firstElementChild === existing;
    if (!alreadyFirst) {
      sidebar.prepend(existing);
    }
    return true;
  }

  ensureStyles();

  const created = createActivityRoot();
  if (!created) {
    return false;
  }

  const { root, body, details } = created;

  details.addEventListener('toggle', () => {
    if (!details.open) {
      return;
    }

    sendTrackEvent('edit_history_expand');
    loadEvents(body);
  });

  try {
    sidebar.prepend(root);
  } catch {
    return false;
  }

  return true;
};

/** Inject activity log card on product/page admin pages. */
export const setupEditHistory = async (): Promise<void> => {
  const settings = await getItem<AlfredSettings>('settings');
  if (settings?.admin?.editHistory === false) {
    return;
  }

  let currentPath = window.location.pathname;
  injectEditHistory();

  let debounceTimer: ReturnType<typeof setTimeout>;
  const observer = new MutationObserver(() => {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      if (window.location.pathname !== currentPath) {
        document.querySelector(`[${ROOT_ATTR}]`)?.remove();
        currentPath = window.location.pathname;
      }

      injectEditHistory();
    }, 250);
  });

  observer.observe(document.documentElement, { childList: true, subtree: true });
};
