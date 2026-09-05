/* ═══════════════════════════════════════════════════════════
   DATUM LINE — media queries

   A media query that JS reads once at load is a bug waiting to
   happen: rotate the phone, or switch on "reduce motion" in the
   OS, and the page keeps the answer it got at boot. Everything
   here stays subscribed for the life of the page.

   MediaQueryList.addEventListener is used directly — every
   browser that can run <script type="module"> and the optional
   chaining in this codebase also has it.
   ═══════════════════════════════════════════════════════════ */

/**
 * @param {string} query a CSS media query
 * @returns {{ matches: boolean, subscribe: (fn: (matches: boolean) => void) => () => void }}
 */
export function watchMedia(query) {
  const mql = window.matchMedia(query);

  return {
    get matches() {
      return mql.matches;
    },
    /** @returns {() => void} unsubscribe */
    subscribe(fn) {
      const handler = (ev) => fn(ev.matches);
      mql.addEventListener('change', handler);
      return () => mql.removeEventListener('change', handler);
    },
  };
}

/* Shared: the renderer and the transition effect both need it, and one
   MediaQueryList with one listener is less to keep straight than two. */
export const reducedMotion = watchMedia('(prefers-reduced-motion: reduce)');
