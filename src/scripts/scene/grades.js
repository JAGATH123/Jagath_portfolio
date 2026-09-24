/* ═══════════════════════════════════════════════════════════
   DATUM LINE — colour grades

   Data only. One grade per screen; the renderer cross-fades
   between them and publishes the result to CSS.

   Channels, all sRGB [r, g, b] 0-255:
     bgA / bgB   the two stops of the backdrop gradient
     c1  / c2    the two blob colours, alternating
     acc / acc2  --accent / --accent2
     sfg         --slab-fg, the ink on accent2-filled slabs

   These numbers are the design; treat them as fixed. The keys
   are the values of `data-grade` on each <section class="screen">.
   ═══════════════════════════════════════════════════════════ */

export const DEFAULT_GRADE = 'coolant';

/* Consumers copy before interpolating — nothing here is ever mutated. */
export const GRADES = {
  coolant: { name: 'COOLANT/ICE',  bgA: [ 4, 11, 25], bgB: [ 2,  6, 15], c1: [ 58, 138, 255], c2: [128, 218, 255], acc: [110, 176, 255], acc2: [186, 238, 255], sfg: [ 8, 30, 64] },
  ember:   { name: 'EMBER',        bgA: [21, 11,  4], bgB: [11,  6,  3], c1: [247, 168,  54], c2: [228,  96,  40], acc: [249, 182,  84], acc2: [236, 156,  78], sfg: [26, 12,  2] },
  iris:    { name: 'IRIS/VIOLET',  bgA: [13,  6, 25], bgB: [ 7,  5, 17], c1: [168,  96, 255], c2: [255,  92, 190], acc: [192, 140, 255], acc2: [255, 132, 210], sfg: [30,  6, 52] },
  emerald: { name: 'EMERALD/CYAN', bgA: [ 3, 18, 15], bgB: [ 2, 11, 17], c1: [ 54, 224, 150], c2: [ 36, 196, 236], acc: [ 84, 232, 170], acc2: [ 72, 210, 240], sfg: [ 4, 34, 28] },
  ash:     { name: 'ASH/BONE',     bgA: [ 9, 10, 14], bgB: [ 4,  5,  7], c1: [ 92, 106, 126], c2: [150, 168, 190], acc: [160, 176, 196], acc2: [224, 236, 248], sfg: [ 8, 10, 15] },
};

/* The interpolated channels, in one place so the fade and the snapshot
   helper cannot drift apart. `name` is deliberately absent: it switches
   at the midpoint rather than blending. */
export const CHANNELS = ['bgA', 'bgB', 'c1', 'c2', 'acc', 'acc2', 'sfg'];
