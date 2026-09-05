/* ═══════════════════════════════════════════════════════════
   DATUM LINE — colour maths

   Pure functions over [r, g, b] triples. No DOM, no state.
   ═══════════════════════════════════════════════════════════ */

const lerp = (a, b, t) => a + (b - a) * t;

/* Rounded on the way out: these end up in `rgb()` strings and as canvas
   fill styles, and integers keep the memoised CSS writes stable — an
   unrounded channel would produce a fresh string on every single frame. */
export const lerpRgb = (from, to, t) => [
  Math.round(lerp(from[0], to[0], t)),
  Math.round(lerp(from[1], to[1], t)),
  Math.round(lerp(from[2], to[2], t)),
];

export const rgb = ([r, g, b]) => `rgb(${r},${g},${b})`;

export const rgba = ([r, g, b], alpha) => `rgba(${r},${g},${b},${alpha})`;

/* Smoothstep: zero velocity at both ends, so the grade cross-fade eases
   in and out instead of starting and stopping abruptly. */
export const smoothstep = (t) => t * t * (3 - 2 * t);
