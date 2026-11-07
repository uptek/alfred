<script lang="ts">
  import type { Stored, Story, Theme } from './feed';
  import { tick, untrack } from 'svelte';
  import { setItem } from '~/utils/storage';
  import { SvelteSet } from 'svelte/reactivity';
  import {
    ago,
    apiCalendar,
    FEEDS,
    fetchStatus,
    fetchStories,
    frameUrl,
    matches,
    NAV,
    newestFirst,
    SHOW_VIDEOS,
    SOURCES,
    STATUS_PAGE,
    summarize,
    topicEmoji,
    upNext,
    VIDEOS,
    videoThumb,
    type Filter,
    type ShopifyStatus
  } from './feed';
  import { allowFrames } from './frames';

  const PAGE = 30;
  // The feeds' own RSS ttl is 40 minutes.
  const FRESH_FOR = 30 * 6e4;
  const PHONE_WIDTH = 860;
  // Windows reserves Win+B, so the sidebar shortcut is Ctrl+B off Mac.
  const SIDEBAR_KEY = /Mac/.test(navigator.platform) ? '⌘B' : 'Ctrl+B';
  const NEXT_THEME: Record<Theme, Theme> = { system: 'light', light: 'dark', dark: 'system' };

  // Inner markup of 20x20 icons, rendered by the `icon` snippet. Most are Polaris icons (MIT) to match Shopify admin.
  // Polaris has no bookmark or sidebar toggle, so `save` and `side` are drawn on its grid with its 1.5 stroke.
  const ICONS = {
    save: '<path d="M7.75 4.25h4.5a2 2 0 0 1 2 2v9.5l-4.25-3-4.25 3v-9.5a2 2 0 0 1 2-2z" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/>',
    side: '<g fill="none" stroke="currentColor" stroke-width="1.5"><rect x="3.75" y="4.25" width="12.5" height="11.5" rx="2.25"/><path d="M8.25 4.25v11.5"/></g>',
    search:
      '<path fill-rule="evenodd" d="M12.323 13.383a5.5 5.5 0 1 1 1.06-1.06l2.897 2.897a.75.75 0 1 1-1.06 1.06l-2.897-2.897Zm.677-4.383a4 4 0 1 1-8 0 4 4 0 0 1 8 0Z"/>',
    back: '<path fill-rule="evenodd" d="M16.5 10a.75.75 0 0 1-.75.75h-9.69l2.72 2.72a.75.75 0 0 1-1.06 1.06l-4-4a.75.75 0 0 1 0-1.06l4-4a.75.75 0 1 1 1.06 1.06l-2.72 2.72h9.69a.75.75 0 0 1 .75.75Z"/>',
    out: '<path d="M11.75 3.5a.75.75 0 0 0 0 1.5h2.19l-4.97 4.97a.75.75 0 1 0 1.06 1.06l4.97-4.97v2.19a.75.75 0 0 0 1.5 0v-4a.75.75 0 0 0-.75-.75h-4Z"/><path d="M15 10.967a.75.75 0 0 0-1.5 0v2.783c0 .69-.56 1.25-1.25 1.25h-6c-.69 0-1.25-.56-1.25-1.25v-6c0-.69.56-1.25 1.25-1.25h2.783a.75.75 0 0 0 0-1.5h-2.783a2.75 2.75 0 0 0-2.75 2.75v6a2.75 2.75 0 0 0 2.75 2.75h6a2.75 2.75 0 0 0 2.75-2.75v-2.783Z"/>',
    play: '<path fill-rule="evenodd" d="M15.375 8.485c1.167.674 1.167 2.358 0 3.031l-7.5 4.33c-1.167.674-2.625-.168-2.625-1.515v-8.66c0-1.348 1.458-2.19 2.625-1.516l7.5 4.33Zm-.75 1.732a.25.25 0 0 0 0-.433l-7.5-4.33a.25.25 0 0 0-.375.217v8.66a.25.25 0 0 0 .375.216l7.5-4.33Z"/>',
    light:
      '<path d="M10 2a.75.75 0 0 1 .75.75v1.5a.75.75 0 0 1-1.5 0v-1.5a.75.75 0 0 1 .75-.75Z"/><path fill-rule="evenodd" d="M6.25 10a3.75 3.75 0 1 1 7.5 0 3.75 3.75 0 0 1-7.5 0Zm3.75-2.25a2.25 2.25 0 1 0 0 4.5 2.25 2.25 0 0 0 0-4.5Z"/><path d="M10.75 15.75a.75.75 0 0 0-1.5 0v1.5a.75.75 0 0 0 1.5 0v-1.5Zm-8.75-6a.75.75 0 0 1 .75-.75h1.5a.75.75 0 0 1 0 1.5h-1.5a.75.75 0 0 1-.75-.75Zm13.75-.75a.75.75 0 0 0 0 1.5h1.5a.75.75 0 0 0 0-1.5h-1.5Zm-11.23-4.834a.75.75 0 0 1 1.061 0l1.06 1.061a.75.75 0 0 1-1.06 1.06l-1.06-1.06a.75.75 0 0 1 0-1.06Zm10.253 9.193a.75.75 0 1 0-1.061 1.06l1.06 1.061a.75.75 0 0 0 1.061-1.06l-1.06-1.061Zm-10.606 2.121a.75.75 0 0 1 0-1.06l1.06-1.061a.75.75 0 1 1 1.061 1.06l-1.06 1.06a.75.75 0 0 1-1.061 0Zm9.191-10.253a.75.75 0 0 0 1.061 1.06l1.06-1.06a.75.75 0 1 0-1.06-1.06l-1.06 1.06Z"/>',
    dark: '<path d="M9.636 3.191a.75.75 0 0 1 .104.787 5.5 5.5 0 0 0 6.28 7.625.75.75 0 0 1 .856 1.04 7.001 7.001 0 1 1-7.992-9.705.75.75 0 0 1 .752.253Zm-1.759 1.723a5.5 5.5 0 1 0 6.866 8.336 7 7 0 0 1-6.866-8.336Z"/>',
    system:
      '<path fill-rule="evenodd" d="M3.5 6.25a2.75 2.75 0 0 1 2.75-2.75h7.5a2.75 2.75 0 0 1 2.75 2.75v4.5a2.75 2.75 0 0 1-2.75 2.75h-1.25v1.5h.75a.75.75 0 0 1 0 1.5h-6.5a.75.75 0 0 1 0-1.5h.75v-1.5h-1.25a2.75 2.75 0 0 1-2.75-2.75v-4.5Zm5.5 7.25h2v1.5h-2v-1.5Zm-2.75-8.5c-.69 0-1.25.56-1.25 1.25v3.25h10v-3.25c0-.69-.56-1.25-1.25-1.25h-7.5Zm8.725 6c-.116.57-.62 1-1.225 1h-7.5a1.25 1.25 0 0 1-1.225-1h9.95Z"/>'
  };

  const props: { stored: Stored } = $props();
  // Storage only seeds the state: from here on the page owns it and writes changes back.
  const stored = untrack(() => props.stored);

  function save(key: keyof Stored, value: unknown) {
    // A failed write (storage full) still leaves the choice in place for this tab.
    setItem('newtab:' + key, value).catch(() => {});
  }

  let view = $state<'index' | 'reader'>('index');
  let filter = $state<Filter>('home');
  let theme = $state(stored.theme ?? 'system');
  let sidebar = $state(stored.sidebar ?? true);
  let selectedId = $state<string | null>(null);
  // On phones the reader shows either the list or the open story.
  let detailOpen = $state(false);
  let pages = $state(1);
  const saved = new SvelteSet(stored.saved ?? []);

  // Raw: the feed is replaced whole and never mutated, so thousands of stories skip deep proxying.
  const cached = stored.feed ?? { at: 0, stories: [] };
  let feed = $state.raw(cached);
  let loading = $state(false);
  let failed = $state(false);
  const stories = $derived(SHOW_VIDEOS ? [...feed.stories, ...VIDEOS].sort(newestFirst) : feed.stories);
  const savedCount = $derived(stories.filter((s) => saved.has(s.id)).length);

  /** Fetches both changelogs. Saved stories stay even once a feed stops listing them. */
  async function refresh() {
    loading = true;
    failed = false;
    try {
      feed = { at: Date.now(), stories: await fetchStories(feed.stories, (s) => saved.has(s.id)) };
      save('feed', feed);
    } catch {
      failed = true;
    } finally {
      loading = false;
    }
  }
  if (Date.now() - cached.at > FRESH_FOR) void refresh();

  // Home searches every story. The query carries into the reader, so J and K step through the results.
  let query = $state('');
  let searchEl = $state<HTMLInputElement>();
  const searching = $derived(query.trim());

  // Status is never cached: a stale "all clear" would mislead.
  let status = $state.raw<ShopifyStatus | null>(null);
  let statusFailed = $state(false);
  fetchStatus().then(
    (s) => (status = s),
    () => (statusFailed = true)
  );

  // Nothing is framed until the rules that make framing work are in place.
  let framesAllowed = $state(false);
  void allowFrames()
    .catch(() => {})
    .finally(() => (framesAllowed = true));

  const list = $derived(
    stories.filter(
      (s) =>
        (filter === 'home' ? !searching || matches(s, searching) : filter === 'saved' ? saved.has(s.id) : s.kind === filter)
    )
  );
  const shown = $derived(list.slice(0, PAGE * pages));
  const selected = $derived(list.find((s) => s.id === selectedId) ?? list[0]);
  const section = $derived(NAV.find((n) => n.id === filter)!);

  // Videos get a gallery and a watch page of their own instead of the feed and the reader.
  const CHANNELS = [...new Set(VIDEOS.map((s) => s.channel!))];
  let channel = $state<string | null>(null);
  let watchId = $state<string | null>(null);
  // The card whose thumbnail grows into the player, and that the player shrinks back into.
  let morphId = $state<string | null>(null);
  // Where the gallery was scrolled when a video opened, restored on the way back.
  let galleryY = 0;
  const watching = $derived(VIDEOS.find((s) => s.id === watchId));
  const gallery = $derived(watching ? upNext(VIDEOS, watching) : VIDEOS.filter((s) => !channel || s.channel === channel));

  $effect(() => {
    if (theme === 'system') delete document.documentElement.dataset.theme;
    else document.documentElement.dataset.theme = theme;
  });

  const rowOf = (id = '') => document.querySelector<HTMLElement>(`.st[data-id="${id}"]`);

  $effect(() => {
    if (view === 'reader' && selected) rowOf(selected.id)?.scrollIntoView({ block: 'nearest' });
  });

  /** Text split on `code` spans: odd parts are code. */
  const rich = (text: string) => text.split(/`([^`]+)`/);
  const hostname = (url: string) => new URL(url).hostname.replace(/^www\./, '');
  const LIST = new Intl.ListFormat('en');
  const day = (t: number) => new Date(t).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  function daysUntil(t: number) {
    const days = Math.ceil((t - Date.now()) / 864e5);
    return days === 1 ? '1 day' : days + ' days';
  }
  // A broken image leaves its fallback (the initial, or no thumbnail) in place.
  const drop = (e: Event) => (e.currentTarget as Element).remove();
  // YouTube answers a missing full-resolution thumbnail with a 120px placeholder, so the fallback goes by size.
  function sharpest(e: Event, s: Story) {
    const img = e.currentTarget as HTMLImageElement;
    if (img.naturalWidth < 200) img.src = videoThumb(s, 'hqdefault');
  }

  /**
   * Changes the page as a view transition where the browser has them.
   * `after` runs once the new page is rendered, before the browser captures it. `instant` skips the transition.
   */
  function swap(change: () => void, { after, instant = false }: { after?: () => void; instant?: boolean } = {}) {
    const update = async () => {
      change();
      await tick();
      after?.();
    };
    if (instant || !document.startViewTransition) return update();
    return document.startViewTransition(update).finished;
  }

  async function watch(id: string) {
    if (!watching) galleryY = filter === 'video' ? scrollY : 0;
    morphId = id;
    // The card has to carry the transition name before the page is captured.
    await tick();
    await swap(
      () => {
        filter = 'video';
        watchId = id;
      },
      { after: () => scrollTo(0, 0) }
    );
  }

  async function closeWatch() {
    await swap(
      () => (watchId = null),
      { after: () => scrollTo(0, galleryY) }
    );
    morphId = null;
  }

  /**
   * Opens or closes the story pane, as a crossfade (newtab.css). The story's row keeps its height on screen, so the
   * feed doesn't jump as it changes width. Keyboard actions don't animate.
   */
  function slide(id: string | undefined, type: 'push' | 'pop', change: () => void, instant = false) {
    const from = rowOf(id)?.getBoundingClientRect();
    return swap(change, {
      instant,
      after() {
        const row = rowOf(id);
        // A feed hidden behind the open story on phones has no row to line up.
        if (row?.offsetParent && from?.width) {
          // Clear of the reader's sticky header, which the row's scroll margin covers.
          row.style.scrollMarginTop = `${Math.max(from.top, parseFloat(getComputedStyle(row).scrollMarginTop))}px`;
          row.scrollIntoView({ block: 'start' });
          row.style.scrollMarginTop = '';
        } else {
          row?.scrollIntoView({ block: 'center' });
        }
        // Back at the feed, the story is focused for the keyboard.
        if (type === 'pop') row?.focus({ preventScroll: true });
      }
    });
  }

  function open(id: string, instant = false) {
    if (view === 'index' && VIDEOS.some((s) => s.id === id)) return void watch(id);
    const change = () => {
      if (!list.some((s) => s.id === id)) filter = 'home';
      // A story opened from the rail can sit past the rows shown so far.
      pages = Math.max(pages, Math.ceil((list.findIndex((s) => s.id === id) + 1) / PAGE));
      selectedId = id;
      detailOpen = true;
      view = 'reader';
    };
    // Switching stories while one is already showing leaves the page where it is.
    if (view === 'index' || (!detailOpen && innerWidth <= PHONE_WIDTH)) void slide(id, 'push', change, instant);
    else change();
  }

  const closeReader = (instant = false) => slide(selected?.id, 'pop', () => (view = 'index'), instant);
  const closeDetail = (instant = false) => slide(selected?.id, 'pop', () => (detailOpen = false), instant);

  function setFilter(next: Filter) {
    filter = next;
    query = '';
    if (next === 'video') view = 'index';
    watchId = null;
    selectedId = null;
    detailOpen = false;
    pages = 1;
    scrollTo(0, 0);
  }

  function toggleSaved(id: string) {
    if (!saved.delete(id)) saved.add(id);
    save('saved', [...saved]);
  }

  function toggleSidebar() {
    sidebar = !sidebar;
    save('sidebar', sidebar);
  }

  function cycleTheme() {
    theme = NEXT_THEME[theme];
    save('theme', theme);
  }

  function openOnKey(e: KeyboardEvent, id: string) {
    if (e.target !== e.currentTarget || (e.key !== 'Enter' && e.key !== ' ')) return;
    e.preventDefault();
    open(id, true);
  }

  function onkeydown(e: KeyboardEvent) {
    if ((e.metaKey || e.ctrlKey) && !e.altKey && !e.shiftKey && e.key.toLowerCase() === 'b') {
      e.preventDefault();
      toggleSidebar();
      return;
    }
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    if (view === 'index') {
      if (e.key === 'Escape' && watching) void closeWatch();
      if (e.key === '/' && searchEl && e.target !== searchEl) {
        e.preventDefault();
        searchEl.focus();
      }
    } else if (e.key === 'Escape') {
      if (detailOpen && innerWidth <= PHONE_WIDTH) void closeDetail(true);
      else void closeReader(true);
    } else if (!selected) {
      return;
    } else if (e.key === 'j' || e.key === 'k') {
      const i = Math.min(list.length - 1, Math.max(0, list.indexOf(selected) + (e.key === 'j' ? 1 : -1)));
      if (i >= shown.length) pages++;
      selectedId = list[i]!.id;
    } else if (e.key === 'o') {
      window.open(selected.link, '_blank', 'noopener');
    }
  }
</script>

<svelte:window {onkeydown} />

{#snippet icon(paths: string)}
  <svg viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">{@html paths}</svg>
{/snippet}

{#snippet richText(text: string)}
  {#each rich(text) as part, i}{#if i % 2}<code>{part}</code>{:else}{part}{/if}{/each}
{/snippet}

{#snippet logo()}
  <button class="logo" onclick={() => setFilter('home')}>
    <img src="/icons/128.png" alt="" /><span>alfred.</span>
  </button>
{/snippet}

{#snippet nav(tips = false)}
  {#each NAV as n (n.id)}
    <!-- Feeds wear emoji. Saved is the reader's own list, so it sits apart with an icon. -->
    {#if n.id === 'saved'}<hr class="nav-sep" />{/if}
    <button
      class="nav-i"
      aria-current={filter === n.id ? 'page' : undefined}
      title={tips ? n.label : undefined}
      onclick={() => setFilter(n.id)}>
      <span class="e">{#if n.id === 'saved'}{@render icon(ICONS.save)}{:else}{n.emoji}{/if}</span>
      {n.label}
      {#if n.id === 'saved' && savedCount}<small>{savedCount}</small>{/if}
    </button>
  {/each}
{/snippet}

{#snippet themeButton()}
  {@const label = theme[0]!.toUpperCase() + theme.slice(1)}
  <button class="soft" title="Theme: {label}" aria-label="Theme: {label}" onclick={cycleTheme}>
    {@render icon(ICONS[theme])}<span>{label}</span>
  </button>
{/snippet}

{#snippet mbar()}
  <header class="mbar">
    {@render logo()}
    <nav aria-label="Sections">{@render nav()}</nav>
  </header>
{/snippet}

{#snippet topicLine(s: Story)}
  <div class="st-top">
    <span class="e">{topicEmoji(s.topic)}</span>
    {s.topic}
    {#if s.kicker}<span class="flag attn">· {s.kicker}</span>{/if}
  </div>
{/snippet}

{#snippet foot(s: Story)}
  {@const on = saved.has(s.id)}
  {@const tip = on ? 'Saved' : 'Save'}
  <div class="st-f">
    <button
      class="dig"
      aria-pressed={on}
      title={tip}
      aria-label={tip}
      onclick={(e) => {
        e.stopPropagation();
        toggleSaved(s.id);
      }}>
      <i>{@render icon(ICONS.save)}</i>
    </button>
    <span class="face"><img src={SOURCES[s.kind].fav} alt="" loading="lazy" onerror={drop} /></span>
    <span><b>{s.kind === 'video' ? s.channel : SOURCES[s.kind].name}</b>, {ago(s.date)}</span>
  </div>
{/snippet}

{#snippet listEnd()}
  {#if !list.length}
    <div class="empty">
      <span class="e">{section.emoji}</span>
      {#if filter === 'saved'}
        Nothing saved yet. Hit the bookmark on any story to keep it here.
      {:else if searching && stories.length}
        Nothing matches “{searching}”.
      {:else if loading}
        Fetching the latest from Shopify…
      {:else if failed}
        Couldn't reach Shopify's changelogs.
        <button class="more" onclick={refresh}>Try again</button>
      {:else}
        Nothing here yet.
      {/if}
    </div>
  {:else if list.length > shown.length}
    <button class="more" onclick={() => pages++}>Show {Math.min(PAGE, list.length - shown.length)} more</button>
  {/if}
{/snippet}

{#snippet feedCard(f: (typeof FEEDS)[number])}
  {@const sum = summarize(stories, f.kind)}
  {@const latest = stories.find((s) => s.kind === f.kind)}
  <section class="card">
    <div class="src">
      <img src={SOURCES[f.kind].fav} alt="" onerror={drop} />
      <div>
        <h3>{f.title}</h3>
        <small>{hostname(f.site)}</small>
      </div>
    </div>
    <p class="card-p">{f.about}</p>
    <dl class="stats">
      <div><dt>Last 30 days</dt><dd>{sum.posts} {sum.posts === 1 ? 'post' : 'posts'}</dd></div>
      {#if f.kind === 'dev'}<div><dt>Need action</dt><dd>{sum.action}</dd></div>{/if}
      {#if latest}<div><dt>Latest</dt><dd>{ago(latest.date)}</dd></div>{/if}
    </dl>
    {#if sum.topics.length}<p class="card-p">Mostly about {LIST.format(sum.topics)}.</p>{/if}
    <a class="soft" href={f.site} target="_blank" rel="noopener">{@render icon(ICONS.out)}Open the changelog</a>
  </section>
{/snippet}

{#snippet calendarCard()}
  {@const cal = apiCalendar()}
  {@const shipping = stories.filter((s) => s.version === cal.next)}
  {@const due = shipping.filter((s) => s.kicker).length}
  <section class="card">
    <h3>Next API version</h3>
    <div class="ver"><b>{cal.next}</b><span>in {daysUntil(cal.nextAt)}</span></div>
    <div class="bar"><i style:width="{cal.progress * 100}%"></i></div>
    <p class="card-p">
      Ships {day(cal.nextAt)}. <code>{cal.stable}</code> is the latest stable version.
      {#if shipping.length}
        {shipping.length}
        {shipping.length === 1 ? 'post covers' : 'posts cover'} it so far{#if due}, {due} with action required{/if}.
      {/if}
    </p>
    <p class="card-p">
      Requests to <code>{cal.retiring}</code> fall forward to a newer version in {daysUntil(cal.retiringAt)}, on {day(
        cal.retiringAt
      )}.
    </p>
    <a class="soft" href="https://shopify.dev/docs/api/usage/versioning" target="_blank" rel="noopener"
      >{@render icon(ICONS.out)}Release schedule</a>
  </section>
{/snippet}

{#snippet actionCard()}
  {@const due = stories.filter((s) => s.kicker).slice(0, 4)}
  {#if due.length}
    <section class="card">
      <h3>Action required</h3>
      {#each due as s (s.id)}
        <button class="arow" onclick={() => open(s.id)}>
          <b>{@render richText(s.title)}</b>
          <small>{s.topic} · {ago(s.date)}</small>
        </button>
      {/each}
    </section>
  {/if}
{/snippet}

{#snippet statusCard()}
  {@const down = status?.components.filter((c) => c.status !== 'operational') ?? []}
  <section class="card">
    <div class="status-h">
      <h3>Shopify status</h3>
      <a href={STATUS_PAGE} target="_blank" rel="noopener">shopifystatus.com{@render icon(ICONS.out)}</a>
    </div>
    {#if status}
      <p class={['status-now', status.status.indicator]}><i></i>{status.status.description}</p>
      <ul class="comps">
        {#each status.components as c (c.id)}
          <li class={c.status} title={c.status.replaceAll('_', ' ')}><i></i>{c.name}</li>
        {/each}
      </ul>
      {#each [...status.incidents, ...status.scheduled_maintenances] as i (i.id)}
        <a class="arow" href={i.shortlink} target="_blank" rel="noopener">
          <b>{i.name}</b>
          <small>
            {#if 'scheduled_for' in i}Scheduled for {day(+new Date(i.scheduled_for))}{:else}{i.status[0]!.toUpperCase() +
                i.status.slice(1)} · updated {ago(i.updated_at)}{/if}
          </small>
        </a>
      {/each}
      {#if down.length && !status.incidents.length}
        <p class="card-p">{LIST.format(down.map((c) => c.name))} reported trouble.</p>
      {/if}
    {:else if statusFailed}
      <p class="card-p">Couldn't check Shopify's status. It's always on shopifystatus.com.</p>
    {:else}
      <p class="card-p">Checking…</p>
    {/if}
  </section>
{/snippet}

{#snippet freshness()}
  <p class="rail-note">
    {#if loading}
      Checking Shopify for updates…
    {:else if failed}
      Couldn't reach Shopify. <button onclick={refresh}>Try again</button>
    {:else if feed.at}
      Checked {ago(feed.at)}. <button onclick={refresh}>Refresh</button>
    {/if}
  </p>
{/snippet}

{#snippet videoCard(s: Story)}
  {@const on = saved.has(s.id)}
  {@const tip = on ? 'Saved' : 'Save'}
  <div class="vc">
    <button class="vc-a" onclick={() => watch(s.id)}>
      <span class="vth" style:view-transition-name={!watching && morphId === s.id ? 'player' : null}>
        <img src={videoThumb(s, 'hqdefault')} alt="" loading="lazy" onerror={drop} />
        <span class="vplay">{@render icon(ICONS.play)}</span>
      </span>
      <b>{@render richText(s.title)}</b>
      <small>{s.channel} · {ago(s.date)}</small>
    </button>
    <button class="vsave" aria-pressed={on} title={tip} aria-label={tip} onclick={() => toggleSaved(s.id)}>
      {@render icon(ICONS.save)}
    </button>
  </div>
{/snippet}

{#snippet watchPage(s: Story)}
  {@const on = saved.has(s.id)}
  {#key s.id}
    <div class="vbar">
      <button class="back" onclick={closeWatch}>{@render icon(ICONS.back)}Videos</button>
    </div>
    <div class="vfit">
      <!-- The thumbnail, blurred, spills the video's colors onto the page around the player. -->
      <img class="glow" src={videoThumb(s, 'mqdefault')} alt="" />
      <div class="player">
        <!-- The poster holds the frame until the player has loaded over it. -->
        <img src={videoThumb(s, 'maxresdefault')} alt="" onload={(e) => sharpest(e, s)} />
        {#if framesAllowed}
          <iframe
            src="{frameUrl(s)}&autoplay=1"
            title={s.title}
            allow="autoplay; fullscreen; encrypted-media; picture-in-picture"
            referrerpolicy="strict-origin-when-cross-origin"
            allowfullscreen
            onload={(e) => e.currentTarget.classList.add('on')}></iframe>
        {/if}
      </div>
    </div>
    <div class="vinfo">
      <div>
        <div class="st-top"><span class="e">{topicEmoji(s.topic)}</span>{s.channel}</div>
        <h1>{@render richText(s.title)}</h1>
        <p>{ago(s.date)}</p>
      </div>
      <div class="acts">
        <button class="soft act" aria-pressed={on} onclick={() => toggleSaved(s.id)}>
          {@render icon(ICONS.save)}{on ? 'Saved' : 'Save'}
        </button>
        <a class="soft act" href={s.link} target="_blank" rel="noopener">{@render icon(ICONS.out)}YouTube</a>
      </div>
    </div>
  {/key}
{/snippet}

<div class={['app', view === 'reader' && detailOpen && 'm-open']}>
  <!-- The feed and the reader share this sidebar. Collapsed, it keeps its icons and clips the labels. -->
  <aside class={['side', !sidebar && 'mini']}>
    {@render logo()}
    <nav class="nav" aria-label="Sections">{@render nav(!sidebar)}</nav>
    <div class="side-foot">
      {@render themeButton()}
      <button
        class="soft"
        aria-expanded={sidebar}
        aria-label="{sidebar ? 'Collapse' : 'Expand'} sidebar"
        aria-keyshortcuts="Meta+B Control+B"
        title="{sidebar ? 'Collapse' : 'Expand'} sidebar ({SIDEBAR_KEY})"
        onclick={toggleSidebar}>
        {@render icon(ICONS.side)}<span>Collapse</span>
      </button>
    </div>
  </aside>
  {@render mbar()}
  {#if filter === 'video'}
    <main class="fp-main wide">
      <div class="vids">
        {#if watching}
          {@render watchPage(watching)}
          <h2 class="vnext">Up next</h2>
        {:else}
          <header class="vhead">
            <h1>Videos</h1>
            <p>{VIDEOS.length} keynotes, talks and demos from Shopify</p>
            <div class="tabs" role="group" aria-label="Channel">
              {#each [null, ...CHANNELS] as c (c ?? '')}
                <button class="tab" aria-pressed={channel === c} onclick={() => (channel = c)}>{c ?? 'All'}</button>
              {/each}
            </div>
          </header>
        {/if}
        <div class="vgrid">
          {#each gallery as s (s.id)}{@render videoCard(s)}{/each}
        </div>
      </div>
    </main>
  {:else}
    <!-- One feed for the index and the reader: opening a story moves it aside for the story pane. -->
    <main class={['fp-main', view === 'reader' && 'reading']}>
      <div class="feed">
        {#if view === 'reader'}
          <div class="rd-head">
            <button class="ib" aria-label="Back to index" title="Back to index" onclick={() => closeReader()}>
              {@render icon(ICONS.back)}
            </button>
            <h2>{searching ? `Results for “${searching}”` : section.label}</h2>
          </div>
        {:else if filter === 'home'}
          <label class="search">
            {@render icon(ICONS.search)}
            <input
              type="search"
              bind:this={searchEl}
              bind:value={query}
              oninput={() => (pages = 1)}
              onkeydown={(e) => e.key === 'Enter' && list[0] && open(list[0].id, true)}
              placeholder="Search {stories.length.toLocaleString()} Shopify updates"
              aria-label="Search updates"
              aria-keyshortcuts="/" />
            <kbd>/</kbd>
          </label>
          {#if searching && list.length}
            <p class="search-n">{list.length.toLocaleString()} {list.length === 1 ? 'result' : 'results'}</p>
          {/if}
        {/if}
        {#each shown as s (s.id)}
          <!-- The whole row opens the story. It holds the save button, so it can't be a button itself. -->
          <!-- svelte-ignore a11y_no_noninteractive_tabindex, a11y_no_noninteractive_element_interactions -->
          <article
            class="st"
            data-id={s.id}
            aria-current={view === 'reader' && s === selected ? 'true' : undefined}
            tabindex="0"
            onclick={() => open(s.id)}
            onkeydown={(e) => openOnKey(e, s.id)}>
            <div class="st-b">
              {@render topicLine(s)}
              <h2 class="st-t">{@render richText(s.title)}</h2>
              {#if s.dek}<p class="st-d">{@render richText(s.dek)}</p>{/if}
              {@render foot(s)}
            </div>
            {#if s.thumb}
              <img class="st-th" src={s.thumb} alt="" loading="lazy" onerror={drop} />
            {/if}
          </article>
        {/each}
        {@render listEnd()}
      </div>
      {#if view === 'reader'}
        <section class="rd-detail">
          {#if selected}
            {#key selected.id}
              <div class="rd-top">
                <div class="rd-bar">
                  <button class="ib only-m" aria-label="Back to list" onclick={() => closeDetail()}>
                    {@render icon(ICONS.back)}
                  </button>
                  {@render topicLine(selected)}
                  <span class="keys"><kbd>J</kbd> <kbd>K</kbd> move, <kbd>O</kbd> new tab</span>
                  <a
                    class="ib"
                    href={selected.link}
                    target="_blank"
                    rel="noopener"
                    title="Open in a new tab"
                    aria-label="Open in a new tab">{@render icon(ICONS.out)}</a>
                </div>
                <h1>{@render richText(selected.title)}</h1>
                {@render foot(selected)}
              </div>
              <div class="frame">
                <div class="frame-wait">Loading {hostname(selected.link)}…</div>
                {#if framesAllowed}
                  <iframe
                    src={frameUrl(selected)}
                    title={selected.title}
                    allow="fullscreen; encrypted-media; picture-in-picture"
                    referrerpolicy="strict-origin-when-cross-origin"
                    onload={(e) => e.currentTarget.classList.add('on')}></iframe>
                {/if}
              </div>
            {/key}
          {/if}
        </section>
      {:else}
        <!-- The rail is about the section in view. Each feed opens with its intro card, and developers get the API
             calendar and what needs action under it. -->
        <aside class="rail">
          {#if filter === 'home'}
            {@render statusCard()}
            {#if SHOW_VIDEOS}
              <section class="card">
                <h3>Latest videos</h3>
                {#each VIDEOS.slice(0, 3) as s (s.id)}
                  <button class="vrow" onclick={() => open(s.id)}>
                    <img src={s.thumb} alt="" loading="lazy" onerror={drop} />
                    <span>
                      <b>{@render richText(s.title)}</b>
                      <small>{s.channel} · {ago(s.date)}</small>
                    </span>
                  </button>
                {/each}
              </section>
            {/if}
          {:else if filter === 'saved'}
            <section class="card">
              <h3>Saved</h3>
              <p class="card-p">Bookmarked stories stay here even after their feed moves on. They live in this browser only.</p>
            </section>
          {:else}
            {#each FEEDS.filter((f) => f.kind === filter) as f (f.kind)}{@render feedCard(f)}{/each}
            {#if filter === 'dev'}
              {@render calendarCard()}
              {@render actionCard()}
            {/if}
          {/if}
          {@render freshness()}
        </aside>
      {/if}
    </main>
  {/if}
</div>
