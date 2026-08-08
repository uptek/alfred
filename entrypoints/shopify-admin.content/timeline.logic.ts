export interface TimelineEvent {
  id: number;
  subject_id: number;
  created_at: string;
  subject_type: string;
  verb: string;
  arguments: unknown[];
  body: string | null;
  message: string;
  author: string;
  description: string;
  path: string;
}

export type DisplayEvent =
  | { kind: 'single'; event: TimelineEvent }
  | {
      kind: 'target-group';
      events: TimelineEvent[];
      targets: string[];
      groupVerb: 'published' | 'unpublished';
      targetKind: 'market' | 'sales-channel';
      created_at: string;
      author: string;
    };

export interface DayGroup {
  label: string;
  items: DisplayEvent[];
}

// Shopify localizes description/message per admin language. These regexes and
// the rewrites in formatEventDescription are an English-only enhancement: when
// they don't match, events render as ungrouped rows with the raw description.
const MARKET_PUBLISH_RE = /included on ([^:]+):/i;
const SALES_CHANNEL_PUBLISH_RE = /included (?:a|the) (?:product|page|collection) on ([^:]+):/i;
const SALES_CHANNEL_UNPUBLISH_RE = /excluded (?:a|the) (?:product|page|collection) from ([^:]+)(?::|\.)/i;

/** Whether the current admin path supports /events.json. */
export const isTimelinePage = (pathname: string): boolean =>
  /^\/store\/[^/]+\/(products|pages|collections)\/\d+\/?$/.test(pathname) ||
  /^\/store\/[^/]+\/content\/(articles|blogs)\/\d+\/?$/.test(pathname) ||
  /^\/admin\/(products|pages|collections)\/\d+\/?$/.test(pathname) ||
  /^\/admin\/blogs\/\d+(\/articles\/\d+)?\/?$/.test(pathname);

const COLLECTION_PATH_RE = /^(\/store\/[^/]+|\/admin)\/collections\/(\d+)$/;

/**
 * Candidate events.json URLs for the current admin resource page, tried in
 * order until one responds. Most resources map 1:1 from their admin path, but:
 * - /collections/{id}/events.json 404s; the working endpoints are
 *   custom_collections/{id} and smart_collections/{id}, and the admin URL
 *   doesn't say which kind the collection is — so both are candidates.
 * - Blog posts and blogs live under /content/ in the admin but their events
 *   endpoints are /articles/{id} and /blogs/{id}.
 */
export const getEventsUrls = (pathname: string, origin: string): string[] => {
  const cleanPath = pathname.replace(/\/$/, '');

  const collectionMatch = COLLECTION_PATH_RE.exec(cleanPath);
  if (collectionMatch) {
    return ['custom_collections', 'smart_collections'].map(
      (resource) => `${origin}${collectionMatch[1]}/${resource}/${collectionMatch[2]}/events.json?limit=250`
    );
  }

  const restPath = cleanPath.replace(/\/content\/(articles|blogs)\//, '/$1/');
  return [`${origin}${restPath}/events.json?limit=250`];
};

const eventText = (event: TimelineEvent): string => event.description || event.message;

export const isMarketPublishEvent = (event: TimelineEvent): boolean =>
  event.verb === 'published' && MARKET_PUBLISH_RE.test(eventText(event));

export const extractMarketName = (event: TimelineEvent): string | null =>
  MARKET_PUBLISH_RE.exec(eventText(event))?.[1]?.trim() ?? null;

export const isSalesChannelPublishEvent = (event: TimelineEvent): boolean =>
  event.verb === 'published' && !isMarketPublishEvent(event) && SALES_CHANNEL_PUBLISH_RE.test(eventText(event));

export const extractSalesChannelName = (event: TimelineEvent): string | null =>
  SALES_CHANNEL_PUBLISH_RE.exec(eventText(event))?.[1]?.trim() ?? null;

export const isSalesChannelUnpublishEvent = (event: TimelineEvent): boolean =>
  event.verb === 'unpublished' && SALES_CHANNEL_UNPUBLISH_RE.test(eventText(event));

export const extractSalesChannelUnpublishTarget = (event: TimelineEvent): string | null =>
  SALES_CHANNEL_UNPUBLISH_RE.exec(eventText(event))?.[1]?.trim() ?? null;

type TargetGrouper = {
  groupVerb: 'published' | 'unpublished';
  targetKind: 'market' | 'sales-channel';
  test: (event: TimelineEvent) => boolean;
  extract: (event: TimelineEvent) => string | null;
};

const TARGET_GROUPERS: TargetGrouper[] = [
  { groupVerb: 'published', targetKind: 'market', test: isMarketPublishEvent, extract: extractMarketName },
  {
    groupVerb: 'published',
    targetKind: 'sales-channel',
    test: isSalesChannelPublishEvent,
    extract: extractSalesChannelName
  },
  {
    groupVerb: 'unpublished',
    targetKind: 'sales-channel',
    test: isSalesChannelUnpublishEvent,
    extract: extractSalesChannelUnpublishTarget
  }
];

const getTargetGrouper = (event: TimelineEvent): TargetGrouper | null =>
  TARGET_GROUPERS.find((grouper) => grouper.test(event)) ?? null;

/**
 * Milliseconds since epoch from a normalized event, or null when missing.
 * Shape aliases (createdAt, attributes.*) are flattened by normalizeEvent
 * before any caller reaches this.
 */
export const getEventTimestampMs = (event: TimelineEvent): number | null => {
  if (!event.created_at.trim()) {
    return null;
  }
  const ms = Date.parse(event.created_at);
  return Number.isFinite(ms) ? ms : null;
};

const sameEventTimestamp = (a: TimelineEvent, b: TimelineEvent): boolean => {
  const aMs = getEventTimestampMs(a);
  const bMs = getEventTimestampMs(b);
  return aMs !== null && bMs !== null && aMs === bMs;
};

/** Comma-separated targets for a grouped publish/unpublish card. */
export const formatTargetList = (targets: string[], targetKind: 'market' | 'sales-channel'): string =>
  targetKind === 'market' ? formatMarketList(targets) : targets.join(', ');

/** Description line for a grouped publish/unpublish row. */
export const formatTargetGroupDescription = (
  groupVerb: 'published' | 'unpublished',
  targetKind: 'market' | 'sales-channel',
  targets: string[]
): string => {
  const list = formatTargetList(targets, targetKind);
  const salesChannelSuffix = targetKind === 'sales-channel' ? ' sales channels' : '';

  if (groupVerb === 'published') {
    return `Published to ${list}${salesChannelSuffix}`;
  }

  return `Unpublished from ${list}${salesChannelSuffix}`;
};

const MARKET_FOR_SUFFIX_RE = /^(.+ for )(.+)$/;

/** Compact market names when many share the same prefix (e.g. Managed Markets catalog for XX). */
export const formatMarketList = (markets: string[]): string => {
  if (!markets.length) {
    return '';
  }

  const prefixCounts = new Map<string, number>();
  for (const market of markets) {
    const match = MARKET_FOR_SUFFIX_RE.exec(market);
    if (match) {
      prefixCounts.set(match[1]!, (prefixCounts.get(match[1]!) ?? 0) + 1);
    }
  }

  const emittedGroups = new Set<string>();
  const parts: string[] = [];

  for (const market of markets) {
    const match = MARKET_FOR_SUFFIX_RE.exec(market);
    if (!match) {
      parts.push(market);
      continue;
    }

    const prefix = match[1]!;
    const count = prefixCounts.get(prefix) ?? 0;

    if (count < 2) {
      parts.push(market);
      continue;
    }

    if (emittedGroups.has(prefix)) {
      continue;
    }

    emittedGroups.add(prefix);
    const suffixes = markets.flatMap((name) => {
      const suffixMatch = MARKET_FOR_SUFFIX_RE.exec(name);
      return suffixMatch?.[1] === prefix ? [suffixMatch[2]!] : [];
    });
    const groupLabel = prefix.replace(/ for $/, '');
    parts.push(`${groupLabel} (${suffixes.join(', ')})`);
  }

  return parts.join(', ');
};

/** Extra detail for update events — changed field names from arguments. */
export const getEventDetail = (event: TimelineEvent): string | null => {
  if (event.verb !== 'update' || !event.arguments?.length) {
    return null;
  }

  const fields = event.arguments.filter(
    (arg, index) => index > 0 && typeof arg === 'string' && arg !== 'api_client_id' && !/^\d+$/.test(arg)
  );

  return fields.length ? fields.join(', ') : null;
};

/** CSS modifier class for a timeline dot. Non-alphanumerics are stripped for valid class names. */
export const getVerbDotClass = (verb: string): string => `alfred-timeline__dot--${verb.replace(/[^a-z0-9-]/gi, '')}`;

const TRAILING_RESOURCE_SUFFIX = /:\s[^:]+\.?$/;

/** Clean Shopify event descriptions for the activity timeline. */
export const formatEventDescription = (description: string): string => {
  let text = description.trim().replace(TRAILING_RESOURCE_SUFFIX, '').replace(/\.$/, '');

  text = text
    .replace(/\bcreated a new (product|page|collection)\b/gi, 'created the $1')
    .replace(/\bchanged (product|page|collection) status\b/gi, 'changed the $1 status')
    .replace(/\b(Product|Page|Collection) was included on\b/g, 'Included the $1 on')
    .replace(/\ba (product|page|collection)\b/gi, 'the $1')
    .replace(/\bupdated (product|page|collection)\b/gi, 'updated the $1')
    .replace(/\bIncluded the Product\b/g, 'Included the product')
    .replace(/\bIncluded the Page\b/g, 'Included the page')
    .replace(/\bIncluded the Collection\b/g, 'Included the collection');

  if (
    /included the (?:product|page|collection) on\b/i.test(text) &&
    !/sales channel$/i.test(text) &&
    !/^Included the (?:product|page|collection) on\b/.test(text)
  ) {
    text = `${text} sales channel`;
  }

  if (/^Included the (?:product|page|collection) on\b/.test(text) && !/market$/i.test(text)) {
    text = `${text} market`;
  }

  if (/excluded the (?:product|page|collection) from\b/i.test(text) && !/sales channel$/i.test(text)) {
    text = `${text} sales channel`;
  }

  return text;
};

// Sentences that safely accept an author prefix ("Liz Ayers " + "published to ...").
const ENGLISH_SENTENCE_START_RE =
  /^(Created|Updated|Published|Unpublished|Included|Excluded|Changed|Deleted|Added|Removed|Duplicated|Archived|Unarchived|Scheduled|Set)\b/;

/**
 * Timeline sentence in the native Shopify style ("Jenny Hopper created the product").
 * Prepends the author only when the description doesn't already name them and
 * starts with a recognized English verb; otherwise the description is returned
 * untouched so non-English admin locales never get mangled text.
 */
export const composeEventSentence = (author: string, description: string): string => {
  const text = description.trim();
  const name = author.trim();

  if (!text) {
    return name;
  }

  if (!name || text.toLowerCase().startsWith(name.toLowerCase())) {
    return text;
  }

  if (ENGLISH_SENTENCE_START_RE.test(text)) {
    return `${name} ${text.charAt(0).toLowerCase()}${text.slice(1)}`;
  }

  return text;
};

/** Whether the sentence already names the author (controls the secondary author line). */
export const sentenceNamesAuthor = (sentence: string, author: string): boolean => {
  const name = author.trim();
  return name !== '' && sentence.toLowerCase().includes(name.toLowerCase());
};

export type EventActor = 'app' | 'staff' | 'system';

// App-driven events carry the acting app's api_client_id in their arguments;
// system events are authored by Shopify; everything else is a staff member.
const hasApiClientId = (args: unknown[]): boolean => args.some((arg) => arg === 'api_client_id');

/** Who caused the event: an installed app, a staff member, or Shopify itself. */
export const getEventActor = (event: TimelineEvent): EventActor => {
  if (hasApiClientId(event.arguments)) {
    return 'app';
  }
  if (event.author.trim().toLowerCase() === 'shopify') {
    return 'system';
  }
  return 'staff';
};

/** Short chip label for an actor, or null for staff (the unmarked default). */
export const getActorLabel = (actor: EventActor): string | null =>
  actor === 'app' ? 'App' : actor === 'system' ? 'System' : null;

/** Local clock time like "5:43 pm" for an event timestamp. */
export const formatEventTime = (event: TimelineEvent): string => {
  const timestampMs = getEventTimestampMs(event);
  if (timestampMs === null) {
    return '';
  }

  return new Date(timestampMs).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' }).toLowerCase();
};

/** Date group label: Today, Yesterday, "19 February", or "19 February 2025". */
export const formatEventDateLabel = (timestampMs: number, now: Date = new Date()): string => {
  const date = new Date(timestampMs);
  const startOfDay = (value: Date): number =>
    new Date(value.getFullYear(), value.getMonth(), value.getDate()).getTime();
  const dayDiff = Math.round((startOfDay(now) - startOfDay(date)) / 86_400_000);

  if (dayDiff === 0) {
    return 'Today';
  }

  if (dayDiff === 1) {
    return 'Yesterday';
  }

  const options: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'long' };
  if (date.getFullYear() !== now.getFullYear()) {
    options.year = 'numeric';
  }

  return date.toLocaleDateString(undefined, options);
};

/** Show newest events first while preserving Shopify's tie order. */
export const eventsForDisplay = (events: TimelineEvent[]): TimelineEvent[] => {
  if (events.length < 2) {
    return [...events];
  }

  const copy = [...events];
  const first = copy[0]!;
  const last = copy[copy.length - 1]!;
  const firstTime = getEventTimestampMs(first) ?? 0;
  const lastTime = getEventTimestampMs(last) ?? 0;

  const isNewestFirst = firstTime > lastTime || (firstTime === lastTime && first.id > last.id);

  return isNewestFirst ? copy : copy.toReversed();
};

/** Collapse same-timestamp publish/unpublish events into one row. */
export const groupTimelineEvents = (events: TimelineEvent[]): DisplayEvent[] => {
  const result: DisplayEvent[] = [];
  let index = 0;

  while (index < events.length) {
    const event = events[index];
    if (!event) {
      index += 1;
      continue;
    }

    const grouper = getTargetGrouper(event);
    const firstTarget = grouper?.extract(event) ?? null;
    if (!grouper || firstTarget === null) {
      result.push({ kind: 'single', event });
      index += 1;
      continue;
    }

    const group: TimelineEvent[] = [event];
    const targets: string[] = [firstTarget];
    index += 1;

    while (index < events.length) {
      const next = events[index];
      if (!next || !grouper.test(next) || !sameEventTimestamp(group[group.length - 1]!, next)) {
        break;
      }
      const target = grouper.extract(next);
      if (target === null) {
        break;
      }
      group.push(next);
      targets.push(target);
      index += 1;
    }

    if (group.length === 1) {
      result.push({ kind: 'single', event: group[0]! });
      continue;
    }

    result.push({
      kind: 'target-group',
      events: group,
      targets,
      groupVerb: grouper.groupVerb,
      targetKind: grouper.targetKind,
      created_at: group[0]!.created_at,
      author: group[0]!.author
    });
  }

  return result;
};

/** Group display rows under date labels for the timeline, preserving order. */
export const groupDisplayEventsByDay = (displays: DisplayEvent[], now: Date = new Date()): DayGroup[] => {
  const groups: DayGroup[] = [];

  for (const display of displays) {
    const anchor = display.kind === 'single' ? display.event : display.events[0]!;
    const timestampMs = getEventTimestampMs(anchor);
    const label = timestampMs === null ? '' : formatEventDateLabel(timestampMs, now);
    const lastGroup = groups[groups.length - 1];

    if (lastGroup && lastGroup.label === label) {
      lastGroup.items.push(display);
    } else {
      groups.push({ label, items: [display] });
    }
  }

  return groups;
};

const coerceString = (value: unknown): string => (typeof value === 'string' ? value : '');

const readField = (record: Record<string, unknown>, ...keys: string[]): unknown => {
  for (const key of keys) {
    if (key in record) {
      return record[key];
    }
  }
  return undefined;
};

const normalizeEvent = (raw: unknown): TimelineEvent | null => {
  if (!raw || typeof raw !== 'object') {
    return null;
  }

  const record = raw as Record<string, unknown>;
  const nested = record.event && typeof record.event === 'object' ? (record.event as Record<string, unknown>) : record;

  const createdAt = coerceString(
    readField(nested, 'created_at', 'createdAt') ?? readField(record, 'created_at', 'createdAt')
  );

  const body = readField(nested, 'body') ?? readField(record, 'body');

  return {
    id: Number(readField(nested, 'id') ?? readField(record, 'id')) || 0,
    subject_id:
      Number(readField(nested, 'subject_id', 'subjectId') ?? readField(record, 'subject_id', 'subjectId')) || 0,
    created_at: createdAt,
    subject_type: coerceString(
      readField(nested, 'subject_type', 'subjectType') ?? readField(record, 'subject_type', 'subjectType')
    ),
    verb: coerceString(readField(nested, 'verb') ?? readField(record, 'verb')),
    arguments: Array.isArray(nested.arguments)
      ? nested.arguments
      : Array.isArray(record.arguments)
        ? record.arguments
        : [],
    body: typeof body === 'string' ? body : null,
    message: coerceString(readField(nested, 'message') ?? readField(record, 'message')),
    author: coerceString(readField(nested, 'author') ?? readField(record, 'author')),
    description: coerceString(readField(nested, 'description') ?? readField(record, 'description')),
    path: coerceString(readField(nested, 'path') ?? readField(record, 'path'))
  };
};

export const parseEventsResponse = (payload: unknown): TimelineEvent[] => {
  let rawEvents: unknown[] = [];

  if (Array.isArray(payload)) {
    rawEvents = payload;
  } else if (payload && typeof payload === 'object' && Array.isArray((payload as { events?: unknown }).events)) {
    rawEvents = (payload as { events: unknown[] }).events;
  }

  return rawEvents.map(normalizeEvent).filter((event): event is TimelineEvent => event !== null);
};
