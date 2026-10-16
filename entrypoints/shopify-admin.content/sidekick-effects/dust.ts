import { barShape, between, type Effect } from './shared';

interface Clump {
  members: Particle[];
  cx: number;
  cy: number;
  vx: number;
  vy: number;
  angle: number;
  spin: number;
  t0: number;
  breakAt: number;
  /** 0 waiting, 1 flying, 2 crumbled */
  state: 0 | 1 | 2;
}

/** One cell of the bar. Positions and speeds are in dust-canvas px. */
interface Particle {
  gx: number;
  gy: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  rel: number;
  life: number;
  size: number;
  wind: number;
  ash: number;
  r: number;
  g: number;
  b: number;
  a: number;
  /** 0 on the bar, 1 in a clump, 2 dust, 3 gone */
  state: 0 | 1 | 2 | 3;
  clump: Clump | null;
  /** Offset from the clump's center. */
  ox: number;
  oy: number;
}

/** 2D value noise with its analytic gradient. Returns one shared object, so read it before the next call. */
function valueNoise() {
  const p = new Uint8Array(256),
    v = new Float32Array(256),
    out = { n: 0, dx: 0, dy: 0 };
  for (let i = 0; i < 256; i++) {
    p[i] = i;
    v[i] = Math.random();
  }
  for (let i = 255; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [p[i], p[j]] = [p[j]!, p[i]!];
  }
  const h = (i: number, j: number) => v[p[(p[i & 255]! + j) & 255]!]!;
  return (x: number, y: number) => {
    const xi = Math.floor(x),
      yi = Math.floor(y),
      fx = x - xi,
      fy = y - yi;
    const a = h(xi, yi),
      b = h(xi + 1, yi),
      c = h(xi, yi + 1),
      d = h(xi + 1, yi + 1);
    const ux = fx * fx * (3 - 2 * fx),
      uy = fy * fy * (3 - 2 * fy),
      k1 = b - a,
      k2 = c - a,
      k3 = a - b - c + d;
    out.n = a + k1 * ux + k2 * uy + k3 * ux * uy;
    out.dx = 6 * fx * (1 - fx) * (k1 + k3 * uy);
    out.dy = 6 * fy * (1 - fy) * (k2 + k3 * ux);
    return out;
  };
}

/**
 * The bar's own pixels turn to dust. Every small cell of the bar is a particle. A ragged release front
 * crosses the bar, starting at the hide button's end. As it passes, each cell is cleared from the bar canvas
 * and lifts off on a second, dust canvas, riding a wind plus curl noise, shrinking and fading toward ash.
 * Some patches leave as clumps and crumble a moment later. Each run draws its own front, wind, timing and
 * texture.
 */
export const dust: Effect = (fx) => {
  const { rect: r, scale: dpr, layer } = fx,
    W = r.width,
    H = r.height,
    rnd = Math.random;
  // Per-run knobs. The wind heading is an angle in screen space, where -90deg is straight up.
  const front = (['sweep', 'spots', 'blotch'] as const)[Math.floor(rnd() * 3)];
  const SWEEP = between(560, 1000), // ms for the release front to cross the bar
    JAG = between(90, 260), // ms of raggedness in the front
    JS = between(9, 26), // px scale of that raggedness
    GRAIN = between(15, 60), // ms of per-cell jitter
    WKS = between(25, 70); // px scale over which wind response varies
  const WA = (between(-160, -60) * Math.PI) / 180, // wind heading
    WS = between(250, 380), // wind strength, px/s²
    ux = Math.cos(WA),
    uy = Math.sin(WA),
    WX = WS * ux,
    WY = WS * uy;
  const LIFE0 = between(550, 900), // ms a particle lives, at least
    LIFEV = between(400, 800), // ms of extra life, at most
    CLUMP = between(90, 400), // particles per clump attempt
    CR = between(2, 5); // px of extra clump radius, at most
  // CSS px units. Wind accelerates dust along this run's heading, drag caps its speed, and a curl-noise
  // velocity field (divergence free) carries it on top, shearing the sheets into wisps.
  const TURB = between(380, 720),
    TURBV = between(55, 120),
    BROWN = between(180, 340),
    DRAG = between(0.45, 0.8),
    FQ = between(0.008, 0.018); // spatial frequency of the curl noise, per px
  const cs = dpr > 1.25 ? 3 : 2; // cell size in texture px

  // The bar canvas stays on screen as the intact bar and loses each cell as it leaves.
  const bc = barShape(fx),
    sw = bc.width,
    sh = bc.height,
    bctx = bc.getContext('2d')!;
  const spx = new Uint32Array(bctx.getImageData(0, 0, sw, sh).data.buffer);
  bc.style.cssText = `position:absolute;left:${r.left}px;top:${r.top}px;width:${sw / dpr}px;height:${sh / dpr}px`;
  // The dust canvas covers where the wind can carry dust: up, and out to either side.
  const padL = Math.min(460, Math.floor(r.left)),
    padT = Math.min(380, Math.floor(r.top)),
    L = r.left - padL,
    T = r.top - padT;
  const DW = Math.round((Math.min(innerWidth, r.left + W + 460) - L) * dpr),
    DH = Math.round((innerHeight - T) * dpr);
  const dc = document.createElement('canvas');
  dc.width = DW;
  dc.height = DH;
  dc.style.cssText = `position:absolute;left:${L}px;top:${T}px;width:${DW / dpr}px;height:${DH / dpr}px`;
  const dctx = dc.getContext('2d')!,
    img = dctx.createImageData(DW, DH),
    buf = new Uint32Array(img.data.buffer);
  const ox = padL * dpr,
    oy = padT * dpr;

  // Release time, made ragged by noise and grainy by jitter. sweep: one front from the hide button's end to the
  // far end. spots: that end and 1 to 3 random points ignite at staggered times and spread both ways. blotch:
  // coarse noise decides, so the bar crumbles in patches, leaning slightly from the hide button's end.
  const noise = valueNoise();
  const speed = (W / SWEEP) * between(0.8, 1.3),
    spots: [number, number][] = [[W, 0]];
  for (let k = 1 + Math.floor(rnd() * 3); k > 0; k--) spots.push([between(0, W), between(60, SWEEP * 0.6)]);
  const releaseAt = (xc: number, yc: number) => {
    if (front === 'sweep') return SWEEP * (1 - xc / W);
    if (front === 'spots')
      return Math.min(...spots.map(([sx, t]) => t + Math.hypot(xc - sx, (yc - H / 2) * 2) / speed));
    return SWEEP * (0.3 * (1 - xc / W) + 0.9 * noise(xc / (JS * 5) + 90, yc / (JS * 5)).n);
  };

  // One particle per cell, colored by the cell's average pixel, so letters and icons crumble in their own colors.
  const gw = Math.ceil(sw / cs),
    gh = Math.ceil(sh / cs),
    grid: (Particle | undefined)[] = [],
    parts: Particle[] = [];
  let relMin = Infinity;
  for (let gy = 0; gy < gh; gy++) {
    for (let gx = 0; gx < gw; gx++) {
      let R = 0,
        G = 0,
        B = 0,
        A = 0,
        k = 0;
      for (let y = gy * cs; y < Math.min(sh, gy * cs + cs); y++) {
        for (let x = gx * cs; x < Math.min(sw, gx * cs + cs); x++) {
          const p = spx[y * sw + x]!,
            a = p >>> 24;
          R += (p & 255) * a;
          G += ((p >> 8) & 255) * a;
          B += ((p >> 16) & 255) * a;
          A += a;
          k++;
        }
      }
      // Near-transparent cells along the rounded edge make no particle, so they go now, not linger.
      if (A / k < 10) {
        bctx.clearRect(gx * cs, gy * cs, cs, cs);
        continue;
      }
      const xc = ((gx + 0.5) * cs) / dpr,
        yc = ((gy + 0.5) * cs) / dpr;
      const ragged = 0.65 * noise(xc / JS, yc / JS).n + 0.35 * noise(xc / (JS * 0.38) + 50, yc / (JS * 0.38) + 20).n;
      const rel = releaseAt(xc, yc) + JAG * (ragged - 0.5) + GRAIN * rnd();
      relMin = Math.min(relMin, rel);
      const p: Particle = {
        gx,
        gy,
        x: ox + gx * cs,
        y: oy + gy * cs,
        vx: 0,
        vy: 0,
        rel,
        // Wind response varies smoothly across the bar, so neighbors leave together as sheets, not as spray.
        wind: 0.55 + 0.9 * noise(xc / WKS + 7, yc / WKS + 3).n + 0.12 * rnd(),
        life: LIFE0 + LIFEV * rnd(),
        size: cs * (0.45 + 0.75 * rnd()),
        ash: 0.55 + 0.45 * rnd(),
        r: R / A,
        g: G / A,
        b: B / A,
        a: A / k,
        state: 0,
        clump: null,
        ox: 0,
        oy: 0
      };
      grid[gy * gw + gx] = p;
      parts.push(p);
    }
  }
  const n = parts.length;
  for (const p of parts) p.rel -= relMin; // the first cell goes on the first frame

  // Clumps: irregular blobs that leave together, tumble briefly, then crumble into dust.
  const clumps: Clump[] = [];
  for (let k = 0; k < n / CLUMP; k++) {
    const s = parts[Math.floor(rnd() * n)]!;
    if (s.clump) continue;
    const rc = ((2 + CR * rnd()) * dpr) / cs,
      m: Particle[] = [];
    for (let gy = Math.floor(s.gy - rc); gy <= s.gy + rc; gy++) {
      for (let gx = Math.floor(s.gx - rc); gx <= s.gx + rc; gx++) {
        const p = gx < 0 || gy < 0 || gx >= gw || gy >= gh ? undefined : grid[gy * gw + gx];
        if (p && !p.clump && Math.hypot(gx - s.gx, gy - s.gy) <= rc * (0.75 + 0.5 * rnd())) m.push(p);
      }
    }
    if (m.length < 4) continue;
    const c: Clump = {
      members: m,
      cx: 0,
      cy: 0,
      vx: 0,
      vy: 0,
      angle: 0,
      spin: (rnd() - 0.5) * 7,
      t0: s.rel,
      breakAt: s.rel + 140 + 280 * rnd(),
      state: 0
    };
    for (const p of m) {
      p.clump = c;
      p.rel = c.t0;
      c.cx += p.x;
      c.cy += p.y;
    }
    c.cx /= m.length;
    c.cy /= m.length;
    for (const p of m) {
      p.ox = p.x - c.cx;
      p.oy = p.y - c.cy;
    }
    clumps.push(c);
  }
  const order = [...parts].sort((a, b) => a.rel - b.rel),
    relMax = order[n - 1]?.rel ?? 0;

  layer.append(bc, dc);
  fx.cover();

  const AR = 124,
    AG = 120,
    AB = 114; // ash
  let simT = 0,
    ri = 0,
    last = performance.now(),
    bx0 = DW,
    by0 = DH,
    bx1 = 0,
    by1 = 0;
  const dot = (x: number, y: number, s: number, c: number) => {
    if (x < 0 || y < 0) return;
    const ix = x | 0,
      iy = y | 0;
    if (ix + s > DW || iy + s > DH) return;
    for (let yy = iy; yy < iy + s; yy++) buf.fill(c, yy * DW + ix, yy * DW + ix + s);
    bx0 = Math.min(bx0, ix);
    by0 = Math.min(by0, iy);
    bx1 = Math.max(bx1, ix + s);
    by1 = Math.max(by1, iy + s);
  };
  // A particle's color, m of the way to ash.
  const color = (p: Particle, m: number, a: number) =>
    (a << 24) | ((p.b + (AB - p.b) * m) << 16) | ((p.g + (AG - p.g) * m) << 8) | (p.r + (AR - p.r) * m);

  return new Promise<void>((resolve) => {
    const frame = (now: number) => {
      if (!layer.isConnected) return resolve();
      const dt = Math.max(0, Math.min(0.05, (now - last) / 1000));
      last = now;
      simT += dt * 1000;
      while (ri < n && order[ri]!.rel <= simT) {
        const p = order[ri++]!;
        bctx.clearRect(p.x - ox, p.y - oy, cs, cs);
        if (p.clump) {
          const c = p.clump;
          p.state = 1;
          if (!c.state) {
            const sp = 12 + 30 * rnd();
            c.state = 1;
            c.vx = (ux * sp + (rnd() - 0.5) * 10) * dpr;
            c.vy = (uy * sp + (rnd() - 0.5) * 10) * dpr;
          }
        } else {
          const sp = 12 + 40 * p.wind + 18 * rnd();
          p.state = 2;
          p.vx = (ux * sp + (rnd() - 0.5) * 16) * dpr;
          p.vy = (uy * sp + (rnd() - 0.5) * 16) * dpr;
        }
      }

      // Clear last frame's dust, remembering its box so the upload covers both.
      for (let y = by0; y < by1; y++) buf.fill(0, y * DW + bx0, y * DW + bx1);
      const qx0 = bx0,
        qy0 = by0,
        qx1 = bx1,
        qy1 = by1;
      bx0 = DW;
      by0 = DH;
      bx1 = 0;
      by1 = 0;
      const tn = simT * 0.00035,
        damp = 1 - DRAG * dt,
        sqdt = Math.sqrt(dt);
      let live = 0;
      for (const c of clumps) {
        if (c.state !== 1) continue;
        const cos = Math.cos(c.angle),
          sin = Math.sin(c.angle);
        if (simT >= c.breakAt) {
          for (const p of c.members) {
            const rx = p.ox * cos - p.oy * sin,
              ry = p.ox * sin + p.oy * cos;
            p.x = c.cx + rx;
            p.y = c.cy + ry;
            p.vx = c.vx - c.spin * ry + (rnd() - 0.5) * 30 * dpr;
            p.vy = c.vy + c.spin * rx + (rnd() - 0.5) * 30 * dpr;
            p.life += c.breakAt - c.t0;
            p.state = 2;
          }
          c.state = 2;
          continue;
        }
        live++;
        const age = simT - c.t0,
          ramp = Math.min(1, age / 250),
          q = noise((c.cx / dpr) * 0.02, (c.cy / dpr) * 0.02 + tn);
        c.vx = (c.vx + (WX * 0.55 * ramp + TURB * 0.35 * q.dy) * dpr * dt) * damp;
        c.vy = (c.vy + (WY * 0.55 * ramp - TURB * 0.35 * q.dx) * dpr * dt) * damp;
        c.cx += c.vx * dt;
        c.cy += c.vy * dt;
        c.angle += c.spin * dt;
        const m = Math.min(0.3, age / 1000);
        for (const p of c.members)
          dot(c.cx + p.ox * cos - p.oy * sin, c.cy + p.ox * sin + p.oy * cos, cs, color(p, m, p.a));
      }
      for (const p of parts) {
        if (p.state !== 2) continue;
        const age = simT - p.rel,
          u = age / p.life;
        if (u >= 1) {
          p.state = 3;
          continue;
        }
        live++;
        const x = p.x / dpr,
          y = p.y / dpr,
          ramp = Math.min(1, age / 250); // a gentle lift, then the wind takes it
        let q = noise(x * FQ, y * FQ + tn),
          cx = q.dy,
          cy = -q.dx; // curl of the noise field: swirls without sources or sinks
        q = noise(x * FQ * 2.9 + 40, y * FQ * 2.9 - 2 * tn);
        cx += 0.7 * q.dy;
        cy -= 0.7 * q.dx;
        const tv = TURBV * Math.min(1, age / 350) * dpr,
          br = BROWN * dpr * sqdt; // turbulence builds as the dust rises off the surface
        p.vx = (p.vx + (WX * p.wind * ramp + 0.3 * TURB * cx) * dpr * dt + (rnd() - 0.5) * br) * damp;
        p.vy = (p.vy + (WY * p.wind * ramp + 0.3 * TURB * cy) * dpr * dt + (rnd() - 0.5) * br) * damp;
        p.x += (p.vx + tv * cx) * dt;
        p.y += (p.vy + tv * cy) * dt;
        dot(
          p.x,
          p.y,
          Math.max(1, Math.round(p.size * (1 - 0.5 * u))),
          color(p, Math.min(0.85, u * 1.5) * p.ash, p.a * (1 - u ** 1.6))
        );
      }
      const ux0 = Math.min(qx0, bx0),
        uy0 = Math.min(qy0, by0),
        ux1 = Math.max(qx1, bx1),
        uy1 = Math.max(qy1, by1);
      if (ux1 > ux0 && uy1 > uy0) dctx.putImageData(img, 0, 0, ux0, uy0, ux1 - ux0, uy1 - uy0);
      if (simT >= relMax + 200) fx.land(); // once the last dust has lifted off
      if (ri >= n && live === 0) {
        bc.remove();
        dc.remove();
        return resolve();
      }
      requestAnimationFrame(frame);
    };
    requestAnimationFrame(frame);
  });
};
