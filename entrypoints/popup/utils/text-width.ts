// Google truncates desktop SERP titles by pixel width, not character count.
// This measures text the same way Chrome would render it in that font, so
// SerpPreview and the Meta Title pill (Overview.svelte) agree on the cutoff.
const TITLE_FONT = '20px arial, sans-serif';
export const TITLE_MAX_PX = 600;

let measureCtx: CanvasRenderingContext2D | null = null;

export function titleWidthPx(text: string): number {
  measureCtx ??= document.createElement('canvas').getContext('2d');
  if (!measureCtx) return 0;
  measureCtx.font = TITLE_FONT;
  return measureCtx.measureText(text).width;
}
