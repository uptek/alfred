import { sendRuntimeMessage } from '~/utils/messages';
import { getItem, setItem } from '~/utils/storage';
import { dust } from './dust';
import { paper } from './paper';
import { drawEffect, type EffectBag, type HideEffect } from './pick';
import type { Effect, EffectContext, GlassHost, GlassModule } from './shared';

export type PlayedEffect = HideEffect | 'fade';

const BAG_KEY = 'alfred:sidekick-effect-bag';
const EFFECTS: Record<Exclude<HideEffect, 'glass'>, Effect> = { dust, paper };

const reducedMotion = () => !!globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

// Probed once. No WebGL2, or only a software renderer (SwiftShader runs glass at ~12fps), rules glass out.
let webgl: boolean | undefined;
const hasWebGL = () =>
  (webgl ??= (() => {
    const gl = document.createElement('canvas').getContext?.('webgl2', { failIfMajorPerformanceCaveat: true });
    gl?.getExtension('WEBGL_lose_context')?.loseContext();
    return !!gl;
  })());

// The background injects the glass script into this content script's world, where it registers itself. A
// failed load is final for the page, so glass leaves the rotation.
let glass: Promise<GlassModule | null> | null = null,
  glassFailed = false;
const loadGlass = () =>
  (glass ??= sendRuntimeMessage({ type: 'load_sidekick_glass' })
    .then(
      () => (globalThis as GlassHost).alfredSidekickGlass ?? null,
      () => null
    )
    .then((module) => {
      glassFailed = !module;
      if (!module) console.warn('Alfred: the Sidekick glass effect failed to load, so dust plays instead.');
      return module;
    }));

// The next effect is drawn on hover, so glass can load before the click, and saved only once it plays.
let upcoming: Promise<{ effect: HideEffect; bag: EffectBag }> | null = null;
const nextEffect = () =>
  (upcoming ??= getItem<EffectBag>(BAG_KEY).then((bag) =>
    drawEffect(
      bag ?? { left: [], last: null },
      hasWebGL() && !glassFailed ? ['glass', 'dust', 'paper'] : ['dust', 'paper']
    )
  ));

/**
 * The bar's pixels from a screenshot of the tab. The bar is built from Polaris web components, whose shadow
 * DOM doesn't survive cloning or redrawing, so the effects work from what is on screen. The texture keeps at
 * most 2 px per CSS px.
 */
async function captureBar(bar: HTMLElement): Promise<Pick<EffectContext, 'pixels' | 'rect' | 'scale'> | null> {
  try {
    const url = await sendRuntimeMessage({ type: 'capture_tab' });
    if (typeof url !== 'string') throw new Error((url as { error?: string } | null)?.error ?? 'no screenshot');
    const rect = bar.getBoundingClientRect();
    const b64 = url.slice(url.indexOf(',') + 1);
    // A full-viewport PNG runs to megabytes, so decode natively where Chrome can (140+).
    const bytes = Uint8Array.fromBase64
      ? Uint8Array.fromBase64(b64)
      : Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
    const shot = await createImageBitmap(new Blob([bytes], { type: 'image/png' }));
    const s = shot.width / innerWidth,
      scale = Math.min(2, s);
    const pixels = document.createElement('canvas');
    pixels.width = Math.round(rect.width * scale);
    pixels.height = Math.round(rect.height * scale);
    pixels
      .getContext('2d')!
      .drawImage(shot, rect.left * s, rect.top * s, rect.width * s, rect.height * s, 0, 0, pixels.width, pixels.height);
    shot.close();
    return { pixels, rect, scale };
  } catch (error) {
    console.warn('Alfred: could not capture the Sidekick bar, so it fades out instead.', error);
    return null;
  }
}

// Chrome allows two captures a second, so a hover takes one and the click reuses it.
let pending: { at: number; capture: ReturnType<typeof captureBar> } | null = null;
let layer: HTMLElement | null = null;
let playing = false;
// Set once the content script is torn down, so an effect still starting never reaches the page.
let disposed = false;

/**
 * Gets the next hide ready while the pointer is on the bar or its hide button: a fresh screenshot, and glass
 * when glass is next.
 */
export function prepareHideEffect(bar: HTMLElement): void {
  if (reducedMotion()) return;
  if (!pending || performance.now() - pending.at > 1000) pending = { at: performance.now(), capture: captureBar(bar) };
  void nextEffect().then(async ({ effect }) => {
    if (effect === 'glass') (await loadGlass())?.warm();
  });
}

/**
 * Plays the next hide effect over the bar, or fades it out when motion is reduced or the tab can't be
 * captured. `cover` runs once the effect is on screen, when the real bar should go. Resolves true when the
 * effect lands, which is when the toast belongs; the effect cleans up on its own after that. Resolves false
 * when nothing played: an effect was already playing, or the content script was torn down.
 */
export async function playHideEffect(bar: HTMLElement, cover: (effect: PlayedEffect) => void): Promise<boolean> {
  if (playing) return false;
  playing = true;
  try {
    return await play(bar, cover);
  } finally {
    playing = false;
  }
}

async function play(bar: HTMLElement, cover: (effect: PlayedEffect) => void): Promise<boolean> {
  const captured = reducedMotion() ? null : await (pending?.capture ?? captureBar(bar));
  pending = null;
  if (disposed) return false;
  if (!captured) {
    const fade = bar.animate?.([{ opacity: 1 }, { opacity: 0 }], {
      duration: 180,
      easing: 'ease-out',
      fill: 'forwards'
    });
    await fade?.finished.catch(() => {});
    if (!disposed) cover('fade');
    fade?.cancel();
    return !disposed;
  }

  const { effect, bag } = await nextEffect();
  upcoming = null;
  const glassPlay = effect === 'glass' ? (await loadGlass())?.play : undefined;
  if (disposed) return false;
  // Glass falls back to dust if its script fails to load. The bag records what actually played.
  const [name, run]: [HideEffect, Effect] =
    effect !== 'glass' ? [effect, EFFECTS[effect]] : glassPlay ? ['glass', glassPlay] : ['dust', dust];
  void setItem(BAG_KEY, { left: bag.left.filter((e) => e !== name), last: name });

  const host = (layer = document.createElement('div'));
  host.style.cssText = 'position:fixed;inset:0;z-index:2147483000;pointer-events:none;overflow:hidden';
  document.body.append(host);
  const { rect } = captured;
  const radius = Math.min(rect.height / 2, parseFloat(getComputedStyle(bar).borderTopLeftRadius) || rect.height / 2);
  return new Promise((resolve) => {
    let covered = false;
    const fx: EffectContext = {
      ...captured,
      layer: host,
      radius,
      impact: { x: rect.right, y: rect.top + rect.height / 2 },
      cover: () => {
        if (!covered && !disposed) cover(name);
        covered = true;
      },
      land: () => resolve(!disposed)
    };
    run(fx)
      .catch((error: unknown) => console.error('Sidekick hide effect failed:', error))
      .finally(() => {
        fx.cover();
        fx.land();
        host.remove();
        if (layer === host) layer = null;
      });
  });
}

/** Stops a running effect, keeps any still starting off the page, and frees the glass WebGL context. */
export function disposeHideEffects(): void {
  disposed = true;
  layer?.remove();
  layer = null;
  (globalThis as GlassHost).alfredSidekickGlass?.dispose();
}
