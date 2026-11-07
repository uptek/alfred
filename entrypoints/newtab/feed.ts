export type Kind = 'platform' | 'dev' | 'video';

export interface Story {
  id: string;
  kind: Kind;
  topic: string;
  kicker?: string;
  title: string;
  dek?: string;
  link: string;
  date: string;
  /** The API version a shopify.dev post ships in. */
  version?: string;
  thumb?: string;
  channel?: string;
}

export type Theme = 'system' | 'light' | 'dark';

/** What the page keeps in extension storage, read by index.ts before it mounts. Null when never saved. */
export interface Stored {
  theme: Theme | null;
  sidebar: boolean | null;
  saved: string[] | null;
  feed: { at: number; stories: Story[] } | null;
}

// Videos are hidden for v1 and have no source yet. Set to true to bring back the Videos section, the rail card and videos in the feed.
export const SHOW_VIDEOS = false;

/** The changelogs behind the feed. Alfred's host permissions let its pages fetch them cross-origin. */
export const FEEDS = [
  {
    kind: 'platform',
    url: 'https://changelog.shopify.com/feed.xml',
    site: 'https://changelog.shopify.com/',
    title: 'Shopify Changelog',
    about: "Shopify's log of what's new for merchants: the admin, checkout, POS, markets, shipping and more."
  },
  {
    kind: 'dev',
    url: 'https://shopify.dev/changelog/feed.xml',
    site: 'https://shopify.dev/changelog',
    title: 'Developer changelog',
    about:
      "Changes to Shopify's APIs and developer tools, including the deprecations and breaking changes apps have to act on."
  }
] as const;

export const newestFirst = (a: Story, b: Story) => +new Date(b.date) - +new Date(a.date);

const favicon = (domain: string) => `https://www.google.com/s2/favicons?domain=${domain}&sz=64`;

/** Publisher shown in a story's footer. */
export const SOURCES: Record<Kind, { name: string; fav: string }> = {
  platform: { name: 'Shopify', fav: favicon('shopify.com') },
  dev: { name: 'shopify.dev', fav: favicon('shopify.dev') },
  video: { name: 'YouTube', fav: favicon('youtube.com') }
};

export const NAV = (
  [
    { id: 'home', label: 'Home', emoji: '🏠' },
    { id: 'platform', label: 'Platform updates', emoji: '🛍️' },
    { id: 'dev', label: 'Developer updates', emoji: '🧩' },
    { id: 'video', label: 'Videos', emoji: '📹' },
    { id: 'saved', label: 'Saved', emoji: '🔖' }
  ] as const
).filter((n) => SHOW_VIDEOS || n.id !== 'video');

export type Filter = (typeof NAV)[number]['id'];

// Posts about Shopify Capital, Shopify Credit and Balance stay out of the feed: they promote interest-based finance.
const SKIP = new Set(['Shopify capital', 'Shopify-credit', 'Balance']);
// shopify.dev labels that say what kind of change a post is, not what it touches.
const META = new Set(['New', 'Update', 'Action Required', 'Breaking API Change', 'Deprecation announcement']);
// Broad areas, shown only when a post names nothing narrower.
const BROAD = new Set(['API', 'Platform', 'Tools']);
const RENAME: Record<string, string> = {
  'Admin GraphQL API': 'Admin API',
  'Admin REST API': 'Admin API',
  'App store': 'App Store',
  'Shopify CLI': 'CLI',
  Pos: 'POS',
  B2b: 'B2B',
  'Customer-account': 'Customer Accounts',
  'Online store': 'Online Store',
  'Help-center': 'Help Center',
  'Shopify fulfillment network': 'Shopify Fulfillment Network'
};

const VERSION = /^\d{4}-\d{2}$/;

function topicOf(categories: string[]) {
  const areas = categories.filter((c) => !META.has(c) && !VERSION.test(c)).map((c) => RENAME[c] ?? c);
  return areas.find((c) => !BROAD.has(c)) ?? areas[0] ?? 'Shopify';
}

const DEK = 280;

/** A post's paragraphs as plain text, with code in backticks for `rich`, cut at a word near `DEK` characters. */
function dekOf(html: string) {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  for (const br of doc.querySelectorAll('br')) br.replaceWith(' ');
  for (const code of doc.querySelectorAll('code')) code.textContent = '`' + code.textContent + '`';
  const text = [...doc.querySelectorAll('p')]
    .map((p) => p.textContent)
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (text.length <= DEK) return text;
  const dek = text.slice(0, text.lastIndexOf(' ', DEK)) + '…';
  // A cut through a code span leaves its opening backtick unmatched.
  return dek.split('`').length % 2 ? dek : dek.replace(/`([^`]*)$/, '$1');
}

/** Stories from one changelog's RSS, in feed order. */
export function parseFeed(xml: string, kind: (typeof FEEDS)[number]['kind']): Story[] {
  const doc = new DOMParser().parseFromString(xml, 'text/xml');
  return [...doc.querySelectorAll('item')].flatMap((item) => {
    const text = (tag: string) => item.querySelector(tag)?.textContent?.trim() ?? '';
    const categories = [...item.querySelectorAll('category')].map((c) => c.textContent?.trim() ?? '');
    const link = text('link');
    if (!link || categories.some((c) => SKIP.has(c))) return [];
    const story: Story = {
      id: link,
      kind,
      topic: topicOf(categories),
      title: text('title'),
      dek: dekOf(text('description')),
      link,
      date: new Date(text('pubDate')).toISOString()
    };
    if (categories.includes('Action Required')) story.kicker = 'Action required';
    const version = categories.find((c) => VERSION.test(c));
    if (version) story.version = version;
    return story;
  });
}

/**
 * Both changelogs, newest first. A feed that fails keeps its stories from `prev`, and `keep` holds on to stories a
 * feed no longer lists. Throws only when every feed fails.
 */
export async function fetchStories(prev: Story[], keep: (s: Story) => boolean) {
  const results = await Promise.allSettled(
    FEEDS.map(async ({ kind, url }) => {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`${url} answered ${res.status}`);
      return parseFeed(await res.text(), kind);
    })
  );
  const failed = results.filter((r) => r.status === 'rejected');
  if (failed.length === results.length) throw failed[0]!.reason;
  const fresh = results.flatMap((r, i) =>
    r.status === 'fulfilled' ? r.value : prev.filter((s) => s.kind === FEEDS[i]!.kind)
  );
  const ids = new Set(fresh.map((s) => s.id));
  return [...fresh, ...prev.filter((s) => keep(s) && !ids.has(s.id))].sort(newestFirst);
}

const TOPIC_EMOJI: Record<string, string> = {
  Themes: '🖌️',
  Functions: '⚡',
  Polaris: '🎨',
  'App Store': '🛍️',
  'Admin API': '🧩',
  API: '🧩',
  Hydrogen: '💧',
  Video: '📹',
  Tools: '🧰',
  CLI: '🧰',
  'Built for Shopify': '🏅',
  Platform: '🧩',
  Liquid: '💧',
  'AI Toolkit': '🤖',
  'Dev Dashboard': '🛠️',
  'Checkout UI': '🛒',
  'POS Extensions': '🧾',
  Catalog: '🗂️',
  'Payments Apps API': '💳',
  UCP: '🤖',
  'Events & webhooks': '🔔',
  'Storefront API': '🏬',
  'Customer Account API': '👤',
  'Customer Accounts': '👤',
  'Admin Extensions': '🧩',
  'App Bridge': '🌉',
  'Shop Minis': '🛍️',
  'Shopify Theme Store': '🖌️',
  ShopifyQL: '📊',
  'Metafields and metaobjects': '🗃️',
  Admin: '🏪',
  POS: '🧾',
  Apps: '🧩',
  Markets: '🌍',
  Analytics: '📊',
  Payments: '💳',
  Plus: '🏢',
  Checkout: '🛒',
  Shipping: '🚚',
  Orders: '📋',
  Products: '🏷️',
  'Online Store': '🖥️',
  Marketing: '📣',
  Mobile: '📱',
  Collective: '🤝',
  Shop: '🛍️',
  Sidekick: '🤖',
  Customers: '👥',
  Channels: '📡',
  Inventory: '📦',
  B2B: '🏢',
  Collabs: '🤝',
  Discounts: '🎟️',
  Billing: '🧾',
  Partners: '🤝',
  'Custom storefronts': '💧',
  'Shopify Fulfillment Network': '🚚',
  'Help Center': '❓',
  Shopify: '🛍️'
};

export const topicEmoji = (topic: string) => TOPIC_EMOJI[topic] ?? '💬';

const MONTH = 30 * 864e5;

/** A feed's last 30 days: how many posts, how many need action, and its three busiest topics. */
export function summarize(stories: Story[], kind: Kind, now = Date.now()) {
  const recent = stories.filter((s) => s.kind === kind && now - +new Date(s.date) < MONTH);
  const counts = new Map<string, number>();
  for (const s of recent) counts.set(s.topic, (counts.get(s.topic) ?? 0) + 1);
  return {
    posts: recent.length,
    action: recent.filter((s) => s.kicker).length,
    topics: [...counts]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([topic]) => topic)
  };
}

// API versions counted in quarters since year 0: version k ships at 5pm UTC on the first day of its quarter, and
// stays reachable until 15:00 UTC on the 16th of the month it turns a year old (shopify.dev/docs/api/usage/versioning).
const releaseOf = (k: number) => Date.UTC(Math.floor(k / 4), (k % 4) * 3, 1, 17);
const endOf = (k: number) => Date.UTC(Math.floor(k / 4) + 1, (k % 4) * 3, 16, 15);
const nameOf = (k: number) => `${Math.floor(k / 4)}-${String((k % 4) * 3 + 1).padStart(2, '0')}`;

/** Where Shopify's API release calendar stands at `now`. `retiring` is the next version to stop answering. */
export function apiCalendar(now = Date.now()) {
  const d = new Date(now);
  let stable = d.getUTCFullYear() * 4 + Math.floor(d.getUTCMonth() / 3);
  if (releaseOf(stable) > now) stable--;
  const retiring = endOf(stable - 4) > now ? stable - 4 : stable - 3;
  return {
    stable: nameOf(stable),
    next: nameOf(stable + 1),
    nextAt: releaseOf(stable + 1),
    progress: (now - releaseOf(stable)) / (releaseOf(stable + 1) - releaseOf(stable)),
    retiring: nameOf(retiring),
    retiringAt: endOf(retiring)
  };
}

export function ago(date: string | number, now = Date.now()) {
  const minutes = Math.max(1, Math.round((now - +new Date(date)) / 6e4));
  if (minutes < 60) return minutes + 'm ago';
  const hours = Math.round(minutes / 60);
  if (hours < 24) return hours + 'h ago';
  const days = Math.round(hours / 24);
  if (days < 7) return days + 'd ago';
  if (days < 30) return Math.round(days / 7) + 'w ago';
  const then = new Date(date);
  // Last year's posts and older carry their year.
  const year = then.getFullYear() !== new Date(now).getFullYear() && ({ year: 'numeric' } as const);
  return then.toLocaleDateString('en-US', { month: 'short', day: 'numeric', ...year });
}

const videoId = (s: Story) => new URL(s.link).searchParams.get('v');

/** What gets framed for a story: the page itself, or the embed player for videos. */
export const frameUrl = (s: Story) =>
  s.kind === 'video' ? `https://www.youtube.com/embed/${videoId(s)}?rel=0` : s.link;

/** Videos, newest first. Empty until videos have a source. */
export const VIDEOS: Story[] = [];

/** A video's thumbnail at one of YouTube's sizes: 320px, 480px, or full resolution (missing for some videos). */
export const videoThumb = (s: Story, size: 'mqdefault' | 'hqdefault' | 'maxresdefault') =>
  `https://i.ytimg.com/vi/${videoId(s)}/${size}.jpg`;

/** Every other video, the given one's channel first. */
export const upNext = (videos: Story[], now: Story) => [
  ...videos.filter((s) => s !== now && s.channel === now.channel),
  ...videos.filter((s) => s.channel !== now.channel)
];

/** Whether a story holds every word of `query`, in its title, summary or topic. */
export function matches(s: Story, query: string) {
  const text = `${s.title} ${s.dek ?? ''} ${s.topic}`.toLowerCase();
  return query
    .toLowerCase()
    .split(/\s+/)
    .every((word) => text.includes(word));
}

export const STATUS_PAGE = 'https://www.shopifystatus.com/';

/** The parts of Statuspage's summary the status card shows. */
export interface ShopifyStatus {
  status: { indicator: 'none' | 'minor' | 'major' | 'critical' | 'maintenance'; description: string };
  components: {
    id: string;
    name: string;
    status: 'operational' | 'degraded_performance' | 'partial_outage' | 'major_outage' | 'under_maintenance';
  }[];
  incidents: { id: string; name: string; status: string; shortlink: string; updated_at: string }[];
  scheduled_maintenances: { id: string; name: string; shortlink: string; scheduled_for: string }[];
}

/** Shopify's live status. Small and cached for only 10 seconds, so every new tab asks again. */
export async function fetchStatus(): Promise<ShopifyStatus> {
  const res = await fetch(STATUS_PAGE + 'api/v2/summary.json');
  if (!res.ok) throw new Error(`Shopify status answered ${res.status}`);
  return res.json();
}
