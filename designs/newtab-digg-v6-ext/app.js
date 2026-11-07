      const D = JSON.parse(document.getElementById('data').textContent);
      const NOW = +new Date(D.taken);

      // ---------- Icons ----------
      const svg = (d, extra = '') => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" ${extra}>${d}</svg>`;
      const I = {
        up: svg('<path d="M12 4.5 20 19H4z"/>'),
        side: svg('<rect x="3" y="4" width="18" height="16" rx="3"/><path d="M9 4v16"/>'),
        comfy: svg('<rect x="3" y="4" width="18" height="7" rx="2"/><rect x="3" y="13" width="18" height="7" rx="2"/>'),
        compact: svg('<rect x="3" y="4" width="18" height="16" rx="2.5"/><path d="M3 9.5h18M3 14.5h18"/>'),
        back: svg('<path d="M19 12H5m6-6-6 6 6 6"/>'),
        out: svg('<path d="M7 17 17 7M8 7h9v9"/>'),
        heart: svg('<path d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10z"/>'),
        chat: svg('<path d="M20 12a8 8 0 0 1-11.6 7.1L4 20l1-4.2A8 8 0 1 1 20 12z"/>'),
        users: svg('<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20a6.5 6.5 0 0 1 13 0M16 4.5a3.5 3.5 0 0 1 0 7M18.5 14.2A6.5 6.5 0 0 1 21.5 20"/>'),
        link: svg('<path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/>'),
        bars: svg('<path d="M6 20V12M12 20V5M18 20v-6"/>'),
        play: svg('<path d="M7 4.5v15l12-7.5z" fill="currentColor"/>'),
        sun: svg('<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>'),
        moon: svg('<path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z"/>'),
        system: svg('<circle cx="12" cy="12" r="9"/><path d="M12 3v18a9 9 0 0 0 0-18z" fill="currentColor"/>'),
      };

      // ---------- Helpers ----------
      const esc = (s = '') => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
      const rich = (s) => esc(s).replace(/`([^`]+)`/g, '<code>$1</code>');
      const fmt = (n) => (n >= 1000 ? (n / 1000).toFixed(n >= 1e4 ? 0 : 1).replace(/\.0$/, '') + 'K' : String(n));
      const sum = (a, k) => a.reduce((t, i) => t + (i[k] || 0), 0);
      const plural = (n, w) => `${n} ${w}${n === 1 ? '' : 's'}`;
      const hue = (s = '') => `hsl(${[...s].reduce((h, c) => (h * 31 + c.charCodeAt(0)) % 360, 7)} 42% 52%)`;
      function ago(d) {
        const m = Math.max(1, Math.round((NOW - +new Date(d)) / 6e4));
        if (m < 60) return m + 'm ago';
        const h = Math.round(m / 60);
        if (h < 24) return h + 'h ago';
        const days = Math.round(h / 24);
        if (days < 7) return days + 'd ago';
        if (days < 30) return Math.round(days / 7) + 'w ago';
        return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
      }
      const short = (d) => ago(d).replace(' ago', '');
      const store = {
        get(k, f) { try { const v = localStorage.getItem('alfred-nt:' + k); return v == null ? f : JSON.parse(v); } catch { return f; } },
        set(k, v) { try { localStorage.setItem('alfred-nt:' + k, JSON.stringify(v)); } catch {} },
      };

      // ---------- Model ----------
      const ALIAS = {
        'GraphQL Admin API Troubleshooting': 'Admin API', 'Admin GraphQL API': 'Admin API', 'Online Store and Theme Development': 'Themes',
        'Shopify CLI and Libraries': 'CLI', 'Hydrogen and Storefront APIs': 'Hydrogen', 'Products and Orders APIs': 'Orders API',
        'Authentication & Access': 'Auth', 'Webhooks and Events': 'Events', 'Events & webhooks': 'Events', 'Shopify App Store': 'App Store',
        'App store': 'App Store', 'Fulfillment & Inventory': 'Fulfillment', 'Shopify Flow': 'Flow', 'Shopify CLI': 'CLI',
      };
      const EMO = {
        'Online Store': '🏬', Themes: '🖌️', 'Theme Store': '🖌️', Functions: '⚡', Events: '📡', Polaris: '🎨', 'App Store': '🛍️',
        Sidekick: '✨', 'Storefront API': '🔑', 'Admin API': '🧩', API: '🧩', 'Customer Account API': '🧩', 'Orders API': '📦',
        Agents: '🤖', Auth: '🔐', Hydrogen: '💧', Video: '📹', Engineering: '⚙️', News: '📰', Markets: '🌍', Extensions: '🧱',
        Flow: '🔀', POS: '🧾', Checkout: '🛒', Tools: '🧰', CLI: '🧰', Fulfillment: '📦', 'Custom Data': '🗂️', 'Dev Platform': '🛠️',
        'Built for Shopify': '🏅', 'Community Feedback': '💬', Announcements: '📣', 'App Bridge': '🌉', 'Agentic Commerce': '🤖',
        'Shop Minis': '📱', 'Web Pixels': '📈', Platform: '🧩', Liquid: '💧', 'Early Access': '🧪', 'AI Toolkit': '🤖', 'Dev Dashboard': '🛠️', 'Checkout UI': '🛒', 'POS Extensions': '🧾', Catalog: '🗂️', 'Payments Apps API': '💳', UCP: '🤖', 'New GraphQL Product APIs': '🧩',
      };
      const emo = (t) => EMO[t] || '💬';
      const FLAG = { 'Action required': 'attn' };
      const FAV = (d) => `https://www.google.com/s2/favicons?domain=${d}&sz=64`;
      const SRC = {
        changelog: { name: 'shopify.dev', fav: FAV('shopify.dev') },
        eng: { name: 'Shopify Engineering', fav: FAV('shopify.engineering') },
        video: { name: 'YouTube', fav: FAV('youtube.com') },
        news: { name: 'Shopify News', fav: FAV('shopify.com') },
      };
      const STORES = [
        { name: 'Bytebench', h: 'bytebench', c: '#4f57c4' },
        { name: 'Northwind Kitchen', h: 'northwind-kitchen', c: '#c0612b' },
        { name: 'Lumen Learning', h: 'lumen-learning', c: '#1d8048' },
        { name: 'Trailmark Travel Co.', h: 'trailmark-travel', c: '#7a4fb8' },
      ];

      // One story per source item, as published.
      const S = D.stories.map(({ items: [i], ...s }) => ({
        likes: 0, replies: 0, views: 0, people: [], ...i, ...s, topic: ALIAS[s.topic] || s.topic, time: +new Date(i.date),
      }));
      const newest = (a, b) => b.time - a.time;
      const NAV = [
        { id: 'home', label: 'Home', e: '🏠' },
        { id: 'changelog', label: 'Platform updates', e: '🧩' },
        { id: 'thread', label: 'Community', e: '💬' },
        { id: 'eng', label: 'Engineering', e: '⚙️' },
        { id: 'video', label: 'Videos', e: '📹' },
        { id: 'saved', label: 'Saved', e: '🔖' },
      ];
      const PAGE = 30;

      const state = {
        filter: 'home', density: store.get('density', 'comfy'), side: true,
        sel: null, mOpen: false, more: 0, saved: new Set(store.get('saved', [])), theme: store.get('theme', 'system'),
      };
      const applyTheme = () => {
        if (state.theme === 'system') document.documentElement.removeAttribute('data-theme');
        else document.documentElement.setAttribute('data-theme', state.theme);
      };
      applyTheme();

      const inFilter = (s) => (state.filter === 'home' ? true : state.filter === 'saved' ? state.saved.has(s.id) : s.kind === state.filter);
      const list = () => S.filter(inFilter).sort(newest);

      // ---------- Pieces ----------
      const face = (src, label = '?', fav = false) =>
        `<span class="face${fav ? ' fav' : ''}" style="--c:${hue(label)}">${esc(label[0].toUpperCase())}${src ? `<img src="${esc(src)}" alt="" loading="lazy">` : ''}</span>`;
      const faces = (s, n = 3) =>
        `<span class="faces">${s.kind === 'thread' ? s.people.slice(0, n).map((p) => face(p.avatar, p.name)).join('') : face(SRC[s.kind].fav, SRC[s.kind].name, true)}</span>`;
      const replies = (n) => `${n} ${n === 1 ? 'reply' : 'replies'}`;
      const meta = (s) => `<b>${s.kind === 'thread' ? replies(s.replies) : esc(s.kind === 'video' ? s.channel : SRC[s.kind].name)}</b>, ${ago(s.date)}`;
      const topicLine = (s) =>
        `<div class="st-top"><span class="e">${emo(s.topic)}</span>${esc(s.topic)}${s.kicker ? `<span class="flag ${FLAG[s.kicker]}">· ${s.kicker}</span>` : ''}${s.solved ? '<span class="flag ok">· Solved</span>' : ''}</div>`;
      function dig(s) {
        const on = state.saved.has(s.id);
        const n = s.likes + (on ? 1 : 0);
        const tip = `${on ? 'Saved' : 'Save'}${s.likes ? `, ${plural(s.likes, 'like')} in the community` : ''}`;
        return `<button class="dig${n ? '' : ' solo'}" data-act="save" data-id="${s.id}" aria-pressed="${on}" title="${tip}" aria-label="${tip}"><i>${I.up}</i>${n ? `<span>${fmt(n)}</span>` : ''}</button>`;
      }
      const foot = (s, n) => `<div class="st-f">${dig(s)}${faces(s, n)}<span>${meta(s)}</span></div>`;
      function row(s) {
        const comfy = state.density === 'comfy';
        return `<article class="st" data-act="open" data-id="${s.id}" tabindex="0">
          <div class="st-b">${topicLine(s)}<h2 class="st-t">${rich(s.title)}</h2>${comfy && s.dek ? `<p class="st-d">${rich(s.dek)}</p>` : ''}${foot(s)}</div>
          ${comfy && s.thumb ? `<img class="st-th" src="${esc(s.thumb)}" alt="" loading="lazy">` : ''}
        </article>`;
      }
      const navItems = (labels = true) =>
        NAV.map((n) => {
          const count = n.id === 'saved' && state.saved.size ? `<small>${state.saved.size}</small>` : '';
          return `<button class="nav-i" data-act="filter" data-v="${n.id}" ${state.filter === n.id ? 'aria-current="page"' : ''} ${labels ? '' : `title="${n.label}" aria-label="${n.label}"`}><span class="e">${n.e}</span>${labels ? esc(n.label) + count : ''}</button>`;
        }).join('');
      const themeBtn = (labels = true) => {
        const t = state.theme;
        const label = t[0].toUpperCase() + t.slice(1);
        return `<button class="soft" data-act="theme" title="Theme: ${label}" aria-label="Theme: ${label}">${I[t === 'system' ? 'system' : t === 'light' ? 'sun' : 'moon']}${labels ? label : ''}</button>`;
      };
      const logo = (word = true) => `<a class="logo" href="#" data-act="filter" data-v="home"><img src="icon.png" alt="">${word ? 'alfred.' : ''}</a>`;
      const sidebar = () => `<aside class="side">${logo()}<nav class="nav" aria-label="Sections">${navItems()}</nav><div class="side-foot">${themeBtn()}</div></aside>`;
      const mbar = () => `<header class="mbar">${logo()}<nav aria-label="Sections">${navItems()}</nav></header>`;
      const densitySeg = () =>
        `<div class="seg" role="group" aria-label="Density">${['comfy', 'compact'].map((d) => `<button data-act="density" data-v="${d}" aria-pressed="${state.density === d}" title="${d === 'comfy' ? 'Comfortable' : 'Compact'}" aria-label="${d === 'comfy' ? 'Comfortable' : 'Compact'}">${I[d]}</button>`).join('')}</div>`;
      const moreBtn = (L, shown) => (L.length > shown.length ? `<button class="more" data-act="more">Show ${Math.min(PAGE, L.length - shown.length)} more</button>` : '');
      const empty = () => `<div class="empty"><span class="e">${NAV.find((n) => n.id === state.filter).e}</span>${state.filter === 'saved' ? 'Nothing saved yet. Hit the arrow on any story to keep it here.' : 'Nothing here yet.'}</div>`;

      // Rail cards for the front page.
      const storesCard = () =>
        `<section class="card"><h3>Your stores</h3>${STORES.map(
          (st) => `<div class="store"><span class="sq" style="--c:${st.c}">${st.name[0]}</span><div class="store-n"><a href="https://admin.shopify.com/store/${st.h}" target="_blank" rel="noopener" title="${st.h}.myshopify.com">${esc(st.name)}</a><div class="ql">${['orders', 'products', 'themes']
            .map((p) => `<a href="https://admin.shopify.com/store/${st.h}/${p}" target="_blank" rel="noopener">${p[0].toUpperCase() + p.slice(1)}</a>`)
            .join('')}</div></div></div>`
        ).join('')}</section>`;
      function videoCard() {
        const v = S.filter((s) => s.kind === 'video').sort(newest).slice(0, 3);
        return `<section class="card"><h3>Latest videos</h3>${v
          .map((s) => `<button class="vrow" data-act="open" data-id="${s.id}"><img src="${esc(s.thumb)}" alt="" loading="lazy"><span><b>${rich(s.title)}</b><small>${esc(s.channel)} · ${ago(s.date)}</small></span></button>`)
          .join('')}</section>`;
      }

      // ---------- Variants ----------
      function frontPage() {
        const L = list();
        const shown = L.slice(0, PAGE * (state.more + 1));
        return `<div class="fp${state.side ? '' : ' noside'}${state.density === 'compact' ? ' compact' : ''}">${sidebar()}${mbar()}
          <main class="fp-main">
            <div class="feed"><div class="tb"><div class="tb-l"><button class="ib" data-act="side" aria-label="Toggle sidebar" title="Toggle sidebar">${I.side}</button></div>${densitySeg()}</div>
              ${L.length ? shown.map(row).join('') + moreBtn(L, shown) : empty()}</div>
            <aside class="rail">${storesCard() + videoCard()}</aside>
          </main></div>`;
      }

      function reader() {
        const L = list();
        const shown = L.slice(0, PAGE * (state.more + 1));
        const sel = L.find((s) => s.id === state.sel) || L[0];
        const label = NAV.find((n) => n.id === state.filter).label;
        const rr = (s) => `<div class="rr" role="option" data-act="open" data-id="${s.id}" aria-selected="${s === sel}" tabindex="${s === sel ? 0 : -1}">
            <div class="st-b">${topicLine(s)}<h3 class="st-t">${rich(s.title)}</h3>${foot(s, 2)}</div>
            ${s.thumb ? `<img class="rr-th" src="${esc(s.thumb)}" alt="" loading="lazy">` : ''}
          </div>`;
        return `<div class="rd${state.mOpen ? ' m-open' : ''}">
          <aside class="irail">${logo(false)}<nav class="nav" aria-label="Sections">${navItems(false)}</nav><div class="side-foot">${themeBtn(false)}</div></aside>
          <section class="rd-list" data-scroll="list">
            ${mbar()}
            <div class="rd-head"><div class="tb-l"><button class="ib" data-act="index" aria-label="Back to index" title="Back to index">${I.back}</button><h2>${esc(label)}</h2></div></div>
            <div class="rd-rows" role="listbox" aria-label="${esc(label)}">${L.length ? shown.map(rr).join('') + moreBtn(L, shown) : empty()}</div>
          </section>
          <section class="rd-detail">${
            sel
              ? `<div class="rd-top"><div class="rd-bar"><button class="ib only-m" data-act="back" aria-label="Back to list">${I.back}</button>${topicLine(sel)}
                  <span class="keys"><kbd>J</kbd> <kbd>K</kbd> move, <kbd>O</kbd> new tab</span>
                  <a class="ib" href="${esc(sel.link)}" target="_blank" rel="noopener" title="Open in a new tab" aria-label="Open in a new tab">${I.out}</a></div>
                <h1>${rich(sel.title)}</h1>${foot(sel, 4)}</div>
                <div class="frame" data-key="${sel.id}">${readerFrame(sel)}</div>`
              : ''
          }</section>
        </div>`;
      }
      // community.shopify.dev sends X-Frame-Options: SAMEORIGIN. Inside the extension a declarativeNetRequest
      // rule lifts it for Alfred's own frames; on a plain web page threads render as a card.
      const CAN_FRAME_FORUM = location.protocol === 'chrome-extension:';
      function readerFrame(s) {
        if (s.kind === 'thread' && !CAN_FRAME_FORUM) {
          return `<div class="thread">${s.excerpt ? `<p>${rich(s.excerpt)}</p>` : ''}<a class="go" href="${esc(s.link)}" target="_blank" rel="noopener">Open the thread${I.out}</a></div>`;
        }
        const url = s.kind === 'video' ? `https://www.youtube.com/embed/${new URL(s.link).searchParams.get('v')}?rel=0` : s.link;
        return `<div class="frame-wait">Loading ${esc(new URL(s.link).hostname.replace(/^www\./, ''))}…</div>
          <iframe src="${esc(url)}" title="${esc(s.title)}" allow="fullscreen; encrypted-media; picture-in-picture" referrerpolicy="strict-origin-when-cross-origin"></iframe>`;
      }

      const variants = [frontPage, reader];

      // Delegated so the page works under an extension CSP, which blocks inline handlers.
      document.addEventListener('error', (e) => e.target.tagName === 'IMG' && e.target.remove(), true);
      document.addEventListener('load', (e) => e.target.tagName === 'IFRAME' && e.target.classList.add('on'), true);

      // ---------- Render + actions ----------
      const stage = document.getElementById('stage');
      function render() {
        const keep = {};
        stage.querySelectorAll('[data-scroll]').forEach((el) => (keep[el.dataset.scroll] = el.scrollTop));
        const a = document.activeElement;
        const focus = a && stage.contains(a) && a.dataset.act ? `[data-act="${a.dataset.act}"]${a.dataset.id ? `[data-id="${a.dataset.id}"]` : ''}${a.dataset.v ? `[data-v="${a.dataset.v}"]` : ''}` : null;
        const next = document.createElement('div');
        next.innerHTML = variants[current]();
        // Moving an iframe reloads it, so when the frame is unchanged patch the rest around it.
        const old = stage.querySelector('.frame');
        const fresh = next.querySelector('.frame');
        if (old && fresh && old.dataset.key === fresh.dataset.key) {
          stage.firstElementChild.className = next.firstElementChild.className;
          for (const sel of ['.irail', '.rd-list', '.rd-top']) stage.querySelector(sel).replaceWith(next.querySelector(sel));
        } else stage.replaceChildren(...next.childNodes);
        stage.querySelectorAll('[data-scroll]').forEach((el) => keep[el.dataset.scroll] != null && (el.scrollTop = keep[el.dataset.scroll]));
        if (focus) stage.querySelector(focus)?.focus({ preventScroll: true });
      }
      function act(el, e) {
        const { act, id, v } = el.dataset;
        switch (act) {
          case 'open':
            // The index hands the story to the reader.
            state.sel = id;
            state.mOpen = true;
            if (current === 0) return setActive(1);
            break;
          case 'back': state.mOpen = false; break;
          case 'index': return setActive(0);
          case 'save':
            state.saved.has(id) ? state.saved.delete(id) : state.saved.add(id);
            store.set('saved', [...state.saved]);
            break;
          case 'filter':
            e?.preventDefault();
            state.filter = v; state.sel = null; state.mOpen = false; state.more = 0;
            break;
          case 'density': state.density = v; store.set('density', v); break;
          case 'side': state.side = !state.side; break;
          case 'more': state.more++; break;
          case 'theme':
            state.theme = { system: 'light', light: 'dark', dark: 'system' }[state.theme];
            store.set('theme', state.theme); applyTheme();
            break;
        }
        render();
        if (act === 'filter') scrollTo(0, 0);
      }
      document.addEventListener('click', (e) => {
        if (e.target.closest('.proto-picker')) return;
        const el = e.target.closest('[data-act]');
        if (e.target.closest('a[target]') || !el || !stage.contains(el)) return;
        act(el, e);
      });
      document.addEventListener('keydown', (e) => {
        if (/^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName) || e.target.isContentEditable || e.metaKey || e.ctrlKey || e.altKey) return;
        if (e.key === 'Escape') {
          if (current === 1 && state.mOpen && innerWidth <= 860) state.mOpen = false;
          else if (current === 1) return setActive(0);
          return render();
        }
        if ((e.key === 'Enter' || e.key === ' ') && e.target.dataset?.act === 'open' && e.target.tagName !== 'BUTTON') {
          e.preventDefault();
          return act(e.target);
        }
        if (current !== 1) return;
        const L = list();
        const s = L.find((x) => x.id === state.sel) || L[0];
        if (!s) return;
        if (e.key === 'j' || e.key === 'k') {
          const next = L[Math.min(L.length - 1, Math.max(0, L.indexOf(s) + (e.key === 'j' ? 1 : -1)))];
          if (L.indexOf(next) >= PAGE * (state.more + 1)) state.more++;
          state.sel = next.id;
          render();
          stage.querySelector(`.rr[data-id="${next.id}"]`)?.scrollIntoView({ block: 'nearest' });
        } else if (e.key === 'o') open(s.link, '_blank', 'noopener');
      });

      // ---------- Picker wiring (PICKER.md reference) ----------
      const picker = document.querySelector('.proto-picker');
      const highlight = picker.querySelector('.proto-picker-highlight');
      const items = [...picker.querySelectorAll('.proto-picker-item:not(.proto-picker-replay)')];
      const replay = picker.querySelector('.proto-picker-replay');
      let current = 0;

      function moveHighlight() {
        const el = items[current];
        highlight.style.width = el.offsetWidth + 'px';
        highlight.style.transform = `translateX(${el.offsetLeft}px)`;
      }

      function mount(i) {
        stage.innerHTML = '';
        // Clear first, render next frame, so entrance animations re-run.
        requestAnimationFrame(() => { stage.innerHTML = variants[i](); });
      }

      function setActive(i) {
        if (i < 0 || i >= variants.length) return;
        current = i;
        items.forEach((el, j) => {
          el.toggleAttribute('data-active', j === i);
          if (j === i) el.setAttribute('aria-current', 'true');
          else el.removeAttribute('aria-current');
        });
        moveHighlight();
        const url = new URL(location);
        url.searchParams.set('v', i + 1);
        history.replaceState(null, '', url);
        mount(i);
      }

      items.forEach((el, i) => el.addEventListener('click', () => setActive(i)));
      replay?.addEventListener('click', () => mount(current));
      window.addEventListener('resize', moveHighlight);

      document.addEventListener('keydown', (e) => {
        if (/^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName) || e.target.isContentEditable) return;
        if (e.metaKey || e.ctrlKey || e.altKey) return;
        const num = parseInt(e.key, 10);
        if (num >= 1 && num <= variants.length) setActive(num - 1);
        else if (e.key === 'ArrowRight') setActive((current + 1) % variants.length);
        else if (e.key === 'ArrowLeft') setActive((current - 1 + variants.length) % variants.length);
        else if (e.key === 'r' || e.key === 'R') mount(current);
      });

      setActive((parseInt(new URLSearchParams(location.search).get('v'), 10) || 1) - 1);
      // Enable the slide only after first paint, so load doesn't animate.
      requestAnimationFrame(() => requestAnimationFrame(() => picker.setAttribute('data-ready', '')));
    