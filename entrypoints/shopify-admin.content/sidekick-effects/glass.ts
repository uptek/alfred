import * as THREE from 'three';
import { between, clamp, insideBar, smooth, type EffectContext, type GlassModule } from './shared';

// Knobs. Times are in ms. [a, b] pairs are per-run or per-shard random ranges.
const K = {
  // Fracture
  seeds: [40, 75], // Voronoi seed count per run
  maxPieces: 88, // hard cap on meshes, splits included
  impactShare: [0.35, 0.6], // share of seeds sprayed around the impact
  impactTightness: [2.4, 4.6], // higher packs the impact spray tighter (more tiny splinters)
  clusters: [0, 3], // secondary crack clusters per run
  plates: [1, 3], // seed-free bands per run, so a few big plates survive
  plateWidth: [40, 130],
  resplit: 0.18, // chance a cell over 60px² breaks again along a random line (slivers)
  depth: 6, // slab thickness, px
  camDist: 1200, // camera distance in px; lower means stronger perspective
  // Crack
  crackSpeed: 4.5, // crack wave speed from the impact, px per ms
  crackHold: 110, // the cracked bar holds this long before the blast
  launchJitter: 45, // random extra delay per shard on top of the crack wave
  tilt: [0.02, 0.18], // initial tilt at the break, rad
  // Blast
  blastMin: 70, // travel, px: (blastMin + (blastMax - blastMin) * rnd ** tail) * run scale
  blastMax: 300,
  tail: 2, // heavier tail: more shards stay close, a few fly far
  blastScale: [0.8, 1.3], // per-run multiplier, so some runs burst tighter and some wider
  blastClamp: 320,
  fan: 1.95, // direction spread either side of straight up, rad (past 90° dips a little down)
  upBias: 0.25,
  tau: [80, 220], // drag time constant
  drift: [0, 0.08], // share of the blast distance drifted per second while hanging
  gravity: [20, 70], // px/s² sag in the hang, for shards that don't float
  floatShare: 0.45, // shards that ignore gravity
  spin: [0.15, 10], // total tumble, rad (skewed toward slow)
  spinTau: [150, 750], // tumble decay
  spinDrift: [0, 0.35], // tumble that keeps going through the hang
  blast: 520, // blast phase length before the hang starts
  hang: 120,
  // Funnel
  spread: 380, // gap between the first and last fragment entering the funnel
  pourJitter: 140, // launch time noise, ms
  orderNoise: 0.9, // 0 = strict nearest-first, 1+ = loose
  travel: [470, 770], // time each fragment spends in the funnel
  suck: [1.6, 2.3], // funnel ease-in exponent: higher means a later, harder pull
  stretch: 2.4, // stretch along the path per px/ms of speed
  stretchMax: 1.6,
  mouthDrop: 6 // the funnel mouth sits this far below the viewport's bottom edge
} as const;

type Pt = [number, number];
type Range = readonly [number, number];
const SP = 40; // shadow texture padding, px
const rnd = Math.random;
const range = ([a, b]: Range) => between(a, b);
const int = ([a, b]: Range) => a + Math.floor(rnd() * (b - a + 1));

/** The bar's shadow, drawn alone (the shape sits off-canvas, only its shadow lands). */
function drawShadow(W: number, H: number, R: number, dpr: number) {
  const cv = document.createElement('canvas'),
    off = 10000;
  cv.width = Math.round((W + 2 * SP) * dpr);
  cv.height = Math.round((H + 2 * SP) * dpr);
  const g = cv.getContext('2d')!;
  g.scale(dpr, dpr);
  for (const [y, blur, a] of [
    [8, 24, 0.12],
    [2, 6, 0.06]
  ] as const) {
    g.shadowColor = `rgba(0,0,0,${a})`;
    g.shadowBlur = blur * dpr;
    g.shadowOffsetX = off * dpr;
    g.shadowOffsetY = y * dpr;
    g.beginPath();
    g.roundRect(SP - off, SP, W, H, R);
    g.fill();
  }
  return cv;
}

const canvasTex = (cv: HTMLCanvasElement) => {
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  t.generateMipmaps = false;
  t.minFilter = THREE.LinearFilter;
  return t;
};

// ---------- Runtime Voronoi fracture of the bar (y up, origin at the bar's bottom left) ----------
/** The bar's rounded outline, counterclockwise. */
function outline(W: number, H: number, R: number): Pt[] {
  const pts: Pt[] = [],
    seg = 8;
  for (const [cx, cy, a0] of [
    [W - R, R, -90],
    [W - R, H - R, 0],
    [R, H - R, 90],
    [R, R, 180]
  ] as const) {
    for (let i = 0; i <= seg; i++) {
      const a = ((a0 + (90 * i) / seg) * Math.PI) / 180,
        p: Pt = [cx + R * Math.cos(a), cy + R * Math.sin(a)],
        q = pts[pts.length - 1];
      if (!q || Math.hypot(p[0] - q[0], p[1] - q[1]) > 0.01) pts.push(p);
    }
  }
  return pts;
}

/** Keeps the side of the line through (mx, my) with normal (nx, ny) where the dot product is <= 0. */
function clip(poly: Pt[], mx: number, my: number, nx: number, ny: number): Pt[] {
  const out: Pt[] = [];
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i]!,
      b = poly[(i + 1) % poly.length]!;
    const da = (a[0] - mx) * nx + (a[1] - my) * ny,
      db = (b[0] - mx) * nx + (b[1] - my) * ny;
    if (da <= 0) out.push(a);
    if (da <= 0 !== db <= 0) {
      const t = da / (da - db);
      out.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]);
    }
  }
  return out;
}

function centroid(p: Pt[]) {
  let a = 0,
    x = 0,
    y = 0;
  for (let i = 0; i < p.length; i++) {
    const [x0, y0] = p[i]!,
      [x1, y1] = p[(i + 1) % p.length]!,
      c = x0 * y1 - x1 * y0;
    a += c;
    x += (x0 + x1) * c;
    y += (y0 + y1) * c;
  }
  return { x: x / (3 * a), y: y / (3 * a), area: a / 2 };
}

/**
 * Seeds come from a mix per run: a spray around the impact (tiny splinters), a few secondary clusters,
 * sparse seeds elsewhere, and seed-free bands where big plates survive. Some cells then split again.
 * ponytail: O(n^2) half-plane clipping, fine below a few hundred cells.
 */
function fracture(W: number, H: number, R: number, I: { x: number; y: number }): Pt[][] {
  const maxD = Math.max(I.x, W - I.x);
  const n = int(K.seeds),
    S: Pt[] = [[I.x, I.y]],
    plates: Pt[] = [];
  for (let k = int(K.plates); k--;) {
    const w = range(K.plateWidth),
      x = rnd() * (W - w);
    if (Math.abs(x + w / 2 - I.x) > w / 2 + 40) {
      plates.push([x, x + w]);
      S.push([x + w / 2, H / 2 + (rnd() - 0.5) * H * 0.4]);
    }
  }
  const clusters = Array.from({ length: int(K.clusters) }, () => ({ x: rnd() * W, y: rnd() * H, r: 6 + rnd() * 24 }));
  const pImpact = range(K.impactShare),
    pCluster = clusters.length ? 0.12 + rnd() * 0.2 : 0,
    pow = range(K.impactTightness),
    gap = 1.8 + rnd() * 1.8;
  for (let guard = 0; S.length < n && guard < 20000; guard++) {
    const u = rnd();
    let x: number, y: number;
    if (u < pImpact) {
      const d = 2 + maxD * rnd() ** pow,
        a = rnd() * Math.PI * 2;
      x = I.x + Math.cos(a) * d;
      y = I.y + Math.sin(a) * Math.min(d, H);
    } else if (u < pImpact + pCluster) {
      const c = clusters[Math.floor(rnd() * clusters.length)]!,
        a = rnd() * Math.PI * 2,
        d = c.r * Math.sqrt(rnd());
      x = c.x + Math.cos(a) * d;
      y = c.y + Math.sin(a) * d;
    } else {
      x = rnd() * W;
      y = rnd() * H;
    }
    if (
      insideBar(x, y, W, H, R, -0.5) &&
      !plates.some(([a, b]) => x > a && x < b) &&
      !S.some(([sx, sy]) => (sx - x) ** 2 + (sy - y) ** 2 < gap * gap)
    )
      S.push([x, y]);
  }
  const shape = outline(W, H, R),
    ok = (p: Pt[]) => p.length > 2 && centroid(p).area > 3;
  const cells = S.map(([sx, sy], i) => {
    let poly = shape;
    for (let j = 0; j < S.length && poly.length > 2; j++) {
      const [ox, oy] = S[j]!;
      if (j !== i) poly = clip(poly, (sx + ox) / 2, (sy + oy) / 2, ox - sx, oy - sy);
    }
    return poly;
  }).filter(ok);
  const out: Pt[][] = [];
  cells.forEach((poly, i) => {
    const c = centroid(poly);
    if (c.area > 60 && rnd() < K.resplit && out.length + cells.length - i < K.maxPieces) {
      // Off-center random line: one half is often a thin sliver.
      const a = rnd() * Math.PI,
        nx = Math.cos(a),
        ny = Math.sin(a),
        off = (rnd() - 0.5) * Math.sqrt(c.area) * 0.8;
      const halves = [
        clip(poly, c.x + nx * off, c.y + ny * off, nx, ny),
        clip(poly, c.x + nx * off, c.y + ny * off, -nx, -ny)
      ].filter(ok);
      if (halves.length === 2) {
        out.push(...halves);
        return;
      }
    }
    out.push(poly);
  });
  return out.slice(0, K.maxPieces);
}

/** Extruded cell: group 0 is the front face (bar texture), group 1 the back and sides (glass). */
function cellGeometry(poly: Pt[], cx: number, cy: number, W: number, H: number) {
  const P: number[] = [],
    N: number[] = [],
    U: number[] = [],
    n = poly.length,
    zf = K.depth / 2,
    zb = -K.depth / 2;
  const v = ([x, y]: Pt, z: number, nx: number, ny: number, nz: number) => {
    P.push(x - cx, y - cy, z);
    N.push(nx, ny, nz);
    U.push(x / W, y / H);
  };
  for (let i = 1; i < n - 1; i++) {
    v(poly[0]!, zf, 0, 0, 1);
    v(poly[i]!, zf, 0, 0, 1);
    v(poly[i + 1]!, zf, 0, 0, 1);
  }
  const front = P.length / 3;
  for (let i = 1; i < n - 1; i++) {
    v(poly[0]!, zb, 0, 0, -1);
    v(poly[i + 1]!, zb, 0, 0, -1);
    v(poly[i]!, zb, 0, 0, -1);
  }
  for (let i = 0; i < n; i++) {
    const a = poly[i]!,
      b = poly[(i + 1) % n]!,
      l = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1,
      nx = (b[1] - a[1]) / l,
      ny = (a[0] - b[0]) / l;
    v(a, zf, nx, ny, 0);
    v(a, zb, nx, ny, 0);
    v(b, zb, nx, ny, 0);
    v(a, zf, nx, ny, 0);
    v(b, zb, nx, ny, 0);
    v(b, zf, nx, ny, 0);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(N, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(U, 2));
  g.addGroup(0, front, 0);
  g.addGroup(front, P.length / 3 - front, 1);
  return g;
}

/**
 * Product-shot environment: dark room, a few bright softboxes. Glass needs contrast to read as glass;
 * three's RoomEnvironment is evenly bright and washes the white shards out.
 */
function studio() {
  const s = new THREE.Scene(),
    box = new THREE.BoxGeometry();
  s.background = new THREE.Color(0x2a2d33);
  const panel = (k: number, x: number, y: number, z: number, sx: number, sy: number, sz: number, tint = 0xffffff) => {
    const m = new THREE.Mesh(box, new THREE.MeshBasicMaterial({ color: new THREE.Color(tint).multiplyScalar(k) }));
    m.position.set(x, y, z);
    m.scale.set(sx, sy, sz);
    s.add(m);
  };
  panel(5, 0, 6, 0, 9, 0.2, 5); // overhead softbox
  panel(9, -6, 1, 1, 0.2, 7, 1.4); // left strip
  panel(4, 6, 0, -1, 0.2, 6, 1.2, 0xd8f0ff); // right strip, cool
  panel(4, -2.5, 3, 7, 3, 1.6, 0.2); // small key behind the viewer
  panel(1.2, 0, -6, 0, 12, 0.2, 12, 0x9aa3ad); // dim floor bounce
  return s;
}

interface GL {
  renderer: THREE.WebGLRenderer;
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  env: THREE.WebGLRenderTarget;
  face: THREE.MeshPhysicalMaterial;
  glass: THREE.MeshPhysicalMaterial;
  shadowMat: THREE.MeshBasicMaterial;
  blank: THREE.Texture;
}

interface Piece {
  mesh: THREE.Mesh;
  c: THREE.Vector3;
  v: THREE.Vector3;
  tau: number;
  drift: number;
  g: number;
  axis: THREE.Vector3;
  spin: number;
  spinTau: number;
  spinDrift: number;
  tiltAxis: THREE.Vector3;
  tilt: number;
  nz: number;
  tc: number;
  t0: number;
  key: number;
  launch: number;
  travel: number;
  suck: number;
  P0: THREE.Vector3;
  B1: THREE.Vector3;
  B2: THREE.Vector3;
}

interface Run {
  pieces: Piece[];
  shadow: THREE.Mesh;
  tex: THREE.Texture;
  shTex: THREE.Texture;
  X: THREE.Vector3;
  end: number;
}

// ---------- Motion ----------
/**
 * Blast position: exponential ease-out (per-shard drag), a slow drift so the hang never fully freezes,
 * and gravity sag for the shards that don't float.
 */
function posAt(p: Piece, t: number, out: THREE.Vector3) {
  const tb = Math.max(0, t - p.t0),
    s = tb / 1000;
  out.copy(p.c).addScaledVector(p.v, 1 - Math.exp(-tb / p.tau) + p.drift * s);
  out.y -= 0.5 * p.g * s * s;
  out.z += p.nz * smooth((t - p.tc) / 50);
  return out;
}
type V3 = THREE.Vector3;
const bez = (a: V3, b: V3, c: V3, d: V3, t: number, o: V3) => {
  const u = 1 - t,
    k0 = u * u * u,
    k1 = 3 * u * u * t,
    k2 = 3 * u * t * t,
    k3 = t * t * t;
  return o.set(
    k0 * a.x + k1 * b.x + k2 * c.x + k3 * d.x,
    k0 * a.y + k1 * b.y + k2 * c.y + k3 * d.y,
    k0 * a.z + k1 * b.z + k2 * c.z + k3 * d.z
  );
};
const bezD = (a: V3, b: V3, c: V3, d: V3, t: number, o: V3) => {
  const u = 1 - t,
    k0 = 3 * u * u,
    k1 = 6 * u * t,
    k2 = 3 * t * t;
  return o.set(
    k0 * (b.x - a.x) + k1 * (c.x - b.x) + k2 * (d.x - c.x),
    k0 * (b.y - a.y) + k1 * (c.y - b.y) + k2 * (d.y - c.y),
    k0 * (b.z - a.z) + k1 * (c.z - b.z) + k2 * (d.z - c.z)
  );
};

const _p = new THREE.Vector3(),
  _d = new THREE.Vector3(),
  _s = new THREE.Vector3(),
  _q = new THREE.Quaternion(),
  _q2 = new THREE.Quaternion();
const _id = new THREE.Quaternion(),
  _R = new THREE.Matrix4(),
  _S = new THREE.Matrix4();

function place(p: Piece, t: number, dz: number, X: V3) {
  const tb = Math.max(0, t - p.t0),
    crack = smooth((t - p.tc) / 50);
  _q.setFromAxisAngle(p.axis, p.spin * (1 - Math.exp(-tb / p.spinTau) + (p.spinDrift * tb) / 1000)).multiply(
    _q2.setFromAxisAngle(p.tiltAxis, p.tilt * crack)
  );
  let a = 1,
    b = 1,
    sc = 1;
  const s = clamp((t - p.launch) / p.travel, 0, 1);
  if (s <= 0) {
    posAt(p, t, _p);
    _d.set(1, 0, 0);
  } else {
    // Funnel: an S-shaped cubic from where the fragment hangs to the mouth, accelerating, stretched
    // along its path, shrinking and turning flat as it goes in.
    const e = s ** p.suck;
    bez(p.P0, p.B1, p.B2, X, e, _p);
    const speed = (bezD(p.P0, p.B1, p.B2, X, e, _d).length() * p.suck * s ** (p.suck - 1)) / p.travel;
    _d.normalize();
    a = 1 + Math.min(K.stretchMax, speed * K.stretch);
    b = 1 / Math.sqrt(a);
    sc = 1 - 0.95 * smooth((e - 0.25) / 0.75);
    _q.slerp(_id, smooth(s) * 0.8);
  }
  _p.z -= (K.depth / 2) * dz; // keeps the front face on z = 0 while the slab thickens
  const k = a - b,
    { x, y, z } = _d;
  _S.set(
    b + k * x * x,
    k * x * y,
    k * x * z,
    0,
    k * y * x,
    b + k * y * y,
    k * y * z,
    0,
    k * z * x,
    k * z * y,
    b + k * z * z,
    0,
    0,
    0,
    0,
    1
  );
  p.mesh.matrix
    .multiplyMatrices(_S, _R.makeRotationFromQuaternion(_q))
    .scale(_s.set(sc, sc, sc * dz))
    .setPosition(_p);
  p.mesh.matrixWorldNeedsUpdate = true;
}

/**
 * The bar shatters like a sheet of glass: runtime Voronoi fracture into thin extruded slabs whose front face
 * is the bar's own pixels, a crack beat, a blast with heavy-tailed travel and tumble, a short hang, then a
 * genie-like pour into the bottom edge.
 */
export function createGlass(): GlassModule {
  let gl: GL | null = null,
    run: (Run & { stop: () => void }) | null = null;

  // WebGL: created ahead of the click, so it does not wait on shader compiles.
  const ensureGL = (): GL => {
    if (gl) return gl;
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(devicePixelRatio);
    renderer.setClearColor(0x000000, 0);
    renderer.domElement.style.cssText = 'position:absolute;inset:0;width:100%;height:100%';
    const scene = new THREE.Scene();
    const pmrem = new THREE.PMREMGenerator(renderer),
      studioScene = studio();
    const env = pmrem.fromScene(studioScene, 0.02);
    pmrem.dispose();
    studioScene.traverse((o) => {
      if (o instanceof THREE.Mesh) {
        o.geometry.dispose();
        (o.material as THREE.Material).dispose();
      }
    });
    scene.environment = env.texture;
    const sun = new THREE.DirectionalLight(0xffffff, 2.2);
    sun.position.set(-0.6, 1, 0.8);
    scene.add(sun);
    const camera = new THREE.PerspectiveCamera(30, 1, 10, 8000);
    camera.position.set(0, 0, K.camDist);
    const blank = new THREE.Texture();
    blank.colorSpace = THREE.SRGBColorSpace;
    // Front face: emissive copy of the bar so the break frame matches the page pixel for pixel; diffuse and
    // reflections fade in as the pieces lift, which is what gives the tumbling faces their light.
    const face = new THREE.MeshPhysicalMaterial({
      map: blank,
      emissiveMap: blank,
      emissive: 0xffffff,
      color: 0x000000,
      roughness: 0.28,
      metalness: 0,
      clearcoat: 1,
      clearcoatRoughness: 0.04,
      side: THREE.DoubleSide,
      envMapIntensity: 0
    });
    // Back and sides: clear glass. Transmission keeps reflections at full strength while the body stays see-through.
    const glass = new THREE.MeshPhysicalMaterial({
      color: 0xffffff,
      roughness: 0,
      metalness: 0,
      transmission: 1,
      thickness: K.depth,
      ior: 1.5,
      attenuationColor: new THREE.Color(0x4fb3a0),
      attenuationDistance: 12,
      clearcoat: 1,
      clearcoatRoughness: 0,
      envMapIntensity: 2.2,
      specularIntensity: 1
    });
    const shadowMat = new THREE.MeshBasicMaterial({ map: blank, transparent: true, depthWrite: false });
    const warm = new THREE.Group();
    const wg = cellGeometry(
        [
          [0, 0],
          [10, 0],
          [10, 10],
          [0, 10]
        ],
        5,
        5,
        10,
        10
      ),
      pg = new THREE.PlaneGeometry();
    warm.add(new THREE.Mesh(wg, [face, glass]), new THREE.Mesh(pg, shadowMat));
    scene.add(warm);
    renderer.compile(scene, camera);
    scene.remove(warm);
    wg.dispose();
    pg.dispose();
    return (gl = { renderer, scene, camera, env, face, glass, shadowMat, blank });
  };

  const disposeGL = () => {
    if (!gl) return;
    const { renderer, env, face, glass, shadowMat, blank } = gl;
    for (const d of [face, glass, shadowMat, blank, env, renderer]) d.dispose();
    renderer.forceContextLoss();
    renderer.domElement.remove();
    gl = null;
  };

  const play = (fx: EffectContext) =>
    new Promise<void>((resolve) => {
      const G = ensureGL(),
        { renderer, scene, camera, face, shadowMat } = G,
        r = fx.rect;
      const iw = innerWidth,
        ih = innerHeight,
        W = r.width,
        H = r.height,
        R = fx.radius;
      renderer.setSize(iw, ih, false);
      camera.aspect = iw / ih;
      camera.fov = (2 * Math.atan(ih / 2 / K.camDist) * 180) / Math.PI; // 1 world unit = 1 CSS px at z = 0
      camera.updateProjectionMatrix();
      const ox = r.left - iw / 2,
        oy = ih / 2 - r.bottom; // world position of the bar's bottom-left corner

      // The texture is the bar's rectangle, page pixels around the rounded ends included, so edge
      // filtering blends with the page instead of adding a dark fringe.
      const tex = canvasTex(fx.pixels),
        shTex = canvasTex(drawShadow(W, H, R, fx.scale));
      face.map = face.emissiveMap = tex;
      shadowMat.map = shTex;
      const zs = K.depth + 0.5,
        f = (K.camDist + zs) / K.camDist; // shadow sits behind the slab, scaled back to its on-screen size
      const shadow = new THREE.Mesh(new THREE.PlaneGeometry(W + 2 * SP, H + 2 * SP), shadowMat);
      shadow.position.set((ox + W / 2) * f, (oy + H / 2) * f, -zs);
      shadow.scale.setScalar(f);
      scene.add(shadow);

      const I = { x: clamp(fx.impact.x - r.left, 8, W - 8), y: clamp(r.bottom - fx.impact.y, 6, H - 6) };
      const cells = fracture(W, H, R, I).map((poly) => Object.assign(centroid(poly), { poly }));
      const maxD = Math.max(...cells.map((c) => Math.hypot(c.x - I.x, c.y - I.y)));
      const TF = K.crackHold + K.blast + K.hang,
        tmp = new THREE.Vector3(),
        blastScale = range(K.blastScale);
      // Hang spot must stay on screen (projected, since shards near the viewer look farther out).
      const onScreen = (q: V3) => {
        const s = K.camDist / (K.camDist - q.z);
        return Math.abs(q.x * s) < iw / 2 - 16 && q.y * s > -ih / 2 + 8 && q.y * s < ih / 2 - 72;
      };
      const pieces = cells.map((c): Piece => {
        const mesh = new THREE.Mesh(cellGeometry(c.poly, c.x, c.y, W, H), [face, G.glass]);
        mesh.matrixAutoUpdate = false;
        scene.add(mesh);
        const dx = c.x - I.x,
          dy = c.y - I.y,
          d = Math.hypot(dx, dy),
          near = 1 - d / maxD,
          size = smooth(c.area / 1200);
        // Random direction in a wide fan around straight up (sideways both ways, a little down), mild up bias,
        // plus a push away from the impact for shards right next to it.
        const fan = (rnd() * 2 - 1) * K.fan,
          rx = d > 2 ? dx / d : 0,
          ry = d > 2 ? dy / d : 1;
        const ux = Math.sin(fan) + rx * near * 0.6,
          uy = Math.cos(fan) + K.upBias + ry * near * 0.6 * (ry < 0 ? 0.4 : 1),
          uz = -0.35 + rnd() * 1.3;
        // Heavy-tailed travel: most stay close, a few fly far. Splinters fly farther than plates.
        const D = Math.min(
          K.blastClamp,
          (K.blastMin + (K.blastMax - K.blastMin) * rnd() ** K.tail) *
            blastScale *
            (0.8 + 0.4 * near) *
            (1.2 - 0.5 * size)
        );
        const sign = rnd() < 0.5 ? -1 : 1,
          ta = rnd() * Math.PI * 2,
          tc = (d / K.crackSpeed) * (0.75 + 0.5 * rnd());
        const p: Piece = {
          mesh,
          c: new THREE.Vector3(ox + c.x, oy + c.y, 0),
          v: new THREE.Vector3(ux, uy, uz).setLength(D),
          tau: range(K.tau),
          drift: range(K.drift),
          g: rnd() < K.floatShare ? 0 : range(K.gravity),
          axis: new THREE.Vector3(rnd() - 0.5, rnd() - 0.5, rnd() - 0.5).normalize(),
          spin: sign * (K.spin[0] + (K.spin[1] - K.spin[0]) * rnd() ** 2.2) * (1.25 - 0.55 * size),
          spinTau: range(K.spinTau),
          spinDrift: rnd() < 0.3 ? 0 : range(K.spinDrift),
          tiltAxis: new THREE.Vector3(Math.cos(ta), Math.sin(ta), 0),
          tilt: (rnd() < 0.5 ? -1 : 1) * (K.tilt[0] + (K.tilt[1] - K.tilt[0]) * rnd() ** 1.5),
          nz: rnd() * 3.5 * (0.3 + near),
          tc,
          t0: K.crackHold + tc * 0.4 + rnd() * K.launchJitter,
          key: 0,
          launch: 0,
          travel: 0,
          suck: 0,
          P0: new THREE.Vector3(),
          B1: new THREE.Vector3(),
          B2: new THREE.Vector3()
        };
        for (let k = 0; k < 8 && !onScreen(posAt(p, TF + K.spread, tmp)); k++) {
          p.v.multiplyScalar(0.75);
          p.g *= 0.6;
        }
        return p;
      });

      // Funnel schedule: loosely nearest the mouth first, with noisy launch times, travel times and curves,
      // so the pour reads as a stream rather than a queue.
      const X = new THREE.Vector3(ox + W / 2, -ih / 2 - K.mouthDrop, 0);
      for (const p of pieces) p.key = posAt(p, TF, tmp).distanceTo(X) * (1 + (rnd() - 0.5) * K.orderNoise);
      [...pieces]
        .sort((a, b) => a.key - b.key)
        .forEach((p, i, arr) => {
          p.launch = Math.max(
            TF - 60,
            TF + (K.spread * i) / Math.max(1, arr.length - 1) + (rnd() - 0.5) * K.pourJitter
          );
          p.travel = range(K.travel);
          p.suck = range(K.suck);
        });
      for (const p of pieces) {
        posAt(p, p.launch, p.P0);
        p.B1.copy(p.P0).add(new THREE.Vector3((rnd() - 0.5) * 40, 4 + rnd() * 30, 0)); // lift before the pull
        p.B2.set(
          X.x + (p.P0.x - X.x) * rnd() * 0.3 + (rnd() - 0.5) * 30,
          X.y + (0.4 + 0.3 * rnd()) * (p.P0.y - X.y) + 10 + rnd() * 40,
          0
        );
      }
      const end = Math.max(...pieces.map((p) => p.launch + p.travel));

      const teardown = () => {
        if (run !== me) return;
        run = null;
        for (const p of me.pieces) {
          scene.remove(p.mesh);
          p.mesh.geometry.dispose();
        }
        scene.remove(me.shadow);
        me.shadow.geometry.dispose();
        me.tex.dispose();
        me.shTex.dispose();
        disposeGL();
        resolve();
      };
      const me = (run = { pieces, shadow, tex, shTex, X, end, stop: teardown });
      fx.layer.append(renderer.domElement);

      let vt = 0,
        last = 0,
        frames = 0;
      const frame = (now: number) => {
        if (run !== me) return;
        if (!fx.layer.isConnected) return teardown();
        vt += frames ? Math.min(now - last, 50) : 0;
        last = now;
        // The front face starts as an exact copy of the bar, then picks up light as the pieces lift.
        const L = smooth(vt / 140);
        face.color.setScalar(0.6 * L);
        face.emissiveIntensity = 1 - 0.5 * L;
        face.envMapIntensity = L;
        // clearcoat stays above 0 (a different shader otherwise) but near 0 at the break, since it dims the base layer by ~4%
        face.clearcoat = 0.001 + 0.999 * L;
        shadowMat.opacity = 1 - smooth(vt / 220);
        const dz = 0.02 + 0.18 * smooth(vt / 60) + 0.8 * smooth((vt - K.crackHold + 20) / 140); // thin until the blast, so the outline stays the bar's
        for (const p of pieces) place(p, vt, dz, X);
        renderer.render(scene, camera);
        if (frames++ === 0) fx.cover(); // the same frame the slab first draws
        if (vt >= end - 200) fx.land();
        if (vt >= end) teardown();
        else requestAnimationFrame(frame);
      };
      requestAnimationFrame(frame);
    });

  return {
    warm: () => void ensureGL(),
    play,
    dispose: () => {
      run?.stop();
      disposeGL();
    }
  };
}
