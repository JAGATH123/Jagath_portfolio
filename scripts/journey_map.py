#!/usr/bin/env python3
"""
Draw the JOURNEY screen's map into src/partials/journey-map.html.

A dev-time tool, like nothing else in scripts/: build.py never runs it and
CI never sees it. The partial it writes is committed; the data it reads is
not. Rerun it after editing src/content/journey.json.

    python3 scripts/journey_map.py --land50 ne_50m_land.geojson \\
                                   --land10 ne_10m_land.geojson

WHY IT EXISTS
    The map is the home lattice's dot field laid over real coastlines: land
    is one <path> of run-rectangles filled by an 11x7-in-16 <pattern> tile,
    so a continent is a few kilobytes of markup rather than thousands of
    <rect>s, and there is no map library, tile server or script at runtime.
    Kattankulathur and Chennai are 30 km apart, a third of a cell at this
    scale, so they get a magnified inset drawn from finer coastline data.

DATA
    Natural Earth land polygons. Public domain; downloaded, never committed.
      https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_50m_land.geojson
      https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_10m_land.geojson

OUTPUT
    Geometry and class names only. Colours, strokes, fonts and pin styling
    all live in the stylesheet; the only inline styles are the --x/--y/--w/
    --ar custom properties that place the HTML overlay. Pins are HTML, not
    SVG text, so labels keep a readable pixel size however the frame scales.

Standard library only.
"""

import argparse
import bisect
import html
import json
import math
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
JOURNEY = ROOT / "src" / "content" / "journey.json"
OUT = ROOT / "src" / "partials" / "journey-map.html"

# Main map: equirectangular, standard parallel PHI0, one 8-unit cell per
# degree of latitude. 96x54 cells is exactly 16:9.
PHI0 = 35.0
C0 = math.cos(math.radians(PHI0))
K = 8.0                       # units per degree of latitude
PITCH = 8.0
COLS, ROWS = 96, 54
WEST, NORTH = -11.0, 60.0     # Siegen upper-left, Chennai lower-right
VW, VH = COLS * PITCH, ROWS * PITCH

# Inset: same projection, magnified. 32x24 cells of 7.875 units is 4:3.
I_PITCH = 7.875
I_COLS, I_ROWS = 32, 24
I_W, I_H = I_COLS * I_PITCH, I_ROWS * I_PITCH
I_X, I_Y = VW - I_W - 18, 18  # top-right, over Central Asia
I_LON = (79.10, 80.42)        # land to the west for labels to sit on; the Bay of Bengal east
I_CUT = 16                    # chamfer on the bottom-right corner
ZONE_MIN = 14                 # the zone box is never smaller than this

TILE = (11 / 16, 7 / 16, 4 / 16)  # the lattice's cell: width, height, y-offset
SS, THR = 3, 0.34             # supersamples per axis, land fraction to light
ROUTE_POINTS = 24
EDGE_SIDE = 78.0              # main pins right of this % take the label left


def num(v, nd=2):
    return f"{round(v, nd):.{nd}f}".rstrip("0").rstrip(".")


def load_edges(path, south, north):
    """Every polygon edge of the GeoJSON that crosses the latitude band."""
    gj = json.loads(Path(path).read_text(encoding="utf-8"))
    edges = []
    for feature in gj["features"]:
        g = feature.get("geometry") or {}
        polys = {"Polygon": [g.get("coordinates")], "MultiPolygon": g.get("coordinates")}.get(g.get("type"), [])
        for poly in polys:
            for ring in poly:
                for (x1, y1), (x2, y2) in zip(ring, ring[1:]):
                    if y1 == y2 or max(y1, y2) < south or min(y1, y2) > north:
                        continue
                    edges.append((x1, y1, x2, y2) if y1 < y2 else (x2, y2, x1, y1))
    return edges


def land_runs(edges, cols, rows, pitch, to_lonlat):
    """Scanline even-odd fill: [row, first col, last col] for each land run."""
    runs = []
    for r in range(rows):
        lat_hi, _ = to_lonlat(0, r * pitch)[::-1]
        lat_lo, _ = to_lonlat(0, (r + 1) * pitch)[::-1]
        band = [e for e in edges if e[1] <= lat_hi and e[3] > lat_lo]
        counts = [0] * cols
        for sy in range(SS):
            _, lat = to_lonlat(0, (r + (sy + .5) / SS) * pitch)
            xs = sorted(x1 + (lat - y1) * (x2 - x1) / (y2 - y1)
                        for x1, y1, x2, y2 in band if y1 <= lat < y2)
            for c in range(cols):
                for sx in range(SS):
                    lon, _ = to_lonlat((c + (sx + .5) / SS) * pitch, 0)
                    counts[c] += bisect.bisect_right(xs, lon) % 2
        land = [n >= THR * SS * SS for n in counts] + [False]
        start = None
        for c, on in enumerate(land):
            if on and start is None:
                start = c
            elif not on and start is not None:
                runs.append((r, start, c - 1))
                start = None
    return runs


def runs_path(runs, pitch):
    p = num(pitch)
    return "".join(f"M{num(s * pitch)} {num(r * pitch)}h{num((e - s + 1) * pitch)}v{p}h-{num((e - s + 1) * pitch)}z"
                   for r, s, e in runs)


def pattern(pid, pitch, cls):
    w, h, y = (num(t * pitch, 3) for t in TILE)
    return (f'<pattern id="{pid}" width="{num(pitch)}" height="{num(pitch)}" patternUnits="userSpaceOnUse">'
            f'<rect class="{cls}" x="0" y="{y}" width="{w}" height="{h}"></rect></pattern>')


def great_circle(a, b, n):
    """n points from a to b, (lat, lon) in degrees, by slerp on the sphere."""
    def vec(lat, lon):
        la, lo = math.radians(lat), math.radians(lon)
        return (math.cos(la) * math.cos(lo), math.cos(la) * math.sin(lo), math.sin(la))
    v1, v2 = vec(*a), vec(*b)
    om = math.acos(max(-1.0, min(1.0, sum(p * q for p, q in zip(v1, v2)))))
    out = []
    for i in range(n):
        t = i / (n - 1)
        s1, s2 = math.sin((1 - t) * om) / math.sin(om), math.sin(t * om) / math.sin(om)
        x, y, z = (s1 * p + s2 * q for p, q in zip(v1, v2))
        out.append((math.degrees(math.asin(z)), math.degrees(math.atan2(y, x))))
    out[0], out[-1] = a, b
    return out


def main():
    ap = argparse.ArgumentParser(description=__doc__.split("\n\n")[0].strip())
    ap.add_argument("--land50", required=True, help="ne_50m_land.geojson (main map)")
    ap.add_argument("--land10", required=True, help="ne_10m_land.geojson (inset)")
    ap.add_argument("--journey", default=str(JOURNEY))
    ap.add_argument("--out", default=str(OUT))
    a = ap.parse_args()

    entries = json.loads(Path(a.journey).read_text(encoding="utf-8"))
    inset = [e for e in entries if e.get("inset")]
    if not inset:
        raise SystemExit("journey.json: no entry has \"inset\": true")

    # projections: main frame units, and inset-local units
    south = NORTH - VH / K
    main_xy = lambda lat, lon: ((lon - WEST) * C0 * K, (NORTH - lat) * K)
    main_ll = lambda x, y: (WEST + x / (C0 * K), NORTH - y / K)
    ki = I_W / ((I_LON[1] - I_LON[0]) * C0)
    mid_lat = sum(e["lat"] for e in inset) / len(inset)
    i_north = mid_lat + I_H / ki / 2
    i_south = i_north - I_H / ki
    inset_xy = lambda lat, lon: ((lon - I_LON[0]) * C0 * ki, (i_north - lat) * ki)
    inset_ll = lambda x, y: (I_LON[0] + x / (C0 * ki), i_north - y / ki)
    mag = ki / K

    land = runs_path(land_runs(load_edges(a.land50, south - 1, NORTH + 1), COLS, ROWS, PITCH, main_ll), PITCH)
    i_land = runs_path(land_runs(load_edges(a.land10, i_south - .1, i_north + .1), I_COLS, I_ROWS, I_PITCH, inset_ll), I_PITCH)

    # zone: the inset's footprint on the main map, grown to stay visible
    zx0, zy0 = main_xy(i_north, I_LON[0])
    zx1, zy1 = main_xy(i_south, I_LON[1])
    zw = max(zx1 - zx0, ZONE_MIN)
    zh = max(zy1 - zy0, zw * I_H / I_W)
    zcx, zcy = (zx0 + zx1) / 2, (zy0 + zy1) / 2
    zone = (zcx - zw / 2, zcy - zh / 2, zw, zh)

    # leader: zone centre toward the nearest point of the inset, clipped to the zone
    tx = min(max(zcx, I_X), I_X + I_W - I_CUT)
    ty = min(max(zcy, I_Y), I_Y + I_H)
    dx, dy = tx - zcx, ty - zcy
    t = min(zw / 2 / abs(dx) if dx else 1e9, zh / 2 / abs(dy) if dy else 1e9)
    lead = f"M{num(zcx + dx * t, 1)} {num(zcy + dy * t, 1)}L{num(tx, 1)} {num(ty, 1)}"

    # route: the inset cluster collapses to its last stop, then every stop after it
    hub = inset[-1]
    legs = [hub] + [e for e in entries[entries.index(hub) + 1:] if not e.get("inset")]
    pts = []
    for p, q in zip(legs, legs[1:]):
        arc = great_circle((p["lat"], p["lon"]), (q["lat"], q["lon"]), ROUTE_POINTS)
        pts += arc[1:] if pts else arc
    route_xy = [main_xy(lat, lon) for lat, lon in pts]
    route = "M" + "L".join(f"{num(x, 1)} {num(y, 1)}" for x, y in route_xy)
    clear = min(math.hypot(max(I_X - x, 0, x - I_X - I_W), max(I_Y - y, 0, y - I_Y - I_H))
                for (x0, y0), (x1, y1) in zip(route_xy, route_xy[1:])
                for x, y in ((x0 + (x1 - x0) * i / 20, y0 + (y1 - y0) * i / 20) for i in range(21)))
    if clear < 12:
        raise SystemExit(f"route passes {clear:.1f} units from the inset: move it or recrop")
    i_route = "M" + "L".join("{} {}".format(*(num(v, 1) for v in inset_xy(e["lat"], e["lon"]))) for e in inset)

    # the overlay, in % of the main frame
    pins, report = [], []
    for e in entries:
        if e.get("inset"):
            x, y = inset_xy(e["lat"], e["lon"])
            x, y, where = I_X + x, I_Y + y, "i"
            side = "l"  # both labels west: east of Chennai is the inset edge
        else:
            (x, y), where = main_xy(e["lat"], e["lon"]), "m"
            side = "l" if x / VW * 100 > EDGE_SIDE else "r"
        px, py = x / VW * 100, y / VH * 100
        if not (0 < px < 100 and 0 < py < 100):
            raise SystemExit(f"{e['num']} {e['place']} falls outside the frame: recrop")
        cls = " ".join(c for c in ("jm__pin", f"jm__pin--{e['num']}", f"jm__pin--{e['kind']}",
                                   e.get("state", ""), f"jm__pin--{where}") if c)
        pins.append(f'<span class="{cls}" style="--x:{px:.2f}%;--y:{py:.2f}%" data-n="{html.escape(e["num"])}" '
                    f'data-side="{side}" aria-hidden="true"><i class="jm__mk"></i><span class="jm__lbl">'
                    f'<b class="jm__n">{html.escape(e["num"])}</b> {html.escape(e["place"])}</span></span>')
        report.append(f"  {e['num']} {e['place']:<16} {where} {side}  x {px:6.2f}%  y {py:6.2f}%")

    chamfer = f"M0 0H{num(I_W)}V{num(I_H - I_CUT)}L{num(I_W - I_CUT)} {num(I_H)}H0Z"
    nse = 'vector-effect="non-scaling-stroke"'
    svg = (
        f'<svg class="jm__svg" viewBox="0 0 {num(VW)} {num(VH)}" preserveAspectRatio="xMidYMid meet" aria-hidden="true" focusable="false">'
        f'<defs>{pattern("jm-cell", PITCH, "jm__unit")}{pattern("jm-cell-i", I_PITCH, "jm__unit jm__unit--i")}'
        f'<clipPath id="jm-inset-clip"><path d="{chamfer}"></path></clipPath></defs>\n'
        f'<path class="jm__land" fill="url(#jm-cell)" d="{land}"></path>\n'
        f'<rect class="jm__zone" x="{num(zone[0], 1)}" y="{num(zone[1], 1)}" width="{num(zone[2], 1)}" height="{num(zone[3], 1)}" {nse}></rect>'
        f'<path class="jm__lead" d="{lead}" {nse}></path>\n'
        f'<path class="jm__route" d="{route}" {nse}></path>\n'
        f'<g class="jm__inset" transform="translate({num(I_X)} {num(I_Y)})">'
        f'<g clip-path="url(#jm-inset-clip)"><rect class="jm__inset-bg" width="{num(I_W)}" height="{num(I_H)}"></rect>'
        f'<path class="jm__land jm__land--i" fill="url(#jm-cell-i)" d="{i_land}"></path></g>'
        f'<path class="jm__route jm__route--i" d="{i_route}" {nse}></path>'
        f'<path class="jm__inset-frame" d="{chamfer}" {nse}></path></g></svg>'
    )
    cap = (f'<span class="jm__icap" style="--x:{I_X / VW * 100:.2f}%;--y:{I_Y / VH * 100:.2f}%;--w:{I_W / VW * 100:.2f}%" '
           f'aria-hidden="true">▪ DETAIL ×{mag:.0f}<span class="jm__icap-at"> // {html.escape(hub["place"])}</span></span>')
    corners = "".join(f'<span class="crn crn--{c}" aria-hidden="true"></span>' for c in ("tl", "tr", "bl"))
    out = (
        "{{! journey-map.html — GENERATED by scripts/journey_map.py from\n"
        "    src/content/journey.json and Natural Earth land (public domain).\n"
        "    Do not edit by hand: change journey.json, then rerun the script. }}\n"
        f'<div class="jm__frame" style="--ar:{num(VW)}/{num(VH)}">\n{svg}\n'
        + "\n".join(pins) + f"\n{cap}\n{corners}\n</div>\n"
    )
    Path(a.out).write_text(out, encoding="utf-8")

    print(f"main   viewBox 0 0 {num(VW)} {num(VH)}  lon {WEST}..{num(main_ll(VW, 0)[0])}  lat {num(south)}..{NORTH}")
    print(f"inset  {num(I_W)}x{num(I_H)} at {num(I_X)},{num(I_Y)}  lon {I_LON[0]}..{I_LON[1]}  "
          f"lat {i_south:.3f}..{i_north:.3f}  magnification x{mag:.2f}  route clearance {clear:.1f}")
    print("\n".join(report))
    print(f"wrote {a.out}  {len(out.encode())} bytes")


if __name__ == "__main__":
    main()
