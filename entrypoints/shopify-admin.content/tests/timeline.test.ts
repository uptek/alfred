import { describe, expect, it } from 'bun:test';
import {
  composeEventSentence,
  extractMarketName,
  extractSalesChannelName,
  extractSalesChannelUnpublishTarget,
  formatEventDateLabel,
  formatEventDescription,
  formatEventTime,
  formatMarketList,
  formatTargetGroupDescription,
  getActorLabel,
  getEventActor,
  getEventDetail,
  getEventTimestampMs,
  getEventsUrls,
  getVerbDotClass,
  groupDisplayEventsByDay,
  groupTimelineEvents,
  isTimelinePage,
  isMarketPublishEvent,
  isSalesChannelPublishEvent,
  isSalesChannelUnpublishEvent,
  eventsForDisplay,
  parseEventsResponse,
  sentenceNamesAuthor,
  type TimelineEvent
} from '../timeline.logic';

const productSuffix = 'Kärcher Foam Jet Nozzle with Mixing Regulator and Directional Nozzle (600ml Bottle)';

const AT = '2026-02-19T10:40:57+00:00';

const baseEvent = (overrides: Partial<TimelineEvent>): TimelineEvent => ({
  id: 1,
  subject_id: 1,
  created_at: AT,
  subject_type: 'Product',
  verb: 'create',
  arguments: ['Product name'],
  body: null,
  message: 'Created product',
  author: 'Jenny Hopper',
  description: 'Jenny Hopper created a new product: Product.',
  path: '/admin/products/1',
  ...overrides
});

const marketEvent = (market: string) =>
  baseEvent({ verb: 'published', description: `Product was included on ${market}: Product.` });

const salesChannelEvent = (channel: string) =>
  baseEvent({ verb: 'published', description: `Liz Ayers included a product on ${channel}: Product.` });

const salesChannelUnpublishEvent = (channel: string) =>
  baseEvent({ verb: 'unpublished', description: `Liz Ayers excluded the product from ${channel}: ${productSuffix}.` });

describe('isTimelinePage', () => {
  it.each([
    ['/store/lanoguarduk/products/15568040427904', true],
    ['/store/lanoguarduk/pages/123456789', true],
    ['/store/lanoguarduk/collections/123456789', true],
    ['/store/lanoguarduk/content/articles/568741822547', true],
    ['/store/lanoguarduk/content/blogs/92138176595', true],
    ['/admin/products/15568040427904', true],
    ['/admin/pages/123456789/', true],
    ['/admin/collections/123456789', true],
    ['/admin/blogs/123456789', true],
    ['/admin/blogs/123456789/articles/987654321', true],
    ['/store/lanoguarduk/articles/123', false],
    ['/store/lanoguarduk/themes', false],
    ['/store/lanoguarduk/products', false]
  ])('%s is a timeline page: %p', (path, matches) => {
    expect(isTimelinePage(path)).toBe(matches);
  });
});

describe('getEventsUrls', () => {
  const admin = 'https://admin.shopify.com';
  const legacy = 'https://demo.myshopify.com';

  // Collections try custom then smart collections; /content/ paths map to their events resource.
  it.each([
    [admin, '/store/demo/products/123', ['/store/demo/products/123']],
    [admin, '/store/demo/products/123/', ['/store/demo/products/123']],
    [admin, '/store/demo/content/articles/456', ['/store/demo/articles/456']],
    [admin, '/store/demo/content/blogs/789', ['/store/demo/blogs/789']],
    [admin, '/store/demo/collections/123', ['/store/demo/custom_collections/123', '/store/demo/smart_collections/123']],
    [legacy, '/admin/collections/123', ['/admin/custom_collections/123', '/admin/smart_collections/123']]
  ])('maps %s%s to its events.json candidates', (origin, path, resources) => {
    expect(getEventsUrls(path, origin)).toEqual(resources.map((r) => `${origin}${r}/events.json?limit=250`));
  });
});

describe('eventsForDisplay', () => {
  const event = (id: number, verb: string, created_at = '2025-09-05T13:18:52+01:00') =>
    baseEvent({ id, verb, created_at });

  it.each([
    ['reverses oldest-first order', [event(1, 'create'), event(2, 'status_changed')], ['status_changed', 'create']],
    ['keeps newest-first order', [event(2, 'status_changed'), event(1, 'create')], ['status_changed', 'create']],
    [
      'reverses by timestamp regardless of ids',
      [event(9, 'create', '2025-09-05T10:00:00+00:00'), event(1, 'update', '2025-09-06T10:00:00+00:00')],
      ['update', 'create']
    ]
  ])('%s', (_, events, verbs) => {
    expect(eventsForDisplay(events).map((e) => e.verb)).toEqual(verbs);
  });
});

describe('parseEventsResponse', () => {
  const iso = '2026-02-19T17:46:30+00:00';

  it('normalizes events from a wrapper or nested records, defaulting missing fields', () => {
    const raw = { id: 7, created_at: iso, author: 'Liz Ayers', verb: 'create' };
    const empty = {
      subject_id: 0,
      subject_type: '',
      arguments: [],
      body: null,
      message: '',
      description: '',
      path: ''
    };
    expect(parseEventsResponse({ events: [raw] })).toEqual([{ ...raw, ...empty }]);
    expect(parseEventsResponse([{ event: raw }])).toEqual([{ ...raw, ...empty }]);
  });

  it('returns an empty list for malformed payloads', () => {
    expect(parseEventsResponse(null)).toEqual([]);
    expect(parseEventsResponse('nope')).toEqual([]);
    expect(parseEventsResponse({})).toEqual([]);
    expect(parseEventsResponse({ events: [null, 'x', 42] })).toEqual([]);
  });

  it('coerces bad ids to 0 and drops non-string body values', () => {
    const [event] = parseEventsResponse([{ id: 'not-a-number', verb: 'create', body: { nested: true } }]);
    expect(event?.id).toBe(0);
    expect(event?.body).toBeNull();
  });

  it.each([
    [{ createdAt: iso }, iso],
    [{ attributes: { created_at: iso } }, iso],
    [{ attributes: { createdAt: iso } }, iso],
    [{ created_at: 1_755_000_000 }, '2025-08-12T12:00:00.000Z'],
    [{ created_at: 1_755_000_000_000 }, '2025-08-12T12:00:00.000Z'],
    [{ created_at: {} }, ''],
    [{ attributes: 'nope' }, '']
  ])('reads created_at from %j as %p', (fields, createdAt) => {
    expect(parseEventsResponse([{ id: 1, verb: 'create', ...fields }])[0]?.created_at).toBe(createdAt);
  });
});

describe('getEventTimestampMs / formatEventTime', () => {
  it('parses a valid timestamp and formats it as a short lowercase clock time', () => {
    const event = baseEvent({ created_at: '2026-02-19T10:40:57+00:00' });
    expect(getEventTimestampMs(event)).toBe(Date.parse('2026-02-19T10:40:57+00:00'));
    const time = formatEventTime(event);
    expect(time).toMatch(/^\d{1,2}:\d{2}(\s?[ap]m)?$/);
    expect(time).toBe(time.toLowerCase());
  });

  it.each(['', 'not a date'])('returns null and an empty time for %p', (created_at) => {
    expect(getEventTimestampMs(baseEvent({ created_at }))).toBeNull();
    expect(formatEventTime(baseEvent({ created_at }))).toBe('');
  });
});

describe('formatEventDateLabel', () => {
  const now = new Date(2026, 1, 20, 12, 0, 0);
  const label = (date: Date) => formatEventDateLabel(date.getTime(), now);

  it('labels today and yesterday', () => {
    expect(label(new Date(2026, 1, 20, 9, 30))).toBe('Today');
    expect(label(new Date(2026, 1, 19, 23, 59))).toBe('Yesterday');
  });

  it('formats older dates, adding the year only for previous years', () => {
    const sameYear = new Date(2026, 0, 5);
    const lastYear = new Date(2025, 8, 5);
    const options = { day: 'numeric', month: 'long' } as const;
    expect(label(sameYear)).toBe(sameYear.toLocaleDateString(undefined, options));
    expect(label(lastYear)).toBe(lastYear.toLocaleDateString(undefined, { ...options, year: 'numeric' }));
  });
});

describe('composeEventSentence', () => {
  // The author is prepended only to recognized English sentences that don't already name them.
  it.each([
    ['Jenny Hopper', 'Jenny Hopper created the product', 'Jenny Hopper created the product'],
    [
      'Liz Ayers',
      'Published to Shop, Buy Button sales channels',
      'Liz Ayers published to Shop, Buy Button sales channels'
    ],
    ['Shopify', 'Included the product on Eurozone market', 'Shopify included the product on Eurozone market'],
    ['Jenny Hopper', 'Le produit a été créé', 'Le produit a été créé'],
    ['', 'Created the product', 'Created the product'],
    ['Jenny Hopper', '', 'Jenny Hopper']
  ])('%p + %p is %p', (author, description, sentence) => {
    expect(composeEventSentence(author, description)).toBe(sentence);
  });
});

describe('sentenceNamesAuthor', () => {
  it('detects the author inside the sentence case-insensitively', () => {
    expect(sentenceNamesAuthor('Jenny Hopper created the product', 'jenny hopper')).toBe(true);
    expect(sentenceNamesAuthor('Le produit a été créé', 'Jenny Hopper')).toBe(false);
    expect(sentenceNamesAuthor('Created the product', '')).toBe(false);
  });
});

describe('groupTimelineEvents', () => {
  it.each([
    ['market', 'published', marketEvent, ['Eurozone', 'International']],
    [
      'sales-channel',
      'published',
      salesChannelEvent,
      ['Point of Sale', 'Shop', 'Buy Button', 'Lanoguard UK New', 'Application Centres [Metaobjects]']
    ],
    [
      'sales-channel',
      'unpublished',
      salesChannelUnpublishEvent,
      ['Microsoft Channel', 'TikTok', 'Inbox', 'Google & YouTube']
    ]
  ])('groups same-timestamp %s %s events up to the next other event', (targetKind, groupVerb, make, targets) => {
    const events = targets.map(make);
    const next = baseEvent({ verb: 'create' });
    expect(groupTimelineEvents([...events, next])).toEqual([
      { kind: 'target-group', events, targets, groupVerb, targetKind, created_at: AT, author: 'Jenny Hopper' },
      { kind: 'single', event: next }
    ]);
  });

  it.each([
    ['no events', []],
    ['same-timestamp non-publish events', [baseEvent({ verb: 'create' }), baseEvent({ verb: 'status_changed' })]],
    [
      'publishes with different timestamps',
      [salesChannelEvent('Shop'), { ...salesChannelEvent('Buy Button'), created_at: '2026-02-19T10:40:58+00:00' }]
    ],
    ['a lone market publish', [marketEvent('Eurozone')]]
  ])('keeps %s as single rows in order', (_, events) => {
    expect(groupTimelineEvents(events)).toEqual(events.map((event) => ({ kind: 'single', event })));
  });
});

describe('formatTargetGroupDescription', () => {
  it.each([
    [
      'unpublished',
      'sales-channel',
      ['Microsoft Channel', 'TikTok', 'Inbox', 'Google & YouTube'],
      'Unpublished from Microsoft Channel, TikTok, Inbox, Google & YouTube sales channels'
    ],
    [
      'published',
      'market',
      ['Eurozone', 'Managed Markets catalog for BL', 'Managed Markets catalog for BJ'],
      'Published to Eurozone, Managed Markets catalog (BL, BJ)'
    ]
  ] as const)('describes %s %s groups', (groupVerb, targetKind, targets, description) => {
    expect(formatTargetGroupDescription(groupVerb, targetKind, [...targets])).toBe(description);
  });
});

describe('groupDisplayEventsByDay', () => {
  it('groups consecutive rows under one date label', () => {
    const rows = groupTimelineEvents([
      baseEvent({ id: 3, verb: 'update', created_at: '2026-02-20T09:00:00+00:00' }),
      baseEvent({ id: 2, verb: 'update', created_at: '2026-02-19T15:00:00+00:00' }),
      baseEvent({ id: 1, verb: 'create', created_at: '2026-02-19T10:00:00+00:00' })
    ]);

    expect(groupDisplayEventsByDay(rows, new Date(2026, 1, 20, 12, 0, 0))).toEqual([
      { label: 'Today', items: [rows[0]!] },
      { label: 'Yesterday', items: [rows[1]!, rows[2]!] }
    ]);
    expect(groupDisplayEventsByDay([])).toEqual([]);
  });
});

describe('extraction predicates', () => {
  // [isMarketPublish, marketName, isSalesChannelPublish, channelName, isSalesChannelUnpublish, unpublishTarget]
  const read = (event: TimelineEvent) => [
    isMarketPublishEvent(event),
    extractMarketName(event),
    isSalesChannelPublishEvent(event),
    extractSalesChannelName(event),
    isSalesChannelUnpublishEvent(event),
    extractSalesChannelUnpublishTarget(event)
  ];

  it.each([
    ['market publish', marketEvent('Eurozone'), [true, 'Eurozone', false, null, false, null]],
    [
      'market publish via message text',
      baseEvent({ verb: 'published', description: '', message: 'Product was included on Eurozone: Product.' }),
      [true, 'Eurozone', false, null, false, null]
    ],
    ['sales channel publish', salesChannelEvent('Point of Sale'), [false, null, true, 'Point of Sale', false, null]],
    [
      'sales channel unpublish without the product title suffix',
      salesChannelUnpublishEvent('Google & YouTube'),
      [false, null, false, null, true, 'Google & YouTube']
    ],
    [
      'unrecognized publish',
      baseEvent({ verb: 'published', description: 'Product published.' }),
      [false, null, false, null, false, null]
    ]
  ])('reads a %s', (_, event, expected) => {
    expect(read(event)).toEqual(expected);
  });
});

describe('formatEventDescription', () => {
  it.each([
    [
      'Liz Ayers included a product on Online Store: Lanoguard Pro Cleaning Bundle.',
      'Liz Ayers included the product on Online Store sales channel'
    ],
    [
      'Jenny Hopper changed product status from active to draft: Lanoguard Pro Cleaning Bundle.',
      'Jenny Hopper changed the product status from active to draft'
    ],
    ['Jenny Hopper created a new product: Lanoguard Pro Cleaning Bundle.', 'Jenny Hopper created the product'],
    ['Jenny Hopper created a new collection: Summer Sale.', 'Jenny Hopper created the collection'],
    ['Product was included on Eurozone: Summer Bundle.', 'Included the product on Eurozone market'],
    ['Liz Ayers unpublished a product: Lanoguard Pro Cleaning Bundle.', 'Liz Ayers unpublished the product'],
    ['Liz Ayers updated a product title: Lanoguard Pro Cleaning Bundle.', 'Liz Ayers updated the product title'],
    [
      `Liz Ayers excluded the product from TikTok: ${productSuffix}.`,
      'Liz Ayers excluded the product from TikTok sales channel'
    ],
    ['Le produit a été créé', 'Le produit a été créé']
  ])('rewrites %p as %p', (description, formatted) => {
    expect(formatEventDescription(description)).toBe(formatted);
  });
});

describe('formatMarketList', () => {
  it.each([
    [[], ''],
    [['Eurozone', 'International'], 'Eurozone, International'],
    [
      ['Managed Markets catalog for BL', 'Managed Markets catalog for BJ', 'Managed Markets catalog for BI'],
      'Managed Markets catalog (BL, BJ, BI)'
    ],
    [
      ['Eurozone', 'Managed Markets catalog for BL', 'Managed Markets catalog for BJ'],
      'Eurozone, Managed Markets catalog (BL, BJ)'
    ]
  ])('formats %j as %p', (markets, list) => {
    expect(formatMarketList(markets)).toBe(list);
  });
});

describe('getEventActor', () => {
  it.each([
    ['Shopify CLI Connector App', ['Timber Trapper Hat', 'api_client_id', 341303132161], 'app', 'App'],
    ['Shopify', ['Timber Trapper Hat'], 'system', 'System'],
    ['Jenny Hopper', ['Timber Trapper Hat'], 'staff', null]
  ])('classifies author %p with arguments %j as %p', (author, args, actor, label) => {
    const event = baseEvent({ author, arguments: args });
    expect(getEventActor(event)).toBe(actor);
    expect(getActorLabel(getEventActor(event))).toBe(label);
  });
});

describe('getVerbDotClass', () => {
  it('strips underscores for css class names', () => {
    expect(getVerbDotClass('status_changed')).toBe('alfred-timeline__dot--statuschanged');
    expect(getVerbDotClass('unpublished')).toBe('alfred-timeline__dot--unpublished');
  });
});

describe('getEventDetail', () => {
  it.each([
    ['update', ['Product name', 'title', 'body_html', 'api_client_id', 1830279], 'title, body_html'],
    ['create', ['Product name'], null],
    ['update', [], null],
    ['update', ['Product name'], null],
    ['update', ['Product name', '1830279'], null]
  ])('%s with arguments %j gives %p', (verb, args, detail) => {
    expect(getEventDetail(baseEvent({ verb, arguments: args }))).toBe(detail);
  });
});
