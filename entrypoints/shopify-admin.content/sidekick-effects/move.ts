export type MoveEffect = 'comet' | 'spring';

/** What a move effect works from. Coordinates are viewport CSS px. */
export interface Flight {
  /** Fixed, full-viewport overlay the effect draws into. */
  layer: HTMLElement;
  /** The bar's pixels, cut to its rounded shape. */
  bar: HTMLCanvasElement;
  /** The bar when its pixels were captured. */
  from: DOMRect;
  /** The bar's corner radius. */
  radius: number;
  /** The nav row Sidekick lands as. It is laid out but stays invisible until `land`. */
  row: HTMLElement;
  /** Called the moment the flying bar reaches the row, which should show then. */
  land(): void;
}

const EASE_OUT = 'cubic-bezier(0.23, 1, 0.32, 1)';
const EASE_IN_OUT = 'cubic-bezier(0.65, 0, 0.35, 1)';
const RISE = 'cubic-bezier(0.33, 1, 0.68, 1)';
const BAR_SHADOW = '0 0 0 1px rgb(0 0 0 / 0.06), 0 4px 16px rgb(0 0 0 / 0.1)';
const NO_SHADOW = '0 0 0 1px rgb(0 0 0 / 0), 0 4px 16px rgb(0 0 0 / 0)';
const WHITE: Keyframe = { backgroundColor: '#fff', boxShadow: BAR_SHADOW };

const center = (r: DOMRect) => ({ x: r.left + r.width / 2, y: r.top + r.height / 2 });
const finished = (anims: Animation[]) => Promise.all(anims.map((a) => a.finished.catch(() => {})));
/** Keyframes that hold `a` until `start` and reach `b` at `end`, as fractions of the effect. */
const ramp = (start: number, end: number, a: Keyframe, b: Keyframe): Keyframe[] => [
  a,
  { ...a, offset: start },
  { ...b, offset: end },
  b
];
const size = (r: DOMRect, radius: number): Keyframe => ({
  width: `${r.width}px`,
  height: `${r.height}px`,
  borderRadius: `${radius}px`
});

/** The first opaque background at or behind an element: the nav's own color. */
function backdrop(el: Element): string {
  for (let e: Element | null = el; e; e = e.parentElement) {
    const bg = getComputedStyle(e).backgroundColor;
    if (bg !== 'transparent' && !bg.endsWith(', 0)')) return bg;
  }
  return '#fff';
}

/**
 * Where the bar lands and how it looks there. The fill is the row's text color faintly over the nav, like a
 * hovered item, so it suits a light or a dark nav.
 */
function destination(row: HTMLElement) {
  const style = getComputedStyle(row);
  return {
    to: row.getBoundingClientRect(),
    radius: parseFloat(style.borderTopLeftRadius) || 8,
    fill: `color-mix(in srgb, ${style.color} 14%, ${backdrop(row)})`
  };
}

/**
 * Copies of the row's icon and label, pinned where they sit in it and styled as they look there, so the
 * flying bar lands as an exact match. The condensed nav lays out no label, so none is copied.
 */
function rowContent(row: HTMLElement): HTMLElement {
  const box = row.getBoundingClientRect();
  const content = document.createElement('div');
  content.style.cssText = 'position:absolute;inset:0';
  const label = [...row.querySelectorAll('*')].find((el) => !el.childElementCount && el.textContent?.trim());
  for (const el of [row.querySelector('s-internal-icon'), label]) {
    const r = el?.getBoundingClientRect();
    if (!el || !r?.width) continue;
    const style = getComputedStyle(el);
    const copy = el.cloneNode(true) as HTMLElement;
    copy.removeAttribute('class');
    copy.style.cssText = `position:absolute;left:${r.left - box.left}px;top:${r.top - box.top}px;width:${r.width}px;height:${r.height}px;margin:0;color:${style.color};font:${style.font};letter-spacing:${style.letterSpacing};line-height:${r.height}px;white-space:nowrap`;
    content.append(copy);
  }
  return content;
}

interface Flyer {
  /** Moves along x. */
  x: HTMLElement;
  /** Moves along y, inside `x`, so each axis eases on its own. */
  y: HTMLElement;
  /** The shape, centered on the flight path. */
  shell: HTMLElement;
  bar?: HTMLElement;
  row?: HTMLElement;
}

/** A flying shape carrying the bar's pixels and the row's look, or a bare echo of it in Polaris magic purple. */
function flyer(fl: Flight, echo = false): Flyer {
  const x = document.createElement('div'),
    y = document.createElement('div'),
    shell = document.createElement('div');
  x.style.cssText = 'position:absolute;left:0;top:0';
  shell.style.cssText = `position:absolute;left:0;top:0;translate:-50% -50%;overflow:hidden;background:${echo ? 'var(--p-color-bg-fill-magic, #8051ff)' : '#fff'}`;
  y.append(shell);
  x.append(y);
  fl.layer.append(x);
  if (echo) return { x, y, shell };
  // The bar's left end, where its avatar is, stays in view as the shape narrows.
  const bar = fl.bar;
  bar.style.cssText = `position:absolute;left:0;top:50%;translate:0 -50%;width:${fl.from.width}px;height:${fl.from.height}px`;
  const row = rowContent(fl.row);
  shell.append(bar, row);
  return { x, y, shell, bar, row };
}

/** The bar's pixels fade as the row's look comes in, sliding 6px so the avatar and the row's icon meet. */
const contentFades = (f: Flyer, t: KeyframeAnimationOptions) => [
  f.bar!.animate(ramp(0.1, 0.5, { opacity: 1 }, { opacity: 0 }), t),
  f.row!.animate(ramp(0.35, 0.75, { opacity: 0, translate: '6px 0' }, { opacity: 1, translate: '0 0' }), t)
];

/** Swaps the flyer for the real row, which lands lit up and then settles. */
function arrive(fl: Flight, f: Flyer, fill: string): void {
  f.x.remove();
  fl.land();
  fl.row.animate([{ backgroundColor: fill }, { backgroundColor: 'transparent' }], {
    duration: 900,
    delay: 250,
    easing: EASE_OUT,
    fill: 'backwards'
  });
}

const COMET_MS = 520;

/** Comet's arc from the bar to the row, reshaping on the way. Echoes skip the color and content. */
function cometTrip(fl: Flight, f: Flyer, dest: ReturnType<typeof destination>, delay = 0): Animation[] {
  const t: KeyframeAnimationOptions = { duration: COMET_MS, delay, fill: 'both' };
  const a = center(fl.from),
    b = center(dest.to),
    peak = Math.min(a.y, b.y) - 36;
  const anims = [
    f.x.animate([{ transform: `translateX(${a.x}px)` }, { transform: `translateX(${b.x}px)` }], {
      ...t,
      easing: EASE_IN_OUT
    }),
    f.y.animate(
      [
        { transform: `translateY(${a.y}px)`, easing: RISE },
        { transform: `translateY(${peak}px)`, offset: 0.4, easing: EASE_IN_OUT },
        { transform: `translateY(${b.y}px)` }
      ],
      t
    ),
    f.shell.animate([size(fl.from, fl.radius), size(dest.to, dest.radius)], { ...t, easing: EASE_IN_OUT })
  ];
  if (!f.bar) return anims;
  // The bar stays white until it has left the page behind.
  const fill: Keyframe = { backgroundColor: dest.fill, boxShadow: NO_SHADOW };
  return [...anims, f.shell.animate([WHITE, { ...WHITE, offset: 0.25 }, fill], t), ...contentFades(f, t)];
}

/** The bar arcs into the nav with three fading purple echoes tracing its path. */
async function comet(fl: Flight): Promise<void> {
  const dest = destination(fl.row);
  // Echoes go in first, so they trail beneath the bar.
  const echoes: Animation[] = [];
  [0.3, 0.18, 0.08].forEach((opacity, i) => {
    const echo = flyer(fl, true),
      delay = (i + 1) * 45;
    echoes.push(
      ...cometTrip(fl, echo, dest, delay),
      echo.x.animate([{ opacity }, { opacity, offset: 0.6 }, { opacity: 0 }], {
        duration: COMET_MS,
        delay,
        fill: 'both'
      })
    );
  });
  const f = flyer(fl);
  await finished(cometTrip(fl, f, dest));
  arrive(fl, f, dest.fill);
  // The echoes catch up after the bar lands.
  await finished(echoes);
}

/** A damped spring as a CSS linear() easing, with the time it takes to settle. */
function springEasing(zeta: number, omega: number): KeyframeAnimationOptions {
  const seconds = Math.log(1000) / (zeta * omega);
  const wd = omega * Math.sqrt(1 - zeta * zeta);
  const points = Array.from({ length: 61 }, (_, i) => {
    const t = (i / 60) * seconds;
    const v = 1 - Math.exp(-zeta * omega * t) * (Math.cos(wd * t) + ((zeta * omega) / wd) * Math.sin(wd * t));
    return i === 60 ? 1 : +v.toFixed(4);
  });
  return { easing: `linear(${points.join(', ')})`, duration: Math.round(seconds * 1000) };
}
const MOVE_SPRING = springEasing(0.85, 16);
// Bouncier than the move, so the shape overshoots its slot and settles into it.
const SIZE_SPRING = springEasing(0.6, 18);

/** The bar shoots straight to the nav on springs and settles into the row. */
async function spring(fl: Flight): Promise<void> {
  const dest = destination(fl.row);
  const f = flyer(fl);
  const a = center(fl.from),
    b = center(dest.to);
  const t: KeyframeAnimationOptions = { duration: 420, fill: 'both' };
  await finished([
    f.x.animate([{ transform: `translateX(${a.x}px)` }, { transform: `translateX(${b.x}px)` }], {
      ...MOVE_SPRING,
      fill: 'both'
    }),
    f.y.animate([{ transform: `translateY(${a.y}px)` }, { transform: `translateY(${b.y}px)` }], {
      ...MOVE_SPRING,
      fill: 'both'
    }),
    f.shell.animate([size(fl.from, fl.radius), size(dest.to, dest.radius)], { ...SIZE_SPRING, fill: 'both' }),
    f.shell.animate([WHITE, { ...WHITE, offset: 0.15 }, { backgroundColor: dest.fill, boxShadow: NO_SHADOW }], {
      ...t,
      easing: EASE_OUT
    }),
    ...contentFades(f, t)
  ]);
  arrive(fl, f, dest.fill);
}

/** Each move effect plays a flight and resolves once it has cleaned up after itself. */
export const MOVE_EFFECTS: Record<MoveEffect, (fl: Flight) => Promise<void>> = { comet, spring };
