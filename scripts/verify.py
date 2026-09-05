#!/usr/bin/env python3
"""
Check that dist/ is actually shippable.

Not a test framework — a list of things that have gone wrong on this project
before. Each check exists because it broke once.

    python3 scripts/verify.py
"""
import json
import re
import sys
from pathlib import Path

DIST = Path(__file__).resolve().parent.parent / "dist"
failures = []


def check(name, problems):
    if problems:
        failures.append(name)
        print(f"  FAIL  {name}")
        for p in problems[:6]:
            print(f"          {p}")
    else:
        print(f"  ok    {name}")


def strip_comments(html):
    return re.sub(r"<!--.*?-->", "", html, flags=re.S)


pages = [p for p in ("index.html", "404.html") if (DIST / p).exists()]
if not pages:
    print("dist/ has no pages. Run: python3 scripts/build.py")
    sys.exit(1)

# Every referenced asset resolves. A 404 on your own CV is worse than no link.
bad = []
for page in pages:
    html = strip_comments((DIST / page).read_text(encoding="utf-8"))
    for url in re.findall(r'(?:src|href)="([^"]+)"', html):
        if re.match(r"^(https?:|mailto:|tel:|data:|#)", url):
            continue
        path = url.split("#")[0].lstrip("/")
        path = re.sub(r"^Jagath_portfolio/", "", path)
        if path and not (DIST / path).exists():
            bad.append(f"{page}: {url}")
check("every local asset resolves", bad)

# Every in-page fragment has a target.
html = strip_comments((DIST / "index.html").read_text(encoding="utf-8"))
ids = set(re.findall(r'id="([^"]+)"', html))
check("no dangling #fragments",
      [f"#{f}" for f in set(re.findall(r'href="#([^"]+)"', html)) if f not in ids])

# Structured data has to parse or search engines silently drop it.
try:
    for block in re.findall(r'ld\+json">(.*?)</script>', html, re.S):
        json.loads(block)
    check("JSON-LD parses", [])
except json.JSONDecodeError as err:
    check("JSON-LD parses", [str(err)])

# Every ES module import points at a real file.
bad = []
for path in (DIST / "assets" / "js").rglob("*.js"):
    for spec in re.findall(r"""from\s+['"](\./[^'"]+)['"]""", path.read_text(encoding="utf-8")):
        if not (path.parent / spec).exists():
            bad.append(f"{path.name} -> {spec}")
check("every module import resolves", bad)

# A build token that reached the output means a typo shipped.
check("no unrendered template tokens",
      [f"{p}: {m}" for p in pages
       for m in re.findall(r"\{\{[^}]*\}\}", (DIST / p).read_text(encoding="utf-8"))])

# These three are load-bearing and have each been broken by a "cleanup" before.
css = (DIST / "assets" / "css" / "main.css").read_text(encoding="utf-8")
guards = []
if "visibility:hidden" not in css:
    guards.append("inactive screens must use visibility:hidden — it is what keeps "
                  "them out of the a11y tree and tab order")
if "margin-block:auto" not in css:
    guards.append("`.screen > *{margin-block:auto}` is the fix for unreachable "
                  "scroll-top; align-items:center re-breaks it")
# All six defaults, not just --accent. If any drifts, the page renders in the
# wrong colours with JS disabled, and nothing else would catch it.
for prop, value in (("--accent", "#6eb0ff"), ("--accent2", "#baeeff"),
                    ("--slab-fg", "#081e40"), ("--ca", "0"),
                    ("--scan-op", ".42"), ("--grain-op", ".06")):
    if f"{prop}:{value}" not in css.replace(" ", ""):
        guards.append(f"{prop} default must be {value} — byte-exact with the "
                      "coolant grade, so the page is coloured with JS off")
check("load-bearing CSS still present", guards)

print()
if failures:
    print(f"{len(failures)} check(s) failed")
    sys.exit(1)
print("all checks passed")
