"""Original JazzTor letterforms — no third-party font outlines.

* Wordmark: Didone-style pointed-pen construction. Each stroke is a centreline whose width follows the
  stroke direction (vertical = thick, horizontal = hairline), plus ball terminals.
* Engraving face: monoline capitals and figures, the way 1960s hi-fi panels were pantograph-engraved.

All glyph geometry is authored here in em units (cap height 700, baseline 0) and converted to meshes or SVG.
"""
import math
import bmesh
import bpy
from mathutils import Vector

THICK, THIN = 94.0, 17.0


# ------------------------------------------------------------------ 2D helpers
def arc(cx, cy, rx, ry, a0, a1, steps=None):
    steps = steps or max(8, int(abs(a1 - a0) / 6))
    return [(cx + rx * math.cos(math.radians(a0 + (a1 - a0) * i / steps)),
             cy + ry * math.sin(math.radians(a0 + (a1 - a0) * i / steps))) for i in range(steps + 1)]


def circle(cx, cy, r, steps=28):
    return [(cx + r * math.cos(2 * math.pi * i / steps), cy + r * math.sin(2 * math.pi * i / steps)) for i in range(steps)]


def contrast_stroke(pts, scale=1.0, closed=False):
    """Outline polygon of a pointed-pen stroke along pts."""
    n = len(pts)
    left, right = [], []
    for i in range(n):
        a = pts[(i - 1) % n] if closed else pts[max(i - 1, 0)]
        b = pts[(i + 1) % n] if closed else pts[min(i + 1, n - 1)]
        dx, dy = b[0] - a[0], b[1] - a[1]
        ln = math.hypot(dx, dy) or 1.0
        dx, dy = dx / ln, dy / ln
        w = (THIN + (THICK - THIN) * abs(dy) ** 1.15) * scale
        nx, ny = -dy, dx
        left.append((pts[i][0] + nx * w / 2, pts[i][1] + ny * w / 2))
        right.append((pts[i][0] - nx * w / 2, pts[i][1] - ny * w / 2))
    if closed:
        return [left, list(reversed(right))]          # outer and inner ring (two polygons as a frame)
    return [left + list(reversed(right))]


def rect_stroke(p0, p1, width):
    dx, dy = p1[0] - p0[0], p1[1] - p0[1]
    ln = math.hypot(dx, dy) or 1.0
    nx, ny = -dy / ln * width / 2, dx / ln * width / 2
    return [(p0[0] + nx, p0[1] + ny), (p1[0] + nx, p1[1] + ny), (p1[0] - nx, p1[1] - ny), (p0[0] - nx, p0[1] - ny)]


def shift(polys, dx, dy=0.0):
    mv = lambda p: [(x + dx, y + dy) for (x, y) in p]
    return [(p[0], mv(p[1]), mv(p[2])) if isinstance(p, tuple) else mv(p) for p in polys]


# ------------------------------------------------------------------ wordmark "JazzTor"
def _ring(cx, cy, rx, ry):
    """Closed contrast stroke (bowl): one ('ring', outer, inner) annulus, both loops counter-clockwise."""
    pts = arc(cx, cy, rx, ry, 0, 360, 72)[:-1]
    outer, inner = contrast_stroke(pts, closed=True)
    return [("ring", outer, list(reversed(inner)))]


def glyph_J():
    p = []
    p += contrast_stroke([(40, 691), (260, 691)])
    p += contrast_stroke([(150, 700), (150, 40)])
    p += contrast_stroke(arc(60, 40, 90, 92, 0, -205))
    end = arc(60, 40, 90, 92, -205, -205, 1)[0]
    p.append(circle(end[0] + 4, end[1] - 10, 47))
    return p, 300


def glyph_a():
    p = []
    p += contrast_stroke([(362, 315), (362, 45)])
    p += contrast_stroke(arc(414, 45, 52, 52, 180, 288))
    p += contrast_stroke(arc(232, 312, 130, 140, 0, 150))
    end = arc(232, 312, 130, 140, 150, 150, 1)[0]
    p.append(circle(end[0] - 2, end[1] - 22, 42))
    p += _ring(228, 132, 132, 124)
    return p, 485


def glyph_z():
    p = []
    p += contrast_stroke([(55, 461), (380, 461)])
    p += contrast_stroke([(62, 470), (62, 392)], scale=0.62)
    p.append([(392, 470), (300, 470), (40, 0), (132, 0)])            # flush-cut diagonal
    p += contrast_stroke([(46, 9), (392, 9)])
    p += contrast_stroke([(385, 0), (385, 88)], scale=0.62)
    return p, 440


def glyph_T():
    p = []
    p += contrast_stroke([(25, 691), (575, 691)])
    p += contrast_stroke([(31, 700), (31, 552)], scale=0.55)
    p += contrast_stroke([(569, 700), (569, 552)], scale=0.55)
    p += contrast_stroke([(300, 700), (300, 0)])
    p += contrast_stroke([(192, 9), (408, 9)])
    return p, 560


def glyph_o():
    return _ring(240, 236, 172, 226), 485


def glyph_r():
    p = []
    p += contrast_stroke([(110, 470), (110, 0)])
    p += contrast_stroke([(22, 9), (212, 9)])
    p += contrast_stroke([(22, 461), (110, 461)])
    p += contrast_stroke(arc(212, 352, 102, 102, 168, 40))
    end = arc(212, 352, 102, 102, 40, 40, 1)[0]
    p.append(circle(end[0] - 8, end[1] - 22, 42))
    return p, 330


def wordmark_polys():
    """Returns (polygons, width, cap_height) for 'JazzTor' in em units."""
    seq = [(glyph_J, 40), (glyph_a, -10), (glyph_z, 10), (glyph_z, 0), (glyph_T, -10), (glyph_o, -55), (glyph_r, 10)]
    polys, x = [], 0.0
    for fn, kern in seq:
        x += kern
        g, adv = fn()
        polys += shift(g, x)
        x += adv
    return polys, x, 700.0


# ------------------------------------------------------------------ monoline engraving face
MONO_W = 72.0


def _mono_glyphs():
    g = {
        "A": ([[(0, 0), (250, 700), (500, 0)], [(95, 235), (405, 235)]], 500),
        "C": ([arc(270, 350, 240, 350, 45, 315)], 520),
        "D": ([[(40, 0), (40, 700), (200, 700)] + arc(200, 350, 270, 350, 90, -90) + [(40, 0)]], 520),
        "E": ([[(440, 700), (40, 700), (40, 0), (440, 0)], [(40, 360), (380, 360)]], 470),
        "F": ([[(440, 700), (40, 700), (40, 0)], [(40, 370), (380, 370)]], 450),
        "G": ([arc(270, 350, 240, 350, 48, 352), [(508, 300), (508, 330), (300, 330)]], 540),
        "H": ([[(40, 0), (40, 700)], [(460, 0), (460, 700)], [(40, 355), (460, 355)]], 500),
        "I": ([[(60, 0), (60, 700)]], 120),
        "K": ([[(40, 0), (40, 700)], [(450, 700), (40, 270)], [(185, 420), (470, 0)]], 480),
        "M": ([[(40, 0), (40, 700), (300, 180), (560, 700), (560, 0)]], 600),
        "N": ([[(40, 0), (40, 700), (460, 0), (460, 700)]], 500),
        "O": ([arc(270, 350, 235, 350, 0, 360, 64)], 540),
        "R": ([[(40, 0), (40, 700), (270, 700)] + arc(270, 525, 175, 175, 90, -90) + [(40, 350)],
               [(240, 350), (470, 0)]], 500),
        "S": ([arc(250, 525, 190, 175, 25, 270) + arc(250, 175, 200, 175, 90, -155)], 500),
        "T": ([[(0, 700), (500, 700)], [(250, 700), (250, 0)]], 500),
        "U": ([[(40, 700), (40, 230)] + arc(250, 230, 210, 230, 180, 360) + [(460, 700)]], 500),
        "Y": ([[(0, 700), (250, 350), (500, 700)], [(250, 350), (250, 0)]], 500),
        "3": ([arc(240, 525, 175, 175, 150, -90) + arc(240, 182, 190, 182, 90, -150)], 470),
        "4": ([[(370, 0), (370, 700), (0, 210), (480, 210)]], 490),
        "5": ([[(440, 700), (90, 700), (60, 400)] + arc(245, 215, 200, 215, 140, -150)], 470),
        "B": ([[(40, 0), (40, 700), (250, 700)] + arc(250, 530, 170, 170, 90, -90) + [(40, 360)],
               [(40, 360), (270, 360)] + arc(270, 180, 180, 180, 90, -90) + [(40, 0)]], 490),
        "J": ([[(380, 700), (380, 210)] + arc(220, 210, 160, 210, 0, -180)], 450),
        "L": ([[(40, 700), (40, 0), (420, 0)]], 440),
        "P": ([[(40, 0), (40, 700), (270, 700)] + arc(270, 520, 180, 180, 90, -90) + [(40, 340)]], 490),
        "Q": ([arc(270, 350, 235, 350, 0, 360, 64), [(320, 170), (520, -40)]], 560),
        "V": ([[(0, 700), (250, 0), (500, 700)]], 500),
        "W": ([[(0, 700), (150, 0), (320, 520), (490, 0), (640, 700)]], 640),
        "X": ([[(20, 0), (480, 700)], [(20, 700), (480, 0)]], 500),
        "Z": ([[(40, 700), (460, 700), (40, 0), (460, 0)]], 500),
        "0": ([arc(240, 350, 200, 350, 0, 360, 48)], 480),
        "1": ([[(110, 560), (250, 700), (250, 0)]], 400),
        "2": ([arc(245, 505, 195, 195, 165, -35) + [(40, 0), (460, 0)]], 500),
        "6": ([arc(255, 470, 205, 230, 60, 180) + arc(250, 200, 205, 200, 180, 540, 40)], 500),
        "7": ([[(30, 700), (470, 700), (170, 0)]], 480),
        "8": ([arc(250, 530, 160, 170, 0, 360, 36), arc(250, 190, 195, 190, 0, 360, 40)], 500),
        "9": ([arc(245, 500, 205, 200, 0, 360, 40), [(450, 500), (380, 0)]], 500),
        "-": ([[(60, 350), (340, 350)]], 400),
        "'": ([[(70, 700), (55, 560)]], 140),
        ".": ([arc(60, 30, 25, 25, 0, 360, 10)], 120),
        "©": ([arc(360, 350, 340, 350, 0, 360, 48), arc(360, 350, 150, 170, 45, 315)], 720),
        " ": ([], 260),
        "·": ([arc(60, 350, 30, 30, 0, 360, 12)], 120),
    }
    return g


MONO = _mono_glyphs()


def _uniform_stroke(pts, w):
    left, right = [], []
    n = len(pts)
    for i in range(n):
        a, b = pts[max(i - 1, 0)], pts[min(i + 1, n - 1)]
        dx, dy = b[0] - a[0], b[1] - a[1]
        ln = math.hypot(dx, dy) or 1.0
        nx, ny = -dy / ln * w / 2, dx / ln * w / 2
        left.append((pts[i][0] + nx, pts[i][1] + ny))
        right.append((pts[i][0] - nx, pts[i][1] - ny))
    return left + list(reversed(right))


def _simplify(pts, min_step=24.0):
    out = [pts[0]]
    for p in pts[1:-1]:
        if math.hypot(p[0] - out[-1][0], p[1] - out[-1][1]) >= min_step:
            out.append(p)
    out.append(pts[-1])
    return out


def mono_polys(text, tracking=110.0):
    """Monoline text: smooth runs become single stroke polygons; round joints only at corners and ends."""
    polys, x = [], 0.0
    for ch in text:
        lines, adv = MONO.get(ch, MONO[" "])
        for line in lines:
            pts = _simplify([(px + x, py) for (px, py) in line])
            runs, run = [], [pts[0]]
            for i in range(1, len(pts)):
                run.append(pts[i])
                if 0 < i < len(pts) - 1:
                    a, b, c2 = pts[i - 1], pts[i], pts[i + 1]
                    ang = math.degrees(abs(math.atan2(c2[1] - b[1], c2[0] - b[0]) - math.atan2(b[1] - a[1], b[0] - a[0])))
                    ang = min(ang, 360 - ang)
                    if ang > 28:
                        runs.append(run)
                        run = [pts[i]]
            runs.append(run)
            for r in runs:
                if len(r) >= 2:
                    polys.append(_uniform_stroke(r, MONO_W))
                for p in (r[0], r[-1]):
                    polys.append(circle(p[0], p[1], MONO_W / 2, 10))
        x += adv + tracking
    return polys, x - tracking

# ------------------------------------------------------------------ mesh / svg output
def _area(poly):
    return sum(poly[i][0] * poly[(i + 1) % len(poly)][1] - poly[(i + 1) % len(poly)][0] * poly[i][1]
               for i in range(len(poly))) / 2


def _annulus(bm, outer, inner, scale, depth, origin):
    """Manifold prism of a ring: outer/inner loops have equal point counts."""
    def loop(pts, z):
        return [bm.verts.new(((x - origin[0]) * scale, (y - origin[1]) * scale, z)) for x, y in pts]
    if _area(outer) < 0:
        outer, inner = list(reversed(outer)), list(reversed(inner))
    ob, ot, ib, it = loop(outer, 0), loop(outer, depth), loop(inner, 0), loop(inner, depth)
    n = len(outer)
    for i in range(n):
        j = (i + 1) % n
        bm.faces.new([ob[i], ob[j], ot[j], ot[i]])        # outer wall
        bm.faces.new([it[i], it[j], ib[j], ib[i]])        # inner wall (faces inward to the hole)
        bm.faces.new([ot[i], ot[j], it[j], it[i]])        # top
        bm.faces.new([ib[i], ib[j], ob[j], ob[i]])        # bottom


def solid_bm(polys, scale, depth, origin=(0.0, 0.0)):
    """Extrude each polygon (em units -> metres) into a closed prism, all in one bmesh (XY plane, +Z up)."""
    bm = bmesh.new()
    for poly in polys:
        if isinstance(poly, tuple):
            _annulus(bm, poly[1], poly[2], scale, depth, origin)
            continue
        if len(poly) < 3:
            continue
        pts = poly if _area(poly) > 0 else list(reversed(poly))
        # drop near-duplicate points (keeps ngon valid)
        clean = [pts[0]]
        for p in pts[1:]:
            if math.hypot(p[0] - clean[-1][0], p[1] - clean[-1][1]) > 0.5:
                clean.append(p)
        if math.hypot(clean[0][0] - clean[-1][0], clean[0][1] - clean[-1][1]) < 0.5:
            clean.pop()
        if len(clean) < 3:
            continue
        lo = [bm.verts.new(((x - origin[0]) * scale, (y - origin[1]) * scale, 0)) for x, y in clean]
        hi = [bm.verts.new(((x - origin[0]) * scale, (y - origin[1]) * scale, depth)) for x, y in clean]
        try:
            bm.faces.new(hi)
            bm.faces.new(list(reversed(lo)))
            for i in range(len(clean)):
                j = (i + 1) % len(clean)
                bm.faces.new([lo[i], lo[j], hi[j], hi[i]])
        except ValueError:
            pass
    bm.normal_update()
    return bm


def write_svg(path, polys, width, height, pad=40, fill="#C9A368"):
    vb_w, vb_h = width + pad * 2, height + pad * 2 + 260   # room for the J descender
    d = []
    to_d = lambda pts: "M" + " L".join(f"{x + pad:.1f} {height + pad + 130 - y:.1f}" for x, y in pts) + " Z"
    for poly in polys:
        if isinstance(poly, tuple):              # ring: outer CCW + inner CW -> hole under nonzero fill
            d.append(to_d(poly[1]) + " " + to_d(list(reversed(poly[2]))))
            continue
        pts = poly if _area(poly) > 0 else list(reversed(poly))
        d.append(to_d(pts))
    with open(path, "w", encoding="utf-8") as f:
        f.write(f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {vb_w:.0f} {vb_h:.0f}" role="img" '
                f'aria-label="JazzTor"><title>JazzTor</title><path fill="{fill}" fill-rule="nonzero" d="{" ".join(d)}"/></svg>\n')


# ------------------------------------------------------------------ Blender objects
def _object(name, col, bm, mat):
    import jt_lib as L
    L.box_uv(bm, 0.05)
    ob = L.obj_from_bm(name, bm, col, mat, 30)
    return ob


def wordmark_object(name, col, cap_height, depth, mat=None):
    """'JazzTor' as one clean manifold mesh (strokes unioned) in the XY plane, extruded +Z by depth."""
    import jt_lib as L
    polys, width, cap = wordmark_polys()
    s = cap_height / cap
    pieces = [_object(f"{name}_part{i}", col, solid_bm([p], s, depth, (width / 2, cap / 2)), None)
              for i, p in enumerate(polys)]
    base = pieces[0]
    for p in pieces[1:]:
        L.boolean(base, p, "UNION")
        bpy.data.objects.remove(p, do_unlink=True)
    base.name = name
    base.data.name = name
    if mat:
        L.assign(base, mat)
    bm = bmesh.new()
    bm.from_mesh(base.data)
    bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-7)
    L.box_uv(bm, 0.05)
    bm.to_mesh(base.data)
    bm.free()
    return base


def mono_object(name, col, text, cap_height, depth, mat=None):
    polys, width = mono_polys(text)
    s = cap_height / 700.0
    return _object(name, col, solid_bm(polys, s, depth, (width / 2, 350)), mat)
