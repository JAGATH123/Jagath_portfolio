/* ═══════════════════════════════════════════════════════════
   DATUM LINE — router

   Hash routing over the four screens. Owns everything that is a
   direct reflection of "which screen is current": the
   data-active attribute, aria-current on the tabs, the document
   title, the wordmark, and where the keyboard focus goes.

   Anything that merely *reacts* to a route change — the colour
   grade, the glitch sweep, the interface blip — is left to the
   onNavigate callback.

   Screens are shown and hidden by CSS through [data-active].
   This module must never touch `display` or the `hidden`
   attribute on a screen: an inline display would beat the
   stylesheet, and `hidden` would take the section out of the
   accessibility tree behind the CSS's back.
   ═══════════════════════════════════════════════════════════ */

/* Not exported: nothing outside this module needs the list, and an export with
   no importer is the same dead weight as an attribute nobody styles. */
// Derived from the DOM, not hardcoded: the sections ARE the source of truth for
// what routes exist. A hardcoded list meant adding a screen silently produced one
// that could not be reached by click, hash, history or keyboard — and no check
// caught it, because the markup and the build were both perfectly valid.
// Document order sets the digit-shortcut order, which is what a reader expects.
const ROUTES = [...document.querySelectorAll('.main > .screen[id]')].map((s) => s.id);
const DEFAULT_ROUTE = 'home';

/**
 * The route named by the current URL fragment, or null if the fragment names
 * something that is not a screen.
 *
 * Returning null rather than defaulting is the whole fix for the skip link:
 * `#main` is a real, useful fragment that simply is not a screen. The old
 * version folded every unrecognised fragment to 'home' and the hashchange
 * handler acted on it, so using "Skip to content" from the work screen threw
 * you back to the home screen.
 *
 * No fragment at all is a different thing from an unknown one — it addresses
 * the top of the document, which is the home screen — so it still resolves.
 * That is what makes Back out of the first navigation work.
 */
const routeFromHash = () => {
  /* No decodeURIComponent: route ids are plain ASCII, and decoding would throw
     a URIError on a malformed fragment such as "#%". */
  const fragment = location.hash.slice(1).toLowerCase();
  if (fragment === '') return DEFAULT_ROUTE;
  return ROUTES.includes(fragment) ? fragment : null;
};

/**
 * @param {{ onNavigate?: (event: {
 *   id: string,
 *   section: HTMLElement,
 *   silent: boolean,
 *   changed: boolean,
 * }) => void }} options
 */
export function createRouter({ onNavigate } = {}) {
  const sections = new Map(ROUTES.map((id) => [id, document.getElementById(id)]));
  const tabs = [...document.querySelectorAll('[data-nav]')];
  const wordmarks = [...document.querySelectorAll('.wordmark')];

  /* The single source of truth for the title. The <title> element is only ever
     the suffix; this module rewrites document.title on boot and on every
     navigation, so editing the HTML alone would change nothing. */
  const baseTitle = document.title;

  /* The digit shortcuts are scoped to this container (see below). Found via the
     tabs rather than a class name so it survives a CSS rename. */
  const navRoot = tabs[0]?.closest('nav') ?? null;

  let current = null;

  /**
   * @param {string} id
   * @param {{ silent?: boolean }} [options] `silent` is the cold boot: reflect
   *   the route, but do not announce it, move focus, or play anything.
   */
  const navigate = (id, { silent = false } = {}) => {
    const section = sections.get(id);
    if (!section) return;

    if (id === current) {
      onNavigate?.({ id, section, silent, changed: false });
      return;
    }

    for (const [key, element] of sections) {
      if (!element) continue;
      if (key === id) {
        element.setAttribute('data-active', '');
        element.scrollTop = 0; // a screen revisited should start at the top
      } else {
        element.removeAttribute('data-active');
      }
    }

    for (const tab of tabs) {
      if (tab.dataset.nav === id) tab.setAttribute('aria-current', 'page');
      else tab.removeAttribute('aria-current');
    }

    const label = id.toUpperCase();
    for (const wordmark of wordmarks) wordmark.textContent = label;

    document.title = id === DEFAULT_ROUTE
      ? baseTitle
      : `${id[0].toUpperCase()}${id.slice(1)} — ${baseTitle}`;

    current = id;

    if (!silent) {
      /* Whatever was focused is inside a section that just went
         visibility:hidden, so the browser drops focus to <body> and a screen
         reader is told nothing at all. Hand focus to the new section instead:
         it is labelled by its own heading, so moving there announces the
         screen. tabindex="-1" makes it programmatically focusable without
         adding a stop to the tab order. */
      section.tabIndex = -1;
      section.focus({ preventScroll: true });
    }

    onNavigate?.({ id, section, silent, changed: true });
  };

  /**
   * The one way in. Click and keyboard both come through here, which is what
   * makes the history dedupe apply to both: pressing "2" six times used to
   * push six identical entries because only the click path checked first.
   */
  const go = (id) => {
    /* pushState does not fire hashchange, so navigate() is called directly
       below rather than left to the event. */
    if (location.hash.slice(1).toLowerCase() !== id) {
      history.pushState(null, '', `#${id}`);
    }
    navigate(id);
  };

  /* Ignore fragments that are not routes — that is what leaves the skip link,
     and any future in-page anchor, to the browser.

     The `!== current` test matters: a back/forward across a hash boundary
     fires popstate AND hashchange, so without it every history traversal
     would be handled twice and blip twice. */
  const followHash = () => {
    const id = routeFromHash();
    if (id && id !== current) navigate(id);
  };

  window.addEventListener('hashchange', followHash);
  window.addEventListener('popstate', followHash);

  /* Intercept in-page links so the transition is ours. */
  document.addEventListener('click', (ev) => {
    /* Anything the user asked the browser to do with this click instead:
       open in a new tab, a new window, download it, or a non-primary button.
       preventDefault() with no such check made all fifteen in-page links
       impossible to open in a new tab. */
    if (ev.defaultPrevented || ev.button !== 0) return;
    if (ev.metaKey || ev.ctrlKey || ev.shiftKey || ev.altKey) return;

    const link = ev.target.closest?.('a[href^="#"]');
    if (!link) return;

    const id = link.getAttribute('href').slice(1).toLowerCase();
    if (!ROUTES.includes(id)) return; // e.g. the skip link's #main

    ev.preventDefault();
    go(id);
  });

  /* Keyboard: 1-4 jump straight to a screen, but only while the nav has focus.
     WCAG 2.1.4 Character Key Shortcuts requires a single-character shortcut to
     be switchable off, remappable, or active only on focus — this is the third
     option. Unscoped, these digits also swallowed the keys screen readers use
     for heading navigation, with no way to turn them off. */
  const focusIsInNav = () => {
    const active = document.activeElement;
    if (!active) return false;
    return navRoot ? navRoot.contains(active) : active.matches('[data-nav]');
  };

  document.addEventListener('keydown', (ev) => {
    if (ev.repeat) return;                              // holding a digit must not fill the history stack
    if (ev.metaKey || ev.ctrlKey || ev.altKey) return;  // those combinations belong to the browser
    if (!focusIsInNav()) return;

    /* Deliberately not bailing on shiftKey: on AZERTY and several other
       layouts the digit row *is* the shifted row, and ev.key already reports
       the character produced, so Shift+1 on QWERTY arrives as "!" and misses. */
    const index = Number(ev.key);
    if (!Number.isInteger(index) || index < 1 || index > ROUTES.length) return;

    ev.preventDefault();
    go(ROUTES[index - 1]);
  });

  return {
    /** Reflect the URL we booted with. Silent: no blip, no sweep, no focus grab. */
    start() {
      navigate(routeFromHash() ?? DEFAULT_ROUTE, { silent: true });
    },
  };
}
