"""JazzTor homepage vertical slice — builds the listening room and exports GLBs.

Run:  blender -b --factory-startup --python D:/Jazztor/blender/scripts/build_home.py
Outputs:
  D:/Jazztor/blender/source/JT_Home.blend
  D:/Jazztor/blender/exports/JT_{Turntable,Cabinet,Whiskey,Room,Skyline}.glb
"""
import math
import os
import random
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import bpy
import bmesh
from mathutils import Vector, Matrix
import jt_lib as L
import jt_turntable as TT
import jt_letters as LT
import jt_player as PL
import jt_map as MAP
import jt_whiskey as WH

SRC = "D:/Jazztor/blender/source"
EXP = "D:/Jazztor/blender/exports"

CONSOLE_TOP = 0.74
BACK_Y = 2.40
WIN_X0, WIN_X1 = 0.20, 3.60
CEIL = 3.0
TT_LOC = (0.02, -0.08, CONSOLE_TOP)
TT_ROT = 16.0
MAP_AT = (2.45, 0.80, 0.0)     # Jazz Map table, right of the console, in front of the east window


# ====================================================================== room shell + console
def build_room(col, P):
    L.box("JT_Room_Floor", col, (7.0, 5.2, 0.02), (0.2, -0.2, -0.01), P["wood_floor"], uv_scale=1.2)
    L.box("JT_Room_Ceiling", col, (7.0, 5.2, 0.04), (0.2, -0.2, CEIL + 0.02), P["ceiling"])
    L.box("JT_Room_WallBack", col, (WIN_X0 + 3.3, 0.2, CEIL), ((WIN_X0 - 3.3) / 2, BACK_Y + 0.1, CEIL / 2),
          P["plaster"], uv_scale=1.5)
    L.box("JT_Room_WallLeft", col, (0.2, 5.2, CEIL), (-3.3, -0.2, CEIL / 2), P["plaster"], uv_scale=1.5)
    L.box("JT_Room_WallRight", col, (0.2, 5.2, CEIL), (3.75, -0.2, CEIL / 2), P["plaster"], uv_scale=1.5)
    L.box("JT_Room_WallFront", col, (7.0, 0.2, CEIL), (0.2, -2.8, CEIL / 2), P["plaster"], uv_scale=1.5)
    # skirting / ceiling reveal in walnut and bronze
    L.box("JT_Room_Reveal", col, (WIN_X1 - WIN_X0 + 0.1, 0.25, 0.08), ((WIN_X0 + WIN_X1) / 2, BACK_Y - 0.05, CEIL - 0.04),
          P["bronze"])

    # ---- window module (A31): mullions, sill, glass with thickness
    xs = [WIN_X0 + i * (WIN_X1 - WIN_X0) / 3 for i in range(4)]
    for i, x in enumerate(xs):
        L.box(f"JT_Window_Mullion_{i}", col, (0.06, 0.14, CEIL), (x, BACK_Y + 0.02, CEIL / 2), P["bronze"],
              bevel=0.004, segments=2)
    L.box("JT_Window_Head", col, (WIN_X1 - WIN_X0, 0.14, 0.08), ((WIN_X0 + WIN_X1) / 2, BACK_Y + 0.02, CEIL - 0.04),
          P["bronze"])
    L.box("JT_Window_Sill", col, (WIN_X1 - WIN_X0 + 0.06, 0.32, 0.10), ((WIN_X0 + WIN_X1) / 2, BACK_Y - 0.06, 0.05),
          P["walnut"], bevel=0.005, segments=3, uv_scale=0.8)
    for i in range(3):
        g = L.box(f"JT_Window_Glass_{i}", col, (xs[i + 1] - xs[i] - 0.06, 0.012, CEIL - 0.18),
                  ((xs[i] + xs[i + 1]) / 2, BACK_Y + 0.04, 0.10 + (CEIL - 0.18) / 2), P["glass_window"])

    # ---- marble console (A30)
    L.box("JT_Console_Marble", col, (2.7, 0.92, 0.05), (0.05, -0.1, CONSOLE_TOP - 0.025), P["marble"],
          bevel=0.003, segments=3, uv_scale=0.7)
    L.box("JT_Console_Apron", col, (2.6, 0.84, 0.11), (0.05, -0.1, CONSOLE_TOP - 0.05 - 0.055), P["walnut"],
          bevel=0.003, segments=2, uv_scale=0.8)
    for sx in (-1, 1):
        for sy in (-1, 1):
            L.box(f"JT_Console_Leg_{sx}{sy}", col, (0.04, 0.04, CONSOLE_TOP - 0.16),
                  (0.05 + sx * 1.22, -0.1 + sy * 0.36, (CONSOLE_TOP - 0.16) / 2), P["brass"], bevel=0.003)
    L.box("JT_Console_Stretcher", col, (2.44, 0.03, 0.03), (0.05, -0.1 + 0.36, 0.12), P["brass"], bevel=0.002)


# ====================================================================== curtains (A06) with morph targets
def curtain_coords(anchor, direction, width, amp, folds, nu, nv, y0, z0, z1):
    co = []
    for j in range(nv + 1):
        s = j / nv
        z = z0 + (z1 - z0) * s
        flare = 1.0 + 0.18 * (1 - s)
        for i in range(nu + 1):
            t = i / nu
            x = anchor + direction * t * width * (1 + 0.03 * (1 - s))
            y = y0 - amp * flare * (0.5 - 0.5 * math.cos(2 * math.pi * folds * t))
            co.append((x, y, z))
    return co


def build_curtain(name, col, P, anchor, direction, open_w, half_w, closed_w):
    nu, nv, folds = 160, 20, 9
    y0, z0, z1 = BACK_Y - 0.12, 0.03, CEIL - 0.08
    states = [(open_w, 0.085), (half_w, 0.055), (closed_w, 0.032)]
    base = curtain_coords(anchor, direction, *states[0], folds, nu, nv, y0, z0, z1)
    me = bpy.data.meshes.new(name)
    faces = []
    for j in range(nv):
        for i in range(nu):
            a = j * (nu + 1) + i
            q = [a, a + 1, a + nu + 2, a + nu + 1]
            faces.append(q if direction > 0 else list(reversed(q)))
    me.from_pydata(base, [], faces)
    uvl = me.uv_layers.new(name="UVMap")
    for p in me.polygons:
        for li in p.loop_indices:
            vi = me.loops[li].vertex_index
            i, j = vi % (nu + 1), vi // (nu + 1)
            uvl.data[li].uv = (i / nu * 2.2, j / nv * 2.8)
    ob = bpy.data.objects.new(name, me)
    col.objects.link(ob)
    L.assign(ob, P["fabric"])
    L.shade(ob, 80)
    ob.shape_key_add(name="Basis")
    for key, st in zip(("Half", "Closed"), states[1:]):
        sk = ob.shape_key_add(name=key)
        for v, c in zip(sk.data, curtain_coords(anchor, direction, *st, folds, nu, nv, y0, z0, z1)):
            v.co = c
        sk.value = 0.0                                      # curtains are built open
    L.set_origin(ob, (anchor, y0, z1))
    return ob


def build_curtains(col, P):
    mid = (WIN_X0 + WIN_X1) / 2 + 0.6
    build_curtain("JT_Curtain_Left", col, P, WIN_X0 - 0.05, 1, 0.42, (mid - WIN_X0) * 0.55, mid - WIN_X0 + 0.04)
    build_curtain("JT_Curtain_Right", col, P, WIN_X1 + 0.05, -1, 0.40, (WIN_X1 - mid) * 0.55, WIN_X1 - mid + 0.04)
    L.box("JT_Curtain_Track", col, (WIN_X1 - WIN_X0 + 0.2, 0.03, 0.025), ((WIN_X0 + WIN_X1) / 2, BACK_Y - 0.12, CEIL - 0.07),
          P["brass"], bevel=0.003)
    cx = WIN_X0 + 0.48
    cord = L.cylinder("JT_Curtain_Cord", col, 0.003, 1.75, (cx, BACK_Y - 0.17, CEIL - 0.08 - 1.75), P["felt"], 12)
    weight = L.lathe("JT_Curtain_CordWeight", col, [(0, 0), (0.010, 0.012), (0.014, 0.08), (0.011, 0.11), (0.003, 0.12),
                                                   (0, 0.12)], P["bronze"], 32,
                     (cx, BACK_Y - 0.17, CEIL - 0.08 - 1.75 - 0.11))
    L.set_parent(weight, cord)
    L.set_origin(cord, (cx, BACK_Y - 0.17, CEIL - 0.08))
    L.collider("CurtainCord", col, (0.07, 0.07, 0.6), (cx, BACK_Y - 0.17, CEIL - 0.08 - 1.6))


# ====================================================================== cabinet (A03 / A25)
CAB_X0, CAB_X1 = -2.05, -0.20
CAB_Y = BACK_Y - 0.25
CAB_H = 0.72
SHELF_X0, SHELF_X1 = -1.72, -0.30
SLEEVE = 0.315


def sleeve_box(bm_target, x, thick, y, z, col_idx, lean=0.0):
    """Append one sleeve (spine faces -Y) into a bmesh with spine atlas UVs."""
    bm = L.box_bm(thick, SLEEVE, SLEEVE, (0, 0, SLEEVE / 2), bevel=0.0006, segments=1)
    uvl = bm.loops.layers.uv.verify()
    u0, u1 = col_idx / 64, (col_idx + 1) / 64
    for f in bm.faces:
        for l in f.loops:
            co = l.vert.co
            l[uvl].uv = (u0 + (u1 - u0) * (co.x / thick + 0.5), co.z / SLEEVE)
    m = Matrix.Translation((x, y, z)) @ Matrix.Rotation(lean, 4, "Y")
    bmesh.ops.transform(bm, matrix=m, verts=bm.verts)
    me = bpy.data.meshes.new("tmp")
    bm.to_mesh(me)
    bm.free()
    bm_target.from_mesh(me)
    bpy.data.meshes.remove(me)


def build_cabinet(col, P):
    rnd = random.Random(7)
    zc = 0.06
    L.box("JT_Cabinet_Carcass", col, (CAB_X1 - CAB_X0, 0.46, CAB_H - zc - 0.02),
          ((CAB_X0 + CAB_X1) / 2, CAB_Y, zc + (CAB_H - zc - 0.02) / 2), P["walnut"], bevel=0.004, uv_scale=0.7)
    L.box("JT_Cabinet_Top", col, (CAB_X1 - CAB_X0 + 0.02, 0.48, 0.02), ((CAB_X0 + CAB_X1) / 2, CAB_Y, CAB_H - 0.01),
          P["marble"], bevel=0.002, uv_scale=1.0)
    for sx in (-1, 1):
        for sy in (-1, 1):
            L.lathe(f"JT_Cabinet_Foot_{sx}{sy}", col, [(0, 0), (0.016, 0), (0.02, zc), (0, zc)], P["brass"], 32,
                    ((CAB_X0 + CAB_X1) / 2 + sx * 0.82, CAB_Y + sy * 0.18, 0))
    dw = (CAB_X1 - CAB_X0 - 0.04) / 3
    for i in range(3):
        x = CAB_X0 + 0.02 + dw * (i + 0.5)
        L.box(f"JT_Cabinet_Drawer_{i}", col, (dw - 0.008, 0.02, 0.50), (x, CAB_Y - 0.235, zc + 0.04 + 0.25),
              P["walnut"], bevel=0.003, uv_scale=0.6)
        L.box(f"JT_Cabinet_Pull_{i}", col, (0.16, 0.012, 0.008), (x, CAB_Y - 0.25, zc + 0.04 + 0.47), P["brass"],
              bevel=0.002)
    # For You / My Crate selector plate on the top rail
    sel_x, sel_z = -1.12, zc + 0.04 + 0.555
    L.box("JT_Cabinet_SelectorPlate", col, (0.34, 0.008, 0.045), (sel_x, CAB_Y - 0.236, sel_z), P["black_metal"],
          bevel=0.002)
    L.box("JT_Cabinet_SelectorSlot", col, (0.20, 0.004, 0.004), (sel_x, CAB_Y - 0.2415, sel_z - 0.008),
          P["rubber"])
    for txt, dx in (("FOR YOU", -0.085), ("MY CRATE", 0.085)):
        t = LT.mono_object(f"JT_Cabinet_Label_{txt.replace(' ', '')}", col, txt, 0.0078, 0.0006, P["brass_polished"])
        t.rotation_euler = (math.radians(90), 0, 0)
        t.location = (sel_x + dx, CAB_Y - 0.2405, sel_z + 0.010)
    lever = L.lathe("JT_Cabinet_Selector_Lever", col, [(0, 0), (0.007, 0), (0.007, 0.010), (0.005, 0.014), (0, 0.014)],
                    P["brass_polished"], 32)
    lever.rotation_euler = (math.radians(90), 0, 0)
    lever.location = (sel_x - 0.085, CAB_Y - 0.2415, sel_z - 0.008)
    L.collider("CabinetSelector", col, (0.34, 0.04, 0.06), (sel_x, CAB_Y - 0.25, sel_z))

    # open record shelf on top
    sz0 = CAB_H
    sh_h, sh_d, t = 0.37, 0.36, 0.018
    sy = CAB_Y + 0.03
    L.box("JT_Shelf_Bottom", col, (SHELF_X1 - SHELF_X0, sh_d, t), ((SHELF_X0 + SHELF_X1) / 2, sy, sz0 + t / 2),
          P["walnut"], bevel=0.002, uv_scale=0.6)
    L.box("JT_Shelf_Top", col, (SHELF_X1 - SHELF_X0, sh_d, t), ((SHELF_X0 + SHELF_X1) / 2, sy, sz0 + sh_h - t / 2),
          P["walnut"], bevel=0.002, uv_scale=0.6)
    L.box("JT_Shelf_Back", col, (SHELF_X1 - SHELF_X0, t, sh_h), ((SHELF_X0 + SHELF_X1) / 2, sy + sh_d / 2 - t / 2,
                                                                 sz0 + sh_h / 2), P["walnut"], uv_scale=0.6)
    for x in (SHELF_X0 + t / 2, SHELF_X1 - t / 2, -0.86):
        L.box(f"JT_Shelf_Side_{x:.2f}", col, (t, sh_d, sh_h), (x, sy, sz0 + sh_h / 2), P["walnut"], bevel=0.002,
              uv_scale=0.6)
    L.box("JT_Shelf_LabelRail", col, (SHELF_X1 - SHELF_X0, 0.006, 0.012), ((SHELF_X0 + SHELF_X1) / 2, sy - sh_d / 2,
                                                                       sz0 + t + 0.004), P["brass"])
    L.box("JT_Shelf_Felt", col, (SHELF_X1 - SHELF_X0 - 0.04, sh_d - 0.02, 0.002),
          ((SHELF_X0 + SHELF_X1) / 2, sy, sz0 + t + 0.001), P["felt"])

    # bulk sleeves (one mesh) — left bay
    bm = bmesh.new()
    x = SHELF_X0 + t + 0.004
    z = sz0 + t + 0.002
    ysl = sy - sh_d / 2 + SLEEVE / 2 + 0.012
    bulk_end = -0.86 - t / 2 - 0.004
    while x < bulk_end - 0.006:
        th = rnd.uniform(0.0028, 0.0042)
        sleeve_box(bm, x + th / 2, th, ysl + rnd.uniform(-0.006, 0.004), z, rnd.randrange(64), rnd.uniform(-0.01, 0.01))
        x += th + rnd.uniform(0.0002, 0.0012)
    bulk = L.obj_from_bm("JT_Cabinet_SleevesBulk", bm, col, P["spines"], 30)

    # featured interactive sleeves — right bay, the ones nearest the turntable
    x = -0.86 + t / 2 + 0.006
    featured = []
    for i in range(8):
        th = 0.0045
        bmf = bmesh.new()
        sleeve_box(bmf, 0, th, 0, 0, (i * 7) % 64)
        cover_mat = P[f"cover{i}"]
        uvl = bmf.loops.layers.uv.verify()
        bmf.normal_update()
        for f in bmf.faces:
            if abs(f.normal.x) > 0.7:
                f.material_index = 1
                for lp in f.loops:
                    co = lp.vert.co
                    u = (co.y / SLEEVE + 0.5)
                    lp[uvl].uv = (u if f.normal.x > 0 else 1 - u, co.z / SLEEVE)
        ob = L.obj_from_bm(f"JT_Cabinet_Sleeve_{i + 1:03d}", bmf, col, None, 30)
        L.assign(ob, P["spines"], cover_mat)
        ob.location = (x + th / 2, ysl, z)
        c = L.collider(f"Sleeve_{i + 1:03d}", col, (th + 0.003, 0.05, SLEEVE),
                       (x + th / 2, ysl - SLEEVE / 2 + 0.02, z + SLEEVE / 2), parent=ob)
        featured.append(ob)
        x += th + 0.0012

    # face-out display sleeve + caption card (selected album)
    disp = L.box("JT_Cabinet_DisplaySleeve", col, (SLEEVE, 0.004, SLEEVE), (0, 0, SLEEVE / 2), None)
    me = disp.data
    uvl = me.uv_layers.active
    for p in me.polygons:
        for li in p.loop_indices:
            co = me.vertices[me.loops[li].vertex_index].co
            uvl.data[li].uv = (co.x / SLEEVE + 0.5, co.z / SLEEVE + 0.5)
    L.assign(disp, P["cover0"])
    disp.location = (-0.55, sy + 0.02, z + 0.004 + SLEEVE / 2)
    disp.rotation_euler = (math.radians(-8), 0, math.radians(-4))
    card = L.box("JT_Cabinet_CaptionCard", col, (0.15, 0.003, 0.075), (0, 0, 0.0375), None, bevel=0.0005, segments=1)
    me = card.data
    uvl = me.uv_layers.active
    for p in me.polygons:
        for li in p.loop_indices:
            co = me.vertices[me.loops[li].vertex_index].co
            uvl.data[li].uv = (co.x / 0.15 + 0.5, co.z / 0.075 + 0.5)
    L.assign(card, P["paper"])
    card.location = (-0.57, sy - 0.12, z + 0.002 + 0.0375)
    card.rotation_euler = (math.radians(-14), 0, math.radians(-6))
    L.collider("DisplaySleeve", col, (0.33, 0.06, 0.33), (-0.55, sy, z + SLEEVE / 2))


# ====================================================================== lamp (A05)
def build_lamp(col, P):
    base = Vector((-0.82, CAB_Y + 0.05, CAB_H + 0.37))
    L.lathe("JT_Lamp_Base", col, [(0, 0), (0.095, 0), (0.098, 0.004), (0.098, 0.022), (0.092, 0.028), (0.03, 0.032),
                                  (0, 0.032)], P["black_metal"], 96, base)
    L.lathe("JT_Lamp_BaseRing", col, [(0.088, 0.027), (0.094, 0.027), (0.094, 0.031), (0.03, 0.035), (0.03, 0.031),
                                      (0.088, 0.027)], P["brass_polished"], 96, base)
    stem_h = 0.30
    L.cylinder("JT_Lamp_Stem", col, 0.009, stem_h, base + Vector((0, 0, 0.032)), P["brass"], 32)
    shade_c = base + Vector((0, 0, 0.032 + stem_h))
    shade = L.lathe("JT_Lamp_Shade", col, [(0.004, 0.115), (0.03, 0.112), (0.085, 0.085), (0.125, 0.03),
                                           (0.14, -0.005), (0.142, -0.012), (0.137, -0.012), (0.134, -0.004),
                                           (0.12, 0.026), (0.081, 0.077), (0.028, 0.104), (0.004, 0.106),
                                           (0.004, 0.115)], P["brass"], 128, shade_c + Vector((0, 0, -0.06)))
    diff = L.lathe("JT_Lamp_Diffuser", col, [(0, 0.0), (0.06, 0.0), (0.062, 0.006), (0, 0.012)],
                   P["lamp_shade_in"], 64, shade_c + Vector((0, 0, -0.045)))
    L.set_parent(diff, shade)
    sw = L.box("JT_Lamp_Switch", col, (0.008, 0.016, 0.006), base + Vector((0.055, -0.045, 0.034)), P["brass_polished"],
               bevel=0.001)
    dim = L.lathe("JT_Lamp_Dimmer", col, [(0, 0), (0.011, 0), (0.011, 0.008), (0.009, 0.010), (0, 0.010)],
                  P["brass"], 48, base + Vector((-0.06, -0.04, 0.026)))
    L.empty("JT_Lamp_LightPoint", col, shade_c + Vector((0, 0, -0.07)))
    L.collider("Lamp", col, (0.30, 0.30, 0.22), shade_c + Vector((0, 0, -0.02)))
    L.collider("LampSwitch", col, (0.04, 0.04, 0.03), base + Vector((0.055, -0.045, 0.034)))


# ====================================================================== whiskey (A04 / A28)
def build_whiskey(col, P):
    """Visual upgrade v1: see jt_whiskey.py (cut crystal, volumetric whiskey, frosted ice, marble display base)."""
    WH.build(col, P, (0.50, -0.07), CONSOLE_TOP)


# ====================================================================== loose record + sleeve on the marble
def build_loose(col, P):
    sl = L.box("JT_Loose_Sleeve", col, (SLEEVE, SLEEVE, 0.004), (0, 0, 0.002), None, bevel=0.0006, segments=1)
    me = sl.data
    uvl = me.uv_layers.active
    for p in me.polygons:
        for li in p.loop_indices:
            co = me.vertices[me.loops[li].vertex_index].co
            uvl.data[li].uv = (co.x / SLEEVE + 0.5, co.y / SLEEVE + 0.5)
    L.assign(sl, P["cover0"])
    sl.location = (-0.78, -0.30, CONSOLE_TOP + 0.002)
    sl.rotation_euler.z = math.radians(-14)
    rec = TT.record_mesh("JT_Loose_Record", col, P, (-0.55, -0.20), CONSOLE_TOP + 0.0042)
    rec.rotation_euler.x = math.radians(-1.2)


# ====================================================================== Toronto skyline (A07 / A32)
def building_bm(w, d, h, setbacks, rnd):
    bm = bmesh.new()
    z = 0.0
    tiers = [(w, d, h * (0.6 if setbacks else 1.0))]
    if setbacks:
        tiers.append((w * 0.78, d * 0.78, h * 0.28))
        tiers.append((w * 0.5, d * 0.5, h * 0.12))
    for (tw, td, th) in tiers:
        t = L.box_bm(tw, td, th, (0, 0, z + th / 2))
        me = bpy.data.meshes.new("t")
        t.to_mesh(me)
        t.free()
        bm.from_mesh(me)
        bpy.data.meshes.remove(me)
        z += th
    uvl = bm.loops.layers.uv.verify()
    ou, ov = rnd.random(), rnd.random()
    for f in bm.faces:
        n = f.normal
        if abs(n.z) > 0.7:
            f.material_index = 1
            for l in f.loops:
                l[uvl].uv = (0.5, 0.5)
            continue
        for l in f.loops:
            co = l.vert.co
            h_coord = co.y if abs(n.x) > abs(n.y) else co.x
            l[uvl].uv = (h_coord / 48.0 + ou, co.z / 115.2 + ov)
    return bm, z


def polar(theta_deg, r):
    a = math.radians(theta_deg)
    return Vector((math.sin(a) * r, math.cos(a) * r, 0))


def build_cn_tower(col, P, at):
    conc = P["sky_concrete"]
    core = L.lathe("JT_CNTower_Core", col, [(0, 0), (10, 0), (7.5, 335), (0, 335)], conc, 6, at)
    parts = [core]
    for k in range(3):
        a = math.radians(90 + k * 120)
        dirv = Vector((math.cos(a), math.sin(a), 0))
        side = Vector((-dirv.y, dirv.x, 0))
        bm = bmesh.new()
        pts = [dirv * 6 + side * 4, dirv * 36 + side * 3.5, dirv * 36 - side * 3.5, dirv * 6 - side * 4]
        top = [dirv * 5 + side * 2.5 + Vector((0, 0, 330)), dirv * 9 + side * 2 + Vector((0, 0, 330)),
               dirv * 9 - side * 2 + Vector((0, 0, 330)), dirv * 5 - side * 2.5 + Vector((0, 0, 330))]
        vs = [bm.verts.new(p) for p in pts + top]
        for f in [(0, 1, 2, 3), (7, 6, 5, 4), (0, 4, 5, 1), (1, 5, 6, 2), (2, 6, 7, 3), (3, 7, 4, 0)]:
            bm.faces.new([vs[i] for i in f])
        bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
        leg = L.obj_from_bm(f"JT_CNTower_Leg_{k}", bm, col, conc, 20)
        leg.location = at
        parts.append(leg)
    parts.append(L.lathe("JT_CNTower_MainPod", col,
                         [(0, 328), (9, 328), (16, 333), (21, 340), (21.5, 347), (19.5, 354), (15, 359), (9, 362),
                          (6, 364), (0, 364)], conc, 48, at))
    parts.append(L.lathe("JT_CNTower_Upper", col, [(0, 364), (5.5, 364), (5.0, 446), (0, 446)], conc, 6, at))
    parts.append(L.lathe("JT_CNTower_SkyPod", col, [(0, 443), (7.5, 444), (8, 449), (6, 454), (0, 454)], conc, 32, at))
    parts.append(L.lathe("JT_CNTower_Mast", col, [(0, 454), (3.2, 454), (2.0, 520), (0.9, 553), (0, 553.3)],
                         P["sky_mast"], 16, at))
    band = L.lathe("JT_CNTower_PodLights", col, [(21.6, 343.5), (21.9, 344), (21.9, 346.5), (21.6, 347),
                                                  (21.6, 343.5)], P["sky_window_band"], 48, at)
    beacon = L.lathe("JT_CNTower_Beacon", col, [(0, 551), (1.4, 551.5), (1.4, 553), (0, 554)], P["sky_beacon"], 12, at)
    return parts + [band, beacon]


def build_skyline(col, P):
    rnd = random.Random(416)
    root = L.empty("JT_Skyline", col, (0, 0, 0), size=1)
    facade_mats = [(P["facade_glass"], P["roof"]), (P["facade_concrete"], P["roof"]), (P["facade_dark"], P["roof"])]
    batches = {i: bmesh.new() for i in range(3)}
    tops = []

    def add_building(theta, r, w, d, h, kind=None):
        k = kind if kind is not None else rnd.choices([0, 1, 2], [0.5, 0.3, 0.2])[0]
        bm, top = building_bm(w, d, h, h > 160 and rnd.random() < 0.5, rnd)
        rot = Matrix.Rotation(math.radians(theta + rnd.uniform(-8, 8)), 4, "Z")
        bmesh.ops.transform(bm, matrix=Matrix.Translation(polar(theta, r)) @ rot, verts=bm.verts)
        me = bpy.data.meshes.new("t")
        bm.to_mesh(me)
        bm.free()
        batches[k].from_mesh(me)
        bpy.data.meshes.remove(me)
        if h > 90:
            tops.append(polar(theta, r) + Vector((0, 0, top)))

    # low-rise fabric of the city
    for _ in range(420):
        add_building(rnd.uniform(-12, 85), rnd.uniform(2550, 4400), rnd.uniform(18, 60), rnd.uniform(18, 60),
                     rnd.uniform(12, 55))
    # Liberty Village / King West condos
    for _ in range(40):
        add_building(rnd.uniform(-8, 26), rnd.uniform(2650, 3300), rnd.uniform(22, 38), rnd.uniform(22, 38),
                     rnd.uniform(70, 160))
    # CityPlace / Fort York condo cluster beside the tower
    for _ in range(26):
        add_building(rnd.uniform(26, 37), rnd.uniform(2700, 3000), rnd.uniform(24, 34), rnd.uniform(24, 34),
                     rnd.uniform(120, 230), 0)
    # Financial District, behind and right of the tower
    for _ in range(30):
        add_building(rnd.uniform(39, 52), rnd.uniform(3150, 3600), rnd.uniform(35, 60), rnd.uniform(35, 60),
                     rnd.uniform(150, 298), rnd.choice([0, 2]))
    # St Lawrence / East Bayfront
    for _ in range(36):
        add_building(rnd.uniform(52, 72), rnd.uniform(2900, 3700), rnd.uniform(24, 45), rnd.uniform(24, 45),
                     rnd.uniform(50, 180))

    names = ["JT_Skyline_Glass", "JT_Skyline_Concrete", "JT_Skyline_Dark"]
    for i in range(3):
        ob = L.obj_from_bm(names[i], batches[i], col, None, 10)
        L.assign(ob, *facade_mats[i])
        L.set_parent(ob, root)

    # aviation beacons on tall roofs
    bb = bmesh.new()
    for p in tops:
        t = bmesh.new()
        bmesh.ops.create_icosphere(t, subdivisions=1, radius=1.2)
        bmesh.ops.translate(t, vec=p + Vector((0, 0, 2)), verts=t.verts)
        me = bpy.data.meshes.new("t")
        t.to_mesh(me)
        t.free()
        bb.from_mesh(me)
        bpy.data.meshes.remove(me)
    L.set_parent(L.obj_from_bm("JT_Skyline_Beacons", bb, col, P["sky_beacon"], None), root)

    tower_at = polar(40, 2850)
    for o in build_cn_tower(col, P, tower_at):
        L.set_parent(o, root)
    dome = L.lathe("JT_Skyline_Dome", col, [(0, 86), (40, 83), (78, 70), (104, 44), (108, 30), (108, 0), (0, 0)],
                   P["sky_concrete"], 64, polar(36.5, 2740))
    L.set_parent(dome, root)
    # cranes
    for i in range(4):
        th, rr = rnd.uniform(10, 50), rnd.uniform(2700, 3200)
        base = polar(th, rr)
        h = rnd.uniform(110, 190)
        mast = L.box(f"JT_Skyline_CraneMast_{i}", col, (3, 3, h), base + Vector((0, 0, h / 2)), P["sky_crane"])
        jib = L.box(f"JT_Skyline_CraneJib_{i}", col, (70, 2, 2.5), base + Vector((15, 0, h)), P["sky_crane"])
        jib.rotation_euler.z = rnd.uniform(0, math.pi)
        L.set_parent(mast, root)
        L.set_parent(jib, root)

    # land, shoreline park with trees, water
    land = L.box("JT_Skyline_Land", col, (16000, 6000, 2), (1000, 2450 + 3000, -1), P["sky_land"])
    L.set_parent(land, root)
    tb = bmesh.new()
    for _ in range(420):
        th, rr = rnd.uniform(-15, 80), rnd.uniform(2460, 2600)
        t = bmesh.new()
        bmesh.ops.create_icosphere(t, subdivisions=1, radius=rnd.uniform(5, 10))
        bmesh.ops.scale(t, vec=(1, 1, rnd.uniform(0.9, 1.6)), verts=t.verts)
        bmesh.ops.translate(t, vec=polar(th, rr) + Vector((0, 0, rnd.uniform(4, 9))), verts=t.verts)
        me = bpy.data.meshes.new("t")
        t.to_mesh(me)
        t.free()
        tb.from_mesh(me)
        bpy.data.meshes.remove(me)
    L.set_parent(L.obj_from_bm("JT_Skyline_Trees", tb, col, P["sky_trees"], 50), root)
    water = L.box("JT_Water", col, (16000, 2460 + 400, 0.5), (1000, (2460 - 400) / 2, -0.25), P["sky_water"])
    L.set_parent(water, root)

    # whole exterior at 1:10, apartment floor ~60 m above the lake
    root.scale = (0.1, 0.1, 0.1)
    root.rotation_euler.z = math.radians(7)
    root.location = (0, 0, -6.0)
    return root


def sky_palette(P):
    P["facade_glass"] = L.material("JT_Facade_Glass", tex="JT_Facade_Glass_BaseColor", metal=0.4, rough=0.18,
                                   emission_tex="JT_Facade_Glass_Emissive", emission_strength=0.0)
    P["facade_concrete"] = L.material("JT_Facade_Concrete", tex="JT_Facade_Concrete_BaseColor", rough=0.7,
                                      emission_tex="JT_Facade_Concrete_Emissive", emission_strength=0.0)
    P["facade_dark"] = L.material("JT_Facade_Dark", tex="JT_Facade_Glass_BaseColor", metal=0.5, rough=0.22,
                                  emission_tex="JT_Facade_Glass_Emissive", emission_strength=0.0,
                                  uv_tint=(0.45, 0.45, 0.5))
    P["roof"] = L.material("JT_Roof", base=(0.12, 0.12, 0.12), rough=0.85)
    P["sky_concrete"] = L.material("JT_Sky_Concrete", base=(0.55, 0.55, 0.53), rough=0.75)
    P["sky_mast"] = L.material("JT_Sky_Mast", base=(0.6, 0.58, 0.56), metal=0.6, rough=0.4)
    P["sky_window_band"] = L.material("JT_Sky_PodLights", base=(0.2, 0.2, 0.2), rough=0.3,
                                      emission=(1.0, 0.82, 0.6), emission_strength=0.0)
    P["sky_beacon"] = L.material("JT_Sky_Beacon", base=(0.3, 0.02, 0.02), rough=0.4,
                                 emission=(1.0, 0.06, 0.04), emission_strength=0.0)
    P["sky_crane"] = L.material("JT_Sky_Crane", base=(0.55, 0.42, 0.12), rough=0.6)
    P["sky_land"] = L.material("JT_Sky_Land", base=(0.09, 0.10, 0.08), rough=0.95)
    P["sky_trees"] = L.material("JT_Sky_Trees", base=(0.05, 0.10, 0.05), rough=0.95)
    P["sky_water"] = L.material("JT_Water", base=(0.05, 0.12, 0.18), rough=0.08, metal=0.0)


# ====================================================================== cameras
def camera(name, col, loc, target, lens=32):
    cam = bpy.data.cameras.new(name)
    cam.lens = lens
    cam.sensor_width = 36
    cam.clip_start = 0.02
    cam.clip_end = 800
    ob = bpy.data.objects.new(name, cam)
    col.objects.link(ob)
    ob.location = loc
    d = Vector(target) - Vector(loc)
    ob.rotation_euler = d.to_track_quat("-Z", "Y").to_euler()
    ob["jt_target"] = list(target)
    return ob


def build_cameras(col):
    tt = Vector(TT_LOC)
    camera("JT_Cam_Home", col, (-0.135, -0.66, 1.04), (0.124, 0.306, 0.809), 26)
    camera("JT_Cam_Platter", col, (tt.x - 0.06, tt.y - 0.12, tt.z + 0.62), (tt.x - 0.06, tt.y + 0.02, tt.z), 35)
    camera("JT_Cam_Map", col, (MAP_AT[0], MAP_AT[1] - 1.20, 1.62), (MAP_AT[0], MAP_AT[1] + 0.08, 0.80), 28)
    camera("JT_Cam_Cabinet", col, (-0.55, 0.35, 1.22), (-1.05, CAB_Y, 0.78), 30)


# ====================================================================== export
def select_tree(cols):
    bpy.ops.object.select_all(action="DESELECT")
    for c in cols:
        for o in c.all_objects:
            o.select_set(True)


def export(cols, name, cameras=False):
    select_tree(cols)
    path = os.path.join(EXP, name + ".glb")
    bpy.ops.export_scene.gltf(filepath=path, export_format="GLB", use_selection=True, export_apply=True,
                              export_yup=True, export_cameras=cameras, export_lights=False, export_extras=True,
                              export_morph=True, export_morph_normal=True, export_image_format="JPEG",
                              export_jpeg_quality=90, export_animations=False)
    print("EXPORTED", path, os.path.getsize(path) // 1024, "KB")


def main():
    L.reset_scene()
    P = L.palette()
    sky_palette(P)
    sc = bpy.context.scene.collection
    c_tt = L.collection("JT_Turntable")
    c_cab = L.collection("JT_Cabinet")
    c_wh = L.collection("JT_Whiskey")
    c_room = L.collection("JT_Room")
    c_sky = L.collection("JT_Skyline")
    c_player = L.collection("JT_Player")
    c_map = L.collection("JT_MapStation")

    root = TT.build(c_tt, P)
    root.location = TT_LOC
    root.rotation_euler.z = math.radians(TT_ROT)
    build_room(c_room, P)
    build_curtains(c_room, P)
    build_lamp(c_room, P)
    build_loose(c_room, P)
    build_cameras(c_room)
    build_cabinet(c_cab, P)
    build_whiskey(c_wh, P)
    build_skyline(c_sky, P)
    PL.build(c_player, P)
    MAP.build(c_map, P, MAP_AT)

    os.makedirs(SRC, exist_ok=True)
    os.makedirs(EXP, exist_ok=True)
    bpy.context.view_layer.update()
    bpy.ops.wm.save_as_mainfile(filepath=os.path.join(SRC, "JT_Home.blend"))
    export([c_tt], "JT_Turntable")
    export([c_cab], "JT_Cabinet")
    export([c_wh], "JT_Whiskey")
    export([c_room], "JT_Room", cameras=True)
    export([c_sky], "JT_Skyline")
    export([c_player], "JT_Player")
    export([c_map], "JT_MapStation")

    # polygon report
    report = []
    dg = bpy.context.evaluated_depsgraph_get()
    for c in (c_tt, c_cab, c_wh, c_room, c_sky, c_player, c_map):
        tris = 0
        for o in c.all_objects:
            if o.type == "MESH":
                tris += sum(len(p.vertices) - 2 for p in o.data.polygons)
        report.append(f"{c.name}: {tris:,} triangles")
    with open(os.path.join(EXP, "polygon_report.txt"), "w") as f:
        f.write("\n".join(report) + "\n")
    print("\n".join(report))
    print("BUILD DONE")


main()
