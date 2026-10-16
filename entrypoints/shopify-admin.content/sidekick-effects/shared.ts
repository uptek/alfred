/** What a hide effect works from. Coordinates are viewport CSS px. */
export interface EffectContext {
  /** Fixed, full-viewport overlay the effect draws into. Once it leaves the page, the effect stops. */
  layer: HTMLElement;
  /** The bar when its pixels were captured. */
  rect: DOMRect;
  /** The bar's corner radius. */
  radius: number;
  /** The bar's pixels, cropped to `rect` but not to its rounded shape. */
  pixels: HTMLCanvasElement;
  /** Texture px per CSS px in `pixels`. */
  scale: number;
  /** Where the effect starts: the bar's end next to the hide button. */
  impact: { x: number; y: number };
  /** Called once the effect covers the bar, so the real bar can go. */
  cover(): void;
  /** Called when the effect has landed, which is when the toast shows. */
  land(): void;
}

/** Plays an effect and resolves once it has cleaned up after itself. */
export type Effect = (fx: EffectContext) => Promise<void>;

/** The glass effect, injected on demand because it bundles three.js. */
export interface GlassModule {
  /** Creates the WebGL context and compiles shaders, so a click doesn't wait on them. */
  warm(): void;
  play: Effect;
  dispose(): void;
}

export type GlassHost = typeof globalThis & { alfredSidekickGlass?: GlassModule };

export const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));
/** A uniformly random number between a and b. */
export const between = (a: number, b: number) => a + (b - a) * Math.random();
export const smooth = (t: number) => (t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t));

/** Whether a point, in px from the bar's top left, lies inside the bar's rounded shape grown by `slack`. */
export function insideBar(x: number, y: number, W: number, H: number, R: number, slack = 0.5): boolean {
  return Math.hypot(x - clamp(x, R, W - R), y - clamp(y, R, H - R)) <= R + slack;
}

/** A canvas the size of `fx.pixels` holding the bar's rounded shape: its pixels, or one color when given. */
export function barShape(fx: EffectContext, color?: string): HTMLCanvasElement {
  const { pixels, scale, rect, radius } = fx;
  const c = document.createElement('canvas');
  c.width = pixels.width;
  c.height = pixels.height;
  const g = c.getContext('2d')!;
  g.scale(scale, scale);
  g.beginPath();
  g.roundRect(0, 0, rect.width, rect.height, radius);
  if (color) {
    g.fillStyle = color;
    g.fill();
  } else {
    g.clip();
    g.drawImage(pixels, 0, 0, rect.width, rect.height);
  }
  return c;
}
