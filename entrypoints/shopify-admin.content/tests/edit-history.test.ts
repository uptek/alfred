import { describe, expect, it } from 'bun:test';
import {
  extractMarketName,
  extractSalesChannelName,
  extractSalesChannelUnpublishTarget,
  formatEventClockTime,
  formatTargetGroupDescription,
  formatTargetList,
  formatVerbLabel,
  getEventDetail,
  getEventTimestampMs,
  getEventsUrl,
  getVerbBadgeClass,
  groupEditEvents,
  isEditHistoryPage,
  isMarketPublishEvent,
  isSalesChannelPublishEvent,
  isSalesChannelUnpublishEvent,
  eventsForDisplay,
  formatEventDescription,
  formatMarketList,
  isShopifyAuthor,
  parseEventsResponse,
  type ShopifyEditEvent
} from '../edit-history.logic';

const productSuffix = 'Kärcher Foam Jet Nozzle with Mixing Regulator and Directional Nozzle (600ml Bottle)';

const salesChannelUnpublishEvent = (channel: string, createdAt: string, id: number): ShopifyEditEvent => ({
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

const salesChannelEvent = (channel: string, createdAt: string, id: number): ShopifyEditEvent => ({
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

const marketEvent = (market: string, createdAt: string, id: number): ShopifyEditEvent => ({
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

const baseEvent = (overrides: Partial<ShopifyEditEvent>): ShopifyEditEvent => ({
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

describe('isEditHistoryPage', () => {
  it('matches admin.shopify.com product and page URLs', () => {
    expect(isEditHistoryPage('/store/lanoguarduk/products/15568040427904')).toBe(true);
    expect(isEditHistoryPage('/store/lanoguarduk/pages/123456789')).toBe(true);
  });

  it('matches legacy myshopify admin URLs', () => {
    expect(isEditHistoryPage('/admin/products/15568040427904')).toBe(true);
    expect(isEditHistoryPage('/admin/pages/123456789/')).toBe(true);
  });

  it('ignores unsupported admin resources', () => {
    expect(isEditHistoryPage('/store/lanoguarduk/collections/123')).toBe(false);
    expect(isEditHistoryPage('/store/lanoguarduk/articles/123')).toBe(false);
    expect(isEditHistoryPage('/store/lanoguarduk/themes')).toBe(false);
  });
});

describe('getEventsUrl', () => {
  it('appends events.json to the current resource path', () => {
    expect(getEventsUrl('/store/demo/products/123', 'https://admin.shopify.com')).toBe(
      'https://admin.shopify.com/store/demo/products/123/events.json'
    );
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
});

describe('formatEventClockTime', () => {
  it('formats a valid event timestamp as HH:MM:SS', () => {
    const event = baseEvent({ created_at: '2026-02-19T10:40:57+00:00' });
    expect(formatEventClockTime(event)).toMatch(/^\d{2}:\d{2}:\d{2}$/);
    expect(getEventTimestampMs(event)).not.toBeNull();
  });

  it('reads camelCase createdAt when created_at is missing', () => {
    const event = {
      author: 'Liz Ayers',
      createdAt: '2026-02-19T17:46:30+00:00'
    };

    expect(formatEventClockTime(event)).toMatch(/^\d{2}:\d{2}:\d{2}$/);
  });
});

describe('groupEditEvents', () => {
  it('preserves shopify event order for same-timestamp events', () => {
    const grouped = groupEditEvents([
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
    const grouped = groupEditEvents([
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
    const grouped = groupEditEvents([
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
    const grouped = groupEditEvents([
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
    const grouped = groupEditEvents([
      salesChannelEvent('Shop', '2026-02-19T21:29:54+00:00', 1),
      salesChannelEvent('Buy Button', '2026-02-19T21:29:55+00:00', 2)
    ]);

    expect(grouped).toHaveLength(2);
    expect(grouped[0].kind).toBe('single');
    expect(grouped[1].kind).toBe('single');
  });

  it('keeps single market publish events ungrouped', () => {
    const grouped = groupEditEvents([marketEvent('Eurozone', '2026-02-19T10:40:59+00:00', 1)]);
    expect(grouped).toHaveLength(1);
    expect(grouped[0].kind).toBe('single');
  });
});

describe('isSalesChannelUnpublishEvent', () => {
  it('detects sales channel unpublish rows from description text', () => {
    expect(isSalesChannelUnpublishEvent(salesChannelUnpublishEvent('TikTok', '2026-02-19T21:29:57+00:00', 1))).toBe(
      true
    );
    expect(isSalesChannelUnpublishEvent(salesChannelEvent('Shop', '2026-02-19T21:29:54+00:00', 1))).toBe(false);
  });
});

describe('extractSalesChannelUnpublishTarget', () => {
  it('pulls the sales channel label without the product title suffix', () => {
    expect(
      extractSalesChannelUnpublishTarget(salesChannelUnpublishEvent('Google & YouTube', '2026-02-19T21:29:57+00:00', 1))
    ).toBe('Google & YouTube');
    expect(
      extractSalesChannelUnpublishTarget(
        salesChannelUnpublishEvent('Microsoft Channel', '2026-02-19T21:29:57+00:00', 2)
      )
    ).toBe('Microsoft Channel');
  });
});

describe('isSalesChannelPublishEvent', () => {
  it('detects sales channel publish rows from description text', () => {
    expect(isSalesChannelPublishEvent(salesChannelEvent('Shop', '2026-02-19T21:29:54+00:00', 1))).toBe(true);
    expect(isSalesChannelPublishEvent(marketEvent('Eurozone', '2026-02-19T10:40:59+00:00', 1))).toBe(false);
  });
});

describe('extractSalesChannelName', () => {
  it('pulls the sales channel label from the event description', () => {
    expect(extractSalesChannelName(salesChannelEvent('Point of Sale', '2026-02-19T21:29:54+00:00', 1))).toBe(
      'Point of Sale'
    );
  });
});

describe('isMarketPublishEvent', () => {
  it('detects market publish rows from description text', () => {
    expect(isMarketPublishEvent(marketEvent('Eurozone', '2026-02-19T10:40:59+00:00', 1))).toBe(true);
    expect(isMarketPublishEvent(baseEvent({ verb: 'published', description: 'Product published.' }))).toBe(false);
  });
});

describe('extractMarketName', () => {
  it('pulls the market label from the event description', () => {
    expect(extractMarketName(marketEvent('Eurozone', '2026-02-19T10:40:59+00:00', 1))).toBe('Eurozone');
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

  it('rewrites create descriptions', () => {
    expect(formatEventDescription('Jenny Hopper created a new product: Lanoguard Pro Cleaning Bundle.')).toBe(
      'Jenny Hopper created the product'
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
});

describe('formatMarketList', () => {
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

describe('isShopifyAuthor', () => {
  it('detects Shopify system events', () => {
    expect(isShopifyAuthor('Shopify')).toBe(true);
    expect(isShopifyAuthor(' shopify ')).toBe(true);
    expect(isShopifyAuthor('Jenny Hopper')).toBe(false);
  });
});

describe('formatVerbLabel', () => {
  it('formats known verbs', () => {
    expect(formatVerbLabel('unpublished')).toBe('Unpublished');
    expect(formatVerbLabel('status_changed')).toBe('Status changed');
    expect(formatVerbLabel('create')).toBe('Created');
  });

  it('title-cases unknown snake_case verbs', () => {
    expect(formatVerbLabel('some_custom_verb')).toBe('Some Custom Verb');
  });
});

describe('getVerbBadgeClass', () => {
  it('strips underscores for css class names', () => {
    expect(getVerbBadgeClass('status_changed')).toBe('alfred-edit-history__badge--statuschanged');
    expect(getVerbBadgeClass('unpublished')).toBe('alfred-edit-history__badge--unpublished');
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

  it('returns null for non-update events', () => {
    expect(getEventDetail(baseEvent({ verb: 'create' }))).toBeNull();
  });
});
