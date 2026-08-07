<script lang="ts">
  import type { PlatformPreview, SocialPlatform } from './utils/social';
  import { graphemeSlice } from './utils/social';

  let { preview, platform }: { preview: PlatformPreview; platform: SocialPlatform } = $props();

  // Per-platform title font/size for the pixel-width truncation below — each
  // platform renders its card title in a different face, so a single shared
  // measurement (like SerpPreview's Google metrics) would cut at the wrong point.
  const TITLE_FONTS: Record<SocialPlatform, string> = {
    facebook: '600 16px Helvetica, Arial, sans-serif',
    x: '700 15px -apple-system, BlinkMacSystemFont, sans-serif',
    linkedin: '600 14px -apple-system, BlinkMacSystemFont, sans-serif'
  };
  const TITLE_MAX_PX: Record<SocialPlatform, number> = {
    facebook: 470,
    x: 500,
    linkedin: 470
  };

  let measureCtx: CanvasRenderingContext2D | null = null;
  function textWidthPx(text: string, font: string): number {
    measureCtx ??= document.createElement('canvas').getContext('2d');
    if (!measureCtx) return 0;
    measureCtx.font = font;
    return measureCtx.measureText(text).width;
  }

  function truncateToPx(text: string, font: string, maxPx: number): string {
    if (textWidthPx(text, font) <= maxPx) return text;
    // 200 chars always exceeds any card's pixel budget, so it bounds the shrink loop cheaply.
    let cut = text.slice(0, 200);
    while (cut.length > 0 && textWidthPx(cut.trimEnd() + '...', font) > maxPx) cut = cut.slice(0, -1);
    return cut.trimEnd() + '...';
  }

  const displayTitle = $derived.by(() => {
    const font = TITLE_FONTS[platform];
    const max = TITLE_MAX_PX[platform];
    return preview.title ? truncateToPx(preview.title, font, max) : '(no title)';
  });

  const displayDescription = $derived.by(() => {
    if (!preview.description) return '';
    const sliced = graphemeSlice(preview.description, 300);
    return sliced.length < preview.description.length ? sliced.trimEnd() + '...' : sliced;
  });

  const domainLabel = $derived(preview.domain.toUpperCase());
</script>

<div class="card card--{platform} card--{preview.cardType}">
  {#if preview.cardType === 'large'}
    <div class="card__media">
      {#if preview.imageUrl}
        <img class="card__img" src={preview.imageUrl} alt="" />
      {:else}
        <div class="card__img card__img--empty"></div>
      {/if}
    </div>
    <div class="card__body">
      <div class="card__domain">{domainLabel}</div>
      <div class="card__title" class:card__title--inferred={preview.inferred}>{displayTitle}</div>
      {#if platform === 'facebook' && displayDescription}
        <div class="card__desc">{displayDescription}</div>
      {/if}
    </div>
  {:else if preview.cardType === 'small'}
    <div class="card__row">
      {#if preview.imageUrl}
        <img class="card__thumb" src={preview.imageUrl} alt="" />
      {:else}
        <div class="card__thumb card__thumb--empty"></div>
      {/if}
      <div class="card__body card__body--row">
        <div class="card__title" class:card__title--inferred={preview.inferred}>{displayTitle}</div>
        {#if displayDescription}
          <div class="card__desc card__desc--clamp">{displayDescription}</div>
        {/if}
        <div class="card__domain card__domain--row">{domainLabel}</div>
      </div>
    </div>
  {:else}
    <div class="card__body">
      <div class="card__domain">{domainLabel}</div>
      <div class="card__title" class:card__title--inferred={preview.inferred}>{displayTitle}</div>
      {#if platform === 'facebook' && displayDescription}
        <div class="card__desc">{displayDescription}</div>
      {/if}
    </div>
  {/if}
</div>

<style>
  /* Platform-imitation card: intentionally fixed light, matching real share
     previews, not themed with tokens. */
  .card {
    background: #fff;
    border: 1px solid #dadde1;
    border-radius: 4px;
    overflow: hidden;
    font-family: Helvetica, Arial, sans-serif;
  }

  .card--x {
    border-radius: 16px;
    border-color: #cfd9de;
  }

  .card--linkedin {
    border-radius: 2px;
    border-color: #e0e0e0;
  }

  /* Large card: image on top, 1.91:1 crop */
  .card__media {
    width: 100%;
    aspect-ratio: 1.91 / 1;
    background: #f0f2f5;
    overflow: hidden;
  }

  .card__img {
    width: 100%;
    height: 100%;
    object-fit: cover;
    display: block;
  }

  .card__img--empty,
  .card__thumb--empty {
    background: #e4e6eb;
  }

  .card__body {
    padding: 10px 12px;
  }

  .card__domain {
    font-size: 11px;
    color: #65676b;
    text-transform: uppercase;
    letter-spacing: 0.02em;
    margin-bottom: 2px;
  }

  .card--x .card__domain {
    color: #536471;
    text-transform: none;
    font-size: 13px;
  }

  .card--linkedin .card__domain {
    font-size: 12px;
    color: #00000099;
  }

  .card__title {
    font-size: 16px;
    font-weight: 600;
    color: #1c1e21;
    line-height: 1.3;
  }

  .card--x .card__title {
    font-size: 15px;
    font-weight: 700;
    color: #0f1419;
  }

  .card--linkedin .card__title {
    font-size: 14px;
    font-weight: 600;
    color: #000000e6;
  }

  /* Simulates platform inference mangling: unresolved source used verbatim */
  .card__title--inferred {
    color: #65676b;
    font-style: italic;
  }

  .card__desc {
    font-size: 13px;
    color: #65676b;
    line-height: 1.4;
    margin-top: 3px;
  }

  .card__desc--clamp {
    display: -webkit-box;
    -webkit-line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
  }

  /* Small card: square thumb left, text right */
  .card__row {
    display: flex;
    align-items: stretch;
  }

  .card__thumb {
    width: 88px;
    height: 88px;
    flex-shrink: 0;
    object-fit: cover;
    display: block;
  }

  .card__body--row {
    padding: 8px 12px;
    min-width: 0;
    display: flex;
    flex-direction: column;
    justify-content: center;
    gap: 2px;
  }

  .card__domain--row {
    margin-top: 2px;
    margin-bottom: 0;
  }
</style>
