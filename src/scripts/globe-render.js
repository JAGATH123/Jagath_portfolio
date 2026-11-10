/* ═══════════════════════════════════════════════════════════
   DATUM LINE — the globe, as characters

   The home field: a sphere drawn in Space Mono, turning under
   a fixed sun, with the three fixes from content/journey.json
   on it and the route between them.

   This file is pure. It knows nothing about the DOM: it takes
   a cell grid and a time and returns a string of spans. That
   is so the SAME code renders the live field in the browser
   (globe.js) and the stills baked into the markup for no-JS
   visitors (scripts/globe_gen.mjs, under Node). Two renderers
   would drift; the still would stop matching the first live
   frame and the globe would visibly jump on load.

   It is drawn as an object, not as a block of text:
   - it turns about an axis that leans 23° off vertical, a full
     turn every 48s, west to east, so the land rolls left to right;
   - the sun is fixed, so the terminator stays where it is while
     the continents pass under it; land and sea are Lambert-lit
     and darken toward the limb, and the lit limb carries a thin
     atmosphere — together that is what makes it read as round;
   - the route, the fixes and their labels exist only on the near
     side. They step down toward the limb and vanish behind it,
     and the route draws itself only while both of its ends face
     the viewer, then erases as they turn away.

   The frame is built in two layers. DATA (the route, the fixes,
   their labels, the ping) is placed first and owns the two bright
   classes. GROUND (land, sea, cloud, limb, stars, satellites) is
   drawn around it, capped at gc, and is cleared to a dark halo
   next to every data cell, so the line never has to compete with
   a coastline for contrast.

   Nothing here picks a colour. A cell gets a class, ga
   (brightest) to gf (faintest) and gm for the route and the
   current fix, and 08-home.css maps those to the grade.

   Everything is deterministic in (grid, t). No Math.random():
   a random star field would make the still and the live first
   frame disagree.

   Started from a public sample (ascii-globe.js). What changed:
   real Natural Earth coastlines instead of a 64x32 sketch, the
   visitor's own route instead of thirteen sample cities, the
   data/ground split, the near-side rules, and a still frame that
   is the resting state rather than an extra.
   ═══════════════════════════════════════════════════════════ */

import { LAND } from './globe-land.js';

const BAY = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
const CLASSES = ['', 'ga', 'gb', 'gc', 'gd', 'ge', 'gf', 'gm'];
const [A, , C, D, E, F, M] = [1, 2, 3, 4, 5, 6, 7];
const DEG = Math.PI / 180;
const TAU = 2 * Math.PI;

/* The turn. At t = 0 the view is centred on 44°E — between Siegen (8°E)
   and Chennai (80°E) — which is the resting frame: the still, reduced
   motion, and the first live frame. Centre longitude falls with time, so
   the near side moves west to east, as the real one does. */
const PERIOD = 48;
const LON0 = 44;
/* the axis leans this far off vertical, in the plane of the screen */
const ROLL = -23 * DEG;

/* Fixed in view space: upper left, a little in front. The terminator is a
   crescent down the right-hand limb, and stays there. */
const SUN = (() => {
  const v = [-0.5, 0.36, 0.79];
  const l = Math.hypot(...v);
  return v.map((n) => n / l);
})();
const SUN2 = (() => {
  const l = Math.hypot(SUN[0], SUN[1]);
  return [SUN[0] / l, SUN[1] / l];
})();

/* The route, in seconds, once both ends face the viewer: draw it, ping
   Siegen, hold. When either end turns away it erases. */
const DRAW = 2.6;
const PING = 1.8;
const ERASE = 1.0;
/* how far round toward the viewer (view-space z) a fix must be ... */
const FACING = 0.3; // ... for the route to run and its label to show
const LIMB = 0.08; // ... for its marker to show at all

/* The globe is sized so its diameter is about this many columns — enough
   for India to read as India — then clamped to a font size that is still a
   glyph. Below NARROW columns across there is no room for place names, and
   labels drop to their numbers. */
const TARGET_DIAMETER_COLS = 58;
const FS_MAX = 11;
const NARROW = 30;

/* Satellites orbit close, so they pass in front of the disc and behind it
   and stay within the grid's bleed. */
const SATS = [
  { r: 1.1, inc: 0.5, node: 0.2, w: 0.42, ph: 0 },
  { r: 1.08, inc: 1.2, node: 2.0, w: -0.32, ph: 2 },
  { r: 1.13, inc: 0.22, node: 4.0, w: 0.26, ph: 4 },
];

/* ── land ──────────────────────────────────────────────────────────────
   globe-land.js is run-length rows, sea first, alternating. A digit or
   letter is a run of 0..60; Z means "61 more, keep reading". */
const ALPHA = '0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ';

function decodeLand({ w, h, rle }) {
  const mask = new Uint8Array(w * h);
  let i = 0;
  let pos = 0;
  let land = 0;
  let acc = 0;
  for (const ch of rle) {
    const v = ALPHA.indexOf(ch);
    if (v === 61) {
      acc += 61;
      continue;
    }
    const n = acc + v;
    acc = 0;
    if (land) mask.fill(1, pos, pos + n);
    pos += n;
    i += n;
    land ^= 1;
    if (n && i % w === 0) land = 0; // every row starts at sea
  }
  return mask;
}

const MASK = decodeLand(LAND);
const LW = LAND.w;
const LH = LAND.h;
const RES = Math.PI / LH; // radians per mask row (and column)

/** bilinear land value 0..1 at lat/lon in radians */
function landAt(lat, lon) {
  let fy = (Math.PI / 2 - lat) / RES - 0.5;
  let fx = (lon + Math.PI) / RES - 0.5;
  fy = Math.max(0, Math.min(LH - 1.001, fy));
  fx = ((fx % LW) + LW) % LW;
  const y0 = fy | 0;
  const x0 = fx | 0;
  const ty = fy - y0;
  const tx = fx - x0;
  const x1 = (x0 + 1) % LW;
  const r0 = y0 * LW;
  const r1 = r0 + LW;
  return (MASK[r0 + x0] * (1 - tx) + MASK[r0 + x1] * tx) * (1 - ty)
    + (MASK[r1 + x0] * (1 - tx) + MASK[r1 + x1] * tx) * ty;
}

function hash01(a, b) {
  const n = Math.sin(a * 12.9898 + b * 78.233) * 43758.5453;
  return n - Math.floor(n);
}

function unit(latD, lonD) {
  const la = latD * DEG;
  const lo = lonD * DEG;
  return [Math.cos(la) * Math.sin(lo), Math.sin(la), Math.cos(la) * Math.cos(lo)];
}

const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const mod = (a, n) => ((a % n) + n) % n;

const escapeHtml = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/* The stroke for one step of the route, from the step itself. Screen y
   grows downward, so down-and-right is a backslash. */
const strokeFor = (dx, dy) => (dy === 0 ? '-' : dx === 0 ? '|' : dx * dy > 0 ? '\\' : '/');

/** the view's rotation at time t: centre longitude, pitch, roll */
const spinAt = (t) => (LON0 - (360 * t) / PERIOD) * DEG;

/* Globe space → view space: turn about the polar axis, pitch the pole
   toward the viewer, then roll the whole thing in the screen plane. */
function makeView(yaw, tilt) {
  const cs = Math.cos(yaw);
  const ss = Math.sin(yaw);
  const ct = Math.cos(tilt);
  const st = Math.sin(tilt);
  const cr = Math.cos(ROLL);
  const sr = Math.sin(ROLL);
  return {
    cs, ss, ct, st, cr, sr,
    to(g) {
      const x1 = g[0] * cs - g[2] * ss;
      const z1 = g[0] * ss + g[2] * cs;
      const y2 = g[1] * ct - z1 * st;
      const z2 = g[1] * st + z1 * ct;
      return [x1 * cr - y2 * sr, x1 * sr + y2 * cr, z2];
    },
  };
}

/**
 * @param {{ fixes: { num: string, place: string, lat: number, lon: number, now: boolean }[] }} opts
 */
export function createRenderer({ fixes }) {
  const points = fixes.map((f) => ({ ...f, g: unit(f.lat, f.lon) }));
  const ends = [points[0], points[points.length - 1]];

  /* The route in globe space, sampled once: every leg in order, arcing a
     little above the surface in the middle, with a cumulative 0..1
     position so the draw can sweep the whole path. */
  const route = [];
  {
    const legs = [];
    let total = 0;
    for (let i = 1; i < points.length; i += 1) {
      const a = points[i - 1].g;
      const b = points[i].g;
      const om = Math.acos(Math.max(-1, Math.min(1, dot(a, b))));
      legs.push({ a, b, om });
      total += om;
    }
    let run = 0;
    for (const { a, b, om } of legs) {
      const n = Math.max(1, Math.ceil(om / 0.01));
      const so = Math.sin(om) || 1;
      for (let k = 0; k <= n; k += 1) {
        const s = k / n;
        const k0 = om ? Math.sin((1 - s) * om) / so : 1 - s;
        const k1 = om ? Math.sin(s * om) / so : s;
        const lift = 1 + 0.1 * Math.sin(Math.PI * s) * Math.min(1, om / 1.2);
        route.push({
          g: [(a[0] * k0 + b[0] * k1) * lift, (a[1] * k0 + b[1] * k1) * lift, (a[2] * k0 + b[2] * k1) * lift],
          s: total ? (run + s * om) / total : 1,
        });
      }
      run += om;
    }
  }
  const now = points.find((p) => p.now) || points[points.length - 1];

  let W = 0;
  let H = 0;
  let RX = 1;
  let RY = 1;
  let CX = 0;
  let CY = 0;
  let TILT = 22 * DEG;
  let narrow = false;
  /** when, within one turn, both ends of the route face the viewer */
  let windows = [];
  /* ground */
  let CH = [];
  let CL = new Uint8Array(0);
  let PZ = new Float32Array(0);
  /* data */
  let DCH = [];
  let DCL = new Uint8Array(0);
  let DM = new Uint8Array(0);
  let N1 = new Uint8Array(0);
  let N2 = new Uint8Array(0);
  /** per disc cell: index, x, y, z, light (Lambert x limb), dither */
  let disc = new Float32Array(0);
  let discN = 0;
  /** cell index → disc slot, or -1 off the disc */
  let slot = new Int32Array(0);
  let isLand = new Uint8Array(0);
  let latA = new Float32Array(0);
  let lonA = new Float32Array(0);
  /** the limb: off-disc cells touching it, with how lit their side is */
  let rim = [];
  let stars = [];

  /* Find the stretches of one turn when both ends of the route face the
     viewer. The turn is periodic, so this is done once per layout rather
     than tracked frame to frame — which keeps draw() a pure function of t,
     and the still, the live field and the generator in agreement. */
  function findWindows() {
    const N = 960;
    const face = [];
    for (let i = 0; i < N; i += 1) {
      const v = makeView(spinAt((i / N) * PERIOD), TILT);
      face.push(ends.every((p) => v.to(p.g)[2] > FACING));
    }
    const out = [];
    const start = face.findIndex((f, i) => !f && face[(i + 1) % N]);
    if (start < 0) return face[0] ? [{ a: 0, b: PERIOD, always: true }] : [];
    for (let k = 1; k <= N; k += 1) {
      const i = (start + k) % N;
      if (face[i] && !face[(i - 1 + N) % N]) out.push({ a: (i / N) * PERIOD, b: 0 });
      if (!face[i] && face[(i - 1 + N) % N] && out.length) out[out.length - 1].b = (i / N) * PERIOD;
    }
    return out;
  }

  /** the route's state at t: which part is drawn, and the head and ping */
  function cycle(t, rest) {
    if (rest) return { from: 0, to: 1, head: -1, ping: -1 };
    const tau = mod(t, PERIOD);
    for (const w of windows) {
      if (w.always) return { from: 0, to: 1, head: -1, ping: -1 };
      const len = mod(w.b - w.a, PERIOD);
      const since = mod(tau - w.a, PERIOD);
      if (since < len) {
        if (since < DRAW) return { from: 0, to: since / DRAW, head: since / DRAW, ping: -1 };
        if (since < DRAW + PING) return { from: 0, to: 1, head: -1, ping: (since - DRAW) / PING };
        return { from: 0, to: 1, head: -1, ping: -1 };
      }
      const after = since - len;
      if (after < ERASE) return { from: after / ERASE, to: 1, head: -1, ping: -1 };
    }
    return { from: 1, to: 0, head: -1, ping: -1 };
  }

  /**
   * Fit the grid to a box. Returns the font size the caller must set, and
   * the grid's size as a multiple of the box's (it may be larger: bleed).
   * @param {number} wPx box width
   * @param {number} hPx box height
   * @param {number} adv character advance as a fraction of the font size
   * @param {{ cy?: number, fill?: number, tilt?: number, fsMin?: number, bleed?: number, bleedX?: number }} [opt]
   *   bleed: how far the grid reaches past the globe, as a multiple of its
   *   diameter, vertically; bleedX the same sideways, where a label beside
   *   a fix near the limb needs the room.
   */
  function layout(wPx, hPx, adv, opt = {}) {
    const { cy: cyFrac = 0.5, fill = 0.94, tilt = 22, fsMin = 7, bleed = 1.3, bleedX = bleed } = opt;
    TILT = tilt * DEG;
    const dPx = Math.min(wPx, hPx) * fill;
    const fs = Math.max(fsMin, Math.min(FS_MAX, dPx / (TARGET_DIAMETER_COLS * adv)));
    /* rounded so the still and the live grid agree to the cell */
    const fsOut = Math.round(fs * 100) / 100;
    const cw = fsOut * adv;
    const gwPx = Math.max(wPx, dPx * bleedX);
    const ghPx = Math.max(hPx, dPx * bleed);
    W = Math.max(1, Math.floor(gwPx / cw));
    H = Math.max(1, Math.floor(ghPx / fsOut));
    RX = dPx / 2 / cw;
    RY = dPx / 2 / fsOut;
    CX = W / 2;
    /* the box is centred on the grid, so the globe's centre in the box
       becomes an offset from the grid's middle */
    CY = H / 2 + ((cyFrac - 0.5) * hPx) / fsOut;
    narrow = RX * 2 < NARROW;
    windows = findWindows();

    const n = W * H;
    CH = new Array(n);
    CL = new Uint8Array(n);
    PZ = new Float32Array(n);
    DCH = new Array(n);
    DCL = new Uint8Array(n);
    DM = new Uint8Array(n);
    N1 = new Uint8Array(n);
    N2 = new Uint8Array(n);
    slot = new Int32Array(n).fill(-1);
    const tmp = [];
    for (let cy = 0; cy < H; cy += 1) {
      for (let cx = 0; cx < W; cx += 1) {
        const x = (cx + 0.5 - CX) / RX;
        const y = (CY - (cy + 0.5)) / RY;
        const r2 = x * x + y * y;
        if (r2 > 1) continue;
        const o = cx + cy * W;
        const z = Math.sqrt(1 - r2);
        /* Lambert, then limb darkening: the edge of a lit sphere is dimmer
           than its middle, which is most of what makes a disc read round */
        const lambert = Math.max(0, x * SUN[0] + y * SUN[1] + z * SUN[2]);
        slot[o] = tmp.length / 6;
        tmp.push(o, x, y, z, lambert * (0.35 + 0.65 * z), BAY[(cx & 3) + ((cy & 3) << 2)] / 16 - 0.5);
      }
    }
    disc = Float32Array.from(tmp);
    discN = tmp.length / 6;
    isLand = new Uint8Array(discN);
    latA = new Float32Array(discN);
    lonA = new Float32Array(discN);

    rim = [];
    stars = [];
    for (let cy = 0; cy < H; cy += 1) {
      for (let cx = 0; cx < W; cx += 1) {
        const o = cx + cy * W;
        if (slot[o] >= 0) continue;
        const x = (cx + 0.5 - CX) / RX;
        const y = (CY - (cy + 0.5)) / RY;
        const r = Math.hypot(x, y) || 1;
        let touches = false;
        for (let dy = -1; dy <= 1 && !touches; dy += 1) {
          for (let dx = -1; dx <= 1; dx += 1) {
            const nx = cx + dx;
            const ny = cy + dy;
            if (nx >= 0 && nx < W && ny >= 0 && ny < H && slot[nx + ny * W] >= 0) {
              touches = true;
              break;
            }
          }
        }
        const lit = (x / r) * SUN2[0] + (y / r) * SUN2[1];
        if (touches) {
          rim.push(o, lit, 1);
        } else if (r < 1.12 && lit > 0.45) {
          rim.push(o, lit, 2); // the glow's outer edge, lit side only
        } else if (r > 1.16 && r < 1.62) {
          /* a round field of stars, thinning outward, so the grid's edge
             never shows as a rectangle of sky */
          const p = 0.035 * (1 - (r - 1.16) / 0.46);
          if (hash01(cx + 0.37, cy + 0.11) < p) stars.push(o, hash01(cy, cx) * TAU);
        }
      }
    }
    return { fs: fsOut, cols: W, rows: H, gw: gwPx / wPx, gh: ghPx / hPx };
  }

  /**
   * One frame.
   * @param {number} t seconds since the field started
   * @param {number} [yawOff] extra yaw, radians (pointer)
   * @param {number} [tiltOff] extra tilt, radians (pointer)
   * @param {{ eol?: string, rest?: boolean }} [o]
   *   eol: line break — '\n' live, '&#10;' for the baked still.
   *   rest: the resting frame (route drawn, no ping), for the stills and
   *   reduced motion, whatever t is.
   */
  function draw(t, yawOff = 0, tiltOff = 0, o = {}) {
    const { eol = '\n', rest = false } = o;
    if (!W || !H) return '';
    const view = makeView(spinAt(t) + yawOff, TILT + tiltOff);
    const toView = view.to;
    const { cs, ss, ct, st, cr, sr } = view;
    const cellX = (v) => Math.floor(CX + v[0] * RX);
    const cellY = (v) => Math.floor(CY - v[1] * RY);
    const inGrid = (x, y) => x >= 0 && x < W && y >= 0 && y < H;

    /* ═══ DATA ═════════════════════════════════════════════════════════ */
    DM.fill(0);
    const put = (x, y, ch, cl) => {
      if (!inGrid(x, y)) return;
      const k = x + y * W;
      DCH[k] = ch;
      DCL[k] = cl;
      DM[k] = 1;
    };
    const { from, to, head, ping } = cycle(t, rest);

    /* The route, cell to cell. Each visible run of samples is thinned to
       anchors about three cells apart, and the walk between anchors visits
       every cell (Bresenham), so there are no gaps and the steps come out
       diagonal where the line is; each cell takes the stroke of the step
       that entered it. A sample counts where it is in front of the globe or
       arcing clear of the limb. Near the limb it steps down from gm to ga. */
    let headCell = null;
    const walk = (a, b) => {
      const [x0, y0] = [Math.floor(a[0]), Math.floor(a[1])];
      const [x1, y1] = [Math.floor(b[0]), Math.floor(b[1])];
      const cl = a[2] > 0.22 && b[2] > 0.22 ? M : A;
      let cx = x0;
      let cy = y0;
      const dx = Math.abs(x1 - cx);
      const dy = -Math.abs(y1 - cy);
      const sx = cx < x1 ? 1 : -1;
      const sy = cy < y1 ? 1 : -1;
      let err = dx + dy;
      let first = true;
      while (cx !== x1 || cy !== y1) {
        const e2 = 2 * err;
        let mx = 0;
        let my = 0;
        if (e2 >= dy) {
          err += dy;
          cx += sx;
          mx = sx;
        }
        if (e2 <= dx) {
          err += dx;
          cy += sy;
          my = sy;
        }
        const stroke = strokeFor(mx, my);
        if (first && !(inGrid(x0, y0) && DM[x0 + y0 * W])) put(x0, y0, stroke, cl);
        first = false;
        put(cx, cy, stroke, cl);
      }
    };
    let run = [];
    const flush = () => {
      if (run.length > 1) {
        const anchors = [run[0]];
        for (let i = 1; i < run.length; i += 1) {
          const a = anchors[anchors.length - 1];
          if (Math.max(Math.abs(run[i][0] - a[0]), Math.abs(run[i][1] - a[1])) >= 3) anchors.push(run[i]);
        }
        const end = run[run.length - 1];
        if (anchors[anchors.length - 1] !== end) anchors.push(end);
        for (let i = 1; i < anchors.length; i += 1) walk(anchors[i - 1], anchors[i]);
        if (head >= 0) headCell = [Math.floor(end[0]), Math.floor(end[1])]; // the last cell drawn is the head
      }
      run = [];
    };
    if (to > from) {
      for (const R of route) {
        const v = toView(R.g);
        const hidden = v[2] < 0 && v[0] * v[0] + v[1] * v[1] <= 1;
        if (R.s < from || R.s > to || hidden) {
          flush();
          continue;
        }
        run.push([CX + v[0] * RX, CY - v[1] * RY, v[2]]);
      }
      flush();
    }
    if (headCell) put(headCell[0], headCell[1], '*', A);

    /* The ping. The ring and everything inside it is cleared first, so it
       is drawn on black; it then fades by stepping its glyph down (o, *, .)
       rather than its colour, which a 7px character cannot show. */
    const nv = toView(now.g);
    if (ping >= 0 && nv[2] > FACING) {
      const bn = now.g;
      const ref = Math.abs(bn[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0];
      let u1 = [bn[1] * ref[2] - bn[2] * ref[1], bn[2] * ref[0] - bn[0] * ref[2], bn[0] * ref[1] - bn[1] * ref[0]];
      const ul = Math.hypot(...u1);
      u1 = u1.map((n) => n / ul);
      const u2 = [bn[1] * u1[2] - bn[2] * u1[1], bn[2] * u1[0] - bn[0] * u1[2], bn[0] * u1[1] - bn[1] * u1[0]];
      const rr = 0.035 + 0.15 * ping;
      const crr = Math.cos(rr);
      const srr = Math.sin(rr);
      const ring = [];
      const steps = Math.max(16, Math.ceil(rr * RX * 8));
      for (let q = 0; q < steps; q += 1) {
        const an = (q / steps) * TAU;
        const ca = Math.cos(an);
        const sa = Math.sin(an);
        const v = toView([
          bn[0] * crr + (u1[0] * ca + u2[0] * sa) * srr,
          bn[1] * crr + (u1[1] * ca + u2[1] * sa) * srr,
          bn[2] * crr + (u1[2] * ca + u2[2] * sa) * srr,
        ]);
        if (v[2] > 0) ring.push([cellX(v), cellY(v), v]);
      }
      const mx = CX + nv[0] * RX;
      const my = CY - nv[1] * RY;
      let rxC = 0.5;
      let ryC = 0.5;
      for (const [, , v] of ring) {
        rxC = Math.max(rxC, Math.abs(CX + v[0] * RX - mx));
        ryC = Math.max(ryC, Math.abs(CY - v[1] * RY - my));
      }
      for (let y = Math.floor(my - ryC); y <= Math.ceil(my + ryC); y += 1) {
        for (let x = Math.floor(mx - rxC); x <= Math.ceil(mx + rxC); x += 1) {
          const ex = (x + 0.5 - mx) / rxC;
          const ey = (y + 0.5 - my) / ryC;
          if (ex * ex + ey * ey < 1 && inGrid(x, y) && !DM[x + y * W]) put(x, y, ' ', 0);
        }
      }
      const glyph = ping < 0.45 ? 'o' : ping < 0.75 ? '*' : '.';
      for (const [x, y] of ring) {
        if (inGrid(x, y) && DM[x + y * W] && DCH[x + y * W] !== ' ') continue; // the route wins
        put(x, y, glyph, ping < 0.5 ? M : A);
      }
    }

    /* The fixes, and their labels. A marker shows on the near side and
       steps down to a dot toward the limb; a label shows only while its fix
       faces the viewer. Kattankulathur and Chennai are 30km apart, one
       character or two, so fixes in the same cell, or within a row and a
       few columns of each other, share a label — "01+02 CHENNAI". A label only goes outward, away
       from the middle of the route; if the name does not fit there it drops
       to its number, and if that does not fit it is left out. It never
       crosses the globe to find room. */
    const seen = [];
    for (const p of points) {
      const v = toView(p.g);
      if (v[2] < LIMB) continue;
      const x = cellX(v);
      const y = cellY(v);
      if (inGrid(x, y)) seen.push({ p, v, x, y });
    }
    const marks = new Set();
    for (const f of seen) {
      const near = f.v[2] > FACING;
      put(f.x, f.y, f.p.now ? (near ? 'O' : 'o') : near ? '+' : '.', f.p.now && near ? M : A);
      marks.add(f.x + f.y * W);
    }
    const facing = seen.filter((f) => f.v[2] > FACING);
    const groups = [];
    for (const f of facing) {
      /* one row apart counts as together too: two labels on adjacent rows
         of a line-height:1 grid touch, and in bold they run into each other */
      const g = groups.find((q) => q.list.some((m) => Math.abs(m.y - f.y) <= 1 && Math.abs(m.x - f.x) <= 3));
      if (g) {
        g.list.push(f);
        g.y = f.y; // the label sits on the row of the latest fix in the group
      } else groups.push({ y: f.y, list: [f] });
    }
    let midX = CX;
    if (seen.length > 1) midX = seen.reduce((sum, f) => sum + f.x, 0) / seen.length;
    const labelled = new Set();
    for (const g of groups) {
      const last = g.list[g.list.length - 1];
      const nums = g.list.map((f) => f.p.num).join('+');
      const lo = Math.min(...g.list.map((f) => f.x));
      const hi = Math.max(...g.list.map((f) => f.x));
      /* outward: away from the other fixes, or away from the globe's
         centre when this is the only one in view */
      const outward = seen.length > 1 ? last.x >= midX : last.x >= CX;
      const tries = narrow ? [` ${nums} `] : [` ${nums} ${last.p.place} `, ` ${nums} `];
      for (const text of tries) {
        const start = outward ? hi + 1 : lo - text.length;
        if (start < 0 || start + text.length > W) continue;
        let clear = true;
        for (let k = 0; k < text.length && clear; k += 1) {
          const at = g.y * W + start + k;
          if (marks.has(at) || labelled.has(at)) clear = false;
        }
        if (!clear) continue;
        for (let k = 0; k < text.length; k += 1) {
          put(start + k, g.y, text[k], k <= nums.length ? M : A);
          labelled.add(g.y * W + start + k);
        }
        break;
      }
    }

    /* the halo: one cell round every data cell, and two for cloud */
    N1.fill(0);
    N2.fill(0);
    for (let y = 0; y < H; y += 1) {
      for (let x = 0; x < W; x += 1) {
        if (!DM[x + y * W] || DCH[x + y * W] === ' ') continue;
        for (let dy = -2; dy <= 2; dy += 1) {
          for (let dx = -2; dx <= 2; dx += 1) {
            const nx = x + dx;
            const ny = y + dy;
            if (!inGrid(nx, ny)) continue;
            const k = nx + ny * W;
            N2[k] = 1;
            if (dx >= -1 && dx <= 1 && dy >= -1 && dy <= 1) N1[k] = 1;
          }
        }
      }
    }

    /* ═══ GROUND ═══════════════════════════════════════════════════════ */
    CH.fill(' ');
    CL.fill(0);
    PZ.fill(-2);

    /* pass 1: what is under each cell — undo the roll, the pitch, the turn */
    for (let i = 0; i < discN; i += 1) {
      const j = i * 6;
      const x = disc[j + 1];
      const y = disc[j + 2];
      const z = disc[j + 3];
      const x2 = x * cr + y * sr;
      const y2 = -x * sr + y * cr;
      const qy = y2 * ct + z * st;
      const qz = -y2 * st + z * ct;
      const gx = x2 * cs + qz * ss;
      const gz = -x2 * ss + qz * cs;
      const lat = Math.asin(Math.max(-1, Math.min(1, qy)));
      const lon = Math.atan2(gx, gz);
      latA[i] = lat;
      lonA[i] = lon;
      isLand[i] = landAt(lat, lon) > 0.5 ? 1 : 0;
      PZ[disc[j]] = z - 0.03;
    }

    /* pass 2: draw it. A coast is land beside sea, and it is the heaviest
       glyph on the globe; inside a coast the fill is lighter and broken,
       and the sea right against a coast is left empty. That outline is what
       makes India a triangle and not part of one block with Arabia. The
       light term already carries the terminator and the limb. */
    const landN = (k, dx, dy) => {
      const x = (k % W) + dx;
      const y = ((k / W) | 0) + dy;
      if (!inGrid(x, y)) return -1;
      const s = slot[x + y * W];
      return s < 0 ? -1 : isLand[s];
    };
    for (let i = 0; i < discN; i += 1) {
      const j = i * 6;
      const k = disc[j];
      const b = disc[j + 4];
      const bay = disc[j + 5];
      const checker = (((k % W) + ((k / W) | 0)) & 1) === 0;
      const nb = [landN(k, -1, 0), landN(k, 1, 0), landN(k, 0, -1), landN(k, 0, 1)];
      if (isLand[i]) {
        const coast = nb.includes(0);
        if (b > 0.06) {
          if (coast) {
            CH[k] = b > 0.36 ? '#' : '*';
            CL[k] = b > 0.32 ? C : b > 0.14 ? D : E;
          } else if (bay > -0.3) {
            /* broken fill: solid fill is what read as a block of text */
            CH[k] = b > 0.5 ? '=' : b > 0.25 ? '-' : ':';
            CL[k] = b > 0.4 ? D : E;
          }
        } else if (coast) {
          CH[k] = ':';
          CL[k] = F;
        } else if (checker) {
          CH[k] = '.';
          CL[k] = F;
          /* a few lit towns on the night side */
          if (hash01(Math.floor(latA[i] / DEG * 3), Math.floor(lonA[i] / DEG * 3)) > 0.93) CL[k] = D;
        }
      } else if (!nb.includes(1)) {
        /* sea: a dither whose density is the light, so the terminator and
           the limb show in the water too */
        const lvl = Math.floor((0.04 + 0.9 * b) * 4 + bay);
        if (lvl >= 3) {
          CH[k] = ':';
          CL[k] = E;
        } else if (lvl === 2) {
          CH[k] = '.';
          CL[k] = E;
        } else if (lvl === 1) {
          CH[k] = '.';
          CL[k] = F;
        } else if (b <= 0.06 && checker && bay > 0.3) {
          CH[k] = '.';
          CL[k] = F;
        }
      }
      /* cloud is ground, the faintest thing on it, and never near the data */
      if (b > 0.15 && !N2[k]) {
        const cloud = Math.sin(lonA[i] * 3.1 + latA[i] * 2.3 + t * 0.07)
          * Math.sin(lonA[i] * 5.3 - latA[i] * 3.7 - t * 0.05 + 1.3);
        if (cloud > 0.74) {
          CH[k] = '~';
          CL[k] = cloud > 0.86 ? E : F;
        }
      }
    }

    /* the atmosphere: an unbroken limb, brighter on the lit side, and a
       second, thinner ring outside it where the sun is */
    for (let i = 0; i < rim.length; i += 3) {
      const k = rim[i];
      const lit = rim[i + 1];
      if (rim[i + 2] === 1) {
        CH[k] = lit > 0.25 ? ':' : '.';
        CL[k] = lit > 0.6 ? C : lit > 0.2 ? D : E;
      } else {
        CH[k] = '.';
        CL[k] = lit > 0.75 ? D : E;
      }
    }

    for (let i = 0; i < stars.length; i += 2) {
      const tw = Math.sin(t * 0.6 + stars[i + 1]);
      if (tw > -0.25) {
        CH[stars[i]] = tw > 0.85 ? '*' : '.';
        CL[stars[i]] = tw > 0.85 ? E : F;
      }
    }

    /* Satellites: decoration, so no brighter than gd. Their orbits are in
       view space; the depth test against the disc is what puts them
       behind the globe for half of every pass. */
    for (const S of SATS) {
      const ci = Math.cos(S.inc);
      const si = Math.sin(S.inc);
      const cn = Math.cos(S.node);
      const sn = Math.sin(S.node);
      for (let q = 0; q < 12; q += 1) {
        const ph = S.ph + S.w * t - Math.sign(S.w) * q * 0.07;
        let p = [S.r * Math.cos(ph), 0, S.r * Math.sin(ph)];
        p = [p[0], p[1] * ci - p[2] * si, p[1] * si + p[2] * ci];
        p = [p[0] * cn + p[2] * sn, p[1], -p[0] * sn + p[2] * cn];
        const x = cellX(p);
        const y = cellY(p);
        if (!inGrid(x, y)) continue;
        const k = x + y * W;
        if (p[2] <= PZ[k]) continue;
        PZ[k] = p[2];
        CH[k] = q === 0 ? 'o' : q < 4 ? ':' : '.';
        CL[k] = q === 0 ? D : q < 4 ? E : F;
      }
    }

    /* ═══ COMPOSE ══════════════════════════════════════════════════════
       Data wins. Next to data the ground is cleared: blank beside it on
       the same row, so a label or a stroke has black either side, and
       above and below it keeps its glyph but drops to the faintest class.
       Blanking those too erased India, which the route crosses. */
    for (let k = 0; k < W * H; k += 1) {
      if (DM[k]) {
        CH[k] = DCH[k];
        CL[k] = DCL[k];
      } else if (N1[k]) {
        const x = k % W;
        const sameRow = (x > 0 && DM[k - 1] && DCH[k - 1] !== ' ') || (x < W - 1 && DM[k + 1] && DCH[k + 1] !== ' ');
        if (sameRow || CH[k] === ' ') {
          CH[k] = ' ';
          CL[k] = 0;
        } else {
          CL[k] = F;
        }
      }
    }

    /* To markup: one span per run of a class, not per cell. A space has no
       colour, so it joins whatever run it is in instead of breaking it —
       most of what a frame costs is the DOM, not the maths. Trailing spaces
       stay: every line must be W wide, or the <pre> changes width frame to
       frame and the globe jitters. */
    let html = '';
    for (let y = 0; y < H; y += 1) {
      let line = '';
      let c = -1;
      for (let x = 0; x < W; x += 1) {
        const k = x + y * W;
        if (CH[k] !== ' ' && CL[k] !== c) {
          if (line) html += c > 0 ? `<span class="${CLASSES[c]}">${escapeHtml(line)}</span>` : line;
          line = '';
          c = CL[k];
        }
        line += CH[k];
      }
      if (line) html += c > 0 ? `<span class="${CLASSES[c]}">${escapeHtml(line)}</span>` : line;
      if (y < H - 1) html += eol;
    }
    return html;
  }

  return {
    layout,
    draw,
    get cols() {
      return W;
    },
    get rows() {
      return H;
    },
  };
}
