<script lang="ts">
  import { titleWidthPx, TITLE_MAX_PX } from '../utils/text-width';
  import { DESC_MAX } from '../utils/overview';

  let {
    title,
    description,
    url,
    favicon,
    siteName
  }: {
    title: string;
    description: string;
    url: string;
    favicon: string | null;
    siteName: string | null;
  } = $props();

  const titleWidth = $derived(Math.round(titleWidthPx(title)));

  const displayTitle = $derived.by(() => {
    if (!title) return '(no title)';
    if (titleWidth <= TITLE_MAX_PX) return title;
    // The 600px cutoff lands near 60 characters, so a 200-char start bounds the
    // per-character measurement loop even for pathologically long titles.
    let cut = title.slice(0, 200);
    while (cut.length > 0 && titleWidthPx(cut.trimEnd() + ' ...') > TITLE_MAX_PX) cut = cut.slice(0, -1);
    return cut.trimEnd() + ' ...';
  });

  const displayDescription = $derived.by(() =>
    description.length > DESC_MAX ? description.slice(0, DESC_MAX - 3).trimEnd() + ' ...' : description
  );

  const parsed = $derived.by(() => {
    try {
      const u = new URL(url);
      const segments = u.pathname.split('/').filter(Boolean);
      return { host: u.hostname, breadcrumb: u.hostname + (segments.length ? ' › ' + segments.join(' › ') : '') };
    } catch {
      return { host: url, breadcrumb: url };
    }
  });
</script>

<div class="serp">
  <div class="serp__site">
    {#if favicon}
      <img class="serp__favicon" src={favicon} alt="" />
    {:else}
      <div class="serp__favicon serp__favicon--empty" aria-hidden="true">
        <svg viewBox="0 0 24 24" fill="none" stroke="#5f6368" stroke-width="1.8" stroke-linecap="round">
          <circle cx="12" cy="12" r="10" />
          <path d="M2 12h20M12 2a15.3 15.3 0 014 10 15.3 15.3 0 01-4 10 15.3 15.3 0 01-4-10 15.3 15.3 0 014-10z" />
        </svg>
      </div>
    {/if}
    <div>
      <div class="serp__name">{siteName ?? parsed.host}</div>
      <div class="serp__url">{parsed.breadcrumb}</div>
    </div>
  </div>
  <div class="serp__title">{displayTitle}</div>
  <div class="serp__desc">
    {#if description}
      {displayDescription}
    {:else}
      <span class="serp__missing">No meta description. Google will improvise one from page content.</span>
    {/if}
  </div>
</div>

<style>
  /* Google-imitation card: intentionally fixed light, matching real SERP, not themed with tokens. */
  .serp {
    background: #fff;
    border: 1px solid #f0f0f0;
    border-radius: 10px;
    padding: 14px 16px 16px;
  }

  .serp__site {
    display: flex;
    align-items: center;
    gap: 9px;
  }

  .serp__favicon {
    width: 26px;
    height: 26px;
    border-radius: 50%;
    background: #f1f3f4;
    border: 1px solid #ececec;
    object-fit: contain;
    box-sizing: border-box;
    flex-shrink: 0;
  }

  .serp__favicon--empty {
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .serp__favicon--empty svg {
    width: 13px;
    height: 13px;
  }

  .serp__name {
    font-size: 12.5px;
    color: #202124;
    font-family: arial, sans-serif;
  }

  .serp__url {
    font-size: 11.5px;
    color: #4d5156;
    font-family: arial, sans-serif;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .serp__title {
    font-size: 17px;
    line-height: 1.3;
    color: #1a0dab;
    font-family: arial, sans-serif;
    margin-top: 9px;
    white-space: nowrap;
    overflow: hidden;
    cursor: pointer;
  }

  .serp__title:hover {
    text-decoration: underline;
  }

  .serp__desc {
    font-size: 12.5px;
    line-height: 1.55;
    color: #4d5156;
    font-family: arial, sans-serif;
    margin-top: 3px;
  }

  .serp__missing {
    font-style: italic;
    color: #9aa0aa;
    font-weight: 400;
  }
</style>
