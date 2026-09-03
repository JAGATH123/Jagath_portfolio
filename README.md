# Jagathguru Jagadeesan — portfolio

A personal portfolio built as **dependency-free static files**. No framework, no build
step, no runtime. Four screens behind a 6 KB hash router.

**Live:** https://jagath123.github.io/Jagath_portfolio/

**19 KB over the wire** for HTML + CSS + JS gzipped. 71 KB of hand-written code.
520 KB on disk, most of which is two images.

---

## Credit where it's due

The visual language — the HUD chrome, the rail furniture, the slab headline treatment,
the four-screen nav idiom — is **after [Piet Dewijngaert](https://github.com/pietdewijngaert)'s
"SECTOR 32"**. I built this as a study of that design and then made it my own site.
Some of its decorative strings are still carried over verbatim.

The code here is mine, written from scratch. The design direction is not, and pretending
otherwise would be worse than saying so.

## Why it's built this way

The original hosting target was shared cPanel with **no Node runtime**, which ruled out
every framework and every build step. That constraint turned out to produce a better site
than free choice would have:

- **No framework.** Four `<section>` elements toggled by a hash router. Shipping a
  component runtime to switch between them would be more bytes and more moving parts for
  strictly less control.
- **One CSS file, no preprocessor.** 511 lines with section comments. Minifying it saves
  a few hundred bytes over the wire because the server already gzips — so it isn't done.
- **Weight is a feature.** Two images are 46% of the site; the code is 71 KB.

## The interesting part: `assets/js/scene.js`

219 lines of Canvas 2D driving a drifting gradient field, and a four-way colour grade
that the entire UI reads from.

Four named grades — `COOLANT/ICE`, `EMBER`, `IRIS/VIOLET`, `EMERALD/CYAN` — cross-fade on
navigation and are published to CSS as `--accent`, `--accent2`, `--slab-fg`, `--ca`,
`--scan-op`, `--grain-op`. Every border, chip, rule and highlight on the page recolours
per screen from those six properties.

**The bit worth reading is `fadeFrom`.** A cross-fade stores a *snapshot of the live RGB
values* taken at the moment it starts, not a key into the grade table. The previous
version stored a from-*key* and only advanced the current key once a fade completed — so
clicking a tab twice inside the 780 ms window left `from === to`, the interpolation block
stopped running, and the palette **froze permanently mid-fade** with the grade readout
showing the wrong name. Snapshotting makes re-entrancy a non-issue: a fade always begins
from wherever the screen visually is.

Also in there, each for a reason:

- Motion is derived from the rAF timestamp, so it runs at the same speed at 60 Hz and 120 Hz.
- `devicePixelRatio` capped at 2 — above that the backing store grows quadratically for
  no visible gain.
- The loop pauses on `visibilitychange`, and `start()` is guarded by a `running` flag.
  Without that guard every `visible` event stacked another rAF chain, and
  `cancelAnimationFrame` could only ever reclaim the newest one.
- The breakpoint flag is recomputed on resize, not read once at load.

## Layout

```
index.html            all content; four screens, readable without JS
404.html              self-contained; GitHub Pages serves it automatically
sitemap.xml  favicon.svg  .nojekyll
README.md  LICENSE  .gitignore
assets/
  css/main.css        one stylesheet, themed at runtime via custom properties
  js/main.js          hash router, accordion, sound toggle, preference persistence
  js/scene.js         the canvas engine above
  img/                portrait (webp + jpg fallback), social card, touch icon
```

## Notes on correctness

Things that were deliberate and are easy to miss:

- `.case[hidden] { display: none }` — `display: grid` overrides the UA `[hidden]` rule,
  so the attribute alone silently does nothing.
- `scene.js` bails cleanly if its canvas is absent, and `main.js` treats the scene as
  optional and guards every call. The site degrades to a static page rather than throwing.
- `localStorage` and `AudioContext` are both wrapped — Safari private mode throws on the first.
- The `<title>` lives in exactly one place. `main.js` reads it from the document at boot
  and rebuilds it per screen. It used to be a literal duplicated in both files, and the
  JS copy always won, so editing the HTML alone did nothing.
- **Fonts are two requests on purpose.** `&text=` is *request-global* in the Google Fonts
  CSS2 API: putting it on a combined request subsets **every** family in that request.
  Doing that once left Chakra Petch and Space Mono with zero Latin coverage — 0 of 9
  served faces matched `U+0041` — and the whole site silently rendered in system
  fallbacks. Latin in one request, the 44 kana in another.
- The résumé row in the contact block is written and commented out. Shipping a 404 that
  points at your own CV is worse than not having the row.

## Accessibility

Skip link, `aria-expanded` / `aria-controls` on every accordion, `aria-pressed` on the
sound toggle, `aria-hidden` on the canvas and every decorative rail, `aria-current` on the
active nav tab, `:focus-visible` throughout, and a `<noscript>` block that unwinds the
fixed HUD shell into a plain scrolling document.

**Known gap, accurately scoped:** under `prefers-reduced-motion` the animation intensity
drops from 0.6 to 0.12 and the glitch transition is disabled, but the gradient drift is
*damped rather than stopped* — the speed term still evaluates to about 0.58. It should
freeze entirely.

## Deployment

GitHub Pages, served from `main` at `/`. `.nojekyll` skips the Jekyll pass so the publish
is a verbatim copy.

Two things that cost real time to learn, kept here in case this moves to Apache hosting:

- Run cPanel **AutoSSL before** enabling any HTTPS redirect, or the first visitor gets a
  full-page certificate warning.
- `Cache-Control: immutable` is only safe on a filename carrying a content hash. Applied
  to a plain `main.css` it pins returning visitors to a stale build for a year, with no
  recovery short of a force-reload.

## Licence

Code under [MIT](LICENSE). The case-study prose is not licensed for reuse, and the visual
direction is credited above rather than claimed.
