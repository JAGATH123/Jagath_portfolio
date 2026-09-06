/* ═══════════════════════════════════════════════════════════
   DATUM LINE — scene

   One canvas layer: a drifting field of soft radial blobs over
   a two-stop backdrop. No 3D, no wireframe — the whole picture
   is one linear gradient plus a handful of radial ones.

   It also owns six CSS custom properties on #root:
     --accent, --accent2, --slab-fg   the grade, cross-faded
     --ca                             chromatic aberration
     --scan-op, --grain-op            the film overlays
   The first four follow the current screen; the last two follow
   the motion preference and nothing else.
   ═══════════════════════════════════════════════════════════ */

import { CHANNELS, DEFAULT_GRADE, GRADES } from './grades.js';
import { lerpRgb, rgb, rgba, smoothstep } from './color.js';
import { reducedMotion, watchMedia } from '../media.js';

/* ── timing ── */
const FADE_MS = 780;

/* The loop is stopped while the tab is hidden, so the first frame after a
   resume carries the whole gap. Clamping the step keeps the field from
   teleporting; the same clamp absorbs GC pauses and background throttling. */
const MAX_DRIFT_STEP_MS = 100;

/* ── canvas ── */
/* Retina is worth the backing store, 3x is not: cost is quadratic in DPR and
   there is nothing in a blurred gradient for the extra samples to resolve. */
const DPR_CAP = 2;

/* Same breakpoint as the CSS layout switch — src/styles/15-phone.css. */
const NARROW = '(max-width:760px)';

/* ── the field ── */
/* The array is built once at the wide count and the narrow breakpoint simply
   draws fewer of them. Rebuilding on every breakpoint flip would re-roll the
   Math.random() parameters and make the whole field jump. */
const BLOBS_WIDE = 6;
const BLOBS_NARROW = 4;

const DRIFT_FX_MIN = 0.00006, DRIFT_FX_SPAN = 0.00007; // radians per unit of drift clock
const DRIFT_FY_MIN = 0.00005, DRIFT_FY_SPAN = 0.00007;
const SWING_MIN = 0.26, SWING_SPAN = 0.18;   // travel, as a fraction of the viewport
const RADIUS_MIN = 0.5,  RADIUS_SPAN = 0.35; // radius, as a fraction of the scale below
const BLOB_RADIUS_SCALE = 0.55;              // ... of max(width, height)
const PHASE_SKEW = 1.3;  // offsets the vertical phase so the two axes never start in lockstep
const BLOB_MID_STOP = 0.45;
const BLOB_MID_ALPHA = 0.34;

/* ── intensity ── */
/* One dial behind alpha, drift speed, aberration, scanlines and grain.
   Reduced motion turns it down; it does not stop the drift on its own —
   that is a separate, absolute freeze below. */
const INTENSITY_FULL = 0.6;
const INTENSITY_REDUCED = 0.12;

const BLOB_ALPHA_BASE = 0.15, BLOB_ALPHA_GAIN = 0.17;
const DRIFT_SPEED_BASE = 0.5, DRIFT_SPEED_GAIN = 0.7;
const SCAN_OP_BASE = 0.2,   SCAN_OP_GAIN = 0.5;
const GRAIN_OP_BASE = 0.02, GRAIN_OP_GAIN = 0.07;

/* Chromatic aberration, in px of colour split. The burst is a single-frame
   spike roughly once a second, which is what makes the type shimmer. */
const CA_BURST_CHANCE = 0.015;
const CA_WIDE_BASE = 0.25, CA_WIDE_GAIN = 1.0, CA_WIDE_BURST = 2.4;
const CA_NARROW_BASE = 0.12, CA_NARROW_GAIN = 0.42, CA_NARROW_BURST = 1.2;

const randomIn = (min, span) => min + Math.random() * span;

/** A private copy of a grade's channels — the interpolation target and source. */
const snapshot = (source) => {
  const copy = { name: source.name };
  for (const channel of CHANNELS) copy[channel] = [...source[channel]];
  return copy;
};

/**
 * @returns {null | {
 *   frame: (now: number) => void,
 *   setGrade: (key: string, options?: { immediate?: boolean }) => void,
 *   gradeName: string,
 * }} null when there is nothing to render into, in which case the CSS
 *    defaults stand and the rest of the page carries on without a scene.
 */
export function createScene() {
  const canvas = document.getElementById('bg');
  const root = document.getElementById('root');
  if (!canvas || !root) return null;

  const ctx = canvas.getContext('2d');
  if (!ctx) return null;

  const narrow = watchMedia(NARROW);

  /* ── viewport ── */
  let width = 1, height = 1, dpr = 1;
  let dirty = true; // "the canvas no longer shows what it should" — forces one repaint

  const resize = () => {
    const nextDpr = Math.min(window.devicePixelRatio || 1, DPR_CAP);
    width = canvas.clientWidth || window.innerWidth;
    height = canvas.clientHeight || window.innerHeight;

    const pixelWidth = Math.max(1, Math.floor(width * nextDpr));
    const pixelHeight = Math.max(1, Math.floor(height * nextDpr));

    /* Assigning canvas.width reallocates and clears the backing store — about
       59 MB at 5K — so only do it when the numbers actually moved. A window
       drag fires `resize` continuously at sizes that often round to the same
       device pixels. */
    if (pixelWidth === canvas.width && pixelHeight === canvas.height && nextDpr === dpr) return;

    dpr = nextDpr;
    canvas.width = pixelWidth;
    canvas.height = pixelHeight;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0); // draw in CSS px; the two assignments above reset the context
    dirty = true;
  };

  /* Coalesce a burst of resize events into one measurement per frame. */
  let resizeHandle = 0;
  const requestResize = () => {
    if (resizeHandle) return;
    resizeHandle = requestAnimationFrame(() => {
      resizeHandle = 0;
      resize();
    });
  };

  resize();
  window.addEventListener('resize', requestResize);

  /* ── the field ── */
  const blobs = Array.from({ length: BLOBS_WIDE }, (_, index) => ({
    phase: Math.random() * Math.PI * 2,
    fx: randomIn(DRIFT_FX_MIN, DRIFT_FX_SPAN),
    fy: randomIn(DRIFT_FY_MIN, DRIFT_FY_SPAN),
    swingX: randomIn(SWING_MIN, SWING_SPAN),
    swingY: randomIn(SWING_MIN, SWING_SPAN),
    radius: randomIn(RADIUS_MIN, RADIUS_SPAN),
    alternate: index % 2 === 1, // every other blob takes the grade's second colour
  }));

  /* Drift is driven by an accumulator (speed-scaled milliseconds) rather than
     by the raw rAF timestamp, so freezing it is exactly "stop adding time" and
     thawing resumes from the same position instead of snapping to wherever a
     wall clock would have carried it. */
  let driftClock = 0;
  let lastFrame = null;

  narrow.subscribe(() => {
    dirty = true; // the blob count just changed
  });

  /* ── grade state ── */
  let intensity = reducedMotion.matches ? INTENSITY_REDUCED : INTENSITY_FULL;
  const live = snapshot(GRADES[DEFAULT_GRADE]);
  let toKey = DEFAULT_GRADE;
  let fadeFrom = null;
  let fadeStart = 0;

  /* ── CSS custom properties ── */
  /* setProperty is a style invalidation even when the value is byte-identical.
     The three grade colours move only during a fade and --ca only on a random
     one-frame burst, yet all four were rewritten 60 times a second, so
     everything downstream of --accent was invalidated for nothing. Write only
     on change. */
  const published = new Map();
  const setVar = (name, value) => {
    if (published.get(name) === value) return;
    published.set(name, value);
    root.style.setProperty(name, value);
  };

  const publishGrade = () => {
    setVar('--accent', rgb(live.acc));
    setVar('--accent2', rgb(live.acc2));
    setVar('--slab-fg', rgb(live.sfg));
  };

  const publishAberration = () => {
    /* Reduced motion kills the aberration outright: it is a per-frame jitter,
       not a colour. */
    if (reducedMotion.matches) {
      setVar('--ca', '0');
      return;
    }
    const base = narrow.matches
      ? CA_NARROW_BASE + CA_NARROW_GAIN * intensity
      : CA_WIDE_BASE + CA_WIDE_GAIN * intensity;
    const burst = Math.random() < CA_BURST_CHANCE
      ? (narrow.matches ? CA_NARROW_BURST : CA_WIDE_BURST)
      : 0;
    setVar('--ca', (base + burst).toFixed(2));
  };

  /* Scanline and grain opacity depend on `intensity` and nothing else, so they
     belong here and not in the frame loop, where they were re-emitting the
     same two strings 120 times a second for the lifetime of the page. */
  const publishFilm = () => {
    setVar('--scan-op', (SCAN_OP_BASE + SCAN_OP_GAIN * intensity).toFixed(3));
    setVar('--grain-op', (GRAIN_OP_BASE + GRAIN_OP_GAIN * intensity).toFixed(3));
  };

  reducedMotion.subscribe((matches) => {
    intensity = matches ? INTENSITY_REDUCED : INTENSITY_FULL;
    publishFilm();
    dirty = true; // blob alpha and the drift both just changed
  });

  publishFilm();

  /* ── render ── */
  const drawField = () => {
    const backdrop = ctx.createLinearGradient(0, 0, width, height);
    backdrop.addColorStop(0, rgb(live.bgA));
    backdrop.addColorStop(1, rgb(live.bgB));
    ctx.globalCompositeOperation = 'source-over';
    ctx.fillStyle = backdrop;
    ctx.fillRect(0, 0, width, height);

    ctx.globalCompositeOperation = 'lighter';
    const alpha = BLOB_ALPHA_BASE + BLOB_ALPHA_GAIN * intensity;
    const longEdge = Math.max(width, height);
    const count = narrow.matches ? BLOBS_NARROW : BLOBS_WIDE;

    for (let i = 0; i < count; i++) {
      const blob = blobs[i];
      const x = (0.5 + blob.swingX * Math.sin(driftClock * blob.fx + blob.phase)) * width;
      const y = (0.5 + blob.swingY * Math.cos(driftClock * blob.fy + blob.phase * PHASE_SKEW)) * height;
      const radius = blob.radius * longEdge * BLOB_RADIUS_SCALE;
      const colour = blob.alternate ? live.c2 : live.c1;

      const glow = ctx.createRadialGradient(x, y, 0, x, y, radius);
      glow.addColorStop(0, rgba(colour, alpha));
      glow.addColorStop(BLOB_MID_STOP, rgba(colour, alpha * BLOB_MID_ALPHA));
      glow.addColorStop(1, rgba(colour, 0));

      ctx.fillStyle = glow;
      ctx.beginPath();
      ctx.arc(x, y, radius, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.globalCompositeOperation = 'source-over';
  };

  const advanceDrift = (now, frozen) => {
    const step = lastFrame === null ? 0 : Math.min(now - lastFrame, MAX_DRIFT_STEP_MS);
    lastFrame = now;
    if (frozen) return;
    driftClock += step * (DRIFT_SPEED_BASE + DRIFT_SPEED_GAIN * intensity);
  };

  const advanceFade = (now) => {
    const t = Math.min(1, (now - fadeStart) / FADE_MS);
    const eased = smoothstep(t);
    const target = GRADES[toKey];
    for (const channel of CHANNELS) {
      live[channel] = lerpRgb(fadeFrom[channel], target[channel], eased);
    }
    /* The readout name swaps at the midpoint — there is no halfway between
       "EMBER" and "IRIS/VIOLET" to interpolate to. */
    live.name = eased < 0.5 ? fadeFrom.name : target.name;
    if (t >= 1) fadeFrom = null;
  };

  const frame = (now) => {
    const frozen = reducedMotion.matches; // hold the field still, do not merely slow it
    advanceDrift(now, frozen);

    const fading = fadeFrom !== null;
    if (fading) advanceFade(now);

    /* When the drift is frozen and no colour is moving, the next frame would be
       pixel-for-pixel the frame already on screen. */
    if (!frozen || fading || dirty) {
      drawField();
      dirty = false;
    }

    publishGrade();
    publishAberration();
  };

  /**
   * @param {string} key one of the keys of GRADES; anything else is ignored
   * @param {{ immediate?: boolean }} [options] `immediate` snaps instead of fading
   */
  const setGrade = (key, { immediate = false } = {}) => {
    const target = GRADES[key];
    if (!target) return;

    if (immediate) {
      Object.assign(live, snapshot(target));
      toKey = key;
      fadeFrom = null;
      dirty = true;
      publishGrade(); // "immediate" means correct now, not correct next frame
      return;
    }

    if (key === toKey && !fadeFrom) return;

    /* Fade from the colours that are on screen right now rather than from a
       grade key. Keying the start meant a second tab click inside FADE_MS left
       from === to, and the palette froze mid-interpolation for good. */
    fadeFrom = snapshot(live);
    toKey = key;
    fadeStart = performance.now(); // same time base as the rAF timestamp
  };

  return {
    frame,
    setGrade,
    get gradeName() {
      return live.name;
    },
  };
}
