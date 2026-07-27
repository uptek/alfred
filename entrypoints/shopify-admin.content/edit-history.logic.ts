export interface ShopifyEditEvent {
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
  | { kind: 'single'; event: ShopifyEditEvent }
  | {
      kind: 'target-group';
      events: ShopifyEditEvent[];
      targets: string[];
      groupVerb: 'published' | 'unpublished';
      targetKind: 'market' | 'sales-channel';
      created_at: string;
      author: string;
    };

const MARKET_PUBLISH_RE = /included on ([^:]+):/i;
const SALES_CHANNEL_PUBLISH_RE = /included (?:a|the) product on ([^:]+):/i;
const SALES_CHANNEL_UNPUBLISH_RE = /excluded (?:a|the) product from ([^:]+)(?::|\.)/i;

/** Whether the current admin path supports /events.json. */
export const isEditHistoryPage = (pathname: string): boolean =>
  /^\/store\/[^/]+\/(products|pages)\/\d+\/?$/.test(pathname) || /^\/admin\/(products|pages)\/\d+\/?$/.test(pathname);

/** Build the events.json URL for the current admin resource page. */
export const getEventsUrl = (pathname: string, origin: string): string => {
  const cleanPath = pathname.replace(/\/$/, '');
  return `${origin}${cleanPath}/events.json`;
};

export const isMarketPublishEvent = (event: ShopifyEditEvent): boolean =>
  event.verb === 'published' && MARKET_PUBLISH_RE.test(event.description || event.message);

export const extractMarketName = (event: ShopifyEditEvent): string => {
  const text = event.description || event.message;
  return MARKET_PUBLISH_RE.exec(text)?.[1]?.trim() ?? 'Unknown market';
};

export const isSalesChannelPublishEvent = (event: ShopifyEditEvent): boolean =>
  event.verb === 'published' &&
  !isMarketPublishEvent(event) &&
  SALES_CHANNEL_PUBLISH_RE.test(event.description || event.message);

export const extractSalesChannelName = (event: ShopifyEditEvent): string => {
  const text = event.description || event.message;
  return SALES_CHANNEL_PUBLISH_RE.exec(text)?.[1]?.trim() ?? 'Unknown sales channel';
};

export const isSalesChannelUnpublishEvent = (event: ShopifyEditEvent): boolean =>
  event.verb === 'unpublished' && SALES_CHANNEL_UNPUBLISH_RE.test(event.description || event.message);

export const extractSalesChannelUnpublishTarget = (event: ShopifyEditEvent): string => {
  const text = event.description || event.message;
  return SALES_CHANNEL_UNPUBLISH_RE.exec(text)?.[1]?.trim() ?? 'Unknown sales channel';
};

type TargetGrouper = {
  groupVerb: 'published' | 'unpublished';
  targetKind: 'market' | 'sales-channel';
  test: (event: ShopifyEditEvent) => boolean;
  extract: (event: ShopifyEditEvent) => string;
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

const getTargetGrouper = (event: ShopifyEditEvent): TargetGrouper | null =>
  TARGET_GROUPERS.find((grouper) => grouper.test(event)) ?? null;

/** Milliseconds since epoch from a Shopify event, or null when missing. */
export const getEventTimestampMs = (event: ShopifyEditEvent | Record<string, unknown>): number | null => {
  const record = event as Record<string, unknown>;
  const candidates: unknown[] = [
    record.created_at,
    record.createdAt,
    (record.attributes as Record<string, unknown> | undefined)?.created_at,
    (record.attributes as Record<string, unknown> | undefined)?.createdAt
  ];

  for (const value of candidates) {
    if (typeof value === 'string' && value.trim()) {
      const ms = Date.parse(value);
      if (Number.isFinite(ms)) {
        return ms;
      }
    }

    if (typeof value === 'number' && Number.isFinite(value)) {
      return value < 1e12 ? value * 1000 : value;
    }
  }

  return null;
};

const sameEventTimestamp = (a: ShopifyEditEvent, b: ShopifyEditEvent): boolean => {
  const aMs = getEventTimestampMs(a);
  const bMs = getEventTimestampMs(b);
  return aMs !== null && bMs !== null && aMs === bMs;
};

/** Comma-separated targets for a grouped publish/unpublish card. */
export const formatTargetList = (targets: string[], targetKind: 'market' | 'sales-channel'): string =>
  targetKind === 'market' ? formatMarketList(targets) : targets.join(', ');

/** Description line for a grouped publish/unpublish card. */
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

/** @deprecated Use formatTargetList */
export const formatPublishTargetList = formatTargetList;

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
export const getEventDetail = (event: ShopifyEditEvent): string | null => {
  if (event.verb !== 'update' || !event.arguments?.length) {
    return null;
  }

  const fields = event.arguments.filter(
    (arg, index) => index > 0 && typeof arg === 'string' && arg !== 'api_client_id' && !/^\d+$/.test(arg)
  );

  return fields.length ? fields.join(', ') : null;
};

export const VERB_LABELS: Record<string, string> = {
  create: 'Created',
  update: 'Updated',
  published: 'Published',
  unpublished: 'Unpublished',
  status_changed: 'Status changed',
  destroy: 'Deleted',
  delete: 'Deleted'
};

/** Human-readable label for an event verb. */
export const formatVerbLabel = (verb: string): string => {
  if (VERB_LABELS[verb]) {
    return VERB_LABELS[verb];
  }

  return verb
    .split('_')
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
};

/** CSS modifier class for a verb badge. Underscores are stripped for valid class names. */
export const getVerbBadgeClass = (verb: string): string =>
  `alfred-edit-history__badge--${verb.replace(/[^a-z0-9-]/gi, '')}`;

const TRAILING_RESOURCE_SUFFIX = /:\s[^:]+\.?$/;

/** Clean Shopify event descriptions for the activity sidebar. */
export const formatEventDescription = (description: string): string => {
  let text = description.trim().replace(TRAILING_RESOURCE_SUFFIX, '').replace(/\.$/, '');

  text = text
    .replace(/\bcreated a new product\b/gi, 'created the product')
    .replace(/\bcreated a new page\b/gi, 'created the page')
    .replace(/\bchanged product status\b/gi, 'changed the product status')
    .replace(/\bProduct was included on\b/g, 'Included the product on')
    .replace(/\ba product\b/gi, 'the product')
    .replace(/\ba page\b/gi, 'the page')
    .replace(/\bupdated product\b/gi, 'updated the product');

  if (
    /included the product on\b/i.test(text) &&
    !/sales channel$/i.test(text) &&
    !/^Included the product on\b/.test(text)
  ) {
    text = `${text} sales channel`;
  }

  if (/^Included the product on\b/.test(text) && !/market$/i.test(text)) {
    text = `${text} market`;
  }

  if (/excluded the product from\b/i.test(text) && !/sales channel$/i.test(text)) {
    text = `${text} sales channel`;
  }

  return text;
};

/** Whether the event was performed by Shopify (system), not a staff member. */
export const isShopifyAuthor = (author: string): boolean => author.trim().toLowerCase() === 'shopify';

/** Show newest events first while preserving Shopify's tie order. */
export const eventsForDisplay = (events: ShopifyEditEvent[]): ShopifyEditEvent[] => {
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
export const groupEditEvents = (events: ShopifyEditEvent[]): DisplayEvent[] => {
  const result: DisplayEvent[] = [];
  let index = 0;

  while (index < events.length) {
    const event = events[index];
    if (!event) {
      index += 1;
      continue;
    }

    const grouper = getTargetGrouper(event);
    if (!grouper) {
      result.push({ kind: 'single', event });
      index += 1;
      continue;
    }

    const group: ShopifyEditEvent[] = [event];
    index += 1;

    while (index < events.length) {
      const next = events[index];
      if (!next || !grouper.test(next) || !sameEventTimestamp(group[group.length - 1]!, next)) {
        break;
      }
      group.push(next);
      index += 1;
    }

    if (group.length === 1) {
      result.push({ kind: 'single', event: group[0]! });
      continue;
    }

    result.push({
      kind: 'target-group',
      events: group,
      targets: group.map(grouper.extract),
      groupVerb: grouper.groupVerb,
      targetKind: grouper.targetKind,
      created_at: group[0]!.created_at,
      author: group[0]!.author
    });
  }

  return result;
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

const normalizeEvent = (raw: unknown): ShopifyEditEvent | null => {
  if (!raw || typeof raw !== 'object') {
    return null;
  }

  const record = raw as Record<string, unknown>;
  const nested = record.event && typeof record.event === 'object' ? (record.event as Record<string, unknown>) : record;

  const createdAt = coerceString(
    readField(nested, 'created_at', 'createdAt') ?? readField(record, 'created_at', 'createdAt')
  );

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
    body: (readField(nested, 'body') ?? readField(record, 'body') ?? null) as string | null,
    message: coerceString(readField(nested, 'message') ?? readField(record, 'message')),
    author: coerceString(readField(nested, 'author') ?? readField(record, 'author')),
    description: coerceString(readField(nested, 'description') ?? readField(record, 'description')),
    path: coerceString(readField(nested, 'path') ?? readField(record, 'path'))
  };
};

/** Local clock time HH:MM:SS for an event timestamp. */
export const formatEventClockTime = (event: ShopifyEditEvent | Record<string, unknown>): string => {
  const timestampMs = getEventTimestampMs(event);
  if (timestampMs === null) {
    return '';
  }

  const date = new Date(timestampMs);
  if (Number.isNaN(date.getTime())) {
    return '';
  }

  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  const seconds = String(date.getSeconds()).padStart(2, '0');
  return `${hours}:${minutes}:${seconds}`;
};

export const parseEventsResponse = (payload: unknown): ShopifyEditEvent[] => {
  let rawEvents: unknown[] = [];

  if (Array.isArray(payload)) {
    rawEvents = payload;
  } else if (payload && typeof payload === 'object' && Array.isArray((payload as { events?: unknown }).events)) {
    rawEvents = (payload as { events: unknown[] }).events;
  }

  return rawEvents.map(normalizeEvent).filter((event): event is ShopifyEditEvent => event !== null);
};

export const getDisplaySubjectType = (events: DisplayEvent[]): string | undefined => {
  const first = events[0];
  if (!first) {
    return undefined;
  }

  return first.kind === 'single' ? first.event.subject_type : first.events[0]?.subject_type;
};
