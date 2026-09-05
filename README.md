# Jagathguru Jagadeesan — portfolio

A personal portfolio built as static files. No framework, no build-time
dependencies, nothing to install. Four screens behind a hash router, one
animated canvas. The page itself loads webfonts from Google — the only
third-party request it makes.

```bash
make preview     # build and serve at localhost:4173
```

That's it — Python 3 and a browser. Nothing to install.

---

## Where things live

```
src/          edit this
public/       copied verbatim into dist/ — mirrors it exactly
dist/         generated. never edit; it is gitignored
scripts/      build.py and verify.py
docs/         architecture.md and deployment.md
```

**To change a project**, edit `src/content/projects.json`. Nothing else.
Six entries, one object each. Adding a seventh is one object.

**To change a screen**, edit `src/sections/{home,about,work,contact}.html`.

**To change a colour**, edit `src/scripts/scene/grades.js` — that is the live
palette. `src/styles/02-tokens.css` mirrors the coolant grade as the boot and
no-JS default; keep the two in sync or `make verify` will tell you.

Everything else is chrome that rarely moves: `src/partials/` holds the
`<head>`, header, rails, footer, canvas backdrop and the `<noscript>` block; `src/components/project-card.html` is the
case-study template the work screen repeats.

## Commands

| | |
|---|---|
| `make build` | src/ → dist/ |
| `make preview` | build, then serve dist/ |
| `make verify` | check dist/ is shippable |
| `make check` | fail if dist/ is stale — catches edits to dist/, though not files added to it |
| `make all` | build, then verify |
| `make clean` | remove dist/ |

## Credit where it's due

The visual language — the HUD chrome, the rail furniture, the slab headline
treatment, the four-screen nav idiom — is **after
[Piet Dewijngaert](https://github.com/pietdewijngaert)'s "SECTOR 32"**. I built
this as a study of that design and then made it my own site. Some of its
decorative strings are still carried over verbatim.

The code here is mine, written from scratch. The design direction is not, and
pretending otherwise would be worse than saying so.

## Why there's a build step

The site ships as plain HTML, CSS and JS. The build never runs on the host —
it runs here, or in CI, and produces files any static server can serve.

It exists because the alternative was one 500-line `index.html` with six
copy-pasted case studies inside it. Now the content is data, each screen is a
file you can hold in your head, and the stylesheet is seventeen focused
partials instead of one 900-line scroll.

`scripts/build.py` is ~200 lines of standard library. Four template
constructs, no engine, no `node_modules`. See
[docs/architecture.md](docs/architecture.md).

## The interesting part

`src/scripts/scene/` — a Canvas 2D gradient field and a four-way colour grade
that the whole UI reads from. Four named grades cross-fade on navigation and
publish six CSS custom properties, so every border, chip and rule recolours
per screen.

The bit worth reading is `fadeFrom`: a cross-fade snapshots the *live RGB
values* at the moment it starts, rather than a key into the grade table. The
previous version stored a from-key and only advanced the current key once a
fade finished — so clicking a tab twice inside the 780 ms window froze the
palette permanently, mid-fade. Snapshotting makes re-entrancy a non-issue.

## Notes on correctness

Things that were deliberate and are easy to undo by accident:

- Inactive screens are hidden with `visibility:hidden`. Not `opacity` alone —
  that hides nothing from assistive tech or the tab order. And not
  `display:none`, which would also hide them correctly but throws away each
  screen's scroll position on every navigation.
- `.screen > *{margin-block:auto}` is what makes a screen centre when it fits
  and top-align when it overflows. `align-items:center` on a scroll container
  makes the top of tall content permanently unreachable.
- The `:root` colour defaults are byte-exact matches for the coolant grade, so
  the page is fully coloured with JavaScript disabled.
- Fonts are two requests on purpose. `&text=` is *request-global* in the
  Google Fonts CSS2 API — putting it on a combined request subsets **every**
  family in it. Doing that once left the display and mono faces with zero
  Latin coverage and the whole site silently rendered in system fallbacks.

`scripts/verify.py` guards the first three. Every check in it exists because
something broke once.

## Accessibility

Skip link, native `<details>` accordions (correct semantics with JavaScript
off, unlike the hand-rolled version they replaced), `aria-current` on the
active tab, `aria-hidden` on every decorative element, `:focus-visible`
throughout, and a `<noscript>` block that unwinds the fixed layout into a
plain scrolling document.

**Known gap:** under `prefers-reduced-motion` the gradient drift is frozen and
the glitch transition is disabled, but the site has not been tested with a
screen reader on real hardware.

## Licence

Code under [MIT](LICENSE). The case-study prose is not licensed for reuse, and
the visual direction is credited above rather than claimed.
