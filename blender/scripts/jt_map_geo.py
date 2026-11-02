"""Geography for the Jazz Map station: projection, shoreline assembly, clipping, simplification.

Pure Python (no bpy) so it can be tested outside Blender. Input: D:/Jazztor/data/osm/toronto.json
(© OpenStreetMap contributors, ODbL). Coordinates are (lon, lat) in, table metres out.
"""
import json
import math

DATA = "D:/Jazztor/data"
GRID_ROT = math.radians(16.7)   # Toronto's street grid runs ~16.7 deg west of true north; the map is turned so Yonge is vertical


class Projection:
    """Equirectangular around the box centre -> rotate to the street grid -> scale to the table."""

    def __init__(self, bbox, map_w, map_h):
        s, w, n, e = bbox
        self.lat0, self.lon0 = (s + n) / 2, (w + e) / 2
        self.kx = 111320.0 * math.cos(math.radians(self.lat0))
        self.ky = 110540.0
        corners = [self._metres(lon, lat) for lon, lat in ((w, s), (e, s), (e, n), (w, n))]
        # rotated box of the source data; the table shows the largest grid-aligned rectangle inside it
        xs = [c[0] for c in corners]
        ys = [c[1] for c in corners]
        inner_w = sorted(xs)[2] - sorted(xs)[1]
        inner_h = sorted(ys)[2] - sorted(ys)[1]
        self.scale = min(map_w / inner_w, map_h / inner_h)
        self.map_w, self.map_h = map_w, map_h
        self.view_m = (map_w / self.scale, map_h / self.scale)     # metres of city shown

    def _metres(self, lon, lat):
        x = (lon - self.lon0) * self.kx
        y = (lat - self.lat0) * self.ky
        c, s = math.cos(GRID_ROT), math.sin(GRID_ROT)
        return (x * c + y * s, -x * s + y * c)                     # clockwise turn: grid north (NNW) -> +Y

    def __call__(self, lon, lat):
        x, y = self._metres(lon, lat)
        return (x * self.scale, y * self.scale)

    def to_json(self):
        return {"lat0": self.lat0, "lon0": self.lon0, "kx": self.kx, "ky": self.ky, "rot": GRID_ROT,
                "scale": self.scale, "mapW": self.map_w, "mapH": self.map_h}


def load():
    with open(f"{DATA}/osm/toronto.json", encoding="utf-8") as f:
        return json.load(f)


def join_chains(ways):
    """Join polylines sharing end nodes. Returns list of point lists (closed rings repeat the first point)."""
    chains = [list(map(tuple, w)) for w in ways if len(w) > 1]
    merged = True
    while merged:
        merged = False
        for i in range(len(chains)):
            for j in range(len(chains)):
                if i == j:
                    continue
                a, b = chains[i], chains[j]
                if a[0] == a[-1] or b[0] == b[-1]:
                    continue
                if a[-1] == b[0]:
                    chains[i] = a + b[1:]
                elif a[-1] == b[-1]:
                    chains[i] = a + b[::-1][1:]
                elif a[0] == b[-1]:
                    chains[i] = b + a[1:]
                elif a[0] == b[0]:
                    chains[i] = b[::-1] + a[1:]
                else:
                    continue
                del chains[j]
                merged = True
                break
            if merged:
                break
    return chains


def simplify(pts, tol):
    """Ramer-Douglas-Peucker."""
    if len(pts) < 3:
        return pts
    (x0, y0), (x1, y1) = pts[0], pts[-1]
    dx, dy = x1 - x0, y1 - y0
    ln = math.hypot(dx, dy)
    best, idx = 0.0, 0
    for i in range(1, len(pts) - 1):
        px, py = pts[i]
        d = abs(dy * px - dx * py + x1 * y0 - y1 * x0) / ln if ln > 1e-12 else math.hypot(px - x0, py - y0)
        if d > best:
            best, idx = d, i
    if best <= tol:
        return [pts[0], pts[-1]]
    return simplify(pts[: idx + 1], tol)[:-1] + simplify(pts[idx:], tol)


def clip_polygon(poly, xmin, ymin, xmax, ymax):
    """Sutherland-Hodgman against an axis-aligned rectangle."""
    def clip(pts, inside, cut):
        out = []
        for i in range(len(pts)):
            cur, prev = pts[i], pts[i - 1]
            if inside(cur):
                if not inside(prev):
                    out.append(cut(prev, cur))
                out.append(cur)
            elif inside(prev):
                out.append(cut(prev, cur))
        return out

    def at_x(x):
        return lambda p, q: (x, p[1] + (q[1] - p[1]) * (x - p[0]) / (q[0] - p[0]))

    def at_y(y):
        return lambda p, q: (p[0] + (q[0] - p[0]) * (y - p[1]) / (q[1] - p[1]), y)

    pts = poly
    for inside, cut in ((lambda p: p[0] >= xmin, at_x(xmin)), (lambda p: p[0] <= xmax, at_x(xmax)),
                        (lambda p: p[1] >= ymin, at_y(ymin)), (lambda p: p[1] <= ymax, at_y(ymax))):
        pts = clip(pts, inside, cut)
        if not pts:
            break
    return pts


def clip_polyline(pts, xmin, ymin, xmax, ymax):
    """Splits a polyline into the runs that lie inside the rectangle (Liang-Barsky per segment)."""
    runs, run = [], []
    for i in range(len(pts) - 1):
        (x0, y0), (x1, y1) = pts[i], pts[i + 1]
        t0, t1, dx, dy = 0.0, 1.0, x1 - x0, y1 - y0
        ok = True
        for p, q in ((-dx, x0 - xmin), (dx, xmax - x0), (-dy, y0 - ymin), (dy, ymax - y0)):
            if p == 0:
                if q < 0:
                    ok = False
                    break
            else:
                t = q / p
                if p < 0:
                    t0 = max(t0, t)
                else:
                    t1 = min(t1, t)
        if not ok or t0 > t1:
            if run:
                runs.append(run)
                run = []
            continue
        a = (x0 + dx * t0, y0 + dy * t0)
        b = (x0 + dx * t1, y0 + dy * t1)
        if not run:
            run = [a]
        elif math.hypot(run[-1][0] - a[0], run[-1][1] - a[1]) > 1e-9:
            runs.append(run)
            run = [a]
        run.append(b)
        if t1 < 1.0:
            runs.append(run)
            run = []
    if len(run) > 1:
        runs.append(run)
    return [r for r in runs if len(r) > 1]


def lake_and_islands(geo, proj, margin_m=3000.0):
    """Returns (lake_polygon, island_rings) in table metres, unclipped (callers clip to the map)."""
    outer = [c["pts"] for c in geo["coastline"] if c["role"] == "outer"]
    inner = [c["pts"] for c in geo["coastline"] if c["role"] == "inner"]
    chains = [[proj(*p) for p in ch] for ch in join_chains(outer)]
    chains = [ch if ch[0][0] <= ch[-1][0] else ch[::-1] for ch in chains]   # west -> east
    chains.sort(key=lambda ch: ch[0][0])
    shore = [p for ch in chains for p in ch]
    far = margin_m * proj.scale
    xs = [p[0] for p in shore]
    ys = [p[1] for p in shore]
    lake = shore + [(max(xs) + far, min(ys) - far), (min(xs) - far, min(ys) - far)]
    islands = [[proj(*p) for p in ring] for ring in join_chains(inner)]
    return lake, islands, len(chains)


def preview_svg(path, geo, proj, lake, islands):
    W, H = proj.map_w, proj.map_h
    k = 1000 / W

    def d(pts, close=False):
        return "M" + " L".join(f"{(x + W / 2) * k:.1f} {(H / 2 - y) * k:.1f}" for x, y in pts) + (" Z" if close else "")
    body = [f'<rect width="1000" height="{H * k:.0f}" fill="#d9cdb4"/>',
            f'<path d="{d(clip_polygon(lake, -W / 2, -H / 2, W / 2, H / 2), True)}" fill="#26323d"/>']
    for r in islands:
        c = clip_polygon(r, -W / 2, -H / 2, W / 2, H / 2)
        if len(c) > 2:
            body.append(f'<path d="{d(c, True)}" fill="#d9cdb4"/>')
    for p in geo["parks"]:
        pts = [proj(*q) for q in p["pts"]]
        c = clip_polygon(pts, -W / 2, -H / 2, W / 2, H / 2)
        if len(c) > 2:
            body.append(f'<path d="{d(c, True)}" fill="#a9b391"/>')
    widths = {"motorway": 3, "trunk": 2.5, "primary": 1.8, "secondary": 1.2, "tertiary": 0.6}
    for r in geo["roads"]:
        if r["cls"] not in widths:
            continue
        for run in clip_polyline([proj(*q) for q in r["pts"]], -W / 2, -H / 2, W / 2, H / 2):
            body.append(f'<path d="{d(run)}" stroke="#3b2a1c" stroke-width="{widths[r["cls"]]}" fill="none"/>')
    for r in geo["rivers"]:
        for run in clip_polyline([proj(*q) for q in r["pts"]], -W / 2, -H / 2, W / 2, H / 2):
            body.append(f'<path d="{d(run)}" stroke="#26323d" stroke-width="2" fill="none"/>')
    with open(f"{DATA}/venues.json", encoding="utf-8") as fh:
        for v in json.load(fh)["venues"]:
            x, y = proj(v["lon"], v["lat"])
            body.append(f'<circle cx="{(x + W / 2) * k:.1f}" cy="{(H / 2 - y) * k:.1f}" r="5" fill="#c4673f"/>')
    with open(path, "w", encoding="utf-8") as fh:
        fh.write(f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1000 {H * k:.0f}">{"".join(body)}</svg>')


if __name__ == "__main__":
    g = load()
    pj = Projection(g["bbox"], 1.30, 0.82)
    lake, islands, n = lake_and_islands(g, pj)
    print("shore chains", n, "lake pts", len(lake), "islands", len(islands),
          "closed", sum(1 for r in islands if r[0] == r[-1]), "view km", [round(v / 1000, 2) for v in pj.view_m])
    preview_svg("D:/Jazztor/blender/renders/map_preview.svg", g, pj, lake, islands)
