/* ═══════════════════════════════════════════════════════════
   DATUM LINE — the home globe, driven

   globe-render.js draws; this file decides when. It owns the
   things a pure renderer cannot know: how big the box is, how
   wide a Space Mono character really is once the font has
   arrived, where the pointer is, and whether anyone is looking.

   The box is never empty. The markup already holds still
   frames (partials/globe-still.html, baked by the same renderer
   under Node): one shaped for the desktop box, one for the
   phone's full-bleed field, and the stylesheet shows whichever
   fits the tier. So with scripting off, before the font lands,
   or under reduced motion, the visitor sees a globe with the
   route drawn and Siegen marked. This file takes over the one
   that is showing, once it can draw the same picture at the
   box's real size.

   Per-tier framing — centre, fill, tilt, smallest font, bleed —
   comes from custom properties on .glb__frame, so the tiers stay
   in the stylesheets with the rest of the layout.

   The turn is continuous; everything about it, including when
   the route draws, is a function of t, so this file only has to
   advance t. Reduced motion asks the renderer for its resting
   frame instead: turned to India and Europe, route drawn.

   Driven by loop.js like everything else that moves, and drawn
   at 30fps, not 60: a character grid cannot show the difference
   and it halves the work. Nothing here sets a colour.
   ═══════════════════════════════════════════════════════════ */

import { createRenderer } from './globe-render.js';
import { reducedMotion, watchMedia } from './media.js';

const FRAME_MS = 1000 / 30;
const DEG = Math.PI / 180;
/* how far the pointer can push the view, and how quickly it follows */
const POINTER_YAW = 22 * DEG;
const POINTER_TILT = 12 * DEG;
const EASE = 0.08;

export function createGlobe() {
  const arts = [...document.querySelectorAll('.glb__art')];
  if (!arts.length) return null;
  const box = arts[0].closest('.lat__frame');
  const screen = arts[0].closest('.screen');
  if (!box) return null;

  const fixes = [...document.querySelectorAll('.glb__fix')].map((el) => ({
    num: el.dataset.num,
    place: el.dataset.place,
    lat: Number(el.dataset.lat),
    lon: Number(el.dataset.lon),
    now: el.dataset.state === 'is-now',
  }));
  if (!fixes.length) return null;

  const renderer = createRenderer({ fixes });
  /* tilt follows a mouse, not a thumb: on touch the "pointer" is a finger
     that is also trying to scroll the page */
  const finePointer = watchMedia('(hover:hover) and (pointer:fine)');

  let advance = 0.612;
  let live = false;
  let art = null;
  let fitted = '';
  let t = 0;
  let heldT = 0;
  let last = 0;
  let html = '';
  let px = 0;
  let py = 0;
  let sx = 0;
  let sy = 0;
  /** the box's rect, read once per resize, enter or scroll — not per move */
  let rect = null;

  const paint = () => {
    if (!art) return;
    const next = renderer.draw(t, sx * POINTER_YAW, -sy * POINTER_TILT, { rest: reducedMotion.matches });
    if (next === html) return;
    html = next;
    art.innerHTML = next;
  };

  const num = (style, name, fallback) => {
    const v = parseFloat(style.getPropertyValue(name));
    return Number.isFinite(v) ? v : fallback;
  };

  /* Fit the grid to the box as it is now. A tier that hides the field
     (display:none) reports 0x0, and then there is nothing to draw until the
     ResizeObserver says otherwise. Fitting the same box twice is skipped,
     which is what the observer's first callback always is. */
  const fit = () => {
    rect = null;
    const w = box.clientWidth;
    const h = box.clientHeight;
    const shown = arts.find((a) => getComputedStyle(a).display !== 'none') || null;
    if (!w || !h || !shown) return false;
    const style = getComputedStyle(box);
    const opt = {
      cy: num(style, '--glb-cy', 0.5),
      fill: num(style, '--glb-fill', 0.94),
      tilt: num(style, '--glb-tilt', 22),
      fsMin: num(style, '--glb-fs-min', 7),
      bleed: num(style, '--glb-bleed', 1.3),
      bleedX: num(style, '--glb-bleed-x', 1.3),
    };
    const key = [w, h, advance, opt.cy, opt.fill, opt.tilt, opt.fsMin, opt.bleed, opt.bleedX, arts.indexOf(shown)].join();
    if (key === fitted) return true;
    fitted = key;
    art = shown;
    const { fs } = renderer.layout(w, h, advance, opt);
    art.style.fontSize = `${fs}px`;
    html = '';
    paint();
    return true;
  };

  const measure = () => {
    const ctx = document.createElement('canvas').getContext('2d');
    if (!ctx) return advance;
    const cs = getComputedStyle(arts[0]);
    ctx.font = `${cs.fontWeight} 100px ${cs.fontFamily}`;
    return ctx.measureText('M').width / 100 || advance;
  };

  /* Wait for Space Mono. Measured against the fallback face, the grid
     would be laid out for the wrong character width and then re-flow
     visibly when the real one arrives. */
  const face = getComputedStyle(arts[0]);
  Promise.all([document.fonts.load(`${face.fontWeight} 10px ${face.fontFamily}`), document.fonts.ready])
    .catch(() => {})
    .then(() => {
      advance = measure();
      live = true;
      fit();
      new ResizeObserver(() => fit()).observe(box);
    });

  /* Reduced motion shows the resting frame at t = 0. Switching it back off
     resumes the turn where it was, rather than restarting it. */
  reducedMotion.subscribe((reduced) => {
    if (reduced) {
      heldT = t;
      t = 0;
      sx = 0;
      sy = 0;
    } else {
      t = heldT;
    }
    if (live) paint();
  });

  box.addEventListener('pointerenter', () => {
    rect = box.getBoundingClientRect();
  });
  box.addEventListener('pointermove', (ev) => {
    rect ??= box.getBoundingClientRect();
    px = ((ev.clientX - rect.left) / rect.width - 0.5) * 2;
    py = ((ev.clientY - rect.top) / rect.height - 0.5) * 2;
  });
  box.addEventListener('pointerleave', () => {
    px = 0;
    py = 0;
  });
  const forget = () => {
    rect = null;
  };
  screen?.addEventListener('scroll', forget, { passive: true });
  window.addEventListener('resize', forget, { passive: true });

  return {
    /** @param {number} now rAF timestamp */
    frame(now) {
      /* reduced motion keeps the resting frame fit() drew: the still */
      if (!live || !art || reducedMotion.matches || !renderer.cols) return;
      if (screen && !screen.hasAttribute('data-active')) {
        last = 0;
        return;
      }
      if (!last) {
        last = now;
        return;
      }
      const dt = now - last;
      if (dt < FRAME_MS - 1) return;
      last = now;
      /* capped, so coming back to the screen does not lurch the sway */
      t += Math.min(dt, 100) / 1000;
      const fine = finePointer.matches;
      sx += ((fine ? px : 0) - sx) * EASE;
      sy += ((fine ? py : 0) - sy) * EASE;
      paint();
    },
  };
}
