/* ═══════════════════════════════════════════════════════════
   DATUM LINE — figure reveals

   Adds .is-seen to a <figure> the first time it scrolls into
   view, which is the only thing the figure animations key off.

   Every animated element in 11-research.css rests in its
   FINISHED state, and .is-seen replays it from the start. That
   ordering is deliberate: with this module absent, with
   scripting off, or under prefers-reduced-motion, the figures
   are complete and readable rather than blank. A diagram that
   needs JavaScript to show its contents is a broken diagram.

   The observer disconnects once everything has fired — these
   are reveals, not a scroll-linked effect.
   ═══════════════════════════════════════════════════════════ */

export function createFigures() {
  const figures = [...document.querySelectorAll('.fig')];
  if (!figures.length || !('IntersectionObserver' in window)) return null;

  let left = figures.length;
  const io = new IntersectionObserver((entries) => {
    for (const entry of entries) {
      if (!entry.isIntersecting) continue;
      entry.target.classList.add('is-seen');
      io.unobserve(entry.target);
      if (--left === 0) io.disconnect();
    }
  }, {
    /* .screen is the scrollport, not the viewport — an observer left on the
       default root would fire for all three the moment the screen became
       visible, because the whole document is inside a fixed shell. */
    root: document.querySelector('#research'),
    rootMargin: '0px 0px -18% 0px',
  });

  for (const fig of figures) io.observe(fig);
  return { stop: () => io.disconnect() };
}
