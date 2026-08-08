import { CWS_REVIEW_URL } from '~/utils/constants';
import { isEnabled, type ResolvedSettings } from '~/utils/settings';
import { sendTrackEvent } from '~/utils/analytics';
import {
  composeEventSentence,
  formatEventDescription,
  formatEventTime,
  formatTargetGroupDescription,
  getActorLabel,
  getEventActor,
  getEventDetail,
  getEventsUrls,
  getVerbDotClass,
  groupDisplayEventsByDay,
  groupTimelineEvents,
  isTimelinePage,
  parseEventsResponse,
  eventsForDisplay,
  sentenceNamesAuthor,
  type DisplayEvent
} from './timeline.logic';

const ROOT_ATTR = 'data-alfred-timeline';
const STYLE_ID = 'alfred-timeline-styles';
const SPA_NAV_DEBOUNCE_MS = 250;
const LAZY_LOAD_ROOT_MARGIN = '200px';

let rootEl: HTMLElement | null = null;
let bodyEl: HTMLElement | null = null;
let lazyObserver: IntersectionObserver | null = null;
let loadedForPath: string | null = null;

const createTextEl = (tag: string, className: string, text: string): HTMLElement => {
  const element = document.createElement(tag);
  element.className = className;
  element.textContent = text;
  return element;
};

const createTimelineItem = (display: DisplayEvent): HTMLLIElement => {
  const li = document.createElement('li');
  li.className = 'alfred-timeline__item';

  const anchor = display.kind === 'single' ? display.event : display.events[0]!;
  const verb = display.kind === 'single' ? display.event.verb : display.groupVerb;
  const author = display.kind === 'single' ? display.event.author : display.author;
  const sentence = composeEventSentence(
    author,
    display.kind === 'single'
      ? formatEventDescription(display.event.description)
      : formatTargetGroupDescription(display.groupVerb, display.targetKind, display.targets)
  );

  const actor = getEventActor(anchor);

  li.append(createTextEl('span', `alfred-timeline__dot ${getVerbDotClass(verb)}`, ''));

  const content = document.createElement('div');
  content.className = 'alfred-timeline__content';

  const row = document.createElement('div');
  row.className = 'alfred-timeline__row';

  const lead = document.createElement('div');
  lead.className = 'alfred-timeline__lead';
  lead.append(createTextEl('p', 'alfred-timeline__text', sentence));

  const actorLabel = getActorLabel(actor);
  if (actorLabel) {
    lead.append(createTextEl('span', `alfred-timeline__actor alfred-timeline__actor--${actor}`, actorLabel));
  }

  row.append(lead, createTextEl('span', 'alfred-timeline__time', formatEventTime(anchor)));
  content.append(row);

  if (display.kind === 'single') {
    const detail = getEventDetail(display.event);
    if (detail) {
      content.append(createTextEl('p', 'alfred-timeline__detail', detail));
    }
  }

  if (!sentenceNamesAuthor(sentence, author)) {
    content.append(createTextEl('p', 'alfred-timeline__meta', author));
  }

  li.append(content);
  return li;
};

const renderTimeline = (container: HTMLElement, displays: DisplayEvent[]): void => {
  const list = document.createElement('ul');
  list.className = 'alfred-timeline__list';

  for (const day of groupDisplayEventsByDay(displays)) {
    if (day.label) {
      list.append(createTextEl('li', 'alfred-timeline__date', day.label));
    }
    for (const display of day.items) {
      list.append(createTimelineItem(display));
    }
  }

  container.replaceChildren(list);
};

const renderStatus = (container: HTMLElement, text: string): void => {
  container.replaceChildren(createTextEl('p', 'alfred-timeline__status', text));
};

const renderSkeleton = (container: HTMLElement): void => {
  container.replaceChildren();
  for (let index = 0; index < 3; index += 1) {
    const row = document.createElement('div');
    row.className = 'alfred-timeline__skeleton-row';
    const bar = document.createElement('span');
    bar.className = 'alfred-timeline__skeleton-bar';
    bar.style.width = `${72 - index * 14}%`;
    row.append(createTextEl('span', 'alfred-timeline__skeleton-dot', ''), bar);
    container.append(row);
  }
};

const ensureStyles = (): void => {
  if (document.getElementById(STYLE_ID)) {
    return;
  }

  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = `
    [${ROOT_ATTR}] {
      margin: 16px 0 24px;
    }

    .alfred-timeline__header {
      display: flex;
      align-items: baseline;
      justify-content: space-between;
      gap: 12px;
      margin: 0 0 12px;
    }

    .alfred-timeline__heading {
      margin: 0;
      font-size: 14px;
      font-weight: 650;
      line-height: 1.4;
      color: var(--p-color-text, #303030);
    }

    .alfred-timeline__credit {
      font-size: 11px;
      line-height: 1.4;
      color: var(--p-color-text-secondary, #616161);
      opacity: 0.8;
      white-space: nowrap;
    }

    .alfred-timeline__credit-link {
      color: var(--p-color-text, #303030);
      text-decoration: underline;
      text-underline-offset: 2px;
      transition: text-underline-offset 120ms ease, color 120ms ease;
    }

    .alfred-timeline__credit-link:hover {
      color: var(--p-color-text-emphasis, #005bd3);
      text-underline-offset: 3px;
    }

    .alfred-timeline__status {
      margin: 0;
      padding-left: 24px;
      font-size: 13px;
      color: var(--p-color-text-secondary, #616161);
    }

    .alfred-timeline__list {
      position: relative;
      list-style: none;
      margin: 0;
      padding: 0;
    }

    .alfred-timeline__list::before {
      content: '';
      position: absolute;
      left: 5px;
      top: 8px;
      bottom: 8px;
      width: 2px;
      border-radius: 1px;
      background: var(--p-color-border-secondary, #e3e3e3);
    }

    .alfred-timeline__date {
      position: relative;
      margin: 16px 0 8px;
      padding-left: 24px;
      font-size: 12px;
      color: var(--p-color-text-secondary, #616161);
    }

    .alfred-timeline__date:first-child {
      margin-top: 0;
    }

    .alfred-timeline__item {
      position: relative;
      display: flex;
      align-items: flex-start;
      gap: 12px;
      padding: 6px 0;
    }

    .alfred-timeline__dot {
      position: relative;
      z-index: 1;
      flex-shrink: 0;
      width: 12px;
      height: 12px;
      margin-top: 4px;
      border-radius: 4px;
      background: var(--p-color-icon, #4a4a4a);
      box-shadow: 0 0 0 3px var(--p-color-bg, #f1f1f1);
    }

    .alfred-timeline__dot--create {
      background: var(--p-color-icon-success, #29845a);
    }

    .alfred-timeline__dot--destroy,
    .alfred-timeline__dot--delete {
      background: var(--p-color-icon-critical, #e51c00);
    }

    .alfred-timeline__dot--unpublished {
      background: var(--p-color-icon-caution, #b28400);
    }

    .alfred-timeline__content {
      flex: 1;
      min-width: 0;
    }

    .alfred-timeline__row {
      display: flex;
      align-items: baseline;
      justify-content: space-between;
      gap: 16px;
    }

    .alfred-timeline__lead {
      display: flex;
      align-items: baseline;
      flex-wrap: wrap;
      gap: 6px;
      min-width: 0;
    }

    .alfred-timeline__text {
      margin: 0;
      font-size: 13px;
      line-height: 1.5;
      color: var(--p-color-text, #303030);
      overflow-wrap: anywhere;
    }

    .alfred-timeline__actor {
      flex-shrink: 0;
      align-self: center;
      padding: 1px 6px;
      border-radius: 6px;
      font-size: 11px;
      font-weight: 550;
      line-height: 1.5;
      background: var(--p-color-bg-surface-secondary, #f1f1f1);
      color: var(--p-color-text-secondary, #616161);
    }

    .alfred-timeline__actor--app {
      background: var(--p-color-bg-surface-info, #ebf4ff);
      color: var(--p-color-text-info, #00527c);
    }

    .alfred-timeline__time {
      font-size: 12px;
      color: var(--p-color-text-secondary, #616161);
      white-space: nowrap;
    }

    .alfred-timeline__detail,
    .alfred-timeline__meta {
      margin: 2px 0 0;
      font-size: 12px;
      line-height: 1.4;
      color: var(--p-color-text-secondary, #616161);
    }

    .alfred-timeline__skeleton-row {
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 8px 0;
    }

    .alfred-timeline__skeleton-dot {
      flex-shrink: 0;
      width: 12px;
      height: 12px;
      border-radius: 4px;
      background: var(--p-color-bg-fill-tertiary, #e3e3e3);
    }

    .alfred-timeline__skeleton-bar {
      height: 10px;
      border-radius: 5px;
      background: var(--p-color-bg-fill-tertiary, #e3e3e3);
      animation: alfred-timeline-pulse 1.4s ease-in-out infinite;
    }

    @keyframes alfred-timeline-pulse {
      0%, 100% { opacity: 1; }
      50% { opacity: 0.45; }
    }

    @media (prefers-reduced-motion: reduce) {
      .alfred-timeline__skeleton-bar {
        animation: none;
      }
    }
  `;
  document.head.appendChild(style);
};

const loadEvents = async (container: HTMLElement): Promise<void> => {
  const pathname = window.location.pathname;
  if (loadedForPath === pathname) {
    return;
  }
  loadedForPath = pathname;

  renderSkeleton(container);

  try {
    // Collections need a fallback (custom_collections then smart_collections);
    // every other resource has a single candidate URL.
    let response: Response | null = null;
    for (const url of getEventsUrls(pathname, window.location.origin)) {
      response = await fetch(url, { credentials: 'include' });
      if (response.ok || response.status !== 404) {
        break;
      }
    }

    // A navigation happened while the request was in flight — the root for
    // this page is gone and a fresh one owns the next load.
    if (!container.isConnected) {
      return;
    }

    if (!response || !response.ok) {
      renderStatus(container, response?.status === 404 ? 'No activity found.' : "Couldn't load activity.");
      return;
    }

    const events = eventsForDisplay(parseEventsResponse(await response.json()));

    if (!container.isConnected) {
      return;
    }

    if (!events.length) {
      renderStatus(container, 'No activity yet.');
      return;
    }

    renderTimeline(container, groupTimelineEvents(events));

    sendTrackEvent('timeline_view', {
      subject_type: events[0]?.subject_type,
      event_count: events.length
    });
  } catch (error) {
    console.error('[alfred] activity log failed', error);
    if (container.isConnected) {
      renderStatus(container, "Couldn't load activity.");
    }
    if (loadedForPath === pathname) {
      loadedForPath = null;
    }
  }
};

const findMainColumnAnchor = (): HTMLElement | null => {
  const sections = document.querySelectorAll<HTMLElement>('.Polaris-Layout__Section, [class*="Layout__Section"]');

  for (const section of sections) {
    if (!/oneThird|oneHalf|fullWidth/i.test(section.className)) {
      return section;
    }
  }

  // Screens on the Polaris web-components layout (e.g. blog posts) have no
  // Layout__Section; the main column is the slot-less s-internal-page child
  // holding the content sections (slot="aside" is the sidebar).
  const columns = document.querySelectorAll<HTMLElement>('s-internal-page > div:not([slot])');
  for (const column of columns) {
    if (column.querySelector('s-internal-section')) {
      return column;
    }
  }

  return null;
};

const removeTimeline = (): void => {
  lazyObserver?.disconnect();
  lazyObserver = null;
  rootEl?.remove();
  rootEl = null;
  bodyEl = null;
};

const injectTimeline = (): void => {
  if (!isTimelinePage(window.location.pathname)) {
    removeTimeline();
    return;
  }

  if (rootEl?.isConnected) {
    return;
  }

  const anchor = findMainColumnAnchor();
  if (!anchor) {
    return;
  }

  // The SPA may have torn down a previous root mid-page; rebuilding means the
  // next visibility hit reloads events for this path.
  removeTimeline();
  loadedForPath = null;
  ensureStyles();

  const root = document.createElement('div');
  root.setAttribute(ROOT_ATTR, 'true');

  const body = document.createElement('div');
  body.className = 'alfred-timeline__body';

  const creditLink = document.createElement('a');
  creditLink.className = 'alfred-timeline__credit-link';
  creditLink.href = CWS_REVIEW_URL;
  creditLink.target = '_blank';
  creditLink.rel = 'noopener';
  creditLink.textContent = 'Alfred';
  creditLink.addEventListener('click', () => {
    sendTrackEvent('credit_click', { source: 'timeline' });
  });

  const credit = createTextEl('span', 'alfred-timeline__credit', 'Powered by ');
  credit.append(creditLink);

  const header = document.createElement('div');
  header.className = 'alfred-timeline__header';
  header.append(createTextEl('h2', 'alfred-timeline__heading', 'Timeline'), credit);

  root.append(header, body);
  anchor.append(root);

  rootEl = root;
  bodyEl = body;

  lazyObserver = new IntersectionObserver(
    (entries) => {
      if (entries.some((entry) => entry.isIntersecting) && bodyEl) {
        lazyObserver?.disconnect();
        lazyObserver = null;
        loadEvents(bodyEl);
      }
    },
    { rootMargin: LAZY_LOAD_ROOT_MARGIN }
  );
  lazyObserver.observe(root);
};

/** Inject the activity timeline on product, page, and collection admin screens. */
export const setupTimeline = (settings: ResolvedSettings): void => {
  if (!isEnabled(settings.admin.timeline)) {
    return;
  }

  let currentPath = window.location.pathname;
  injectTimeline();

  let debounceTimer: ReturnType<typeof setTimeout> | undefined;
  const observer = new MutationObserver(() => {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      if (window.location.pathname !== currentPath) {
        currentPath = window.location.pathname;
        removeTimeline();
        loadedForPath = null;
      }

      injectTimeline();
    }, SPA_NAV_DEBOUNCE_MS);
  });

  observer.observe(document.documentElement, { childList: true, subtree: true });
};
