/* ═══════════════════════════════════════════════════════════
   DATUM LINE — the cache lattice

   The home screen's field: a grid of cells standing in for a
   KV-cache, with a write head crossing it and spans of it
   resolving into structure and dissolving again.

   It is SVG and not a second <canvas> for one reason: the grade
   colours are CSS custom properties written onto #root, and a
   stylesheet reaches SVG children. Canvas would mean reading
   those properties back out every frame and re-plumbing the
   whole cross-fade by hand. Here the recolour is free, and the
   field still draws — static, complete — with JavaScript off,
   because the base grid is an SVG <pattern> in the markup
   rather than something this file creates.

   So nothing below sets a colour. It sets geometry and opacity;
   the stylesheet owns the rest.
   ═══════════════════════════════════════════════════════════ */

import { reducedMotion } from './media.js';

/* Must match the <pattern> in partials/lattice.html. If these drift, the
   lit cells stop landing on the grid and the whole thing looks broken. */
const PITCH = 16;
const COLS = 22;
const ROWS = 24;
const CELL_W = 11;
const CELL_H = 7;
const CELL_DY = 4; // the cell sits low in its 16px slot, leaving a gutter

const SVG_NS = 'http://www.w3.org/2000/svg';

const HEAD_PERIOD = 9200; // ms for the write head to cross the field once
const SPAWN_EVERY = 520; // ms between resolve attempts
const POOL = 26; // hard ceiling on live elements; the field is texture, not a crowd

const rand = (n) => Math.floor(Math.random() * n);

export function createLattice() {
  const svg = document.querySelector('.lattice');
  if (!svg) return null;

  const live = svg.querySelector('.lattice__live');
  const head = svg.querySelector('.lattice__head');
  if (!live || !head) return null;

  /* Animating a screen nobody is looking at is work for nothing. .screen is
     hidden with visibility, so it is not painted either way — this just stops
     the DOM writes. */
  const screen = svg.closest('.screen');

  /** @type {{el: SVGElement, born: number, life: number, peak: number}[]} */
  const events = [];
  let lastSpawn = 0;
  let headCol = -1;

  const take = (tag) => {
    const el = document.createElementNS(SVG_NS, tag);
    el.setAttribute('class', tag === 'line' ? 'lattice__link' : 'lattice__cell');
    live.appendChild(el);
    return el;
  };

  const cellAt = (col, row) => {
    const el = take('rect');
    el.setAttribute('x', String(col * PITCH));
    el.setAttribute('y', String(row * PITCH + CELL_DY));
    el.setAttribute('width', String(CELL_W));
    el.setAttribute('height', String(CELL_H));
    return el;
  };

  const push = (el, now, life, peak) => events.push({ el, born: now, life, peak });

  /* A span resolving: a rectangular block of the cache briefly becomes
     coherent. Rows are contiguous positions, columns are depth, so a block is
     the shape a real attention span would light up. */
  const spanEvent = (now) => {
    const w = 2 + rand(4);
    const h = 1 + rand(3);
    const col = rand(COLS - w);
    const row = rand(ROWS - h);
    for (let c = col; c < col + w; c += 1) {
      for (let r = row; r < row + h; r += 1) {
        push(cellAt(c, r), now + (c - col) * 40, 900 + rand(600), 0.85);
      }
    }
  };

  /* A link: two distant cells briefly associated. Deliberately rarer and
     fainter than the spans — it is the exception that makes the grid read as
     something being computed over rather than a texture. */
  const linkEvent = (now) => {
    const c1 = rand(COLS);
    const r1 = rand(ROWS);
    const c2 = rand(COLS);
    const r2 = rand(ROWS);
    const el = take('line');
    el.setAttribute('x1', String(c1 * PITCH + CELL_W / 2));
    el.setAttribute('y1', String(r1 * PITCH + CELL_DY + CELL_H / 2));
    el.setAttribute('x2', String(c2 * PITCH + CELL_W / 2));
    el.setAttribute('y2', String(r2 * PITCH + CELL_DY + CELL_H / 2));
    push(el, now, 1100, 0.5);
    push(cellAt(c1, r1), now, 1100, 0.9);
    push(cellAt(c2, r2), now, 1100, 0.9);
  };

  /* The head writes as it passes: the column it crosses lights behind it.
     Without this the head is a decoration sliding over an unrelated grid. */
  const headWrite = (col, now) => {
    for (let r = 0; r < ROWS; r += 1) {
      if (Math.random() < 0.45) push(cellAt(col, r), now + rand(120), 700 + rand(500), 0.6);
    }
  };

  const clear = () => {
    for (const ev of events) ev.el.remove();
    events.length = 0;
  };

  /* Reduced motion still gets a field — a frozen one. An empty box where the
     others see a moving system is a worse outcome than a still image. */
  const settle = () => {
    clear();
    head.style.opacity = '0';
    for (let i = 0; i < 34; i += 1) {
      const el = cellAt(rand(COLS), rand(ROWS));
      el.style.opacity = String(0.3 + Math.random() * 0.5);
    }
  };

  if (reducedMotion.matches) settle();
  reducedMotion.subscribe((reduced) => {
    clear();
    if (reduced) settle();
    else head.style.opacity = '';
  });

  return {
    /** @param {number} now rAF timestamp */
    frame(now) {
      if (reducedMotion.matches) return;
      if (screen && !screen.hasAttribute('data-active')) return;

      const phase = (now % HEAD_PERIOD) / HEAD_PERIOD;
      head.setAttribute('transform', `translate(${(phase * COLS * PITCH).toFixed(1)} 0)`);

      const col = Math.floor(phase * COLS);
      if (col !== headCol) {
        headCol = col;
        if (events.length < POOL * 2) headWrite(col, now);
      }

      if (now - lastSpawn > SPAWN_EVERY) {
        lastSpawn = now;
        if (events.length < POOL) (Math.random() < 0.22 ? linkEvent : spanEvent)(now);
      }

      for (let i = events.length - 1; i >= 0; i -= 1) {
        const ev = events[i];
        const t = (now - ev.born) / ev.life;
        if (t >= 1) {
          ev.el.remove();
          events.splice(i, 1);
          continue;
        }
        /* fast in, slow out — a cell asserts itself and then decays, which is
           the shape of a value being written and going stale */
        const a = t < 0 ? 0 : t < 0.18 ? t / 0.18 : 1 - (t - 0.18) / 0.82;
        ev.el.style.opacity = String(a * ev.peak);
      }
    },
  };
}
