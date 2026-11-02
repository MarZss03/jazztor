"""JazzTor Museum - a separate old-money interior reached through a real door (concepts 04 / 05, 2026-10-20).

blender -b --factory-startup --python build_museum.py
-> D:/Jazztor/blender/source/JT_Museum.blend, D:/Jazztor/blender/exports/JT_Museum.glb

Plan (Blender metres, Z up; the whole museum sits at MX on the X axis, far from the listening room):
  antechamber  y -2.4..0      dark marble, the listening-room side of the door
  door         y = 0          walnut double door, 1.7 x 2.6 m opening, leaves swing inward (+Y)
  vestibule    x +-3.6, y 0..6.6, h 3.9   coffered ceiling, panelled walls, runner, pedestal table, chandelier
  north wall   y = 6.6        centre niche + two arches (x = -2.45 / +2.45)
  WORLD wing   x -6.2..-0.7, y 6.6..10.8   relief world map, brass timeline rail, vitrine, bench, lectern
  TORONTO wing x  0.7..6.2, y 6.6..10.8   street relief map with venue pins, window, portraits, drawers, lectern
Dynamic (not lightmapped): door leaves + hardware, timeline markers, map pins, placards, portrait inserts.
"""
import json
import math
import os
import random
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import bmesh
import bpy
from mathutils import Vector, Matrix
import jt_lib as L
import jt_letters as LT
import jt_map_geo as G
from jt_map import prism_into, strip_into, plate_into, _area
from jt_player import front_uv
import jt_exhibits as EX

MX = 400.0
SRC = "D:/Jazztor/blender/source"
EXP = "D:/Jazztor/blender/exports"
PUBLIC = "D:/Jazztor/app/public/data"
H = 3.9            # vestibule height
WH = 3.4           # wing height
VW, VD = 3.6, 6.6  # vestibule half-width, depth
DOOR_W, DOOR_H = 1.7, 2.6
ARCH_X, ARCH_W, ARCH_H = 2.45, 1.9, 3.0
WING = dict(x0=0.7, x1=6.2, y0=6.6, y1=10.8)


# a placard sheet lying on a lectern desk (centre (lx, ly, 1.07), 0.04 thick, tilted -28 deg about X): its centre sits
# half the desk + half the sheet + 1 mm out along the desk normal (0, sin 28, cos 28), clear of the walnut
def placard_on_desk(lx, ly, t=0.02 + 0.002 + 0.001):
    return (lx, ly + t * math.sin(math.radians(28)), 1.07 + t * math.cos(math.radians(28)))


INSTRUMENTS = []  # plinth tops for the app (filled by vestibule())
SEATS = []  # benches a visitor can sit on (the app's free walk)


def V(x, y, z):
    return Vector((MX + x, y, z))


# ------------------------------------------------------------------ materials
def materials(P):
    M = dict(P)
    M["oak"] = L.material("JT_Mus_Oak", tex="JT_Mus_Floor_BaseColor", orm="JT_Mus_Floor_ORM", normal="JT_Mus_Floor_Normal",
                          normal_strength=0.7, coat=0.55, coat_rough=0.12)      # oiled and buffed: soft mirror sheen
    M["rug"] = L.material("JT_Mus_Rug", tex="JT_Mus_Rug_BaseColor", rough=0.95, normal="JT_Mus_Rug_Normal", normal_strength=0.8)
    M["velvet_black"] = L.material("JT_Mus_VelvetBlack", base=(0.012, 0.011, 0.012), rough=0.95)  # instrument plinth tops
    M["velvet"] = L.material("JT_Mus_Velvet", tex="JT_Mus_Velvet_BaseColor", rough=0.9, normal="JT_Mus_Velvet_Normal",
                             normal_strength=0.6)
    M["silk"] = L.material("JT_Mus_Silk", tex="JT_Mus_Silk_BaseColor", rough=0.55)
    M["dwalnut"] = L.material("JT_Mus_Walnut", tex="JT_Walnut_BaseColor", orm="JT_Walnut_ORM", normal="JT_Walnut_Normal",
                              normal_strength=0.5, coat=0.3, coat_rough=0.28, uv_tint=(0.86, 0.72, 0.62))
    M["board"] = L.material("JT_Mus_MapBoard", tex="JT_Walnut_BaseColor", orm="JT_Walnut_ORM", uv_tint=(0.22, 0.18, 0.16),
                            coat=0.25, coat_rough=0.45)     # satin lacquer: spots bloom softly, no hot circles
    M["lake"] = L.material("JT_Mus_MapWater", base=(0.006, 0.012, 0.02), rough=0.08, coat=1.0, coat_rough=0.03)
    # the relief maps: untextured satin brass (a 3 m flat sheet magnifies any compression block in a patina ORM)
    M["land"] = L.material("JT_Mus_LandBrass", base=(0.80, 0.58, 0.33), metal=1.0, rough=0.42)
    # exhibits: dark lacquered moulding, ivory mat, matte white picture / text carriers (the app textures them)
    M["frame"] = L.material("JT_Mus_FrameLacquer", base=(0.035, 0.022, 0.016), rough=0.32, coat=0.5, coat_rough=0.2)
    M["mat"] = L.material("JT_Mus_MatBoard", base=(0.80, 0.76, 0.66), rough=0.9)
    M["expic"] = L.material("JT_Mus_ExPicture", base=(0.8, 0.8, 0.8), rough=0.7)
    M["textpanel"] = L.material("JT_Mus_WallText", base=(0.86, 0.82, 0.72), rough=0.88)
    M["glass"] = L.material("JT_Mus_Glass", base=(0.9, 0.9, 0.88), rough=0.02, alpha=0.08)
    M["chand"] = L.material("JT_Mus_ChandelierGlass", base=(0.98, 0.92, 0.82), rough=0.35, transmission=1.0, ior=1.5,
                            emission=(1.0, 0.78, 0.52), emission_strength=0.35)          # frosted, lit from inside
    M["sconce"] = L.material("JT_Mus_SconceGlass", base=(0.95, 0.9, 0.8), rough=0.4,
                             emission=(1.0, 0.74, 0.46), emission_strength=2.2)
    M["downlight"] = L.material("JT_Mus_Downlight", base=(1, 1, 1), rough=0.3, emission=(1.0, 0.82, 0.6), emission_strength=12.0)
    M["cove"] = L.material("JT_Mus_Cove", base=(1, 1, 1), rough=0.3, emission=(1.0, 0.76, 0.48), emission_strength=5.0)
    M["leather_red"] = L.material("JT_Mus_LeatherOxblood", base=(0.16, 0.025, 0.02), rough=0.5, coat=0.3)
    M["leather_green"] = L.material("JT_Mus_LeatherGreen", base=(0.02, 0.07, 0.04), rough=0.55, coat=0.2)
    M["paper"] = L.material("JT_Mus_Paper", base=(0.86, 0.80, 0.68), rough=0.85)
    M["placard"] = L.material("JT_Mus_Placard", base=(0.90, 0.85, 0.74), rough=0.85)
    M["portrait"] = L.material("JT_Mus_Portrait", base=(0.18, 0.17, 0.16), rough=0.6)
    M["ceiling"] = L.material("JT_Mus_CeilingPanel", tex="JT_Walnut_BaseColor", orm="JT_Walnut_ORM", uv_tint=(0.78, 0.66, 0.58),
                              rough=0.6)
    M["shellac"] = L.material("JT_Mus_Shellac", base=(0.01, 0.01, 0.01), rough=0.15, coat=0.6)
    M["label"] = L.material("JT_Mus_DiscLabel", base=(0.42, 0.09, 0.05), rough=0.6)
    M["photo"] = L.material("JT_Mus_TorontoNight", tex=None, base=(1, 1, 1), rough=1.0, emission=(1, 1, 1), emission_strength=1.0)
    return M


# ------------------------------------------------------------------ helpers
def bx(name, col, M, mat, size, c, bevel=0.004, uv=0.6, seg=2):
    return L.box(name, col, size, V(*c), M[mat] if isinstance(mat, str) else mat, bevel=bevel, segments=seg, uv_scale=uv)


def extrude_poly(name, col, pts2d, depth, mat, axis, at, uv=0.5):
    """Polygon in a vertical plane. axis='y': polygon in X-Z (normal Y); axis='x': polygon in Y-Z (normal X)."""
    bm = bmesh.new()
    prism_into(bm, pts2d, 0.0, depth)
    if axis == "y":
        bmesh.ops.transform(bm, matrix=Matrix.Rotation(math.radians(90), 4, "X"), verts=bm.verts)   # (u,v,w)->(u,-w,v)
    else:
        bmesh.ops.transform(bm, matrix=Matrix.Rotation(math.radians(90), 4, "Z") @ Matrix.Rotation(math.radians(90), 4, "X"),
                            verts=bm.verts)
    L.box_uv(bm, uv)
    ob = L.obj_from_bm(name, bm, col, mat, 30)
    ob.location = V(*at)
    return ob


def arch_pts(w, h, seg=28):
    r = w / 2
    pts = [(-r, 0.0), (r, 0.0)]
    for i in range(seg + 1):
        a = math.pi * i / seg
        pts.append((r * math.cos(a), h - r + r * math.sin(a)))
    return pts


def raised_panel(name, col, M, cx, cy, cz, w, h, normal, depth=0.025):
    """Stile frame + bevelled raised field. normal: 'x+', 'x-', 'y+', 'y-' (direction the panel faces)."""
    t = 0.07
    parts = []
    ax = normal[0]
    sgn = 1 if normal[1] == "+" else -1
    def piece(sz_along, sz_up, d, off_n, du=0.0, dz=0.0, mat="dwalnut", bevel=0.004):
        if ax == "y":
            size, c = (sz_along, d, sz_up), (cx + du, cy + sgn * off_n, cz + dz)
        else:
            size, c = (d, sz_along, sz_up), (cx + sgn * off_n, cy + du, cz + dz)
        return bx(f"{name}_{len(parts)}", col, M, mat, size, c, bevel=bevel, uv=0.5)
    parts.append(piece(w, t, depth, depth / 2, 0, h / 2 - t / 2))
    parts.append(piece(w, t, depth, depth / 2, 0, -h / 2 + t / 2))
    parts.append(piece(t, h, depth, depth / 2, -w / 2 + t / 2, 0))
    parts.append(piece(t, h, depth, depth / 2, w / 2 - t / 2, 0))
    parts.append(piece(w - 2 * t - 0.03, h - 2 * t - 0.03, depth * 0.8, depth * 0.4, 0, 0, bevel=0.012))
    ob = L.join(parts, name)
    return ob


def panel_wall(prefix, col, M, axis, fixed, a0, a1, z0, z1, normal, skip=()):
    """Rows of raised panels along a wall from a0 to a1 (dado + tall field), skipping [s0, s1] spans (openings)."""
    out = []
    n = max(1, round((a1 - a0) / 0.9))
    step = (a1 - a0) / n
    for i in range(n):
        c = a0 + step * (i + 0.5)
        if any(s0 - 0.05 < c < s1 + 0.05 for s0, s1 in skip):
            continue
        for zc, hh in (((z0 + 0.15 + 0.85) / 2 + 0.0, 0.72), ((0.98 + z1) / 2, z1 - 0.98 - 0.12)):
            if hh < 0.2:
                continue
            if axis == "y":
                out.append(raised_panel(f"{prefix}_{i}_{int(zc * 10)}", col, M, c, fixed, zc, step - 0.06, hh, normal))
            else:
                out.append(raised_panel(f"{prefix}_{i}_{int(zc * 10)}", col, M, fixed, c, zc, step - 0.06, hh, normal))
    return out


def mono(name, col, M, text, cap, at, rot_z=0.0, face_y=True, mat="brass_polished", depth=0.004):
    t = LT.mono_object(name, col, text, cap, depth, M[mat])
    t.location = V(*at)
    t.rotation_euler = (math.radians(90), 0, math.radians(rot_z)) if face_y else (0, 0, math.radians(rot_z))
    return t


def tube(name, col, pts, r, mat, sides=16):
    return L.tube_along(name, col, [V(*p) for p in pts], r, mat, sides)


# ------------------------------------------------------------------ architecture
def shell(col, M):
    o = []
    # floors
    fl = bx("JT_Mus_Floor", col, M, "oak", (2 * VW, VD, 0.04), (0, VD / 2, -0.02), bevel=0, uv=1.2)
    o.append(fl)
    for side, name in ((-1, "World"), (1, "Toronto")):
        cx = side * (WING["x0"] + WING["x1"]) / 2
        o.append(bx(f"JT_Mus_Floor{name}", col, M, "oak", (WING["x1"] - WING["x0"], WING["y1"] - WING["y0"], 0.04),
                    (cx, (WING["y0"] + WING["y1"]) / 2, -0.02), bevel=0, uv=1.2))
    # rotate the parquet 45 deg so its rows run with the room
    for ob in [x for x in o if x.name.startswith("JT_Mus_Floor")]:
        uvl = ob.data.uv_layers.active.data
        c, s = math.cos(math.radians(45)), math.sin(math.radians(45))
        for d in uvl:
            u, v = d.uv
            d.uv = (u * c - v * s, u * s + v * c)
    o.append(bx("JT_Mus_AnteFloor", col, M, "marble", (2.6, 2.4, 0.04), (0, -1.2, -0.02), bevel=0, uv=1.4))

    # vestibule walls: south (door), east/west (panelled), north (niche + arches) - all 0.25 thick
    T = 0.25
    south = bx("JT_Mus_WallSouth", col, M, "dwalnut", (2 * VW + 2 * T, T, H), (0, -T / 2, H / 2), bevel=0, uv=0.8)
    cut = extrude_poly("JT_cut_door", col, [(-DOOR_W / 2 - 0.12, -0.05), (DOOR_W / 2 + 0.12, -0.05),
                                             (DOOR_W / 2 + 0.12, DOOR_H + 0.1), (-DOOR_W / 2 - 0.12, DOOR_H + 0.1)],
                       1.0, None, "y", (0, 0.5, 0))
    L.boolean(south, cut)
    bpy.data.objects.remove(cut, do_unlink=True)
    L.assign(south, M["dwalnut"])
    o.append(south)
    north = bx("JT_Mus_WallNorth", col, M, "dwalnut", (2 * VW + 2 * T, T, H), (0, VD + T / 2, H / 2), bevel=0, uv=0.8)
    for sx in (-1, 1):
        cut = extrude_poly(f"JT_cut_arch{sx}", col, arch_pts(ARCH_W, ARCH_H), 1.0, None, "y", (sx * ARCH_X, VD + 0.5 + T / 2, -0.02))
        L.boolean(north, cut)
        bpy.data.objects.remove(cut, do_unlink=True)
    L.assign(north, M["dwalnut"])
    o.append(north)
    for sx, name in ((-1, "West"), (1, "East")):
        o.append(bx(f"JT_Mus_Wall{name}", col, M, "dwalnut", (T, VD, H), (sx * (VW + T / 2), VD / 2, H / 2), bevel=0, uv=0.8))

    # panelling
    o += panel_wall("JT_Mus_PanelS", col, M, "y", 0.0, -VW + 0.1, VW - 0.1, 0.0, H - 0.5, "y+", skip=[(-DOOR_W / 2 - 0.3, DOOR_W / 2 + 0.3)])
    o += panel_wall("JT_Mus_PanelW", col, M, "x", -VW, 0.15, VD - 0.15, 0.0, H - 0.5, "x+")
    o += panel_wall("JT_Mus_PanelE", col, M, "x", VW, 0.15, VD - 0.15, 0.0, H - 0.5, "x-")
    o += panel_wall("JT_Mus_PanelN", col, M, "y", VD, -VW + 0.1, VW - 0.1, 0.0, H - 0.5, "y-",
                    skip=[(-ARCH_X - ARCH_W / 2 - 0.25, -ARCH_X + ARCH_W / 2 + 0.25), (ARCH_X - ARCH_W / 2 - 0.25, ARCH_X + ARCH_W / 2 + 0.25),
                          (-0.85, 0.85)])
    # skirting (black marble) + brass dado rail + crown; the south / north runs stop at the door and arch openings
    # (one bar straight across them read as a barrier between the door and the room)
    open_s = [(-DOOR_W / 2 - 0.14, DOOR_W / 2 + 0.14)]
    open_n = [(-ARCH_X - ARCH_W / 2, -ARCH_X + ARCH_W / 2), (ARCH_X - ARCH_W / 2, ARCH_X + ARCH_W / 2)]

    def runs(x0, x1, cuts):
        out, x = [], x0
        for a, b in sorted(cuts):
            if a > x:
                out.append((x, a))
            x = max(x, b)
        if x1 > x:
            out.append((x, x1))
        return out

    for wall, y, cuts in (("S", 0.0, open_s), ("N", VD, open_n)):
        inward = 1 if wall == "S" else -1
        for k, (xa_, xb_) in enumerate(runs(-VW, VW, cuts)):
            w, cx_ = xb_ - xa_, (xa_ + xb_) / 2
            o.append(bx(f"JT_Mus_Skirting{wall}{k}", col, M, "marble", (w, 0.03, 0.16), (cx_, y + inward * 0.015, 0.08), bevel=0.003, uv=0.8))
            o.append(bx(f"JT_Mus_DadoRail{wall}{k}", col, M, "brass_aged", (w, 0.05, 0.03), (cx_, y + inward * 0.04, 0.97), bevel=0.006))
    for name, size, c in (("W", (0.03, VD, 0.16), (-VW + 0.015, VD / 2, 0.08)), ("E", (0.03, VD, 0.16), (VW - 0.015, VD / 2, 0.08))):
        o.append(bx(f"JT_Mus_Skirting{name}", col, M, "marble", size, c, bevel=0.003, uv=0.8))
    for name, size, c in (("W", (0.05, VD, 0.03), (-VW + 0.04, VD / 2, 0.97)), ("E", (0.05, VD, 0.03), (VW - 0.04, VD / 2, 0.97))):
        o.append(bx(f"JT_Mus_DadoRail{name}", col, M, "brass_aged", size, c, bevel=0.006))
    for name, size, c in (("S", (2 * VW, 0.16, 0.22), (0, 0.08, H - 0.11)), ("N", (2 * VW, 0.16, 0.22), (0, VD - 0.08, H - 0.11)),
                          ("W", (0.16, VD, 0.22), (-VW + 0.08, VD / 2, H - 0.11)), ("E", (0.16, VD, 0.22), (VW - 0.08, VD / 2, H - 0.11))):
        o.append(bx(f"JT_Mus_Crown{name}", col, M, "dwalnut", size, c, bevel=0.02, uv=0.5))
    # concealed warm cove above the crown (indirect light)

    # coffered ceiling: slab + beam grid + recessed panels + downlights
    o.append(bx("JT_Mus_Ceiling", col, M, "ceiling", (2 * VW, VD, 0.06), (0, VD / 2, H + 0.03), bevel=0, uv=1.0))
    nx, ny = 6, 5
    for i in range(nx + 1):
        x = -VW + 2 * VW * i / nx
        o.append(bx(f"JT_Mus_BeamX{i}", col, M, "dwalnut", (0.14, VD, 0.2), (x, VD / 2, H - 0.1), bevel=0.012, uv=0.5))
    for j in range(ny + 1):
        y = VD * j / ny
        o.append(bx(f"JT_Mus_BeamY{j}", col, M, "dwalnut", (2 * VW, 0.14, 0.2), (0, y, H - 0.1), bevel=0.012, uv=0.5))
    for i in range(nx):
        for j in range(ny):
            x = -VW + 2 * VW * (i + 0.5) / nx
            y = VD * (j + 0.5) / ny
            o.append(bx(f"JT_Mus_Coffer{i}{j}", col, M, "ceiling", (2 * VW / nx - 0.34, VD / ny - 0.34, 0.025),
                        (x, y, H - 0.02), bevel=0.01, uv=0.5))
            o.append(bx(f"JT_Mus_CofferTrim{i}{j}", col, M, "brass_aged", (2 * VW / nx - 0.3, VD / ny - 0.3, 0.008),
                        (x, y, H - 0.006), bevel=0.0, uv=0.5))
            if (i in (0, 5) and j in (1, 3)) or (i in (2, 3) and j in (0, 4)):
                o.append(L.cylinder(f"JT_Mus_Downlight{i}{j}", col, 0.045, 0.01, V(x, y, H - 0.045), M["downlight"], 24))

    # door frame (brass architrave on the vestibule side, marble on the antechamber side) + threshold
    fw = 0.09
    for side in (-1, 1):
        o.append(bx(f"JT_Mus_DoorJamb{side}", col, M, "brass_aged", (fw, 0.32, DOOR_H + 0.05), (side * (DOOR_W / 2 + fw / 2), 0.0, (DOOR_H + 0.05) / 2),
                    bevel=0.008))
    o.append(bx("JT_Mus_DoorHead", col, M, "brass_aged", (DOOR_W + 2 * fw, 0.32, 0.1), (0, 0.0, DOOR_H + 0.05), bevel=0.008))
    o.append(bx("JT_Mus_Threshold", col, M, "brass_polished", (DOOR_W, 0.3, 0.012), (0, 0.0, 0.006), bevel=0.003))
    # pediment trim over the door, vestibule side
    o.append(bx("JT_Mus_DoorPediment", col, M, "dwalnut", (DOOR_W + 0.6, 0.12, 0.26), (0, 0.06, DOOR_H + 0.28), bevel=0.02, uv=0.5))

    # antechamber: black marble walls, low ceiling
    o.append(bx("JT_Mus_AnteWallW", col, M, "marble", (0.2, 2.4, 3.0), (-1.4, -1.2, 1.5), bevel=0, uv=1.2))
    o.append(bx("JT_Mus_AnteWallE", col, M, "marble", (0.2, 2.4, 3.0), (1.4, -1.2, 1.5), bevel=0, uv=1.2))
    o.append(bx("JT_Mus_AnteCeiling", col, M, "black_metal", (2.8, 2.4, 0.05), (0, -1.2, 3.0), bevel=0))
    o.append(bx("JT_Mus_AnteBack", col, M, "marble", (2.8, 0.2, 3.0), (0, -2.5, 1.5), bevel=0, uv=1.2))
    return o


def door(col, M):
    """Two leaves hinged at the jambs, each 0.85 x 2.6 x 0.06 with raised panels both sides, lever handles, latch."""
    parts = []
    lw = DOOR_W / 2
    for side, name in ((-1, "L"), (1, "R")):
        hinge = V(side * DOOR_W / 2, -0.03, 0)                                       # antechamber face: the leaves open outward
        rig = L.empty(f"JT_Mus_DoorRig_{name}", col, hinge, size=0.1)                 # rotates about Z
        cx = side * (DOOR_W / 2 - lw / 2)
        leaf = bx(f"JT_Mus_DoorLeaf_{name}", col, M, "dwalnut", (lw - 0.006, 0.06, DOOR_H - 0.01), (cx, 0.0, DOOR_H / 2), bevel=0.006, uv=0.5)
        pieces = [leaf]
        for face in (-1, 1):
            for zc, hh in ((0.62, 0.9), (1.75, 1.15)):
                p = raised_panel(f"JT_Mus_DoorPanel_{name}{face}{int(zc * 10)}", col, M, cx, face * 0.03, zc, lw - 0.16, hh,
                                 "y+" if face > 0 else "y-", depth=0.018)
                pieces.append(p)
            # brass medallion (globe / CN tower) on the upper panel
            med = L.lathe(f"JT_Mus_DoorMedallion_{name}{face}", col, [(0, 0), (0.11, 0), (0.115, 0.006), (0.1, 0.012), (0, 0.012)],
                          M["brass_aged"], 64)
            med.rotation_euler = (math.radians(-90 * face), 0, 0)
            med.location = V(cx, face * 0.048, 2.0)
            pieces.append(med)
            ring = L.lathe(f"JT_Mus_DoorMedRing_{name}{face}", col, [(0.07, 0.012), (0.08, 0.012), (0.08, 0.018), (0.07, 0.018), (0.07, 0.012)],
                           M["brass_polished"], 64)
            ring.rotation_euler = med.rotation_euler
            ring.location = med.location
            pieces.append(ring)
        # vertical brass inlay strips (art-deco)
        for k in (-0.05, 0.0, 0.05):
            for face in (-1, 1):
                pieces.append(bx(f"JT_Mus_DoorStrip_{name}{face}{k}", col, M, "brass_aged", (0.008, 0.004, 0.5),
                                 (cx + k, face * 0.05, 2.0 - (0.42 if k == 0 else 0.36)), bevel=0))
        # hinges
        for zz in (0.35, 1.3, 2.25):
            pieces.append(L.cylinder(f"JT_Mus_Hinge_{name}{zz}", col, 0.012, 0.14, V(side * (DOOR_W / 2 - 0.005), -0.035, zz - 0.07),
                                     M["brass_polished"], 16))
        for o in pieces:
            L.set_parent(o, rig)
        # lever handle (pivot on its rose), both faces; latch bolt slides along X
        hx = side * 0.07
        for face in (-1, 1):
            plate = bx(f"JT_Mus_HandlePlate_{name}{face}", col, M, "brass_aged", (0.05, 0.008, 0.26), (hx, face * 0.034, 1.02), bevel=0.003)
            L.set_parent(plate, rig)
            key = L.cylinder(f"JT_Mus_Keyhole_{name}{face}", col, 0.007, 0.004, V(hx, face * 0.039, 0.93), M["black_metal"], 12)
            key.rotation_euler = (math.radians(90), 0, 0)
            L.set_parent(key, rig)
            hrig = L.empty(f"JT_Mus_HandleRig_{name}{face}", col, V(hx, face * 0.04, 1.08), size=0.03)   # rotates about Y
            L.set_parent(hrig, rig)
            rose = L.lathe(f"JT_Mus_HandleRose_{name}{face}", col, [(0, 0), (0.022, 0), (0.022, 0.012), (0, 0.016)], M["brass_polished"], 32)
            rose.rotation_euler = (math.radians(-90 * face), 0, 0)
            rose.location = V(hx, face * 0.038, 1.08)
            # the lever points away from the meeting stiles, toward its leaf's hinge (as on any pair of doors: the two
            # levers never cross), and its free end goes down when pressed (see MuseumWorld)
            lever = tube(f"JT_Mus_Lever_{name}{face}", col, [(hx, face * 0.05, 1.08), (hx, face * 0.075, 1.08),
                                                             (hx + side * 0.03, face * 0.082, 1.08), (hx + side * 0.13, face * 0.082, 1.075)],
                         0.0095, M["brass_polished"])
            L.set_parent(rose, hrig)
            L.set_parent(lever, hrig)
        latch = bx(f"JT_Mus_Latch_{name}", col, M, "brass_polished", (0.03, 0.016, 0.022), (side * 0.0 - side * 0.012, 0.0, 1.0), bevel=0.002)
        L.set_parent(latch, rig)
        L.collider(f"MusDoor_{name}", col, (lw, 0.1, DOOR_H), V(cx, 0.0, DOOR_H / 2), parent=rig)
        parts.append(rig)
    return parts


def vestibule(col, M):
    o = []
    # runner from the door to the table
    rug = bx("JT_Mus_Runner", col, M, "rug", (1.5, 4.5, 0.012), (0, 2.6, 0.006), bevel=0.004, uv=0.5)
    me = rug.data
    for p in me.polygons:
        for li in p.loop_indices:
            co = me.vertices[me.loops[li].vertex_index].co
            me.uv_layers.active.data[li].uv = (co.x / 1.5 + 0.5, co.y / 4.5 + 0.5)
    o.append(rug)
    # fluted pedestal table
    tx, ty = 0.0, 3.35
    o.append(L.lathe("JT_Mus_TableBase", col, [(0, 0), (0.46, 0), (0.46, 0.05), (0.43, 0.07), (0.0, 0.07)], M["brass_aged"], 96, V(tx, ty, 0)))
    flutes = [(0.38 * (1 - 0.06 * (i % 2)), 0.07 + 0.66 * j / 1) for i in range(1) for j in range(2)]
    col_bm = bmesh.new()
    n = 96
    for k in range(2):
        pass
    prof = [(0, 0.07), (0.37, 0.07), (0.37, 0.73), (0, 0.73)]
    shaft = L.lathe("JT_Mus_TableShaft", col, prof, M["dwalnut"], n, V(tx, ty, 0))
    for v in shaft.data.vertices:                                   # 24 flutes
        r = math.hypot(v.co.x, v.co.y)
        if r > 0.3 and 0.09 < v.co.z < 0.71:
            a = math.atan2(v.co.y, v.co.x)
            k = 1 - 0.035 * (0.5 + 0.5 * math.cos(a * 24))
            v.co.x *= k
            v.co.y *= k
    col_bm.free()
    o.append(shaft)
    o.append(L.lathe("JT_Mus_TableCollar", col, [(0, 0.72), (0.42, 0.72), (0.42, 0.75), (0, 0.75)], M["brass_aged"], 96, V(tx, ty, 0)))
    o.append(L.lathe("JT_Mus_TableTop", col, [(0, 0.75), (0.66, 0.75), (0.68, 0.765), (0.68, 0.79), (0.665, 0.8), (0, 0.8)],
                     M["marble"], 128, V(tx, ty, 0)))
    o.append(L.lathe("JT_Mus_TableEdge", col, [(0.675, 0.748), (0.685, 0.748), (0.685, 0.802), (0.675, 0.802), (0.675, 0.748)],
                     M["brass_polished"], 128, V(tx, ty, 0)))
    # on the table: stacked books, brass bowl, small brass lamp
    z = 0.8
    rng = random.Random(3)
    for i, (w, d, h, m) in enumerate(((0.32, 0.24, 0.045, "leather_red"), (0.30, 0.22, 0.04, "leather_green"), (0.27, 0.2, 0.035, "leather_red"))):
        b = bx(f"JT_Mus_Book{i}", col, M, m, (w, d, h), (tx - 0.3, ty - 0.1, z + h / 2), bevel=0.004, uv=0.3)
        b.rotation_euler.z = math.radians(rng.uniform(-12, 12))
        pages = bx(f"JT_Mus_BookPages{i}", col, M, "paper", (w - 0.012, d - 0.01, h - 0.012), (tx - 0.3 + 0.006, ty - 0.1, z + h / 2), bevel=0.001)
        pages.rotation_euler.z = b.rotation_euler.z
        o += [b, pages]
        z += h
    o.append(L.lathe("JT_Mus_Bowl", col, [(0, 0.8), (0.08, 0.802), (0.14, 0.83), (0.17, 0.875), (0.165, 0.878), (0.135, 0.836),
                                          (0.08, 0.81), (0, 0.808)], M["brass_aged"], 96, V(tx + 0.25, ty + 0.1, 0)))
    # chandelier: three tiers of fluted glass in brass rings, hung on rods
    cz = H - 0.2
    for i, (r, zz, hh) in enumerate(((0.46, cz - 0.98, 0.13), (0.35, cz - 0.8, 0.12), (0.24, cz - 0.64, 0.1))):
        o.append(L.lathe(f"JT_Mus_ChandGlass{i}", col, [(r - 0.01, 0), (r, 0), (r, hh), (r - 0.01, hh), (r - 0.01, 0)], M["chand"], 96,
                         V(tx, ty, zz)))
        o.append(L.lathe(f"JT_Mus_ChandRingLo{i}", col, [(r - 0.03, -0.012), (r + 0.012, -0.012), (r + 0.012, 0.0), (r - 0.03, 0.0), (r - 0.03, -0.012)],
                         M["brass_polished"], 96, V(tx, ty, zz)))
        o.append(L.lathe(f"JT_Mus_ChandRingHi{i}", col, [(r - 0.03, hh), (r + 0.012, hh), (r + 0.012, hh + 0.012), (r - 0.03, hh + 0.012), (r - 0.03, hh)],
                         M["brass_polished"], 96, V(tx, ty, zz)))
        o.append(L.lathe(f"JT_Mus_ChandDisc{i}", col, [(0, 0), (r - 0.03, 0), (r - 0.03, 0.006), (0, 0.006)], M["chand"], 64, V(tx, ty, zz + 0.002)))
    for k in range(4):
        a = math.radians(45 + 90 * k)
        o.append(tube(f"JT_Mus_ChandRod{k}", col, [(tx + 0.42 * math.cos(a), ty + 0.42 * math.sin(a), cz - 0.98),
                                                   (tx + 0.2 * math.cos(a), ty + 0.2 * math.sin(a), H - 0.12)], 0.006, M["brass_polished"], 8))
    o.append(L.lathe("JT_Mus_ChandCanopy", col, [(0, H - 0.2), (0.14, H - 0.2), (0.16, H - 0.16), (0.16, H - 0.12), (0, H - 0.12)],
                     M["brass_polished"], 64, V(tx, ty, 0)))
    # north niche: silk back; the painting hung in it (Max Oppenheimer, Jazzband, 1927) is an exhibit, framed and lit
    # by jt_exhibits from data/museum-exhibits.json (wall VN)
    nz = 1.85
    o.append(bx("JT_Mus_NicheBack", col, M, "silk", (1.4, 0.02, 2.2), (0, VD - 0.01, nz), bevel=0, uv=0.6))
    # sconces flanking the niche and on the side walls
    for x, y, rot in ((-1.05, VD - 0.05, 0), (1.05, VD - 0.05, 0), (-VW + 0.05, 2.2, 90), (-VW + 0.05, 4.6, 90), (VW - 0.05, 2.2, -90), (VW - 0.05, 4.6, -90)):
        plate = bx(f"JT_Mus_SconcePlate{x}{y}", col, M, "brass_aged", (0.09, 0.02, 0.36), (x, y, 2.05), bevel=0.004)
        plate.rotation_euler.z = math.radians(rot)
        off = Vector((0, -0.08, 0)) if rot == 0 else Vector((0.08 * (1 if rot == 90 else -1), 0, 0))
        g = L.lathe(f"JT_Mus_SconceGlass{x}{y}", col, [(0, 0), (0.045, 0), (0.045, 0.3), (0, 0.3)], M["sconce"], 32, V(x, y, 1.9) + off)
        cap = L.lathe(f"JT_Mus_SconceCap{x}{y}", col, [(0, 0.3), (0.052, 0.3), (0.052, 0.33), (0, 0.33)], M["brass_polished"], 32, V(x, y, 1.9) + off)
        o += [plate, g, cap]
    # globe on a black marble drum, left of the door
    gx, gy = -2.65, 1.3
    o.append(L.cylinder("JT_Mus_GlobeDrum", col, 0.3, 0.85, V(gx, gy, 0), M["marble"], 96, chamfer=0.01))
    o.append(L.lathe("JT_Mus_GlobeDrumRing", col, [(0.298, 0.85), (0.31, 0.85), (0.31, 0.87), (0.298, 0.87), (0.298, 0.85)], M["brass_polished"], 96, V(gx, gy, 0)))
    gb = bmesh.new()
    bmesh.ops.create_uvsphere(gb, u_segments=64, v_segments=32, radius=0.24, calc_uvs=True)
    globe = L.obj_from_bm("JT_Mus_Globe", gb, col, M["brass_aged"], 180)
    globe.location = V(gx, gy, 0.87 + 0.08 + 0.24)
    o.append(globe)
    meridian = L.lathe("JT_Mus_GlobeMeridian", col, [(0.255, -0.006), (0.27, -0.006), (0.27, 0.006), (0.255, 0.006), (0.255, -0.006)], M["brass_polished"], 96)
    meridian.rotation_euler = (math.radians(90), math.radians(23), 0)
    meridian.location = globe.location
    o.append(meridian)
    o.append(tube("JT_Mus_GlobeStem", col, [(gx, gy, 0.87), (gx, gy, 0.87 + 0.08)], 0.012, M["brass_polished"]))
    # green velvet bench along the east wall
    bx_, by = VW - 0.45, 3.4
    o.append(bx("JT_Mus_BenchSeat", col, M, "velvet", (0.42, 1.4, 0.14), (bx_, by, 0.46), bevel=0.04, seg=4, uv=0.4))
    for sy in (-1, 1):
        o.append(bx(f"JT_Mus_BenchLeg{sy}", col, M, "brass_aged", (0.36, 0.03, 0.38), (bx_, by + sy * 0.62, 0.2), bevel=0.006))
    o.append(bx("JT_Mus_BenchRail", col, M, "brass_aged", (0.03, 1.24, 0.03), (bx_, by, 0.12), bevel=0.004))
    L.collider("MusSeat_vestibule", col, (0.42, 1.4, 0.5), V(bx_, by, 0.3))
    SEATS.append({"id": "vestibule", "c": list(V(bx_, by, 0.53)), "w": 0.42, "d": 1.4, "face": [-1, 0, 0]})
    # legendary instruments: low walnut plinths with black velvet tops along the side walls, each under (or near) its
    # musician's photograph - low enough that the pictures and their labels stay clear. The instruments themselves are
    # dynamic (loaded and placed by the app on the velvet, clickable); the plinths and their pools of light are baked.
    for name, x, y, face in (("Armstrong", -VW + 0.35, 3.4, 1), ("Gillespie", VW - 0.35, 5.6, -1), ("Parker", VW - 0.35, 1.25, -1)):
        pw, pd, ph = 0.48, 0.76, 0.86              # across the wall (x), along it (y), height
        o.append(bx(f"JT_Mus_Plinth{name}", col, M, "dwalnut", (pw, pd, ph - 0.05), (x, y, (ph - 0.05) / 2), bevel=0.008, uv=0.5))
        o.append(bx(f"JT_Mus_PlinthBand{name}", col, M, "brass_aged", (pw + 0.012, pd + 0.012, 0.022), (x, y, ph - 0.061), bevel=0.003))
        o.append(bx(f"JT_Mus_PlinthTop{name}", col, M, "dwalnut", (pw + 0.02, pd + 0.02, 0.04), (x, y, ph - 0.03), bevel=0.006, uv=0.5))
        o.append(bx(f"JT_Mus_PlinthVelvet{name}", col, M, "velvet_black", (pw - 0.05, pd - 0.05, 0.006), (x, y, ph - 0.007), bevel=0.002, uv=0.4))
        o.append(bx(f"JT_Mus_PlinthFoot{name}", col, M, "marble", (pw + 0.03, pd + 0.03, 0.05), (x, y, 0.025), bevel=0.004, uv=0.6))
        # small brass name plate on the room-facing side
        o.append(bx(f"JT_Mus_PlinthPlate{name}", col, M, "brass_polished", (0.004, 0.22, 0.06), (x + face * (pw / 2 + 0.002), y, ph - 0.17), bevel=0.0015))
        L.collider(f"MusInst_{name}", col, (pw, pd, 0.3), V(x, y, ph + 0.15))
        INSTRUMENTS.append({"id": name.lower(), "c": list(V(x, y, ph)), "along": [0, 1, 0], "face": [face, 0, 0]})
    # signage over the arches (brass monoline)
    o.append(mono("JT_Mus_SignWorld", col, M, "WORLD JAZZ HISTORY", 0.075, (-ARCH_X, VD - 0.02, ARCH_H + 0.32), 0))
    o.append(mono("JT_Mus_SignToronto", col, M, "TORONTO JAZZ LEGACY", 0.075, (ARCH_X, VD - 0.02, ARCH_H + 0.32), 0))
    # archivolts (brass-edged arch mouldings)
    for sx in (-1, 1):
        pts = arch_pts(ARCH_W + 0.06, ARCH_H + 0.03, 40)[2:]
        o.append(tube(f"JT_Mus_Archivolt{sx}", col, [(sx * ARCH_X + px, VD - 0.02, pz) for px, pz in pts], 0.03, M["brass_aged"], 16))
        for px in (-ARCH_W / 2 - 0.03, ARCH_W / 2 + 0.03):
            o.append(tube(f"JT_Mus_ArchJamb{sx}{px}", col, [(sx * ARCH_X + px, VD - 0.02, 0.0), (sx * ARCH_X + px, VD - 0.02, ARCH_H + 0.03 - ARCH_W / 2 - 0.03)],
                          0.03, M["brass_aged"], 16))
    return o


def wing_shell(col, M, side, name):
    o = []
    x0, x1 = side * WING["x0"], side * WING["x1"]
    xa, xb = min(x0, x1), max(x0, x1)
    y0, y1 = WING["y0"], WING["y1"]
    cx, cy = (xa + xb) / 2, (y0 + y1) / 2
    T = 0.25
    o.append(bx(f"JT_Mus_{name}Back", col, M, "dwalnut", (xb - xa + 2 * T, T, WH), (cx, y1 + T / 2, WH / 2), bevel=0, uv=0.8))
    o.append(bx(f"JT_Mus_{name}Outer", col, M, "dwalnut", (T, y1 - y0, WH), (side * (WING["x1"] + T / 2), cy, WH / 2), bevel=0, uv=0.8))
    o.append(bx(f"JT_Mus_{name}Inner", col, M, "dwalnut", (T, y1 - y0, WH), (side * (WING["x0"] - T / 2), cy, WH / 2), bevel=0, uv=0.8))
    # the wing's front (south) wall beyond the vestibule: the vestibule's north wall only spans |x| <= VW + T, so without
    # this the pictures hung there floated in front of the night outside
    fx0, fx1 = VW + T, WING["x1"] + T
    fcx, fy = side * (fx0 + fx1) / 2, VD + T / 2
    o.append(bx(f"JT_Mus_{name}Front", col, M, "dwalnut", (fx1 - fx0, T, WH), (fcx, fy, WH / 2), bevel=0, uv=0.8))
    sw = WING["x1"] - fx0 - 0.05
    sx = side * (fx0 + sw / 2)
    o.append(bx(f"JT_Mus_{name}SilkFront", col, M, "silk", (sw, 0.01, WH - 1.1), (sx, VD + T + 0.005, 1.0 + (WH - 1.1) / 2), bevel=0, uv=0.6))
    fa, fb = sorted((side * (fx0 + 0.1), side * (WING["x1"] - 0.1)))
    o += panel_wall(f"JT_Mus_{name}DadoF", col, M, "y", VD + T, fa, fb, 0.0, 1.0, "y+")
    o.append(bx(f"JT_Mus_{name}RailF", col, M, "brass_aged", (WING["x1"] - fx0, 0.04, 0.03), (side * (fx0 + (WING["x1"] - fx0) / 2), VD + T + 0.02, 1.0), bevel=0.005))
    o.append(bx(f"JT_Mus_{name}Ceiling", col, M, "ceiling", (xb - xa, y1 - y0, 0.06), (cx, cy, WH + 0.03), bevel=0, uv=1.0))
    # silk wall covering above a walnut dado on all three walls
    o.append(bx(f"JT_Mus_{name}SilkBack", col, M, "silk", (xb - xa - 0.1, 0.01, WH - 1.1), (cx, y1 - 0.005, 1.0 + (WH - 1.1) / 2), bevel=0, uv=0.6))
    o.append(bx(f"JT_Mus_{name}SilkOuter", col, M, "silk", (0.01, y1 - y0 - 0.1, WH - 1.1), (side * (WING["x1"] - 0.005), cy, 1.0 + (WH - 1.1) / 2), bevel=0, uv=0.6))
    o.append(bx(f"JT_Mus_{name}SilkInner", col, M, "silk", (0.01, y1 - y0 - 0.1, WH - 1.1), (side * (WING["x0"] + 0.005), cy, 1.0 + (WH - 1.1) / 2), bevel=0, uv=0.6))
    o += panel_wall(f"JT_Mus_{name}DadoB", col, M, "y", y1, xa + 0.1, xb - 0.1, 0.0, 1.0, "y-")
    o += [p for p in panel_wall(f"JT_Mus_{name}DadoO", col, M, "x", side * WING["x1"], y0 + 0.15, y1 - 0.15, 0.0, 1.0, "x-" if side > 0 else "x+")]
    o += [p for p in panel_wall(f"JT_Mus_{name}DadoI", col, M, "x", side * WING["x0"], y0 + 0.15, y1 - 0.15, 0.0, 1.0, "x+" if side > 0 else "x-")]
    for suffix, size, c in (("B", (xb - xa, 0.04, 0.03), (cx, y1 - 0.02, 1.0)), ("O", (0.04, y1 - y0, 0.03), (side * (WING["x1"] - 0.02), cy, 1.0)),
                            ("I", (0.04, y1 - y0, 0.03), (side * (WING["x0"] + 0.02), cy, 1.0))):
        o.append(bx(f"JT_Mus_{name}Rail{suffix}", col, M, "brass_aged", size, c, bevel=0.005))
    # track lighting: brass rail + spot heads aimed at the back wall
    o.append(bx(f"JT_Mus_{name}Track", col, M, "black_metal", (xb - xa - 0.6, 0.04, 0.03), (cx, y1 - 1.5, WH - 0.02), bevel=0.004))
    for k in range(5):
        hx = xa + 0.6 + (xb - xa - 1.2) * k / 4
        head = L.lathe(f"JT_Mus_{name}Spot{k}", col, [(0, 0), (0.035, 0), (0.04, 0.12), (0.03, 0.13), (0, 0.13)], M["black_metal"], 24)
        head.rotation_euler = (math.radians(-140), 0, 0)
        head.location = V(hx, y1 - 1.5, WH - 0.04)
        ring = L.lathe(f"JT_Mus_{name}SpotRing{k}", col, [(0.03, 0.12), (0.041, 0.12), (0.041, 0.128), (0.03, 0.128), (0.03, 0.12)], M["brass_polished"], 24)
        ring.rotation_euler, ring.location = head.rotation_euler, head.location
        o += [head, ring]
    return o


def world_wing(col, M):
    o = wing_shell(col, M, -1, "World")
    y1 = WING["y1"]
    mx, mz, mw, mh = -ARCH_X - 0.6, 2.05, 3.0, 1.5
    o.append(bx("JT_Mus_WorldMapBoard", col, M, "board", (mw + 0.1, 0.04, mh + 0.1), (mx, y1 - 0.03, mz), bevel=0.006, uv=0.6))
    fr = []
    for nm, size, c in (("T", (mw + 0.2, 0.05, 0.05), (mx, y1 - 0.05, mz + mh / 2 + 0.075)), ("B", (mw + 0.2, 0.05, 0.05), (mx, y1 - 0.05, mz - mh / 2 - 0.075)),
                        ("L", (0.05, 0.05, mh + 0.2), (mx - mw / 2 - 0.075, y1 - 0.05, mz)), ("R", (0.05, 0.05, mh + 0.2), (mx + mw / 2 + 0.075, y1 - 0.05, mz))):
        fr.append(bx(f"JT_Mus_WorldMapFrame{nm}", col, M, "brass_aged", size, c, bevel=0.008))
    o.append(L.join(fr, "JT_Mus_WorldMapFrame"))
    # continents: Natural Earth 1:110m land, equirectangular, extruded 6 mm
    with open("D:/Jazztor/data/naturalearth/ne_110m_land.geojson", encoding="utf-8") as f:
        land = json.load(f)
    bm = bmesh.new()
    lat0, lat1 = -58.0, 84.0
    def proj(lon, lat):
        return ((lon / 180.0) * mw / 2, ((lat - (lat0 + lat1) / 2) / (lat1 - lat0)) * mh)
    for feat in land["features"]:
        geom = feat["geometry"]
        polys = geom["coordinates"] if geom["type"] == "MultiPolygon" else [geom["coordinates"]]
        for poly in polys:
            ring = [proj(lo, max(lat0, min(lat1, la))) for lo, la in poly[0]]
            ring = G.simplify(ring, 0.002)
            if len(ring) > 3 and abs(_area(ring)) > 1e-5:
                prism_into(bm, ring, 0.0, 0.006)
    bmesh.ops.transform(bm, matrix=Matrix.Rotation(math.radians(90), 4, "X"), verts=bm.verts)        # up-faces now face -Y (the room)
    L.box_uv(bm, 0.4)
    land_ob = L.obj_from_bm("JT_Mus_WorldLand", bm, col, M["land"], 30)
    land_ob.location = V(mx, y1 - 0.05, mz)
    o.append(land_ob)
    # graticule lines (fine brass)
    for lat in (-30, 0, 30, 60):
        _, zz = proj(0, lat)
        o.append(bx(f"JT_Mus_WorldLat{lat}", col, M, "brass_polished" if lat == 0 else "brass_aged", (mw, 0.002, 0.0025), (mx, y1 - 0.052, mz + zz), bevel=0))
    meta = {"world": {"cx": MX + mx, "y": y1 - 0.058, "cz": mz, "w": mw, "h": mh, "lat0": lat0, "lat1": lat1}}
    # timeline rail beneath the map: 7 sliding markers placed at runtime; year labels engraved
    ry, rz = y1 - 0.18, 1.06
    o.append(tube("JT_Mus_TimelineRail", col, [(mx - 1.55, ry, rz), (mx + 1.55, ry, rz)], 0.012, M["brass_polished"]))
    for e in (-1, 1):
        o.append(L.cylinder(f"JT_Mus_TimelineEnd{e}", col, 0.022, 0.05, V(mx + e * 1.58, ry, rz - 0.025), M["brass_aged"], 24))
    o.append(bx("JT_Mus_TimelineShelf", col, M, "dwalnut", (3.4, 0.24, 0.05), (mx, y1 - 0.16, rz - 0.06), bevel=0.01, uv=0.5))
    for yr in (1910, 1930, 1950, 1970):
        t = (yr - 1910) / 60
        o.append(mono(f"JT_Mus_TimelineYear{yr}", col, M, str(yr), 0.026, (mx - 1.5 + 3.0 * t, y1 - 0.045, rz - 0.135), 0))
    meta["timeline"] = {"x0": MX + mx - 1.5, "x1": MX + mx + 1.5, "y": ry, "z": rz, "year0": 1910, "year1": 1970}
    # vitrine on the inner wall: walnut base, glass hood, artefacts (78 rpm disc, trumpet, ticket)
    vx, vy = -WING["x0"] - 0.45, (WING["y0"] + y1) / 2
    o.append(bx("JT_Mus_VitrineBase", col, M, "dwalnut", (0.6, 1.6, 0.9), (vx, vy, 0.45), bevel=0.01, uv=0.5))
    o.append(bx("JT_Mus_VitrineDeck", col, M, "velvet", (0.56, 1.56, 0.01), (vx, vy, 0.905), bevel=0, uv=0.4))
    o.append(bx("JT_Mus_VitrineGlass", col, M, "glass", (0.6, 1.6, 0.55), (vx, vy, 0.9 + 0.275), bevel=0.002))
    o.append(bx("JT_Mus_VitrineCap", col, M, "brass_aged", (0.62, 1.62, 0.025), (vx, vy, 1.462), bevel=0.004))
    o.append(bx("JT_Mus_VitrineLED", col, M, "cove", (0.5, 1.5, 0.006), (vx, vy, 1.445), bevel=0))
    disc = L.lathe("JT_Mus_ShellacDisc", col, [(0.004, 0), (0.125, 0), (0.127, 0.002), (0.125, 0.004), (0.004, 0.004)], M["shellac"], 96)
    disc.rotation_euler = (0, math.radians(-70), 0)
    disc.location = V(vx, vy - 0.4, 1.04)
    lab = L.lathe("JT_Mus_ShellacLabel", col, [(0.005, 0), (0.045, 0), (0.045, 0.0045), (0.005, 0.0045)], M["label"], 48)
    lab.rotation_euler, lab.location = disc.rotation_euler, disc.location
    stand = bx("JT_Mus_DiscStand", col, M, "brass_aged", (0.08, 0.1, 0.012), (vx, vy - 0.4, 0.92), bevel=0.003)
    o += [disc, lab, stand]
    tb = L.lathe("JT_Mus_VitrineTrumpetBell", col, [(0.003, 0), (0.006, 0.2), (0.012, 0.32), (0.03, 0.38), (0.07, 0.415), (0.072, 0.42),
                                                     (0.066, 0.42), (0.027, 0.38), (0.009, 0.32), (0.0, 0.0)], M["brass_polished"], 48)
    tb.rotation_euler = (math.radians(90), 0, math.radians(20))
    tb.location = V(vx - 0.05, vy + 0.05, 0.97)
    o.append(tb)
    o.append(tube("JT_Mus_VitrineTrumpetPipe", col, [(vx - 0.05, vy + 0.05, 0.97), (vx + 0.02, vy + 0.35, 1.02), (vx + 0.1, vy + 0.42, 0.97),
                                                     (vx + 0.05, vy + 0.2, 0.94)], 0.0055, M["brass_polished"], 10))
    tk = bx("JT_Mus_Ticket", col, M, "paper", (0.16, 0.07, 0.002), (vx + 0.08, vy + 0.55, 0.915), bevel=0.0005)
    tk.rotation_euler.z = math.radians(14)
    o.append(tk)
    # lectern with the chapter placard (placard is dynamic); clear of the vitrine (its cap ends at x = vx - 0.31): at
    # -ARCH_X + 0.9 the desk ran 0.2 m into the case and its cap hung over the reading view
    lx, ly = -ARCH_X + 0.6, y1 - 1.35
    o.append(L.lathe("JT_Mus_WorldLecternFoot", col, [(0, 0), (0.2, 0), (0.2, 0.03), (0, 0.04)], M["brass_aged"], 48, V(lx, ly, 0)))
    o.append(L.cylinder("JT_Mus_WorldLecternPost", col, 0.035, 1.0, V(lx, ly, 0.04), M["dwalnut"], 32))
    desk = bx("JT_Mus_WorldLecternDesk", col, M, "dwalnut", (0.62, 0.46, 0.04), (lx, ly, 1.07), bevel=0.008, uv=0.5)
    desk.rotation_euler.x = math.radians(-28)
    o.append(desk)
    placard = bx("JT_Mus_WorldPlacard", col, M, "placard", (0.56, 0.4, 0.004), placard_on_desk(lx, ly), bevel=0.001)
    placard.rotation_euler.x = math.radians(-28)
    top_uv(placard)
    meta["worldPlacard"] = "JT_Mus_WorldPlacard"
    L.collider("MusWorldPlacard", col, (0.62, 0.5, 0.1), V(lx, ly, 1.08))
    # velvet bench facing the map, well inside the room (it used to stand in the walkway just past the arch); a seat
    bxw, byw = mx - 0.2, WING["y1"] - 1.65
    o.append(bx("JT_Mus_WorldBench", col, M, "velvet", (1.4, 0.42, 0.14), (bxw, byw, 0.46), bevel=0.04, seg=4, uv=0.4))
    for sx in (-1, 1):
        o.append(bx(f"JT_Mus_WorldBenchLeg{sx}", col, M, "brass_aged", (0.03, 0.36, 0.38), (bxw + sx * 0.62, byw, 0.2), bevel=0.006))
    L.collider("MusSeat_world", col, (1.4, 0.42, 0.5), V(bxw, byw, 0.3))
    SEATS.append({"id": "world", "c": list(V(bxw, byw, 0.53)), "w": 1.4, "d": 0.42, "face": [0, 1, 0]})
    return o, meta


def top_uv(ob):
    me = ob.data
    xs = [v.co.x for v in me.vertices]
    ys = [v.co.y for v in me.vertices]
    x0, x1, y0, y1 = min(xs), max(xs), min(ys), max(ys)
    uvl = me.uv_layers.active or me.uv_layers.new()
    for p in me.polygons:
        for li in p.loop_indices:
            co = me.vertices[me.loops[li].vertex_index].co
            uvl.data[li].uv = ((co.x - x0) / (x1 - x0), (co.y - y0) / (y1 - y0)) if p.normal.z > 0.5 else (0.02, 0.02)


def toronto_wing(col, M):
    o = wing_shell(col, M, 1, "Toronto")
    y1 = WING["y1"]
    mx, mz, mw, mh = ARCH_X - 0.2, 2.0, 2.4, 1.52
    o.append(bx("JT_Mus_TorMapBoard", col, M, "board", (mw + 0.1, 0.04, mh + 0.1), (mx, y1 - 0.03, mz), bevel=0.006, uv=0.6))
    fr = []
    for nm, size, c in (("T", (mw + 0.2, 0.05, 0.05), (mx, y1 - 0.05, mz + mh / 2 + 0.075)), ("B", (mw + 0.2, 0.05, 0.05), (mx, y1 - 0.05, mz - mh / 2 - 0.075)),
                        ("L", (0.05, 0.05, mh + 0.2), (mx - mw / 2 - 0.075, y1 - 0.05, mz)), ("R", (0.05, 0.05, mh + 0.2), (mx + mw / 2 + 0.075, y1 - 0.05, mz))):
        fr.append(bx(f"JT_Mus_TorMapFrame{nm}", col, M, "brass_aged", size, c, bevel=0.008))
    o.append(L.join(fr, "JT_Mus_TorMapFrame"))
    geo = G.load()
    proj = G.Projection(geo["bbox"], mw, mh)
    x0, y0_, x1, y1_ = -mw / 2, -mh / 2, mw / 2, mh / 2
    lake, islands, _ = G.lake_and_islands(geo, proj)
    bm = bmesh.new()
    plate_into(bm, G.clip_polygon(G.simplify(lake, 0.0006), x0, y0_, x1, y1_), 0.0)
    lake_ob = mesh_vertical("JT_Mus_TorLake", col, bm, M["lake"], (mx, y1 - 0.052, mz))
    o.append(lake_ob)
    road_w = {"motorway": 0.0046, "trunk": 0.004, "primary": 0.003, "secondary": 0.0021}
    bm = bmesh.new()
    for r in geo["roads"]:
        w = road_w.get(r["cls"])
        if not w:
            continue
        for run in G.clip_polyline(G.simplify([proj(*q) for q in r["pts"]], 0.0008), x0, y0_, x1, y1_):
            strip_into(bm, run, w, 0.0015)
    o.append(mesh_vertical("JT_Mus_TorRoads", col, bm, M["land"], (mx, y1 - 0.052, mz)))
    bm = bmesh.new()
    for ring in islands:
        c = G.clip_polygon(G.simplify(ring, 0.0006), x0, y0_, x1, y1_)
        if len(c) > 2:
            plate_into(bm, c, 0.0006)
    o.append(mesh_vertical("JT_Mus_TorIslands", col, bm, M["board"], (mx, y1 - 0.053, mz)))
    meta = {"toronto": {"cx": MX + mx, "y": y1 - 0.058, "cz": mz, **proj.to_json()}}
    # window to the night city (photo plane far behind the glass = environment, not an object)
    wx, wz, ww, wh = 5.15, 1.95, 1.3, 2.1
    back = [o_ for o_ in o if o_.name == "JT_Mus_TorontoBack"][0]
    cut = extrude_poly("JT_cut_win", col, [(-ww / 2, -wh / 2), (ww / 2, -wh / 2), (ww / 2, wh / 2), (-ww / 2, wh / 2)], 1.0, None, "y",
                       (wx, y1 + 0.5 + 0.125, wz))
    L.boolean(back, cut)
    bpy.data.objects.remove(cut, do_unlink=True)
    L.assign(back, M["dwalnut"])
    silk = [o_ for o_ in o if o_.name == "JT_Mus_TorontoSilkBack"][0]
    cut = extrude_poly("JT_cut_win2", col, [(-ww / 2 - 0.02, -wh / 2 - 0.02), (ww / 2 + 0.02, -wh / 2 - 0.02), (ww / 2 + 0.02, wh / 2 + 0.02), (-ww / 2 - 0.02, wh / 2 + 0.02)],
                       1.0, None, "y", (wx, y1 + 0.5, wz))
    L.boolean(silk, cut)
    bpy.data.objects.remove(cut, do_unlink=True)
    L.assign(silk, M["silk"])
    for nm, size, c in (("T", (ww + 0.12, 0.3, 0.06), (wx, y1 + 0.12, wz + wh / 2 + 0.03)), ("B", (ww + 0.12, 0.36, 0.06), (wx, y1 + 0.1, wz - wh / 2 - 0.03)),
                        ("L", (0.06, 0.3, wh), (wx - ww / 2 - 0.03, y1 + 0.12, wz)), ("R", (0.06, 0.3, wh), (wx + ww / 2 + 0.03, y1 + 0.12, wz)),
                        ("M", (0.035, 0.05, wh), (wx, y1 + 0.2, wz))):
        o.append(bx(f"JT_Mus_TorWindow{nm}", col, M, "bronze", size, c, bevel=0.006))
    o.append(bx("JT_Mus_TorWindowGlass", col, M, "glass", (ww, 0.012, wh), (wx, y1 + 0.2, wz), bevel=0))
    photo = bx("JT_Mus_TorontoView", col, M, "photo", (20.0, 0.02, 11.25), (wx + 2.0, y1 + 8.0, wz + 1.6), bevel=0)
    front_uv(photo)
    o.append(photo)
    meta["view"] = "JT_Mus_TorontoView"
    # archive drawers (walnut, brass pulls + label frames) on the inner wall
    dx, dy = WING["x0"] + 0.3, (WING["y0"] + y1) / 2
    o.append(bx("JT_Mus_DrawerCase", col, M, "dwalnut", (0.55, 1.9, 1.0), (dx, dy, 0.5), bevel=0.01, uv=0.5))
    o.append(bx("JT_Mus_DrawerTop", col, M, "marble", (0.6, 1.95, 0.03), (dx, dy, 1.015), bevel=0.004, uv=0.8))
    for i in range(4):
        for j in range(3):
            zy = dy - 0.72 + i * 0.48
            zz = 0.2 + j * 0.3
            o.append(bx(f"JT_Mus_Drawer{i}{j}", col, M, "dwalnut", (0.02, 0.44, 0.27), (dx + 0.285, zy, zz), bevel=0.004, uv=0.4))
            o.append(bx(f"JT_Mus_DrawerLabel{i}{j}", col, M, "brass_aged", (0.006, 0.09, 0.05), (dx + 0.298, zy, zz + 0.06), bevel=0.001))
            o.append(bx(f"JT_Mus_DrawerPull{i}{j}", col, M, "brass_polished", (0.02, 0.12, 0.012), (dx + 0.305, zy, zz - 0.04), bevel=0.004))
    # portrait gallery on the outer wall: 4 deep brass frames, inserts dynamic (rights-pending placeholders)
    py = (WING["y0"] + y1) / 2
    for k in range(4):
        pz = 1.85
        yy = py - 1.2 + k * 0.8
        x = WING["x1"] - 0.04
        fr = []
        for nm, size, c in (("T", (0.06, 0.62, 0.06), (x, yy, pz + 0.37)), ("B", (0.06, 0.62, 0.06), (x, yy, pz - 0.37)),
                            ("L", (0.06, 0.06, 0.8), (x, yy - 0.28, pz)), ("R", (0.06, 0.06, 0.8), (x, yy + 0.28, pz))):
            fr.append(bx(f"JT_Mus_PortraitFrame{k}{nm}", col, M, "brass_polished", size, c, bevel=0.012))
        o.append(L.join(fr, f"JT_Mus_PortraitFrame{k}"))
        ins = bx(f"JT_Mus_Portrait{k}", col, M, "portrait", (0.01, 0.5, 0.68), (x - 0.01, yy, pz), bevel=0)
        side_uv(ins)
        L.collider(f"MusPortrait{k}", col, (0.08, 0.62, 0.8), V(x - 0.03, yy, pz))
        o.append(bx(f"JT_Mus_PortraitLight{k}", col, M, "brass_polished", (0.08, 0.32, 0.03), (x - 0.1, yy, pz + 0.47), bevel=0.008))
    # lectern + placard
    lx, ly = ARCH_X - 0.6, y1 - 1.45
    o.append(L.lathe("JT_Mus_TorLecternFoot", col, [(0, 0), (0.2, 0), (0.2, 0.03), (0, 0.04)], M["brass_aged"], 48, V(lx, ly, 0)))
    o.append(L.cylinder("JT_Mus_TorLecternPost", col, 0.035, 1.0, V(lx, ly, 0.04), M["dwalnut"], 32))
    desk = bx("JT_Mus_TorLecternDesk", col, M, "dwalnut", (0.62, 0.46, 0.04), (lx, ly, 1.07), bevel=0.008, uv=0.5)
    desk.rotation_euler.x = math.radians(-28)
    o.append(desk)
    placard = bx("JT_Mus_TorPlacard", col, M, "placard", (0.56, 0.4, 0.004), placard_on_desk(lx, ly), bevel=0.001)
    placard.rotation_euler.x = math.radians(-28)
    top_uv(placard)
    L.collider("MusTorPlacard", col, (0.62, 0.5, 0.1), V(lx, ly, 1.08))
    # oxblood leather club chair silhouette: simple upholstered block chair by the window
    cxh, cyh = 5.1, WING["y0"] + 1.6
    o.append(bx("JT_Mus_ChairSeat", col, M, "leather_red", (0.75, 0.7, 0.42), (cxh, cyh, 0.25), bevel=0.06, seg=4, uv=0.4))
    o.append(bx("JT_Mus_ChairBack", col, M, "leather_red", (0.75, 0.18, 0.5), (cxh, cyh + 0.28, 0.65), bevel=0.06, seg=4, uv=0.4))
    for sx in (-1, 1):
        o.append(bx(f"JT_Mus_ChairArm{sx}", col, M, "leather_red", (0.16, 0.7, 0.24), (cxh + sx * 0.32, cyh, 0.55), bevel=0.05, seg=4, uv=0.4))
    return o, meta


def side_uv(ob):
    me = ob.data
    ys = [v.co.y for v in me.vertices]
    zs = [v.co.z for v in me.vertices]
    y0, y1, z0, z1 = min(ys), max(ys), min(zs), max(zs)
    uvl = me.uv_layers.active or me.uv_layers.new()
    for p in me.polygons:
        for li in p.loop_indices:
            co = me.vertices[me.loops[li].vertex_index].co
            uvl.data[li].uv = ((co.y - y0) / (y1 - y0), (co.z - z0) / (z1 - z0)) if p.normal.x < -0.5 else (0.02, 0.02)


def mesh_vertical(name, col, bm, mat, at):
    """Map-plane mesh (XY, +Z up) stood upright facing -Y on a wall."""
    bmesh.ops.transform(bm, matrix=Matrix.Rotation(math.radians(90), 4, "X"), verts=bm.verts)        # up-faces now face -Y
    L.box_uv(bm, 0.4)
    ob = L.obj_from_bm(name, bm, col, mat, 30)
    ob.location = V(*at)
    return ob


def cameras(col):
    def cam(name, loc, target, lens):
        c = bpy.data.cameras.new(name)
        c.lens = lens
        c.sensor_width = 36
        c.clip_start = 0.02
        c.clip_end = 60
        ob = bpy.data.objects.new(name, c)
        col.objects.link(ob)
        ob.location = V(*loc)
        ob.rotation_euler = (V(*target) - V(*loc)).to_track_quat("-Z", "Y").to_euler()
        return ob
    cam("JT_MusCam_Door", (0, -2.3, 1.52), (0, 2.0, 1.45), 21)
    cam("JT_MusCam_Vestibule", (0, 0.75, 1.62), (0, 6.6, 1.75), 19)
    cam("JT_MusCam_World", (-ARCH_X + 0.35, 7.55, 1.62), (-ARCH_X - 0.55, WING["y1"], 1.6), 24)
    cam("JT_MusCam_Toronto", (ARCH_X + 0.25, 7.55, 1.62), (ARCH_X + 0.9, WING["y1"], 1.65), 24)


def main():
    L.reset_scene()
    P = L.palette()
    M = materials(P)
    col = L.collection("JT_Museum")
    shell(col, M)
    door(col, M)
    vestibule(col, M)
    _, wmeta = world_wing(col, M)
    _, tmeta = toronto_wing(col, M)
    _, exmeta = EX.build(col, M, L, bx, V, EX.walls(VW, VD, WING))
    cameras(col)
    # photo for the Toronto window: night master
    pm = bpy.data.materials["JT_Mus_TorontoNight"]
    nt = pm.node_tree
    bsdf = next(n for n in nt.nodes if n.type == "BSDF_PRINCIPLED")
    tex = nt.nodes.new("ShaderNodeTexImage")
    tex.image = bpy.data.images.load("D:/Jazztor/assets/environment/source/toronto-night-master.png")
    nt.links.new(tex.outputs["Color"], bsdf.inputs["Base Color"])
    nt.links.new(tex.outputs["Color"], bsdf.inputs["Emission Color"])
    bsdf.inputs["Emission Strength"].default_value = 1.6
    os.makedirs(SRC, exist_ok=True)
    os.makedirs(PUBLIC, exist_ok=True)
    with open(f"{PUBLIC}/museum.json", "w", encoding="utf-8") as f:
        json.dump({**wmeta, **tmeta, "mx": MX, "exhibits": exmeta, "instruments": INSTRUMENTS, "seats": SEATS}, f, indent=1)
    bpy.context.view_layer.update()
    bpy.ops.wm.save_as_mainfile(filepath=f"{SRC}/JT_Museum.blend")
    tris = sum(sum(len(p.vertices) - 2 for p in o.data.polygons) for o in col.all_objects if o.type == "MESH")
    print("MUSEUM BUILT", len(col.all_objects), "objects", f"{tris:,} tris")


main()
