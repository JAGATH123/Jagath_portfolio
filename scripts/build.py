#!/usr/bin/env python3
"""
Build src/ into dist/.

Runs on your machine or in CI — never on the web host. The output is plain
HTML, CSS and JS with no runtime dependency on anything in this repo.

    python3 scripts/build.py            build into dist/
    python3 scripts/build.py --check    verify dist/ matches src/

--check is the guard against src/ and dist/ drifting apart. CI runs it on
every push; run it yourself before committing.

WHAT GOES WHERE
    src/pages/*.html        one file per output page
    src/partials/           shared chrome, included by the pages
    src/sections/           one file per screen
    src/components/         repeated markup, used inside loops
    src/content/*.json      the actual content; edit projects here
    src/styles/*.css        concatenated in main.css.order into one stylesheet
    src/scripts/            ES modules, copied through to dist/assets/js/
    public/                 copied verbatim into dist/ — mirrors it exactly

TEMPLATE SYNTAX — four constructs, no engine, no dependencies:

    {{! a note }}                      documentation; stripped from the output
    {{> partials/head.html }}          include a file (recursive, indent-aware)
    {{ site.email }}                   dotted lookup into src/content/*.json
    {{ count.projects }}               how many entries projects.json has
    {{# projects }} … {{/ projects }}  repeat per entry, {{ . field }} inside

Anything else inside {{ }} raises a build error naming the file and the
token, so a typo fails the build instead of shipping "{{ }}" to a visitor.
"""

import json
import re
import shutil
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "src"
PUBLIC = ROOT / "public"
DIST = ROOT / "dist"
MAX_INCLUDE_DEPTH = 5

INCLUDE = re.compile(r"^([ \t]*)\{\{>\s*([^}]+?)\s*\}\}[ \t]*$", re.M)
LOOP = re.compile(r"\{\{#\s*(\w+)\s*\}\}\n?(.*?)\n?\{\{/\s*\1\s*\}\}", re.S)
VAR = re.compile(r"\{\{\s*([^#/>!][^}]*?)\s*\}\}")
# {{! ... }} documents a template for whoever edits it and never reaches the
# output. Use it instead of an HTML comment, which a loop would emit N times.
NOTE = re.compile(r"^[ \t]*\{\{!.*?\}\}[ \t]*\n?", re.M | re.S)


class BuildError(Exception):
    """A problem in src/ that must stop the build rather than ship."""


def load_content():
    """Every file in src/content/ becomes a top-level name in templates."""
    data = {
        path.stem: json.loads(path.read_text(encoding="utf-8"))
        for path in sorted((SRC / "content").glob("*.json"))
    }
    # Every list also gets a zero-padded length under `count`, so the
    # WORK screen can print "06 BUILDS" without a literal that goes
    # quietly wrong the first time a seventh project is added.
    data["count"] = {k: f"{len(v):02d}" for k, v in data.items() if isinstance(v, list)}
    return data


def resolve(expr, data, item, origin="?"):
    """`site.email` walks the content tree; `. name` reads the loop's item."""
    expr = expr.strip()
    if expr.startswith("."):
        key = expr[1:].strip()
        if item is None:
            raise BuildError(f"{origin}: '{expr}' used outside a loop")
        if key not in item:
            raise BuildError(f"{origin}: '{key}' is not a field on this item")
        return str(item[key])

    node = data
    for part in expr.split("."):
        if not isinstance(node, dict) or part not in node:
            raise BuildError(f"{origin}: '{expr}' not found in src/content/")
        node = node[part]
    return str(node)


def expand_includes(text, origin, depth=0):
    """Splice in {{> path }}, re-indenting the included file to match."""
    if depth > MAX_INCLUDE_DEPTH:
        raise BuildError(f"includes nested more than {MAX_INCLUDE_DEPTH} deep in {origin}")

    def swap(match):
        indent, rel = match.group(1), match.group(2)
        path = SRC / rel
        if not path.exists():
            raise BuildError(f"{origin} includes '{rel}', which does not exist")
        body = expand_includes(path.read_text(encoding="utf-8").rstrip("\n"), rel, depth + 1)
        return "\n".join(indent + line if line else line for line in body.split("\n"))

    return INCLUDE.sub(swap, text)


def render(text, data, origin):
    """Includes first, then loops, then variables."""
    text = NOTE.sub("", expand_includes(text, origin))

    def unroll(match):
        name, body = match.group(1), match.group(2)
        items = data.get(name)
        if not isinstance(items, list):
            raise BuildError(f"{origin}: '{name}' is not a list in src/content/")
        return "\n".join(
            VAR.sub(lambda m: resolve(m.group(1), data, item, origin), body) for item in items
        )

    text = VAR.sub(lambda m: resolve(m.group(1), data, None, origin), LOOP.sub(unroll, text))

    stray = re.search(r"\{\{.*?\}\}", text)
    if stray:
        raise BuildError(f"{origin}: unresolved token {stray.group(0)!r}")
    return text


def build_styles(dist):
    """Concatenate src/styles in the order main.css.order gives.

    That order IS the cascade. Reordering the manifest changes which rules
    win, so treat it as code, not as a file list.
    """
    order = SRC / "styles" / "main.css.order"
    names = [
        line.strip()
        for line in order.read_text(encoding="utf-8").splitlines()
        if line.strip() and not line.startswith("#")
    ]
    parts = ["/* Generated from src/styles/ by scripts/build.py — do not edit. */"]
    for name in names:
        path = SRC / "styles" / name
        if not path.exists():
            raise BuildError(f"main.css.order lists '{name}', which does not exist")
        parts.append(f"\n/* ── {name} ── */\n" + path.read_text(encoding="utf-8").strip())

    out = dist / "assets" / "css" / "main.css"
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text("\n".join(parts) + "\n", encoding="utf-8")
    return len(names), out.stat().st_size


def build(dist):
    """Produce the complete deployable tree at `dist`."""
    if dist.exists():
        shutil.rmtree(dist)
    dist.mkdir(parents=True)

    data = load_content()
    written = []

    for page in sorted((SRC / "pages").glob("*.html")):
        html = render(page.read_text(encoding="utf-8"), data, f"pages/{page.name}")
        (dist / page.name).write_text(html, encoding="utf-8")
        written.append((page.name, len(html)))

    count, size = build_styles(dist)
    written.append((f"assets/css/main.css  ({count} partials)", size))

    shutil.copytree(SRC / "scripts", dist / "assets" / "js")
    written.append(("assets/js/  (ES modules, copied)",
                    sum(f.stat().st_size for f in (dist / "assets" / "js").rglob("*.js"))))

    # public/ mirrors dist/, so this is a verbatim copy with no path mapping.
    shutil.copytree(PUBLIC, dist, dirs_exist_ok=True)
    written.append(("public/ → dist/  (verbatim)",
                    sum(f.stat().st_size for f in PUBLIC.rglob("*") if f.is_file())))

    return written


def main():
    if "--check" in sys.argv:
        with tempfile.TemporaryDirectory() as tmp:
            fresh = Path(tmp) / "dist"
            build(fresh)
            if not DIST.exists():
                print("dist/ does not exist. Run: python3 scripts/build.py")
                return 1
            drifted = [
                str(f.relative_to(fresh))
                for f in sorted(fresh.rglob("*"))
                if f.is_file()
                and (not (DIST / f.relative_to(fresh)).exists()
                     or (DIST / f.relative_to(fresh)).read_bytes() != f.read_bytes())
            ]
            if drifted:
                print("STALE — dist/ does not match src/:")
                for name in drifted:
                    print(f"  {name}")
                print("\nRun: python3 scripts/build.py")
                return 1
            print("dist/ is up to date with src/")
            return 0

    for name, size in build(DIST):
        print(f"  {name:44s} {size:>8,} B")
    print("\nbuilt dist/. preview with: make preview")
    return 0


if __name__ == "__main__":
    try:
        sys.exit(main())
    except BuildError as err:
        print(f"build failed: {err}", file=sys.stderr)
        sys.exit(1)
