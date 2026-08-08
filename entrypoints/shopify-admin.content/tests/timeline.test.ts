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
  formatTargetList,
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

const salesChannelUnpublishEvent = (channel: string, createdAt: string, id: number): TimelineEvent => ({
  id,
  subject_id: 1,
  created_at: createdAt,
  subject_type: 'Product',
  verb: 'unpublished',
  arguments: ['Product name'],
  body: null,
  message: `Liz Ayers excluded the product from ${channel}: ${productSuffix}.`,
  author: 'Liz Ayers',
  description: `Liz Ayers excluded the product from ${channel}: ${productSuffix}.`,
  path: '/admin/products/1'
});

const salesChannelEvent = (channel: string, createdAt: string, id: number): TimelineEvent => ({
  id,
  subject_id: 1,
  created_at: createdAt,
  subject_type: 'Product',
  verb: 'published',
  arguments: ['Product name'],
  body: null,
  message: `Liz Ayers included a product on ${channel}: <a href="#">Product</a>.`,
  author: 'Liz Ayers',
  description: `Liz Ayers included a product on ${channel}: Product.`,
  path: '/admin/products/1'
});

const marketEvent = (market: string, createdAt: string, id: number): TimelineEvent => ({
  id,
  subject_id: 1,
  created_at: createdAt,
  subject_type: 'Product',
  verb: 'published',
  arguments: ['Product name'],
  body: null,
  message: `Product was included on ${market}: <a href="#">Product</a>.`,
  author: 'Shopify',
  description: `Product was included on ${market}: Product.`,
  path: '/admin/products/1'
});

const baseEvent = (overrides: Partial<TimelineEvent>): TimelineEvent => ({
  id: 1,
  subject_id: 1,
  created_at: '2026-02-19T10:40:57+00:00',
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

describe('isTimelinePage', () => {
  it('matches admin.shopify.com product, page, and collection URLs', () => {
    expect(isTimelinePage('/store/lanoguarduk/products/15568040427904')).toBe(true);
    expect(isTimelinePage('/store/lanoguarduk/pages/123456789')).toBe(true);
    expect(isTimelinePage('/store/lanoguarduk/collections/123456789')).toBe(true);
  });

  it('matches blog post and blog URLs under /content/', () => {
    expect(isTimelinePage('/store/lanoguarduk/content/articles/568741822547')).toBe(true);
    expect(isTimelinePage('/store/lanoguarduk/content/blogs/92138176595')).toBe(true);
  });

  it('matches legacy myshopify admin URLs', () => {
    expect(isTimelinePage('/admin/products/15568040427904')).toBe(true);
    expect(isTimelinePage('/admin/pages/123456789/')).toBe(true);
    expect(isTimelinePage('/admin/collections/123456789')).toBe(true);
    expect(isTimelinePage('/admin/blogs/123456789')).toBe(true);
    expect(isTimelinePage('/admin/blogs/123456789/articles/987654321')).toBe(true);
  });

  it('ignores unsupported admin resources', () => {
    expect(isTimelinePage('/store/lanoguarduk/articles/123')).toBe(false);
    expect(isTimelinePage('/store/lanoguarduk/themes')).toBe(false);
    expect(isTimelinePage('/store/lanoguarduk/products')).toBe(false);
  });
});

describe('getEventsUrls', () => {
  it('appends events.json with a limit to the current resource path', () => {
    expect(getEventsUrls('/store/demo/products/123', 'https://admin.shopify.com')).toEqual([
      'https://admin.shopify.com/store/demo/products/123/events.json?limit=250'
    ]);
  });

  it('strips a trailing slash before appending', () => {
    expect(getEventsUrls('/store/demo/products/123/', 'https://admin.shopify.com')).toEqual([
      'https://admin.shopify.com/store/demo/products/123/events.json?limit=250'
    ]);
  });

  it('returns custom then smart collection candidates for collection pages', () => {
    expect(getEventsUrls('/store/demo/collections/123', 'https://admin.shopify.com')).toEqual([
      'https://admin.shopify.com/store/demo/custom_collections/123/events.json?limit=250',
      'https://admin.shopify.com/store/demo/smart_collections/123/events.json?limit=250'
    ]);
    expect(getEventsUrls('/admin/collections/123', 'https://demo.myshopify.com')).toEqual([
      'https://demo.myshopify.com/admin/custom_collections/123/events.json?limit=250',
      'https://demo.myshopify.com/admin/smart_collections/123/events.json?limit=250'
    ]);
  });

  it('rewrites /content/articles and /content/blogs to their events resource paths', () => {
    expect(getEventsUrls('/store/demo/content/articles/456', 'https://admin.shopify.com')).toEqual([
      'https://admin.shopify.com/store/demo/articles/456/events.json?limit=250'
    ]);
    expect(getEventsUrls('/store/demo/content/blogs/789', 'https://admin.shopify.com')).toEqual([
      'https://admin.shopify.com/store/demo/blogs/789/events.json?limit=250'
    ]);
  });
});

describe('eventsForDisplay', () => {
  it('reverses oldest-first shopify order', () => {
    const events = [
      baseEvent({ id: 237571030811008, verb: 'create', created_at: '2025-09-05T13:18:52+01:00' }),
      baseEvent({ id: 237571031400832, verb: 'status_changed', created_at: '2025-09-05T13:18:52+01:00' })
    ];

    expect(eventsForDisplay(events).map((event) => event.verb)).toEqual(['status_changed', 'create']);
  });

  it('keeps newest-first shopify order', () => {
    const events = [
      baseEvent({ id: 237571031400832, verb: 'status_changed', created_at: '2025-09-05T13:18:52+01:00' }),
      baseEvent({ id: 237571030811008, verb: 'create', created_at: '2025-09-05T13:18:52+01:00' })
    ];

    expect(eventsForDisplay(events).map((event) => event.verb)).toEqual(['status_changed', 'create']);
  });

  it('reverses when timestamps differ regardless of ids', () => {
    const events = [
      baseEvent({ id: 9, verb: 'create', created_at: '2025-09-05T10:00:00+00:00' }),
      baseEvent({ id: 1, verb: 'update', created_at: '2025-09-06T10:00:00+00:00' })
    ];

    expect(eventsForDisplay(events).map((event) => event.verb)).toEqual(['update', 'create']);
  });
});

describe('parseEventsResponse', () => {
  it('normalizes snake_case event fields', () => {
    const events = parseEventsResponse({
      events: [
        {
          id: 1,
          created_at: '2026-02-19T17:46:30+00:00',
          author: 'Liz Ayers',
          verb: 'published',
          description: 'Liz Ayers included a product on Online Store: Product.'
        }
      ]
    });

    expect(events[0]?.created_at).toBe('2026-02-19T17:46:30+00:00');
    expect(events[0]?.author).toBe('Liz Ayers');
  });

  it('normalizes camelCase createdAt from the payload', () => {
    const events = parseEventsResponse({
      events: [
        {
          id: 1,
          createdAt: '2026-02-19T17:46:30+00:00',
          author: 'Liz Ayers',
          verb: 'published',
          description: 'Liz Ayers included a product on Online Store: Product.'
        }
      ]
    });

    expect(events[0]?.created_at).toBe('2026-02-19T17:46:30+00:00');
  });

  it('returns an empty list for malformed payloads', () => {
    expect(parseEventsResponse(null)).toEqual([]);
    expect(parseEventsResponse('nope')).toEqual([]);
    expect(parseEventsResponse({})).toEqual([]);
    expect(parseEventsResponse({ events: [null, 'x', 42] })).toEqual([]);
  });

  it('unwraps nested event records and coerces ids', () => {
    const events = parseEventsResponse([{ event: { id: 7, created_at: '2026-01-01T00:00:00Z', verb: 'create' } }]);
    expect(events[0]?.id).toBe(7);
    expect(events[0]?.verb).toBe('create');

    const fallback = parseEventsResponse([{ id: 'not-a-number', verb: 'create' }]);
    expect(fallback[0]?.id).toBe(0);
  });

  it('drops non-string body values', () => {
    const events = parseEventsResponse([{ id: 1, verb: 'create', body: { nested: true } }]);
    expect(events[0]?.body).toBeNull();
  });
});

describe('getEventTimestampMs', () => {
  it('parses ISO timestamps and scales epoch seconds to milliseconds', () => {
    expect(getEventTimestampMs(baseEvent({ created_at: '2026-02-19T10:40:57+00:00' }))).toBe(
      Date.parse('2026-02-19T10:40:57+00:00')
    );
    expect(getEventTimestampMs({ created_at: 1755000000 })).toBe(1755000000000);
    expect(getEventTimestampMs({ created_at: 1755000000000 })).toBe(1755000000000);
  });

  it('reads camelCase and attribute fallbacks', () => {
    expect(getEventTimestampMs({ createdAt: '2026-02-19T17:46:30+00:00' })).not.toBeNull();
    expect(getEventTimestampMs({ attributes: { created_at: '2026-02-19T17:46:30+00:00' } })).not.toBeNull();
  });

  it('returns null for missing or unparseable timestamps', () => {
    expect(getEventTimestampMs({})).toBeNull();
    expect(getEventTimestampMs({ created_at: '' })).toBeNull();
    expect(getEventTimestampMs({ created_at: 'not a date' })).toBeNull();
  });
});

describe('formatEventTime', () => {
  it('formats a valid event timestamp as a short lowercase clock time', () => {
    const time = formatEventTime(baseEvent({ created_at: '2026-02-19T10:40:57+00:00' }));
    expect(time).toMatch(/^\d{1,2}:\d{2}(\s?[ap]m)?$/);
    expect(time).toBe(time.toLowerCase());
  });

  it('returns an empty string for missing or invalid timestamps', () => {
    expect(formatEventTime({})).toBe('');
    expect(formatEventTime(baseEvent({ created_at: 'garbage' }))).toBe('');
  });
});

describe('formatEventDateLabel', () => {
  const now = new Date(2026, 1, 20, 12, 0, 0);

  it('labels today and yesterday', () => {
    expect(formatEventDateLabel(new Date(2026, 1, 20, 9, 30).getTime(), now)).toBe('Today');
    expect(formatEventDateLabel(new Date(2026, 1, 19, 23, 59).getTime(), now)).toBe('Yesterday');
  });

  it('formats older same-year dates without the year', () => {
    const ms = new Date(2026, 0, 5).getTime();
    expect(formatEventDateLabel(ms, now)).toBe(
      new Date(ms).toLocaleDateString(undefined, { day: 'numeric', month: 'long' })
    );
  });

  it('includes the year for previous years', () => {
    const ms = new Date(2025, 8, 5).getTime();
    expect(formatEventDateLabel(ms, now)).toBe(
      new Date(ms).toLocaleDateString(undefined, { day: 'numeric', month: 'long', year: 'numeric' })
    );
  });
});

describe('composeEventSentence', () => {
  it('keeps sentences that already name the author', () => {
    expect(composeEventSentence('Jenny Hopper', 'Jenny Hopper created the product')).toBe(
      'Jenny Hopper created the product'
    );
  });

  it('prepends the author to recognized English sentences', () => {
    expect(composeEventSentence('Liz Ayers', 'Published to Shop, Buy Button sales channels')).toBe(
      'Liz Ayers published to Shop, Buy Button sales channels'
    );
    expect(composeEventSentence('Shopify', 'Included the product on Eurozone market')).toBe(
      'Shopify included the product on Eurozone market'
    );
  });

  it('leaves unrecognized (non-English) sentences untouched', () => {
    expect(composeEventSentence('Jenny Hopper', 'Le produit a été créé')).toBe('Le produit a été créé');
  });

  it('handles empty author and empty description', () => {
    expect(composeEventSentence('', 'Created the product')).toBe('Created the product');
    expect(composeEventSentence('Jenny Hopper', '')).toBe('Jenny Hopper');
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
  it('returns an empty list for no events', () => {
    expect(groupTimelineEvents([])).toEqual([]);
  });

  it('preserves shopify event order for same-timestamp events', () => {
    const grouped = groupTimelineEvents([
      baseEvent({ id: 237571030811008, verb: 'create', created_at: '2025-09-05T13:18:52+01:00' }),
      baseEvent({
        id: 237571031400832,
        verb: 'status_changed',
        created_at: '2025-09-05T13:18:52+01:00',
        description: 'Jenny Hopper changed product status from active to draft: Lanoguard Pro Cleaning Bundle.'
      })
    ]);

    expect(grouped).toHaveLength(2);
    expect(grouped[0].kind).toBe('single');
    expect(grouped[1].kind).toBe('single');
    if (grouped[0].kind === 'single' && grouped[1].kind === 'single') {
      expect(grouped[0].event.verb).toBe('create');
      expect(grouped[1].event.verb).toBe('status_changed');
    }
  });

  it('groups same-timestamp market publish events', () => {
    const grouped = groupTimelineEvents([
      marketEvent('Eurozone', '2026-02-19T10:40:59+00:00', 1),
      marketEvent('International', '2026-02-19T10:40:59+00:00', 2),
      baseEvent({ id: 3, verb: 'create', created_at: '2026-02-19T10:40:57+00:00' })
    ]);

    expect(grouped).toHaveLength(2);
    expect(grouped[0].kind).toBe('target-group');
    if (grouped[0].kind === 'target-group') {
      expect(grouped[0].targetKind).toBe('market');
      expect(grouped[0].groupVerb).toBe('published');
      expect(grouped[0].targets).toEqual(['Eurozone', 'International']);
    }
    expect(grouped[1].kind).toBe('single');
  });

  it('groups same-timestamp sales channel publish events', () => {
    const grouped = groupTimelineEvents([
      salesChannelEvent('Point of Sale', '2026-02-19T21:29:54+00:00', 1),
      salesChannelEvent('Shop', '2026-02-19T21:29:54+00:00', 2),
      salesChannelEvent('Buy Button', '2026-02-19T21:29:54+00:00', 3),
      salesChannelEvent('Lanoguard UK New', '2026-02-19T21:29:54+00:00', 4),
      salesChannelEvent('Application Centres [Metaobjects]', '2026-02-19T21:29:54+00:00', 5)
    ]);

    expect(grouped).toHaveLength(1);
    expect(grouped[0].kind).toBe('target-group');
    if (grouped[0].kind === 'target-group') {
      expect(grouped[0].targetKind).toBe('sales-channel');
      expect(grouped[0].groupVerb).toBe('published');
      expect(grouped[0].targets).toEqual([
        'Point of Sale',
        'Shop',
        'Buy Button',
        'Lanoguard UK New',
        'Application Centres [Metaobjects]'
      ]);
      expect(formatTargetList(grouped[0].targets, grouped[0].targetKind)).toBe(
        'Point of Sale, Shop, Buy Button, Lanoguard UK New, Application Centres [Metaobjects]'
      );
    }
  });

  it('groups same-timestamp sales channel unpublish events', () => {
    const grouped = groupTimelineEvents([
      salesChannelUnpublishEvent('Microsoft Channel', '2026-02-19T21:29:57+00:00', 1),
      salesChannelUnpublishEvent('TikTok', '2026-02-19T21:29:57+00:00', 2),
      salesChannelUnpublishEvent('Inbox', '2026-02-19T21:29:57+00:00', 3),
      salesChannelUnpublishEvent('Google & YouTube', '2026-02-19T21:29:57+00:00', 4)
    ]);

    expect(grouped).toHaveLength(1);
    expect(grouped[0].kind).toBe('target-group');
    if (grouped[0].kind === 'target-group') {
      expect(grouped[0].groupVerb).toBe('unpublished');
      expect(grouped[0].targetKind).toBe('sales-channel');
      expect(grouped[0].targets).toEqual(['Microsoft Channel', 'TikTok', 'Inbox', 'Google & YouTube']);
      expect(formatTargetGroupDescription(grouped[0].groupVerb, grouped[0].targetKind, grouped[0].targets)).toBe(
        'Unpublished from Microsoft Channel, TikTok, Inbox, Google & YouTube sales channels'
      );
    }
  });

  it('keeps sales channel publish events with different timestamps separate', () => {
    const grouped = groupTimelineEvents([
      salesChannelEvent('Shop', '2026-02-19T21:29:54+00:00', 1),
      salesChannelEvent('Buy Button', '2026-02-19T21:29:55+00:00', 2)
    ]);

    expect(grouped).toHaveLength(2);
    expect(grouped[0].kind).toBe('single');
    expect(grouped[1].kind).toBe('single');
  });

  it('keeps single market publish events ungrouped', () => {
    const grouped = groupTimelineEvents([marketEvent('Eurozone', '2026-02-19T10:40:59+00:00', 1)]);
    expect(grouped).toHaveLength(1);
    expect(grouped[0].kind).toBe('single');
  });
});

describe('groupDisplayEventsByDay', () => {
  it('groups consecutive rows under one date label', () => {
    const now = new Date(2026, 1, 20, 12, 0, 0);
    const groups = groupDisplayEventsByDay(
      groupTimelineEvents([
        baseEvent({ id: 3, verb: 'update', created_at: '2026-02-20T09:00:00+00:00' }),
        baseEvent({ id: 2, verb: 'update', created_at: '2026-02-19T15:00:00+00:00' }),
        baseEvent({ id: 1, verb: 'create', created_at: '2026-02-19T10:00:00+00:00' })
      ]),
      now
    );

    expect(groups.map((group) => group.items.length)).toEqual([1, 2]);
    expect(groups[1]?.items).toHaveLength(2);
  });

  it('returns no groups for no events', () => {
    expect(groupDisplayEventsByDay([])).toEqual([]);
  });
});

describe('extraction predicates', () => {
  it('detects sales channel unpublish rows from description text', () => {
    expect(isSalesChannelUnpublishEvent(salesChannelUnpublishEvent('TikTok', '2026-02-19T21:29:57+00:00', 1))).toBe(
      true
    );
    expect(isSalesChannelUnpublishEvent(salesChannelEvent('Shop', '2026-02-19T21:29:54+00:00', 1))).toBe(false);
  });

  it('pulls the sales channel label without the product title suffix', () => {
    expect(
      extractSalesChannelUnpublishTarget(salesChannelUnpublishEvent('Google & YouTube', '2026-02-19T21:29:57+00:00', 1))
    ).toBe('Google & YouTube');
  });

  it('detects sales channel publish rows from description text', () => {
    expect(isSalesChannelPublishEvent(salesChannelEvent('Shop', '2026-02-19T21:29:54+00:00', 1))).toBe(true);
    expect(isSalesChannelPublishEvent(marketEvent('Eurozone', '2026-02-19T10:40:59+00:00', 1))).toBe(false);
  });

  it('pulls the sales channel label from the event description', () => {
    expect(extractSalesChannelName(salesChannelEvent('Point of Sale', '2026-02-19T21:29:54+00:00', 1))).toBe(
      'Point of Sale'
    );
  });

  it('detects market publish rows from description text', () => {
    expect(isMarketPublishEvent(marketEvent('Eurozone', '2026-02-19T10:40:59+00:00', 1))).toBe(true);
    expect(isMarketPublishEvent(baseEvent({ verb: 'published', description: 'Product published.' }))).toBe(false);
  });

  it('pulls the market label from the event description', () => {
    expect(extractMarketName(marketEvent('Eurozone', '2026-02-19T10:40:59+00:00', 1))).toBe('Eurozone');
  });

  it('falls back to message text and returns null when nothing matches', () => {
    const viaMessage = baseEvent({
      verb: 'published',
      description: '',
      message: 'Product was included on Eurozone: Product.'
    });
    expect(extractMarketName(viaMessage)).toBe('Eurozone');
    expect(extractMarketName(baseEvent({ verb: 'published', description: 'no match', message: '' }))).toBeNull();
    expect(extractSalesChannelName(baseEvent({ description: 'no match', message: '' }))).toBeNull();
    expect(extractSalesChannelUnpublishTarget(baseEvent({ description: 'no match', message: '' }))).toBeNull();
  });
});

describe('formatEventDescription', () => {
  it('rewrites sales channel publish descriptions', () => {
    expect(formatEventDescription('Liz Ayers included a product on Online Store: Lanoguard Pro Cleaning Bundle.')).toBe(
      'Liz Ayers included the product on Online Store sales channel'
    );
  });

  it('rewrites status change descriptions', () => {
    expect(
      formatEventDescription('Jenny Hopper changed product status from active to draft: Lanoguard Pro Cleaning Bundle.')
    ).toBe('Jenny Hopper changed the product status from active to draft');
  });

  it('rewrites create descriptions for products and collections', () => {
    expect(formatEventDescription('Jenny Hopper created a new product: Lanoguard Pro Cleaning Bundle.')).toBe(
      'Jenny Hopper created the product'
    );
    expect(formatEventDescription('Jenny Hopper created a new collection: Summer Sale.')).toBe(
      'Jenny Hopper created the collection'
    );
  });

  it('rewrites market publish descriptions', () => {
    expect(formatEventDescription('Product was included on Eurozone: Summer Bundle.')).toBe(
      'Included the product on Eurozone market'
    );
  });

  it('replaces a product with the product in any message', () => {
    expect(formatEventDescription('Liz Ayers unpublished a product: Lanoguard Pro Cleaning Bundle.')).toBe(
      'Liz Ayers unpublished the product'
    );
    expect(formatEventDescription('Liz Ayers updated a product title: Lanoguard Pro Cleaning Bundle.')).toBe(
      'Liz Ayers updated the product title'
    );
  });

  it('rewrites sales channel unpublish descriptions', () => {
    expect(formatEventDescription(`Liz Ayers excluded the product from TikTok: ${productSuffix}.`)).toBe(
      'Liz Ayers excluded the product from TikTok sales channel'
    );
  });

  it('leaves non-English descriptions untouched apart from suffix trimming', () => {
    expect(formatEventDescription('Le produit a été créé')).toBe('Le produit a été créé');
  });
});

describe('formatMarketList', () => {
  it('returns an empty string for no markets', () => {
    expect(formatMarketList([])).toBe('');
  });

  it('groups repeated managed markets catalogs', () => {
    expect(
      formatMarketList([
        'Managed Markets catalog for BL',
        'Managed Markets catalog for BJ',
        'Managed Markets catalog for BI'
      ])
    ).toBe('Managed Markets catalog (BL, BJ, BI)');
  });

  it('keeps unique market names unchanged', () => {
    expect(formatMarketList(['Eurozone', 'International'])).toBe('Eurozone, International');
  });

  it('mixes standalone markets with grouped catalogs', () => {
    expect(formatMarketList(['Eurozone', 'Managed Markets catalog for BL', 'Managed Markets catalog for BJ'])).toBe(
      'Eurozone, Managed Markets catalog (BL, BJ)'
    );
  });
});

describe('getEventActor', () => {
  it('classifies app-driven events by api_client_id in arguments', () => {
    const appEvent = baseEvent({
      author: 'Shopify CLI Connector App',
      arguments: ['Timber Trapper Hat', 'api_client_id', 341303132161]
    });
    expect(getEventActor(appEvent)).toBe('app');
    expect(getActorLabel(getEventActor(appEvent))).toBe('App');
  });

  it('classifies Shopify-authored events without an app client as system', () => {
    const systemEvent = baseEvent({ author: 'Shopify', arguments: ['Timber Trapper Hat'] });
    expect(getEventActor(systemEvent)).toBe('system');
    expect(getActorLabel(getEventActor(systemEvent))).toBe('System');
  });

  it('classifies named authors without an app client as staff', () => {
    const staffEvent = baseEvent({ author: 'Jenny Hopper', arguments: ['Timber Trapper Hat'] });
    expect(getEventActor(staffEvent)).toBe('staff');
    expect(getActorLabel(getEventActor(staffEvent))).toBeNull();
  });
});

describe('getVerbDotClass', () => {
  it('strips underscores for css class names', () => {
    expect(getVerbDotClass('status_changed')).toBe('alfred-timeline__dot--statuschanged');
    expect(getVerbDotClass('unpublished')).toBe('alfred-timeline__dot--unpublished');
  });
});

describe('getEventDetail', () => {
  it('returns changed fields for update events', () => {
    expect(
      getEventDetail(
        baseEvent({
          verb: 'update',
          arguments: ['Product name', 'title', 'body_html', 'api_client_id', 1830279]
        })
      )
    ).toBe('title, body_html');
  });

  it('returns null for non-update events and empty or filtered arguments', () => {
    expect(getEventDetail(baseEvent({ verb: 'create' }))).toBeNull();
    expect(getEventDetail(baseEvent({ verb: 'update', arguments: [] }))).toBeNull();
    expect(getEventDetail(baseEvent({ verb: 'update', arguments: ['Product name'] }))).toBeNull();
    expect(getEventDetail(baseEvent({ verb: 'update', arguments: ['Product name', '1830279'] }))).toBeNull();
  });
});
