      const D = JSON.parse(document.getElementById('data').textContent);
      const NOW = Date.now();
      const IN_EXTENSION = location.protocol === 'chrome-extension:';

      // ---------- Helpers ----------
      const svg = (d) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;
      const I = {
        back: svg('<path d="M19 12H5m6-6-6 6 6 6"/>'),
        out: svg('<path d="M7 17 17 7M8 7h9v9"/>'),
        tune: svg('<path d="M4 7h10M18 7h2M4 17h4M12 17h8"/><circle cx="16" cy="7" r="2"/><circle cx="10" cy="17" r="2"/>'),
      };
      const esc = (s = '') => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
      const rich = (s) => esc(s).replace(/`([^`]+)`/g, '<code>$1</code>');
      const hue = (s = '') => `hsl(${[...s].reduce((h, c) => (h * 31 + c.charCodeAt(0)) % 360, 7)} 42% 52%)`;
      const plural = (n, one, many = one + 's') => `${n} ${n === 1 ? one : many}`;
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
      const store = {
        get(k, f) { try { const v = localStorage.getItem('alfred-nt:' + k); return v == null ? f : JSON.parse(v); } catch { return f; } },
        set(k, v) { try { localStorage.setItem('alfred-nt:' + k, JSON.stringify(v)); } catch {} },
      };

      // ---------- Model ----------
      const FAV = (d) => `https://www.google.com/s2/favicons?domain=${d}&sz=64`;
      const KINDS = {
        changelog: { label: 'Platform updates', e: '🧩', name: 'shopify.dev', fav: FAV('shopify.dev') },
        thread: { label: 'Community', e: '💬' },
        eng: { label: 'Engineering', e: '⚙️', name: 'Shopify Engineering', fav: FAV('shopify.engineering') },
        video: { label: 'Videos', e: '📹', name: 'YouTube', fav: FAV('youtube.com') },
      };
      const NAV = [{ id: 'home', label: 'Home', e: '🏠' }, ...Object.entries(KINDS).map(([id, k]) => ({ id, label: k.label, e: k.e }))];
      const ITEMS = D.items.map((i) => ({ replies: 0, likes: 0, people: [], ...i, time: +new Date(i.date) }));
      const PAGE = 30;

      const params = new URLSearchParams(location.search);
      const state = { filter: 'home', sel: params.get('item'), more: 0, mOpen: !!params.get('item') };
      state.view = state.sel ? 'reader' : 'index';
      const list = () => ITEMS.filter((i) => state.filter === 'home' || i.kind === state.filter);

      // ---------- Pieces ----------
      const face = (src, label = '?', fav = false) =>
        `<span class="face${fav ? ' fav' : ''}" style="--c:${hue(label)}">${esc(label[0].toUpperCase())}${src ? `<img src="${esc(src)}" alt="" loading="lazy">` : ''}</span>`;
      const faces = (i, n = 3) =>
        `<span class="faces">${i.kind === 'thread' ? i.people.slice(0, n).map((p) => face(p.avatar, p.name)).join('') : face(KINDS[i.kind].fav, KINDS[i.kind].name, true)}</span>`;
      const meta = (i) =>
        i.kind === 'thread'
          ? `<span><b>${plural(i.replies, 'reply', 'replies')}</b>${i.likes ? ` · ${plural(i.likes, 'like')}` : ''}, ${ago(i.date)}</span>`
          : `<span><b>${KINDS[i.kind].name}</b>, ${ago(i.date)}</span>`;
      const topicLine = (i) =>
        `<div class="st-top"><span class="e">${KINDS[i.kind].e}</span>${esc(i.category)}${i.action ? '<span class="flag attn">· Action required</span>' : ''}${i.solved ? '<span class="flag ok">· Solved</span>' : ''}</div>`;
      const foot = (i, n) => `<div class="st-f">${faces(i, n)}${meta(i)}</div>`;
      const thumb = (i, cls) => (i.thumb ? `<img class="${cls}" src="${esc(i.thumb)}" alt="" loading="lazy">` : '');
      const navItems = (labels = true) =>
        NAV.map((n) => `<button class="nav-i" data-act="filter" data-v="${n.id}" ${state.filter === n.id ? 'aria-current="page"' : ''} ${labels ? '' : `title="${n.label}" aria-label="${n.label}"`}><span class="e">${n.e}</span>${labels ? esc(n.label) : ''}</button>`).join('');
      const logo = (word = true) => `<a class="logo" href="#" data-act="home"><img src="icon.png" alt="">${word ? 'alfred.' : ''}</a>`;
      const settingsBtn = (labels = true) => `<button class="soft" data-act="settings" title="New tab settings" aria-label="New tab settings">${I.tune}${labels ? 'New tab settings' : ''}</button>`;
      const mbar = () => `<header class="mbar">${logo()}<nav aria-label="Sections">${navItems()}</nav></header>`;
      const moreBtn = (L, shown) => (L.length > shown.length ? `<button class="more" data-act="more">Show ${Math.min(PAGE, L.length - shown.length)} more</button>` : '');
      const label = () => NAV.find((n) => n.id === state.filter).label;

      // ---------- Views ----------
      function index() {
        const L = list();
        const shown = L.slice(0, PAGE * (state.more + 1));
        const row = (i) => `<article class="st" data-act="open" data-id="${i.id}" tabindex="0">
            <div class="st-b">${topicLine(i)}<h2 class="st-t">${rich(i.title)}</h2>${i.excerpt ? `<p class="st-d">${rich(i.excerpt)}</p>` : ''}${foot(i)}</div>${thumb(i, 'st-th')}
          </article>`;
        return `<div class="ix"><aside class="side">${logo()}<nav class="nav" aria-label="Sections">${navItems()}</nav><div class="side-foot">${settingsBtn()}</div></aside>${mbar()}
          <main class="ix-main"><div class="feed">
            <div class="ix-head"><h1>${esc(label())}</h1><span>Updated ${ago(D.fetched)}</span></div>
            ${L.length ? shown.map(row).join('') + moreBtn(L, shown) : '<div class="empty">Nothing here yet.</div>'}
          </div></main></div>`;
      }

      function reader() {
        const L = list();
        const shown = L.slice(0, Math.max(PAGE * (state.more + 1), L.findIndex((i) => i.id === state.sel) + 1));
        const sel = L.find((i) => i.id === state.sel) || L[0];
        const rr = (i) => `<div class="rr" role="option" data-act="open" data-id="${i.id}" aria-selected="${i === sel}" tabindex="${i === sel ? 0 : -1}">
            <div class="st-b">${topicLine(i)}<h3 class="st-t">${rich(i.title)}</h3>${foot(i, 2)}</div>${thumb(i, 'rr-th')}
          </div>`;
        return `<div class="rd${state.mOpen ? ' m-open' : ''}">
          <aside class="irail">${logo(false)}<nav class="nav" aria-label="Sections">${navItems(false)}</nav><div class="side-foot">${settingsBtn(false)}</div></aside>
          <section class="rd-list" data-scroll="list">${mbar()}
            <div class="rd-head"><button class="ib" data-act="home" aria-label="Back to index" title="Back to index">${I.back}</button><h2>${esc(label())}</h2></div>
            <div class="rd-rows" role="listbox" aria-label="${esc(label())}">${L.length ? shown.map(rr).join('') + moreBtn(L, shown) : '<div class="empty">Nothing here yet.</div>'}</div>
          </section>
          <section class="rd-detail">${
            sel
              ? `<div class="rd-top"><div class="rd-bar"><button class="ib only-m" data-act="back" aria-label="Back to list">${I.back}</button>${topicLine(sel)}
                  <span class="keys"><kbd>J</kbd> <kbd>K</kbd> move, <kbd>O</kbd> new tab</span>
                  <a class="ib" href="${esc(sel.link)}" target="_blank" rel="noopener" title="Open in a new tab" aria-label="Open in a new tab">${I.out}</a></div>
                <h1>${rich(sel.title)}</h1>${foot(sel, 4)}</div>
                <div class="frame" data-key="${sel.id}">${frame(sel)}</div>`
              : ''
          }</section>
        </div>`;
      }

      // community.shopify.dev refuses to be framed. The extension lifts that for its own frames with a
      // declarativeNetRequest rule; served as a plain page, threads fall back to their excerpt.
      function frame(i) {
        if (i.kind === 'thread' && !IN_EXTENSION) {
          return `<div class="thread">${i.excerpt ? `<p>${rich(i.excerpt)}</p>` : ''}<a class="go" href="${esc(i.link)}" target="_blank" rel="noopener">Open the thread${I.out}</a></div>`;
        }
        const url = i.kind === 'video' ? `https://www.youtube.com/embed/${new URL(i.link).searchParams.get('v')}?rel=0` : i.link;
        return `<div class="frame-wait">Loading ${esc(new URL(i.link).hostname.replace(/^www\./, ''))}…</div>
          <iframe src="${esc(url)}" title="${esc(i.title)}" allow="fullscreen; encrypted-media; picture-in-picture" referrerpolicy="strict-origin-when-cross-origin"></iframe>`;
      }

      // ---------- New tab choice ----------
      // 'on' keeps Alfred's new tab, 'off' hands new tabs back to Chrome, unset asks once.
      const choice = () => store.get('newtab', null);
      function chromeNewTab() {
        if (IN_EXTENSION) chrome.tabs.getCurrent((t) => chrome.tabs.update(t.id, { url: 'chrome://new-tab-page/' }));
        else render();
      }
      function modal() {
        const sources = Object.values(KINDS).map((k) => `<span>${k.e} ${k.label}</span>`).join('');
        return `<div class="scrim"><div class="dlg" role="dialog" aria-modal="true" aria-labelledby="dlg-t">
            <img src="icon.png" alt="">
            <h2 id="dlg-t">Shopify updates on every new tab</h2>
            <p>Alfred now opens new tabs with the latest from the Shopify developer platform, in one list.</p>
            <div class="dlg-src">${sources}</div>
            <p>Prefer Chrome’s own new tab? You can switch back now, or later from New tab settings.</p>
            <div class="dlg-act"><button class="btn quiet" data-act="choose" data-v="off">Use Chrome’s new tab</button><button class="btn main" data-act="choose" data-v="on">Keep Alfred</button></div>
          </div></div>`;
      }
      const offPage = () =>
        `<div class="off"><div><b>Alfred’s new tab is off</b>New tabs open Chrome’s own page.<br><button class="btn main" data-act="choose" data-v="on">Turn it back on</button></div></div>`;

      // ---------- Render + actions ----------
      const app = document.getElementById('app');
      const modalRoot = document.getElementById('modal');
      let asking = false;
      function render() {
        if (choice() === 'off') {
          app.innerHTML = offPage();
          app.inert = false;
          modalRoot.innerHTML = '';
          return;
        }
        const keep = {};
        app.querySelectorAll('[data-scroll]').forEach((el) => (keep[el.dataset.scroll] = el.scrollTop));
        const a = document.activeElement;
        const focus = a && app.contains(a) && a.dataset.act ? `[data-act="${a.dataset.act}"]${a.dataset.id ? `[data-id="${a.dataset.id}"]` : ''}${a.dataset.v ? `[data-v="${a.dataset.v}"]` : ''}` : null;
        const next = document.createElement('div');
        next.innerHTML = state.view === 'reader' ? reader() : index();
        // Moving an iframe reloads it, so when the frame is unchanged patch the rest around it.
        const old = app.querySelector('.frame');
        const fresh = next.querySelector('.frame');
        if (old && fresh && old.dataset.key === fresh.dataset.key) {
          app.firstElementChild.className = next.firstElementChild.className;
          for (const sel of ['.irail', '.rd-list', '.rd-top']) app.querySelector(sel).replaceWith(next.querySelector(sel));
        } else app.replaceChildren(...next.childNodes);
        app.querySelectorAll('[data-scroll]').forEach((el) => keep[el.dataset.scroll] != null && (el.scrollTop = keep[el.dataset.scroll]));
        if (focus) app.querySelector(focus)?.focus({ preventScroll: true });
        const open = asking || choice() == null;
        app.inert = open;
        if (open && !modalRoot.firstChild) {
          modalRoot.innerHTML = modal();
          modalRoot.querySelector('.btn.main').focus();
        } else if (!open) modalRoot.innerHTML = '';
      }
      function syncUrl() {
        const url = new URL(location);
        if (state.view === 'reader' && state.sel) url.searchParams.set('item', state.sel);
        else url.searchParams.delete('item');
        history.replaceState(null, '', url);
      }
      function act(el, e) {
        const { act, id, v } = el.dataset;
        switch (act) {
          case 'open':
            state.sel = id;
            state.mOpen = true;
            if (state.view !== 'reader') { state.view = 'reader'; scrollTo(0, 0); }
            break;
          case 'home':
            e?.preventDefault();
            state.view = 'index'; state.mOpen = false;
            break;
          case 'back': state.mOpen = false; break;
          case 'filter':
            state.filter = v; state.sel = null; state.mOpen = false; state.more = 0;
            scrollTo(0, 0);
            break;
          case 'more': state.more++; break;
          case 'settings': asking = true; break;
          case 'choose':
            asking = false;
            store.set('newtab', v);
            if (v === 'off') return chromeNewTab();
            break;
        }
        syncUrl();
        render();
        if (act === 'open') app.querySelector('.rr[aria-selected="true"]')?.scrollIntoView({ block: 'nearest' });
      }
      document.addEventListener('click', (e) => {
        const el = e.target.closest('[data-act]');
        if (e.target.closest('a[target]') || !el) return;
        act(el, e);
      });
      document.addEventListener('keydown', (e) => {
        if (/^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName) || e.target.isContentEditable || e.metaKey || e.ctrlKey || e.altKey) return;
        if (modalRoot.firstChild) {
          if (e.key === 'Escape') act({ dataset: { act: 'choose', v: choice() || 'on' } });
          return;
        }
        if (e.key === 'Escape' && state.view === 'reader') return act({ dataset: { act: state.mOpen && innerWidth <= 860 ? 'back' : 'home' } });
        if ((e.key === 'Enter' || e.key === ' ') && e.target.dataset?.act === 'open' && e.target.tagName !== 'BUTTON') {
          e.preventDefault();
          return act(e.target);
        }
        if (state.view !== 'reader') return;
        const L = list();
        const i = L.find((x) => x.id === state.sel) || L[0];
        if (!i) return;
        if (e.key === 'j' || e.key === 'k') {
          const next = L[Math.min(L.length - 1, Math.max(0, L.indexOf(i) + (e.key === 'j' ? 1 : -1)))];
          state.sel = next.id;
          syncUrl();
          render();
          app.querySelector(`.rr[data-id="${next.id}"]`)?.scrollIntoView({ block: 'nearest' });
        } else if (e.key === 'o') open(i.link, '_blank', 'noopener');
      });
      // Delegated so the page works under an extension CSP, which blocks inline handlers.
      document.addEventListener('error', (e) => e.target.tagName === 'IMG' && e.target.remove(), true);
      document.addEventListener('load', (e) => e.target.tagName === 'IFRAME' && e.target.classList.add('on'), true);

      if (choice() === 'off' && IN_EXTENSION) chromeNewTab();
      else render();
    