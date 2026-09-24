# Architecture

## The shape

```
src/content/*.json  ──┐
src/sections/*.html ──┤
src/partials/*.html ──┼──▶ scripts/build.py ──▶ dist/  ──▶ any static host
src/components/*    ──┤
src/styles/*.css    ──┤
src/scripts/**      ──┘
public/             ──────── copied verbatim ───┘
```

One rule: **edit `src/`, ship `dist/`.** `dist/` is gitignored and rebuilt
from scratch every time.

## Why a build step on a site with no dependencies

Before this, everything lived in one 500-line `index.html`: the `<head>`, the
HUD chrome, all four screens, and six case studies as six near-identical
30-line blocks. Changing a project meant editing markup. Adding one meant
copy-pasting 30 lines and hand-incrementing three IDs.

The three ways to split HTML are client-side templating (breaks SEO and the
no-JS path), separate pages (duplicates the shared chrome four times), or a
generator. Only the third keeps a single fast page *and* a source tree you can
navigate.

The build runs on your machine or in CI — never on the web host. The output is
plain files. Nothing in `dist/` knows this repo exists.

## The template language

Four constructs. There is no engine and no dependency.

```
{{! a note }}                       documentation; stripped from the output
{{> partials/head.html }}           include a file; recursive, indent-aware
{{ site.email }}                    dotted lookup into src/content/*.json
{{ count.projects }}                how many entries projects.json has
{{# projects }} … {{/ projects }}   repeat per entry; {{ . field }} inside
```

Anything else inside `{{ }}` is a build error naming the file and the token.
A typo fails the build rather than shipping `{{ }}` to a visitor.

`{{! }}` exists because an HTML comment inside a loop body gets emitted once
per iteration — the project-card doc comment appeared six times before this
was added.

## Layers

| Layer | Owns | Does not |
|---|---|---|
| `src/content/` | What the site says | Mostly stay out of presentation — `metricClass` is the one leak, and it names a CSS class |
| `src/sections/`, `partials/`, `components/` | Structure | Hold *repeated* content — the six projects come from `content/`. Prose still lives in the section files. |
| `src/styles/` | Appearance | Know about screens beyond a class name |
| `src/scripts/` | Behaviour | Reach into each other's state |
| `scripts/build.py` | Assembly | Appear in the output |

## Styles

Nineteen partials in `src/styles/`, concatenated in the order given by
`main.css.order`.

**That order is the cascade.** Reordering the manifest changes which rules
win. Treat it as code.

The split follows the stylesheet's own structure: header (the map and
legends) → reset → tokens → base → shell → shared → header/rails → screens →
one file per screen, in DOM order (home, about, work, research, contact) →
footer → animation → **one file per device tier** → reduced-motion → print.

Order lives in `main.css.order` and nowhere else; the numeric prefixes only
mirror it. Each partial names itself on its first line, and `make verify`
fails if a renumbering leaves one calling itself by its old name.

### Device tiers

Each tier owns a file and owns it completely — `15-phone.css` does not layer
on top of `14-tablet.css`, it replaces it, and the two queries are written so
they can never both match. That is deliberate: the previous single
`14-responsive.css` had `@media (max-width:820px)` doing double duty as both
"tablet" and "phone", so an iPad Air in portrait (820px) got the phone layout
at a 95ch text measure with the rails switched off.

```
                        width            height        file
desktop, full HUD       > 1150px         —             (the base rules)
tablet                  761–1150px       > 480px       14-tablet.css
short (any tier ≥ 761)  ≥ 761px          481–800px     14-tablet.css
phone                   ≤ 760px          —             15-phone.css
phone, on its side      ≤ 1000px         ≤ 480px       15-phone.css
small phone             ≤ 380px          —             15-phone.css
```

Two of those rows are the reason the map is not a simple ladder:

- **A phone on its side is 812–932px wide.** Width alone cannot find it. The
  rule this replaces read `(max-height:520px) and (min-width:821px)` and so
  matched none of the phones it was written for. The phone tier's query is
  `(max-width:760px),(max-width:1000px) and (max-height:480px)` — OR-of-AND —
  and the tablet band excludes the same shape with `(min-height:481px)`.
- **`src/scripts/scene/index.js` hardcodes the same number.** `NARROW` drives
  the blob count and the chromatic-aberration strength. It is 760 because the
  phone tier is; if one moves, both move.

The phone tier re-composes the HUD rather than deleting it: the two side
rails become a drawn instrument frame (`#root::after`, four gradient layers on
one pseudo-element), the nav leaves the top of the screen for the thumb zone,
and the home field stops being a panel beside the copy and becomes the one
full-bleed moment. Reserved chrome goes from 296px of an 852px screen to
150px.

## Scripts

Twelve ES modules. `main.js` wires them together and holds no logic of its own.

```
main.js       constructs and connects. 63 lines.
loop.js       the single rAF ticker — running flag, visibility pause, recovery
media.js      watchMedia(); reduced-motion as a live signal. scene/index.js
              uses the same helper for its own 760px breakpoint.
router.js     hash routing; reflects the route into DOM, title and focus
scene/        canvas field, colour grades, the six CSS custom properties
telemetry.js  clock, uptime, FPS, grade readout
sound.js      WebAudio blip and its persisted toggle
glitch.js     the transition sweep
lattice.js    the home field: sets geometry and opacity on an SVG whose
              colours all come from CSS, so it recolours for free
figures.js    adds .is-seen to a research figure on first scroll-in
```

`loop.js` exists so the renderer and telemetry share one rAF tick. Two loops
would double wake-ups and let their clocks disagree — and it means telemetry
keeps working when the canvas is absent.

There is no accordion module. The case studies are native `<details>`, which
handles open/close, keyboard and `aria-expanded` correctly, including with
JavaScript off — which the hand-rolled version did not.

## The CSS ↔ JS contract

`src/scripts/scene/index.js` writes six custom properties onto `#root`:

```
--accent  --accent2  --slab-fg  --ca  --scan-op  --grain-op
```

`src/styles/02-tokens.css` declares defaults for all six. The three colour
defaults are **byte-exact matches for the coolant grade**; `--ca`, `--scan-op`
and `--grain-op` are not grade channels, so their defaults are just the
calmest sensible starting values, not a mirror of anything.

fully coloured with JavaScript disabled or failed. The inline styles are an
override layer, not the only source.

This is the one place the layers touch. Both sides are documented in
`02-tokens.css`. `make verify` — a separate target, not part of the build —
checks all six defaults and fails if any drifts.

## Adding things

**A project** — one object in `src/content/projects.json`. Fields: `num`,
`name`, `line`, `tech`, `year`, `problem`, `approach`, `outcomeLabel`,
`metricClass`, `metric`, `metricLabel`, `outcomeKind` (`status`, `figure` or
`live` — how the outcome chip renders on the closed card on a phone).

**A screen** — a file in `src/sections/`, an include in `src/pages/index.html`,
a tab in `src/partials/header.html`, a grade in `src/scripts/scene/grades.js`,
and a stylesheet (see below). The router, the digit shortcuts and the nav's
plate count all read the rest from the DOM.

Three things that used to go wrong silently here now fail `make verify`: a
screen with no tab (or a tab with no screen), a `data-grade` that is not in
`GRADES` — `scene/index.js` returns quietly on an unknown key, so the new
screen would wear the previous one's colours — and a CJK character missing
from the font subset.

The phone nav fits five plates at 360px with labels up to about six
characters. The fifth plate is `\lab` rather than `\research` for exactly
that reason; the section id, the URL and the heading all say research.

**A stylesheet** — a file in `src/styles/` and a line in `main.css.order`, in
the position the cascade needs. Its first line names the file.

**A figure** — a partial in `src/partials/figures/`, included from the section
that uses it. Inline SVG, not a separate `.svg` file: the grade colours are
custom properties written onto `#root` as an inline style, and an `<img>` SVG is
a separate document that cannot see them. Animate it with CSS, not SMIL —
`17-reduced-motion.css` switches animation off with a `*` rule that reaches
inside inline SVG and that SMIL ignores — and let every animated element *rest*
in its finished state, so a figure with no script is complete, not blank. Give
it an `id` (`fig-4`) and cross-reference it as `<a href="#fig-4">`, which
`make verify` then checks for free.

**Kana** — just write them. The Google Fonts `&text=` subset is derived from
the rendered page by `font_subset()` in `build.py`; nothing to keep in sync.
