import { barShape, between, clamp, insideBar, smooth, type Effect, type EffectContext } from './shared';

const PAPER = '#fbfaf6';
const LIGHT = [-0.299, -0.427, -0.854] as const; // toward the light: upper left and toward the viewer (z grows away from the viewer)
const SVG = 'aria-hidden="true" style="position:absolute;left:0;top:0;overflow:visible"';
const BIN_BACK = `<svg width="60" height="72" viewBox="0 0 60 72" ${SVG}><defs><linearGradient id="alfred-bin-in" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#858585"/><stop offset="1" stop-color="#a9a9a9"/></linearGradient></defs><ellipse cx="30" cy="8" rx="27" ry="5.5" fill="url(#alfred-bin-in)"/><path d="M3 8A27 5.5 0 0 1 57 8" fill="none" stroke="#b9b9b9" stroke-width="2.2"/></svg>`;
const BIN_FRONT = `<svg width="60" height="72" viewBox="0 0 60 72" ${SVG}><defs><linearGradient id="alfred-bin-body" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#e9e9e9"/><stop offset=".55" stop-color="#dadada"/><stop offset="1" stop-color="#cbcbcb"/></linearGradient></defs><path d="M3 8A27 5.5 0 0 0 57 8L52.6 68.6Q52.4 71 50 71H10Q7.6 71 7.4 68.6Z" fill="url(#alfred-bin-body)" stroke="rgba(0,0,0,.08)" stroke-width=".8"/><path d="M16 18L17.4 66M30 19V67M44 18L42.6 66" stroke="rgba(0,0,0,.06)" stroke-width="1.2" stroke-linecap="round"/><path d="M3 8A27 5.5 0 0 0 57 8" fill="none" stroke="#c4c4c4" stroke-width="2.2"/><path d="M5.5 10.4A25 4.6 0 0 0 54.5 10.4" fill="none" stroke="rgba(255,255,255,.6)" stroke-width=".8"/></svg>`;

/** A mesh vertex: where it sits on the bar (u, v), now (x, y, z), last step (px, py, pz), and on the canvas. */
interface Vert {
  id: number;
  u: number;
  v: number;
  x: number;
  y: number;
  z: number;
  px: number;
  py: number;
  pz: number;
  sx: number;
  sy: number;
  /** Corners of the grid lie outside the bar's rounded ends. */
  inside: boolean;
}
interface Link {
  a: Vert;
  b: Vert;
  rest: number;
  stiff: number;
}
interface Edge {
  a: Vert;
  b: Vert;
  tris: Tri[];
}
interface Tri {
  a: Vert;
  b: Vert;
  c: Vert;
  nx: number;
  ny: number;
  nz: number;
  depth: number;
  drawn: boolean;
  /** Edges shared with a neighbor, where a crease line can show. */
  edges: Edge[];
}

/**
 * Crumples the bar on its own canvas and resolves with the finished ball, drawn into a canvas of its own.
 * The bar's pixels are mapped onto a jittered triangle mesh. A position-based cloth sim keeps the sheet from
 * stretching while a shrinking sphere, the hand, squeezes it in three uneven pulses, so it buckles out of
 * plane into irregular folds. Folds set as they form, since the bend links creep toward their current length.
 * Each frame the triangles are drawn far to near with an affine texture map (the plain paper back where they
 * face away), Lambert shading and a line along sharp creases.
 */
function crumple(fx: EffectContext) {
  const { rect: r, scale: dpr, radius: R, layer } = fx,
    W = r.width,
    H = r.height,
    rnd = Math.random;
  const front = barShape(fx),
    back = barShape(fx, PAPER),
    dark = barShape(fx, 'rgb(58,48,34)'),
    light = barShape(fx, '#fff');

  // Mesh: a jittered grid, each quad split along a random diagonal. The grab lifts the sheet toward the
  // viewer, unevenly, which seeds the buckling.
  const NX = Math.round(W / 14),
    NY = 3,
    verts: Vert[] = [];
  for (let j = 0; j <= NY; j++) {
    for (let i = 0; i <= NX; i++) {
      const u = ((i + (i % NX ? (rnd() - 0.5) * 0.5 : 0)) / NX) * W,
        v = ((j + (j % NY ? (rnd() - 0.5) * 0.4 : 0)) / NY) * H;
      const z = (rnd() - 0.5) * 0.8;
      verts.push({
        id: verts.length,
        u,
        v,
        x: r.left + u,
        y: r.top + v,
        z,
        px: r.left + u,
        py: r.top + v,
        pz: z + 0.15 + 0.3 * rnd(),
        sx: 0,
        sy: 0,
        inside: insideBar(u, v, W, H, R)
      });
    }
  }
  const at = (i: number, j: number) => verts[j * (NX + 1) + i]!;
  const tris: Tri[] = [];
  const tri = (a: Vert, b: Vert, c: Vert): Tri => ({ a, b, c, nx: 0, ny: 0, nz: 0, depth: 0, drawn: false, edges: [] });
  for (let j = 0; j < NY; j++) {
    for (let i = 0; i < NX; i++) {
      const a = at(i, j),
        b = at(i + 1, j),
        c = at(i, j + 1),
        d = at(i + 1, j + 1);
      if (rnd() < 0.5) tris.push(tri(a, b, d), tri(a, d, c));
      else tris.push(tri(a, b, c), tri(b, d, c));
    }
  }
  // Every triangle edge keeps its length, since paper does not stretch. Weak bend links between vertices two
  // apart resist folding a little.
  const links: Link[] = [],
    edges = new Map<number, Edge>();
  const link = (a: Vert, b: Vert, stiff: number) => links.push({ a, b, stiff, rest: Math.hypot(b.u - a.u, b.v - a.v) });
  for (const t of tris) {
    for (const [a, b] of [
      [t.a, t.b],
      [t.b, t.c],
      [t.c, t.a]
    ] as const) {
      const key = Math.min(a.id, b.id) * verts.length + Math.max(a.id, b.id);
      let e = edges.get(key);
      if (!e) {
        edges.set(key, (e = { a, b, tris: [] }));
        link(a, b, 1);
      }
      e.tris.push(t);
    }
  }
  for (const e of edges.values()) if (e.tris.length === 2) for (const t of e.tris) t.edges.push(e);
  for (let j = 0; j <= NY; j++) for (let i = 0; i + 2 <= NX; i++) link(at(i, j), at(i + 2, j), 0.06);
  for (let j = 0; j + 2 <= NY; j++) for (let i = 0; i <= NX; i++) link(at(i, j), at(i, j + 2), 0.06);

  // The hand: a sphere around c that shrinks in three uneven squeezes, each with a little springback, while
  // the hand drifts up and the ball starts to turn.
  const CT = between(720, 900), // ms the crumple takes
    RB = 16, // radius of the finished ball, px
    ph = rnd() * 2 * Math.PI; // phase of the hand's wobble
  const c0 = [r.left + W * between(0.35, 0.65), r.top + H / 2] as const,
    c1 = [c0[0] + between(-40, 40), c0[1] - between(10, 36)] as const;
  const R0 = Math.max(...verts.map((p) => Math.hypot(p.x - c0[0], p.y - c0[1]) + 1));
  const t1 = between(0.26, 0.38),
    t2 = between(0.58, 0.7),
    k1 = between(0.38, 0.58),
    k2 = between(0.7, 0.86);
  const keys: [number, number][] = [
    [0, 0],
    [0.07, 0],
    [t1, k1],
    [t1 + 0.07, k1 - between(0.03, 0.08)],
    [t2, k2],
    [t2 + 0.06, k2 - between(0.02, 0.05)],
    [1, 1]
  ];
  const kicks = [0.07, t1 + 0.07, t2 + 0.06];
  const squeeze = (u: number) => {
    let k = 1;
    while (k < keys.length - 1 && u > keys[k]![0]) k++;
    const [ta, fa] = keys[k - 1]!,
      [tb, fb] = keys[k]!;
    return fa + (fb - fa) * smooth(clamp((u - ta) / (tb - ta), 0, 1));
  };
  const center = (u: number) => {
    const e = smooth(u),
      w = 1 - u;
    return [
      c0[0] + (c1[0] - c0[0]) * e + 3 * w * Math.sin(17 * u + ph),
      c0[1] + (c1[1] - c0[1]) * e + 2 * w * Math.cos(13 * u + ph)
    ] as const;
  };
  let ax = rnd() - 0.5,
    ay = rnd() - 0.5,
    az = rnd() - 0.5;
  const al = Math.hypot(ax, ay, az);
  ax /= al;
  ay /= al;
  az /= al;
  const WMAX = between(1.5, 3.5) * (rnd() < 0.5 ? -1 : 1);
  // Rodrigues rotation about the hand (z = 0), written into `out`.
  const out = { x: 0, y: 0, z: 0 };
  const turn = (x: number, y: number, z: number, c: readonly [number, number], cs: number, sn: number) => {
    x -= c[0];
    y -= c[1];
    const d = (ax * x + ay * y + az * z) * (1 - cs);
    out.x = c[0] + x * cs + (ay * z - az * y) * sn + ax * d;
    out.y = c[1] + y * cs + (az * x - ax * z) * sn + ay * d;
    out.z = z * cs + (ax * y - ay * x) * sn + az * d;
  };
  const HS = 1 / 120, // sim step, s
    DAMP = 0.97, // velocity kept per step
    ITER = 8; // constraint passes per step
  let kick = 0;
  const step = (u: number) => {
    const c = center(u),
      rad = R0 + (RB - R0) * squeeze(u),
      th = WMAX * u * u * HS,
      cs = Math.cos(th),
      sn = Math.sin(th);
    // Each squeeze jolts the sheet a little, so the folds it starts are uneven.
    const jolt = kick < kicks.length && u >= kicks[kick]! ? (kick++, 0.5) : 0;
    const j = () => (jolt ? (rnd() - 0.5) * jolt : 0);
    for (const p of verts) {
      turn(p.x, p.y, p.z, c, cs, sn);
      const { x, y, z } = out;
      turn(p.px, p.py, p.pz, c, cs, sn);
      p.x = x + (x - out.x) * DAMP + j();
      p.y = y + (y - out.y) * DAMP + j();
      p.z = z + (z - out.z) * DAMP + j();
      p.px = x;
      p.py = y;
      p.pz = z;
    }
    for (let it = 0; it < ITER; it++) {
      for (const { a, b, rest, stiff } of links) {
        const dx = b.x - a.x,
          dy = b.y - a.y,
          dz = b.z - a.z,
          s = (1 - rest / (Math.hypot(dx, dy, dz) || 1e-6)) * 0.5 * stiff;
        a.x += dx * s;
        a.y += dy * s;
        a.z += dz * s;
        b.x -= dx * s;
        b.y -= dy * s;
        b.z -= dz * s;
      }
      for (const p of verts) {
        const x = p.x - c[0],
          y = p.y - c[1],
          d = Math.hypot(x, y, p.z);
        if (d > rad) {
          const s = rad / d;
          p.x = c[0] + x * s;
          p.y = c[1] + y * s;
          p.z *= s;
        }
      }
    }
    // Folds set: bend links creep toward their current length, so a fold stays folded.
    for (const l of links)
      if (l.stiff < 1) l.rest += (Math.hypot(l.b.x - l.a.x, l.b.y - l.a.y, l.b.z - l.a.z) - l.rest) * 0.04;
  };

  // Drawing. Perspective about a point above the bar; ox, oy: the page position of the canvas's top left.
  const F = 1100,
    pcx = r.left + W / 2,
    pcy = r.top - 60;
  const draw = (g: CanvasRenderingContext2D, ox: number, oy: number) => {
    for (const p of verts) {
      const s = F / (F + p.z);
      p.sx = (pcx + (p.x - pcx) * s - ox) * dpr;
      p.sy = (pcy + (p.y - pcy) * s - oy) * dpr;
    }
    for (const t of tris) {
      const { a, b, c } = t,
        ux = b.x - a.x,
        uy = b.y - a.y,
        uz = b.z - a.z,
        vx = c.x - a.x,
        vy = c.y - a.y,
        vz = c.z - a.z;
      const nx = uy * vz - uz * vy,
        ny = uz * vx - ux * vz,
        nz = ux * vy - uy * vx,
        l = Math.hypot(nx, ny, nz) || 1;
      t.nx = nx / l;
      t.ny = ny / l;
      t.nz = nz / l;
      t.depth = a.z + b.z + c.z;
      t.drawn = false;
    }
    tris.sort((m, k) => k.depth - m.depth);
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.clearRect(0, 0, g.canvas.width, g.canvas.height);
    g.lineCap = 'round';
    for (const t of tris) {
      t.drawn = true;
      const { a, b, c } = t,
        x0 = a.sx,
        y0 = a.sy,
        x1 = b.sx,
        y1 = b.sy,
        x2 = c.sx,
        y2 = c.sy;
      const area = (x1 - x0) * (y2 - y0) - (x2 - x0) * (y1 - y0);
      if (Math.abs(area) < 0.1) continue;
      // Clip a hair outside the triangle, so neighbors overlap instead of leaving antialiased seams.
      const mx = (x0 + x1 + x2) / 3,
        my = (y0 + y1 + y2) / 3;
      g.beginPath();
      for (const p of [a, b, c]) {
        const d = Math.hypot(p.sx - mx, p.sy - my) || 1;
        g.lineTo(p.sx + ((p.sx - mx) / d) * 0.6 * dpr, p.sy + ((p.sy - my) / d) * 0.6 * dpr);
      }
      g.closePath();
      g.save();
      g.clip();
      // Affine map from the bar's pixels to this triangle on screen.
      const u0 = a.u * dpr,
        v0 = a.v * dpr,
        u1 = b.u * dpr - u0,
        v1 = b.v * dpr - v0,
        u2 = c.u * dpr - u0,
        v2 = c.v * dpr - v0;
      const den = u1 * v2 - u2 * v1,
        X1 = x1 - x0,
        Y1 = y1 - y0,
        X2 = x2 - x0,
        Y2 = y2 - y0;
      const ma = (X1 * v2 - X2 * v1) / den,
        mb = (Y1 * v2 - Y2 * v1) / den,
        mc = (X2 * u1 - X1 * u2) / den,
        md = (Y2 * u1 - Y1 * u2) / den;
      g.setTransform(ma, mb, mc, md, x0 - ma * u0 - mc * v0, y0 - mb * u0 - md * v0);
      g.drawImage(area > 0 ? front : back, 0, 0);
      // Lambert shading against the normal that faces the viewer, 0 while the sheet lies flat. The shade is the
      // bar's shape in one color, so it stops at the paper's edge.
      const sg = t.nz > 0 ? -1 : 1,
        sh = sg * (t.nx * LIGHT[0] + t.ny * LIGHT[1] + t.nz * LIGHT[2]) + LIGHT[2];
      g.globalAlpha = sh < 0 ? Math.min(0.5, -sh * 0.55) : Math.min(0.6, sh * 2.2);
      g.drawImage(sh < 0 ? dark : light, 0, 0);
      g.globalAlpha = 1;
      g.restore();
      // A crease line where this triangle meets an already drawn neighbor at a sharp angle.
      for (const e of t.edges) {
        const o = e.tris[0] === t ? e.tris[1]! : e.tris[0]!;
        if (!o.drawn || !e.a.inside || !e.b.inside) continue;
        const dot = t.nx * o.nx + t.ny * o.ny + t.nz * o.nz;
        if (dot > 0.97) continue;
        g.strokeStyle = `rgba(110,96,74,${Math.min(0.35, (0.97 - dot) * 0.8).toFixed(3)})`;
        g.lineWidth = 0.6 * dpr;
        g.beginPath();
        g.moveTo(e.a.sx, e.a.sy);
        g.lineTo(e.b.sx, e.b.sy);
        g.stroke();
      }
    }
  };

  // The sheet canvas: the bar with room for folds to bulge out, and to the bottom edge.
  const CL = Math.floor(r.left - 120),
    CTp = Math.floor(r.top - 260),
    CWd = Math.ceil(W + 240),
    CHt = Math.ceil(innerHeight - CTp);
  const sheet = document.createElement('canvas');
  sheet.width = CWd * dpr;
  sheet.height = CHt * dpr;
  sheet.style.cssText = `position:absolute;left:${CL}px;top:${CTp}px;width:${CWd}px;height:${CHt}px;filter:drop-shadow(0 1.5px 2px rgba(0,0,0,.14))`;
  const g = sheet.getContext('2d')!;
  return new Promise<{ ball: HTMLCanvasElement; sheet: HTMLCanvasElement; cx: number; cy: number; D: number } | null>(
    (resolve) => {
      let simT = 0,
        stepT = 0,
        last = performance.now(),
        first = true;
      const frame = (now: number) => {
        if (!layer.isConnected) return resolve(null);
        simT = Math.min(CT, simT + Math.max(0, Math.min(50, now - last)));
        last = now;
        while (stepT + HS * 1000 <= simT) {
          stepT += HS * 1000;
          step(stepT / CT);
        }
        draw(g, CL, CTp);
        if (first) {
          first = false;
          layer.append(sheet);
          fx.cover();
        }
        if (simT < CT) return requestAnimationFrame(frame);
        // The ball's box on the page, then the same drawing into a canvas of its own.
        let x0 = Infinity,
          y0 = Infinity,
          x1 = -Infinity,
          y1 = -Infinity;
        for (const p of verts) {
          if (!p.inside) continue;
          const x = p.sx / dpr + CL,
            y = p.sy / dpr + CTp;
          x0 = Math.min(x0, x);
          x1 = Math.max(x1, x);
          y0 = Math.min(y0, y);
          y1 = Math.max(y1, y);
        }
        const D = Math.ceil(Math.max(x1 - x0, y1 - y0)) + 4,
          cx = (x0 + x1) / 2,
          cy = (y0 + y1) / 2,
          ball = document.createElement('canvas');
        ball.width = ball.height = D * dpr;
        draw(ball.getContext('2d')!, cx - D / 2, cy - D / 2);
        resolve({ ball, sheet, cx, cy, D });
      };
      requestAnimationFrame(frame);
    }
  );
}

/**
 * The bar is crumpled up like a sheet of paper and tossed into a bin that rose from the bottom edge, which
 * rocks once on impact and sinks back.
 */
export const paper: Effect = async (fx) => {
  const { rect: r, layer } = fx;
  const anims: Animation[] = [];

  // Bin: rises from the bottom edge to the left of the bar while the sheet is crumpled.
  const BW = 60,
    BH = 72,
    binCx = Math.max(44, r.left - 160),
    binL = binCx - BW / 2,
    binT = innerHeight - 66,
    rimY = binT + 8;
  const bin = document.createElement('div'),
    wob = document.createElement('div'),
    ball = document.createElement('div');
  bin.style.cssText = `position:absolute;left:${binL}px;top:${binT}px;width:${BW}px;height:${BH}px`;
  wob.style.cssText = `position:absolute;inset:0;transform-origin:${BW / 2}px ${BH - 2}px;filter:drop-shadow(0 1px 1px rgba(0,0,0,.08))`;
  bin.append(wob);
  wob.insertAdjacentHTML('beforeend', BIN_BACK);
  wob.append(ball);
  wob.insertAdjacentHTML('beforeend', BIN_FRONT);
  layer.append(bin);
  anims.push(
    bin.animate(
      [
        { transform: 'translateY(80px)', easing: 'cubic-bezier(.2,.8,.3,1)' },
        { offset: 0.72, transform: 'translateY(-2.5px)', easing: 'ease-in-out' },
        { transform: 'translateY(0)' }
      ],
      { delay: 150, duration: 440, fill: 'both' }
    )
  );

  const done = await crumple(fx);
  if (!done) return;
  // The ball takes over from the sheet in place. It sits inside the bin, between its back and front.
  const { cx, cy, D } = done,
    BR = D / 2,
    S = [cx, cy] as const;
  done.ball.style.cssText = `position:absolute;left:0;top:0;width:${D}px;height:${D}px`;
  ball.style.cssText = `position:absolute;left:${cx - binL - BR}px;top:${cy - binT - BR}px;width:${D}px;height:${D}px;filter:drop-shadow(0 1.5px 1.5px rgba(0,0,0,.2))`;
  ball.append(done.ball);
  done.sheet.remove();

  // Throw: ballistic. Constant horizontal speed, gravity on the vertical, aimed at the rim, then it drops inside.
  const G = 2600,
    TF = 0.5,
    aim = [binCx + 7, rimY] as const;
  const vxB = (aim[0] - S[0]) / TF,
    vyB = (aim[1] - S[1] - 0.5 * G * TF * TF) / TF;
  const floorY = binT + BH - 4 - BR,
    slack = Math.max(0, 24 - BR),
    spin0 = (Math.random() - 0.5) * 40,
    track: { t: number; transform: string }[] = [];
  let t = 0,
    tHit = 0;
  for (;;) {
    let x = S[0] + vxB * t,
      y = S[1] + vyB * t + 0.5 * G * t * t;
    if (t > TF) x = clamp(x, binCx - slack, binCx + slack); // inside the bin the walls stop it
    const hit = y >= floorY;
    if (hit) y = floorY;
    track.push({
      t,
      transform: `translate(${x - S[0]}px,${y - S[1]}px) rotate(${spin0 - 600 * t}deg) scale(${1 - 0.14 * smooth(Math.min(1, t / TF))})`
    });
    if (hit) {
      tHit = t;
      break;
    }
    t += 1 / 60;
  }
  anims.push(
    ball.animate(
      track.map((k) => ({ offset: k.t / tHit, transform: k.transform })),
      { duration: tHit * 1000, fill: 'forwards' }
    )
  );

  // Impact: the bin rocks once on its base, then sinks back below the edge.
  const IMPACT = tHit * 1000,
    sine = 'cubic-bezier(.37,0,.63,1)';
  anims.push(
    wob.animate(
      [
        { transform: 'translateY(0) rotate(0deg)', easing: 'cubic-bezier(.2,.8,.4,1)' },
        { offset: 0.14, transform: 'translateY(1.5px) rotate(-5deg)', easing: sine },
        { offset: 0.4, transform: 'translateY(0) rotate(3deg)', easing: sine },
        { offset: 0.64, transform: 'translateY(0) rotate(-1.4deg)', easing: sine },
        { offset: 0.84, transform: 'translateY(0) rotate(.5deg)', easing: sine },
        { transform: 'translateY(0) rotate(0deg)' }
      ],
      { delay: IMPACT, duration: 440, fill: 'both' }
    ),
    bin.animate([{ transform: 'translateY(0)' }, { transform: 'translateY(84px)' }], {
      delay: IMPACT + 300,
      duration: 280,
      easing: 'cubic-bezier(.55,0,.8,.3)',
      fill: 'forwards'
    })
  );
  setTimeout(fx.land, IMPACT + 340);
  await Promise.all(anims.map((a) => a.finished)).catch(() => {});
  bin.remove();
};
