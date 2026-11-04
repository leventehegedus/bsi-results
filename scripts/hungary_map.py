#!/usr/bin/env python3
"""Build public/hu-map.json (towns and border of Hungary, already projected) for the finisher heatmap.

Usage: hungary_map.py HU.zip ne_10m_admin_0_countries.geojson public/hu-map.json

  HU.zip     https://download.geonames.org/export/dump/HU.zip (CC BY 4.0, credited in the UI)
  *.geojson  nvkelso/natural-earth-vector, geojson/ne_10m_admin_0_countries.geojson (public domain)
"""
import json
import math
import sys
import zipfile

WIDTH = 640  # viewBox width; the client bins and draws in these units
TOLERANCE = 0.6  # border simplification, in viewBox units
SETTLEMENTS = {"PPL", "PPLA", "PPLA2", "PPLC"}


def simplify(points, tolerance):
    """Ramer-Douglas-Peucker, iterative so long borders can't hit the recursion limit."""
    keep = {0, len(points) - 1}
    stack = [(0, len(points) - 1)]
    while stack:
        a, b = stack.pop()
        (ax, ay), (bx, by) = points[a], points[b]
        length = math.hypot(bx - ax, by - ay)
        best, best_dist = None, tolerance
        for i in range(a + 1, b):
            px, py = points[i]
            dist = (
                abs((bx - ax) * (ay - py) - (ax - px) * (by - ay)) / length
                if length
                else math.hypot(px - ax, py - ay)
            )
            if dist > best_dist:
                best, best_dist = i, dist
        if best is not None:
            keep.add(best)
            stack += [(a, best), (best, b)]
    return [points[i] for i in sorted(keep)]


def main(zip_path, geojson_path, out_path):
    with open(geojson_path, encoding="utf-8") as f:
        countries = json.load(f)
    hungary = next(c for c in countries["features"] if c["properties"]["ADM0_A3"] == "HUN")
    assert hungary["geometry"]["type"] == "Polygon"
    ring = hungary["geometry"]["coordinates"][0]

    lons = [p[0] for p in ring]
    lats = [p[1] for p in ring]
    # equirectangular at Hungary's mid latitude: small enough a country that this barely distorts
    squeeze = math.cos(math.radians((min(lats) + max(lats)) / 2))
    scale = WIDTH / ((max(lons) - min(lons)) * squeeze)
    project = lambda lon, lat: (
        round((lon - min(lons)) * squeeze * scale, 1),
        round((max(lats) - lat) * scale, 1),
    )

    border = simplify([project(*p) for p in ring], TOLERANCE)
    outline = "M" + "L".join(f"{x},{y}" for x, y in border) + "Z"

    with zipfile.ZipFile(zip_path) as z:
        rows = [line.split("\t") for line in z.read("HU.txt").decode("utf-8").splitlines()]
    # many real villages have no population in GeoNames, so they stay in; biggest first,
    # so a name shared by several places resolves to the largest
    places = [r for r in rows if r[6] == "P" and r[7] in SETTLEMENTS]
    places.sort(key=lambda r: -int(r[14] or 0))
    towns = []
    seen = set()
    for r in places:
        if r[1] not in seen:
            seen.add(r[1])
            towns.append([r[1], *project(float(r[5]), float(r[4]))])

    km_per_unit = 111.32 / scale
    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(
            {
                "width": WIDTH,
                "height": round((max(lats) - min(lats)) * scale, 1),
                "kmPerUnit": round(km_per_unit, 3),
                "outline": outline,
                "towns": towns,
            },
            f,
            ensure_ascii=False,
            separators=(",", ":"),
        )
    print(f"{len(towns)} towns, {len(border)} border points, 1 unit = {km_per_unit:.2f} km")


if __name__ == "__main__":
    main(*sys.argv[1:])
