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

Seventeen partials in `src/styles/`, concatenated in the order given by
`main.css.order`.

**That order is the cascade.** Reordering the manifest changes which rules
win. Treat it as code.

The split follows the stylesheet's own structure: header (the map and
legends) → reset → tokens → base → shell → shared → header/rails → screens →
one file per screen → footer → animation → responsive → reduced-motion → print.

## Scripts

Ten ES modules. `main.js` wires them together and holds no logic of its own.

```
main.js       constructs and connects. 58 lines.
loop.js       the single rAF ticker — running flag, visibility pause, recovery
media.js      watchMedia(); reduced-motion as a live signal. scene/index.js
              uses the same helper for its own 820px breakpoint.
router.js     hash routing; reflects the route into DOM, title and focus
scene/        canvas field, colour grades, the six CSS custom properties
telemetry.js  clock, uptime, FPS, grade readout
sound.js      WebAudio blip and its persisted toggle
glitch.js     the transition sweep
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
`metricClass`, `metric`, `metricLabel`.

**A screen** — a file in `src/sections/`, an include in `src/pages/index.html`,
a tab in `src/partials/header.html`, and a grade in
`src/scripts/scene/grades.js`. Four edits; the router reads the rest from the
DOM.

**A stylesheet** — a file in `src/styles/` and a line in `main.css.order`, in
the position the cascade needs.
