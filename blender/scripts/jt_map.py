"""A10 / 35 — Jazz Map station: walnut-and-brass table with a modelled relief map of Toronto under smoked glass.

Map data © OpenStreetMap contributors (ODbL) — see D:/Jazztor/data/osm. Everything on the map is geometry:
land is a slab carved by Lake Ontario, roads are raised brass relief graded by class, parks are felt inlays,
rivers are water channels, labels are monoline engraving. Pins are placed at runtime from data/venues.json using
the projection written to app/public/data/map_projection.json, so venues can change without a rebuild.

Local frame: JT_MapStation_Root at the table centre on the floor; JT_Map_Origin = centre of the map, on the lake bed.
"""
import json
import math
import os
import bmesh
from mathutils import Vector
import jt_lib as L
import jt_letters as LT
import jt_map_geo as G
from jt_player import front_uv

MAP_W, MAP_H = 1.30, 0.82
RAIL = 0.10
Z0 = 0.760                # lake bed (top of the map base)
LAND = 0.0040             # land surface above the lake bed
RAIL_TOP = 0.800
OUT_W, OUT_D = MAP_W + 2 * RAIL, MAP_H + 2 * RAIL
PUBLIC = "D:/Jazztor/app/public/data"

ROAD_W = {"motorway": 0.0034, "trunk": 0.0030, "primary": 0.0021, "secondary": 0.0015, "tertiary": 0.0008}
FILTERS = ["ALL", "LIVE", "HALLS", "HISTORIC"]
FILTER_ANGLES = [-50, -17, 17, 50]   # dial detents
FILTER_XY = Vector((-0.56, -(MAP_H / 2 + RAIL / 2)))
DATE_XY = Vector((-0.20, -(MAP_H / 2 + RAIL / 2)))
CARD_XY = Vector((0.40, -(MAP_H / 2 + RAIL / 2)))
CARD_W, CARD_H = 0.240, 0.165

# neighbourhood labels: approximate centroids, for orientation only
PLACES = [
    ("KENSINGTON", 43.6547, -79.4006), ("FINANCIAL DISTRICT", 43.6481, -79.3800), ("YORKVILLE", 43.6712, -79.3925),
    ("THE ANNEX", 43.6690, -79.4065), ("LIBERTY VILLAGE", 43.6385, -79.4205), ("PARKDALE", 43.6395, -79.4385),
    ("DISTILLERY", 43.6503, -79.3596), ("CABBAGETOWN", 43.6665, -79.3660), ("LITTLE ITALY", 43.6553, -79.4155),
    ("TORONTO ISLANDS", 43.6205, -79.3770), ("HARBOURFRONT", 43.6385, -79.3880),
]


def materials():
    return {
        "land": L.material("JT_Map_Land", tex="JT_Plaster_BaseColor", rough=0.68, normal="JT_Fabric_Normal",
                           normal_strength=0.45, uv_tint=(2.1, 1.35, 0.85)),          # dark umber leather
        "water": L.material("JT_Map_Water", base=(0.004, 0.007, 0.012), rough=0.06, coat=1.0, coat_rough=0.03),
        "park": L.material("JT_Map_Park", base=(0.085, 0.10, 0.065), rough=0.95),
        "road": L.material("JT_Map_Road", base=(0.66, 0.48, 0.24), metal=1.0, rough=0.38),
        "road_major": L.material("JT_Map_RoadMajor", base=(0.80, 0.60, 0.31), metal=1.0, rough=0.25),
        "rail": L.material("JT_Map_Rail", base=(0.03, 0.028, 0.026), metal=0.5, rough=0.5),
        "label": L.material("JT_Map_Label", base=(0.80, 0.72, 0.58), rough=0.6),
        "glass": L.material("JT_Map_Glass", base=(0.01, 0.009, 0.008), rough=0.03, alpha=0.22),
        "card": L.material("JT_Map_CardFace", base=(0.88, 0.82, 0.70), rough=0.85),
        "datewin": L.material("JT_Map_DateFace", base=(0.02, 0.015, 0.012), rough=0.15,
                              emission=(1.0, 0.6, 0.25), emission_strength=1.0),
    }


def top_uv(ob):
    """Faces pointing +Z -> 0..1 over the object's X/Y extent (runtime canvas zone)."""
    me = ob.data
    xs = [v.co.x for v in me.vertices]
    ys = [v.co.y for v in me.vertices]
    x0, x1, y0, y1 = min(xs), max(xs), min(ys), max(ys)
    uvl = me.uv_layers.active or me.uv_layers.new()
    for p in me.polygons:
        for li in p.loop_indices:
            co = me.vertices[me.loops[li].vertex_index].co
            uvl.data[li].uv = ((co.x - x0) / (x1 - x0), (co.y - y0) / (y1 - y0)) if p.normal.z > 0.5 else (0.02, 0.02)


# ------------------------------------------------------------------ geometry helpers (map plane, table metres)
def _clean(poly, eps=2e-5):
    out = []
    for p in poly:
        if not out or math.hypot(p[0] - out[-1][0], p[1] - out[-1][1]) > eps:
            out.append(p)
    if len(out) > 2 and math.hypot(out[0][0] - out[-1][0], out[0][1] - out[-1][1]) <= eps:
        out.pop()
    return out


def _area(poly):
    return sum(poly[i][0] * poly[(i + 1) % len(poly)][1] - poly[(i + 1) % len(poly)][0] * poly[i][1]
               for i in range(len(poly))) / 2


def prism_into(bm, poly, z0, z1):
    poly = _clean(poly)
    if len(poly) < 3 or abs(_area(poly)) < 1e-9:
        return
    if _area(poly) < 0:
        poly = poly[::-1]
    lo = [bm.verts.new((x, y, z0)) for x, y in poly]
    hi = [bm.verts.new((x, y, z1)) for x, y in poly]
    try:
        bm.faces.new(hi)
        bm.faces.new(lo[::-1])
        for i in range(len(poly)):
            j = (i + 1) % len(poly)
            bm.faces.new([lo[i], lo[j], hi[j], hi[i]])
    except ValueError:
        pass


def plate_into(bm, poly, z):
    """Single upward face (inlay sitting on a surface)."""
    poly = _clean(poly)
    if len(poly) < 3 or abs(_area(poly)) < 1e-9:
        return
    if _area(poly) < 0:
        poly = poly[::-1]
    try:
        bm.faces.new([bm.verts.new((x, y, z)) for x, y in poly])
    except ValueError:
        pass


def strip_into(bm, pts, width, z):
    """Upward-facing ribbon along a polyline (raised relief line)."""
    pts = _clean(pts, 1e-5)
    if len(pts) < 2:
        return
    n = len(pts)
    left, right = [], []
    for i in range(n):
        a, b = pts[max(i - 1, 0)], pts[min(i + 1, n - 1)]
        dx, dy = b[0] - a[0], b[1] - a[1]
        ln = math.hypot(dx, dy) or 1.0
        nx, ny = -dy / ln * width / 2, dx / ln * width / 2
        left.append(bm.verts.new((pts[i][0] + nx, pts[i][1] + ny, z)))
        right.append(bm.verts.new((pts[i][0] - nx, pts[i][1] - ny, z)))
    for i in range(n - 1):
        try:
            bm.faces.new([right[i], right[i + 1], left[i + 1], left[i]])
        except ValueError:
            pass


def mesh_obj(name, col, bm, mat, loc, uv_scale=0.25):
    L.box_uv(bm, uv_scale)
    ob = L.obj_from_bm(name, bm, col, mat, 30)
    ob.location = loc
    return ob


# ------------------------------------------------------------------ build
def build(col, P, at):
    M = materials()
    at = Vector(at)
    root = L.empty("JT_MapStation_Root", col, at, size=0.1)
    objs = []

    # ---- table: walnut body, rails with brass trim, tapered legs with brass sabots
    body_h = Z0 - 0.008 - 0.68            # stops below the lake bed (no coplanar faces)
    objs.append(L.box("JT_MapTable_Body", col, (OUT_W, OUT_D, body_h), at + Vector((0, 0, 0.68 + body_h / 2)), P["walnut"],
                      bevel=0.004, segments=3, uv_scale=0.6))
    rh = RAIL_TOP - Z0
    for name, size, off in (("Front", (OUT_W, RAIL, rh), (0, -(MAP_H + RAIL) / 2)), ("Back", (OUT_W, RAIL, rh), (0, (MAP_H + RAIL) / 2)),
                            ("Left", (RAIL, MAP_H, rh), (-(MAP_W + RAIL) / 2, 0)), ("Right", (RAIL, MAP_H, rh), ((MAP_W + RAIL) / 2, 0))):
        objs.append(L.box(f"JT_MapTable_Rail{name}", col, size, at + Vector((off[0], off[1], Z0 + rh / 2)), P["walnut"],
                          bevel=0.003, segments=3, uv_scale=0.6))
    t = 0.006
    for name, size, off in (("F", (MAP_W + 2 * t, t, 0.003), (0, -MAP_H / 2 - t / 2)), ("B", (MAP_W + 2 * t, t, 0.003), (0, MAP_H / 2 + t / 2)),
                            ("L", (t, MAP_H, 0.003), (-MAP_W / 2 - t / 2, 0)), ("R", (t, MAP_H, 0.003), (MAP_W / 2 + t / 2, 0))):
        objs.append(L.box(f"JT_MapTable_Trim{name}", col, size, at + Vector((off[0], off[1], RAIL_TOP + 0.0015)),
                          P["brass_polished"]))
    for sx in (-1, 1):
        for sy in (-1, 1):
            p = at + Vector((sx * (OUT_W / 2 - 0.08), sy * (OUT_D / 2 - 0.08), 0))
            leg = L.lathe(f"JT_MapTable_Leg_{sx}{sy}", col, [(0, 0.05), (0.030, 0.05), (0.042, 0.68), (0, 0.68)], P["walnut"], 4, p)
            leg.rotation_euler.z = math.radians(45)
            sab = L.lathe(f"JT_MapTable_Sabot_{sx}{sy}", col, [(0, 0), (0.027, 0), (0.031, 0.05), (0, 0.05)], P["brass"], 4, p)
            sab.rotation_euler.z = math.radians(45)
            objs += [leg, sab]

    # ---- map
    geo = G.load()
    proj = G.Projection(geo["bbox"], MAP_W, MAP_H)
    origin = at + Vector((0, 0, Z0))
    org = L.empty("JT_Map_Origin", col, origin, size=0.05)
    x0, y0, x1, y1 = -MAP_W / 2, -MAP_H / 2, MAP_W / 2, MAP_H / 2

    bm = bmesh.new()
    prism_into(bm, [(x0, y0), (x1, y0), (x1, y1), (x0, y1)], -0.006, 0.0)
    objs.append(mesh_obj("JT_Map_LakeBed", col, bm, M["water"], origin))

    lake, islands, _ = G.lake_and_islands(geo, proj)
    land = L.box("JT_Map_Land", col, (MAP_W, MAP_H, LAND), origin + Vector((0, 0, LAND / 2)), M["land"])
    cut = bmesh.new()
    lake_c = G.clip_polygon(G.simplify(lake, 0.0002), x0 - 0.01, y0 - 0.01, x1 + 0.01, y1 + 0.01)
    prism_into(cut, lake_c, -0.002, LAND + 0.002)
    cutter = L.obj_from_bm("JT_Map_LakeCut", cut, col, None, None)
    cutter.location = origin
    L.boolean(land, cutter)
    L.bpy.data.objects.remove(cutter, do_unlink=True)
    L.assign(land, M["land"])
    bmu = bmesh.new()
    bmu.from_mesh(land.data)
    L.box_uv(bmu, 0.35)
    bmu.to_mesh(land.data)
    bmu.free()
    L.shade(land, 30)
    objs.append(land)

    bm = bmesh.new()
    for ring in islands:
        c = G.clip_polygon(G.simplify(ring, 0.0002), x0, y0, x1, y1)
        prism_into(bm, c, 0.0, LAND)
    objs.append(mesh_obj("JT_Map_Islands", col, bm, M["land"], origin, 0.35))

    def inside(p):
        return x0 <= p[0] <= x1 and y0 <= p[1] <= y1

    # parks (felt inlays), skip specks
    bm = bmesh.new()
    for park in geo["parks"]:
        pts = [proj(*q) for q in park["pts"]]
        c = G.clip_polygon(G.simplify(pts, 0.00025), x0, y0, x1, y1)
        if len(c) > 2 and abs(_area(c)) > 1.5e-5:
            plate_into(bm, c, LAND + 0.0004)
    objs.append(mesh_obj("JT_Map_Parks", col, bm, M["park"], origin))

    # roads: two brass grades
    major, minor = bmesh.new(), bmesh.new()
    for r in geo["roads"]:
        w = ROAD_W.get(r["cls"])
        if not w:
            continue
        pts = G.simplify([proj(*q) for q in r["pts"]], 0.0003)
        for run in G.clip_polyline(pts, x0, y0, x1, y1):
            strip_into(major if r["cls"] in ("motorway", "trunk", "primary") else minor, run, w,
                       LAND + (0.0010 if w > 0.002 else 0.0008))
    objs.append(mesh_obj("JT_Map_RoadsMajor", col, major, M["road_major"], origin))
    objs.append(mesh_obj("JT_Map_Roads", col, minor, M["road"], origin))

    bm = bmesh.new()
    for r in geo["rail"]:
        for run in G.clip_polyline(G.simplify([proj(*q) for q in r], 0.0003), x0, y0, x1, y1):
            strip_into(bm, run, 0.0007, LAND + 0.0006)
    objs.append(mesh_obj("JT_Map_Rail", col, bm, M["rail"], origin))

    bm = bmesh.new()
    for r in geo["rivers"]:
        for run in G.clip_polyline(G.simplify([proj(*q) for q in r["pts"]], 0.0002), x0, y0, x1, y1):
            strip_into(bm, run, 0.0026, LAND + 0.0003)
    objs.append(mesh_obj("JT_Map_Rivers", col, bm, M["water"], origin))

    # engraved place names (monoline), Lake Ontario, compass and attribution
    labels = []
    for name, lat, lon in PLACES:
        x, y = proj(lon, lat)
        if inside((x, y)):
            o = LT.mono_object(f"JT_Map_Label_{name.replace(' ', '_')}", col, name, 0.0085, 0.0004, M["label"])
            o.location = origin + Vector((x, y, LAND + 0.0012))
            labels.append(o)
    lx, ly = proj(-79.428, 43.613)
    o = LT.mono_object("JT_Map_Label_LAKE_ONTARIO", col, "L A K E   O N T A R I O", 0.016, 0.0004, M["label"])
    o.location = origin + Vector((lx, ly, 0.0004))
    labels.append(o)
    rail_y = -(MAP_H / 2 + RAIL / 2)
    eng = LT.mono_object("JT_Map_Engr_Title", col, "JAZZ MAP · TORONTO", 0.0105, 0.0003, P["brass_polished"])
    eng.location = at + Vector((0.0, rail_y + 0.012, RAIL_TOP + 0.00005))
    att = LT.mono_object("JT_Map_Engr_Attribution", col, "MAP DATA © OPENSTREETMAP CONTRIBUTORS", 0.0055, 0.0003,
                         P["brass_polished"])
    att.location = at + Vector((0.0, rail_y - 0.022, RAIL_TOP + 0.00005))
    labels += [eng, att]
    # compass on the back-right rail: grid north (up) and true north (16.7 deg clockwise of grid north)
    cpos = at + Vector((MAP_W / 2 - 0.02, MAP_H / 2 + RAIL / 2, RAIL_TOP + 0.00005))
    for nm, ang, length in (("Grid", 0.0, 0.034), ("True", math.degrees(G.GRID_ROT), 0.026)):
        a = math.radians(ang)
        tip = Vector((math.sin(a), math.cos(a), 0)) * length
        bm = bmesh.new()
        side = Vector((math.cos(a), -math.sin(a), 0)) * 0.0035
        vs = [bm.verts.new(v) for v in (-tip * 0.35 + side, tip, -tip * 0.35 - side)]
        bm.faces.new(vs)
        bmesh.ops.extrude_face_region(bm, geom=list(bm.faces))
        for v in bm.verts[3:]:
            v.co.z = 0.0004
        bm.normal_update()
        arrow = L.obj_from_bm(f"JT_Map_Compass_{nm}", bm, col, P["brass_polished"] if nm == "Grid" else P["black_metal"], 30)
        arrow.location = cpos + Vector((-0.06, -0.012, 0))
        labels.append(arrow)
    n_lbl = LT.mono_object("JT_Map_Compass_N", col, "N", 0.008, 0.0003, P["brass_polished"])
    n_lbl.location = cpos + Vector((-0.06, 0.030, 0))
    labels.append(n_lbl)
    objs += labels

    # smoked glass (sits on the brass trim)
    glass = L.box("JT_Map_Glass", col, (MAP_W + 0.01, MAP_H + 0.01, 0.010), at + Vector((0, 0, RAIL_TOP - 0.004)), M["glass"])
    objs.append(glass)

    # pin prototype (cloned per venue at runtime), standing on the land at the map origin
    pin_root = L.empty("JT_Map_Pin", col, origin + Vector((0, 0, LAND)), size=0.01)
    shaft = L.cylinder("JT_Map_PinShaft", col, 0.0012, 0.011, origin + Vector((0, 0, LAND)), P["nickel"], 16)
    collar = L.lathe("JT_Map_PinCollar", col, [(0, 0), (0.0040, 0), (0.0026, 0.0022), (0, 0.0022)], P["brass"], 24,
                     origin + Vector((0, 0, LAND)))
    head = L.lathe("JT_Map_PinHead", col, [(0, 0), (0.0063, 0.0006), (0.0084, 0.0045), (0.0075, 0.0082), (0.0045, 0.0102),
                                           (0, 0.0105)], P["brass_polished"], 40, origin + Vector((0, 0, LAND + 0.011)))
    jewel = L.lathe("JT_Map_PinJewel", col, [(0, 0), (0.0037, 0.0003), (0.0040, 0.0017), (0.0026, 0.0036), (0, 0.0041)],
                    P["led"], 24, origin + Vector((0, 0, LAND + 0.0212)))
    for o in (shaft, collar, head, jewel):
        L.set_parent(o, pin_root)
    L.collider("MapPin", col, (0.026, 0.026, 0.028), origin + Vector((0, 0, LAND + 0.013)), parent=pin_root)

    # ---- controls on the front rail
    # filter dial with engraved positions and pilot LEDs
    fbase = L.lathe("JT_Map_FilterBase", col, [(0, 0), (0.022, 0), (0.022, 0.003), (0.020, 0.0035), (0, 0.0035)],
                    P["black_gloss"], 64, at + Vector((FILTER_XY.x, FILTER_XY.y, RAIL_TOP)))
    dial = L.lathe("JT_Map_FilterDial", col, [(0, 0), (0.0155, 0), (0.0155, 0.016), (0.0145, 0.018), (0, 0.018)],
                   P["brass"], 72, at + Vector((FILTER_XY.x, FILTER_XY.y, RAIL_TOP + 0.0035)))
    tick = L.box("JT_Map_FilterTick", col, (0.0014, 0.007, 0.0005), at + Vector((FILTER_XY.x, FILTER_XY.y - 0.010, RAIL_TOP + 0.0218)),
                 P["black_metal"])
    L.set_parent(tick, dial)
    objs += [fbase, dial]
    # positions read left to right beside the dial, each with an amber pilot light
    for i, name in enumerate(FILTERS):
        x = FILTER_XY.x + 0.055 + i * 0.050
        led = L.lathe(f"JT_Map_FilterLED_{name}", col, [(0, 0.0012), (0.0011, 0.0009), (0.0012, 0), (0, 0)], P["led"], 16,
                      at + Vector((x, FILTER_XY.y + 0.010, RAIL_TOP)))
        lab = LT.mono_object(f"JT_Map_FilterLabel_{name}", col, name, 0.0062, 0.0003, P["brass_polished"])
        lab.location = at + Vector((x, FILTER_XY.y - 0.002, RAIL_TOP + 0.00005))
        objs += [led, lab]
    show = LT.mono_object("JT_Map_FilterCaption", col, "SHOW", 0.0045, 0.0003, P["brass_polished"])
    show.location = at + Vector((FILTER_XY.x, FILTER_XY.y - 0.032, RAIL_TOP + 0.00005))
    L.collider("MapFilter", col, (0.26, 0.07, 0.03), at + Vector((FILTER_XY.x + 0.09, FILTER_XY.y, RAIL_TOP + 0.012)))

    # date wheel: knurled thumbwheel sunk in the rail + amber readout window
    recess = L.box("JT_Map_DateRecess", col, (0.016, 0.046, 0.002), at + Vector((DATE_XY.x, DATE_XY.y, RAIL_TOP + 0.0006)),
                   P["black_metal"])
    prof = [(0.0040, -0.006), (0.019, -0.006)]
    prof += [(0.0195 + (0.0008 if i % 2 else 0), -0.006 + i * 0.0012) for i in range(11)]
    prof += [(0.019, 0.006), (0.0040, 0.006), (0.0040, -0.006)]
    wheel = L.lathe("JT_Map_DateWheel", col, prof, P["brass"], 64)
    wheel.rotation_euler = (0, math.radians(90), 0)
    wheel.location = at + Vector((DATE_XY.x, DATE_XY.y, RAIL_TOP - 0.013))
    win = L.box("JT_Map_DateWindow", col, (0.085, 0.026, 0.0016), at + Vector((DATE_XY.x + 0.068, DATE_XY.y, RAIL_TOP + 0.0008)),
                M["datewin"])
    top_uv(win)
    winf = L.box("JT_Map_DateFrame", col, (0.090, 0.031, 0.0012), at + Vector((DATE_XY.x + 0.068, DATE_XY.y, RAIL_TOP + 0.0004)),
                 P["brass_polished"])
    when = LT.mono_object("JT_Map_DateCaption", col, "WHEN", 0.0045, 0.0003, P["brass_polished"])
    when.location = at + Vector((DATE_XY.x + 0.03, DATE_XY.y - 0.032, RAIL_TOP + 0.00005))
    L.collider("MapDate", col, (0.13, 0.05, 0.03), at + Vector((DATE_XY.x + 0.04, DATE_XY.y, RAIL_TOP + 0.008)))
    objs += [recess, wheel, win, winf, show, when]

    # archival card in its slot (rises at runtime); slot lips + recess
    slot = L.box("JT_Map_CardSlot", col, (CARD_W + 0.012, 0.010, 0.0016), at + Vector((CARD_XY.x, CARD_XY.y, RAIL_TOP + 0.0004)),
                 P["black_metal"])
    lips = [L.box(f"JT_Map_CardLip_{i}", col, (CARD_W + 0.02, 0.003, 0.003),
                  at + Vector((CARD_XY.x, CARD_XY.y + s * 0.0065, RAIL_TOP + 0.0015)), P["brass_polished"]) for i, s in enumerate((-1, 1))]
    card = L.box("JT_Map_Card", col, (CARD_W, 0.0024, CARD_H), at + Vector((CARD_XY.x, CARD_XY.y, RAIL_TOP - CARD_H / 2 - 0.002)),
                 M["card"], bevel=0.0006, segments=1)
    front_uv(card)
    L.set_origin(card, at + Vector((CARD_XY.x, CARD_XY.y, RAIL_TOP - CARD_H - 0.002)))
    L.collider("MapCard", col, (CARD_W, 0.012, CARD_H), at + Vector((CARD_XY.x, CARD_XY.y, RAIL_TOP - CARD_H / 2 - 0.002)),
               parent=card)
    objs += [slot, card] + lips
    L.empty("JT_Map_FocusLight", col, at + Vector((0, -0.05, 2.70)), size=0.05)

    for o in list(col.objects):
        if o.parent is None and o is not root:
            L.set_parent(o, root)

    os.makedirs(PUBLIC, exist_ok=True)
    with open(f"{PUBLIC}/map_projection.json", "w", encoding="utf-8") as f:
        json.dump({**proj.to_json(), "land": LAND, "attribution": geo["attribution"]}, f, indent=1)
    return root
