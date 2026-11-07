import { afterAll, afterEach, beforeAll, describe, expect, test } from 'bun:test';
import { DOMParser } from 'linkedom';
import {
  ago,
  apiCalendar,
  FEEDS,
  fetchStories,
  frameUrl,
  matches,
  parseFeed,
  summarize,
  upNext,
  videoThumb,
  type Story
} from '../feed';

const realDOMParser = globalThis.DOMParser;
const realFetch = globalThis.fetch;
beforeAll(() => {
  globalThis.DOMParser = DOMParser as unknown as typeof globalThis.DOMParser;
});
afterEach(() => {
  globalThis.fetch = realFetch;
});
afterAll(() => {
  globalThis.DOMParser = realDOMParser;
});

const item = (title: string, categories: string[], description: string, date = 'Thu, 01 Oct 2026 17:30:00 +0000') => `
  <item>
    <title>${title}</title>
    <description><![CDATA[${description}]]></description>
    <pubDate>${date}</pubDate>
    ${categories.map((c) => `<category>${c}</category>`).join('')}
    <link>https://example.com/${encodeURIComponent(title)}</link>
  </item>`;
const rss = (...items: string[]) => `<rss version="2.0"><channel>${items.join('')}</channel></rss>`;

const story = (over: Partial<Story>): Story => ({
  id: 'a',
  kind: 'dev',
  topic: 'API',
  title: 'A',
  link: 'https://shopify.dev/changelog/a',
  date: '2026-10-01T00:00:00.000Z',
  ...over
});

describe('ago', () => {
  const now = +new Date('2026-10-03T12:00:00Z');
  const cases: [string, string][] = [
    ['2026-10-03T12:00:00Z', '1m ago'],
    ['2026-10-03T11:15:00Z', '45m ago'],
    ['2026-10-03T07:00:00Z', '5h ago'],
    ['2026-09-30T12:00:00Z', '3d ago'],
    ['2026-09-19T12:00:00Z', '2w ago'],
    ['2026-08-01T12:00:00Z', 'Aug 1'],
    ['2025-08-01T12:00:00Z', 'Aug 1, 2025']
  ];
  test.each(cases)('%s -> %s', (date, expected) => {
    expect(ago(date, now)).toBe(expected);
  });
});

describe('parseFeed', () => {
  test('shopify.dev: narrowest area as topic, Action Required as kicker, code in backticks', () => {
    const [s] = parseFeed(
      rss(
        item(
          'Rollouts',
          ['Action Required', 'API', 'Breaking API Change', 'Admin GraphQL API', '2027-01'],
          '<h2>Summary</h2><p>Use <code>rollouts</code><br>now.</p>'
        )
      ),
      'dev'
    );
    expect(s).toEqual({
      id: 'https://example.com/Rollouts',
      kind: 'dev',
      topic: 'Admin API',
      kicker: 'Action required',
      title: 'Rollouts',
      dek: 'Use `rollouts` now.',
      link: 'https://example.com/Rollouts',
      date: '2026-10-01T17:30:00.000Z',
      version: '2027-01'
    });
  });

  test('changelog.shopify.com: tidies category names and skips interest-based finance', () => {
    const stories = parseFeed(
      rss(item('POS', ['Pos'], '<p>a</p>'), item('Capital', ['Shopify capital'], '<p>b</p>'), item('Bare', [], '')),
      'platform'
    );
    expect(stories.map((s) => [s.title, s.topic, s.dek])).toEqual([
      ['POS', 'POS', 'a'],
      ['Bare', 'Shopify', '']
    ]);
  });

  test('cuts long text at a word and drops a backtick the cut leaves open', () => {
    const [s] = parseFeed(
      rss(item('Long', ['API'], `<p>${'word '.repeat(54)}<code>x y z w v u</code> end</p>`)),
      'dev'
    );
    expect(s!.dek).toBe(`${'word '.repeat(54)}x y z w v…`);
  });
});

describe('apiCalendar', () => {
  const at = (iso: string) => {
    const c = apiCalendar(+new Date(iso));
    return [c.stable, c.next, new Date(c.nextAt).toISOString(), c.retiring, new Date(c.retiringAt).toISOString()];
  };

  test("early in a quarter, last year's version still has days left", () => {
    expect(at('2026-10-06T12:00:00Z')).toEqual([
      '2026-10',
      '2027-01',
      '2027-01-01T17:00:00.000Z',
      '2025-10',
      '2026-10-16T15:00:00.000Z'
    ]);
  });

  test('once it goes, the next to retire is the one the coming release replaces', () => {
    expect(at('2026-10-20T00:00:00Z').slice(3)).toEqual(['2026-01', '2027-01-16T15:00:00.000Z']);
  });

  test('a version counts as released only from 5pm UTC on its day', () => {
    expect(at('2027-01-01T16:59:00Z').slice(0, 2)).toEqual(['2026-10', '2027-01']);
    expect(at('2027-01-01T17:00:00Z').slice(0, 2)).toEqual(['2027-01', '2027-04']);
  });
});

test("summarize counts a feed's last 30 days and ranks its topics", () => {
  const now = +new Date('2026-10-06T00:00:00Z');
  const stories = [
    story({ id: '1', topic: 'Admin API', kicker: 'Action required', date: '2026-10-05T00:00:00Z' }),
    story({ id: '2', topic: 'Admin API', date: '2026-10-01T00:00:00Z' }),
    story({ id: '3', topic: 'Functions', date: '2026-09-20T00:00:00Z' }),
    story({ id: '4', topic: 'Themes', date: '2026-08-01T00:00:00Z' }),
    story({ id: '5', kind: 'platform', topic: 'POS', date: '2026-10-05T00:00:00Z' })
  ];
  expect(summarize(stories, 'dev', now)).toEqual({ posts: 3, action: 1, topics: ['Admin API', 'Functions'] });
});

test('matches wants every word, in any case, across title, summary and topic', () => {
  const s = story({ title: 'Discounts in Rollouts', dek: 'Read `Discount.rollouts` now.', topic: 'Admin API' });
  expect(matches(s, 'rollouts admin')).toBe(true);
  expect(matches(s, ' DISCOUNT.rollouts ')).toBe(true);
  expect(matches(s, 'rollouts checkout')).toBe(false);
});

describe('fetchStories', () => {
  const serve = (bodies: Record<string, string | null>) => {
    globalThis.fetch = (async (url: string) =>
      bodies[url] == null ? new Response('', { status: 503 }) : new Response(bodies[url])) as typeof fetch;
  };
  const [platform, dev] = FEEDS.map((f) => f.url) as [string, string];

  test('merges both feeds newest first', async () => {
    serve({
      [platform]: rss(item('P', ['Admin'], '', 'Fri, 02 Oct 2026 10:00:00 +0000')),
      [dev]: rss(item('D', ['API'], '', 'Thu, 01 Oct 2026 10:00:00 +0000'))
    });
    expect((await fetchStories([], () => false)).map((s) => s.title)).toEqual(['P', 'D']);
  });

  test('a failed feed keeps its earlier stories, and kept stories outlive the feed', async () => {
    serve({ [platform]: null, [dev]: rss(item('New', ['API'], '')) });
    const prev = [
      story({ id: 'p', kind: 'platform', date: '2026-09-01T00:00:00.000Z' }),
      story({ id: 'gone', date: '2026-08-01T00:00:00.000Z' }),
      story({ id: 'saved', date: '2026-07-01T00:00:00.000Z' })
    ];
    const ids = (await fetchStories(prev, (s) => s.id === 'saved')).map((s) => s.id);
    expect(ids).toEqual(['https://example.com/New', 'p', 'saved']);
  });

  test('throws when every feed fails', async () => {
    serve({});
    await expect(fetchStories([story({})], () => true)).rejects.toThrow('answered 503');
  });
});

test('frameUrl embeds videos and frames everything else as is', () => {
  expect(frameUrl(story({ kind: 'video', link: 'https://www.youtube.com/watch?v=abc123' }))).toBe(
    'https://www.youtube.com/embed/abc123?rel=0'
  );
  expect(frameUrl(story({}))).toBe('https://shopify.dev/changelog/a');
});

test('videoThumb builds a thumbnail URL from the video link', () => {
  const video = story({ link: 'https://www.youtube.com/watch?v=abc123' });
  expect(videoThumb(video, 'hqdefault')).toBe('https://i.ytimg.com/vi/abc123/hqdefault.jpg');
});

test('upNext lists every other video, same channel first', () => {
  const [a, b, c, d] = (['A', 'B', 'A', 'A'] as const).map((channel, i) =>
    story({ id: String(i), kind: 'video', channel })
  );
  expect(upNext([a!, b!, c!, d!], c!)).toEqual([a!, d!, b!]);
});
