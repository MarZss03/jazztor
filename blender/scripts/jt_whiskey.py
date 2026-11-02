"""A04 / 28 (visual upgrade v1) — whiskey display after the supplied reference (assets/materials/source/whiskey-set-reference.png).

Square cut-crystal decanter with faceted gem stopper, diamond-cut rocks glass with a brass rim, amber whiskey
(transmission + volume absorption at runtime), frosted ice sphere, black-marble display base with a brass band.
Glass has real thickness (outer + inner walls). Every part is a separate mesh; JT_Whiskey_Rig rotates the top.
"""
import math
import random
import bmesh
from mathutils import Vector, noise
import jt_lib as L

RING = 64


def superellipse(hw, p, n=RING, rot=0.0):
    pts = []
    for i in range(n):
        a = 2 * math.pi * i / n + rot
        c, s = math.cos(a), math.sin(a)
        r = hw / (abs(c) ** p + abs(s) ** p) ** (1 / p)
        pts.append((r * c, r * s))
    return pts


def loft_bm(sections, cap_bottom=True, cap_top=False, diamond=None):
    """sections: [(z, hw, p)] lofted with superellipse rings. diamond=(z0, z1, depth, rows) carves facets."""
    bm = bmesh.new()
    rings = []
    for k, (z, hw, p) in enumerate(sections):
        ring = []
        for i, (x, y) in enumerate(superellipse(hw, p)):
            if diamond and diamond[0] <= z <= diamond[1] and (i + k) % 2 == 0:
                f = 1 - diamond[2] / hw
                x, y = x * f, y * f
            ring.append(bm.verts.new((x, y, z)))
        rings.append(ring)
    for a, b in zip(rings, rings[1:]):
        for i in range(RING):
            j = (i + 1) % RING
            bm.faces.new([a[i], a[j], b[j], b[i]])
    if cap_bottom:
        bm.faces.new(list(reversed(rings[0])))
    if cap_top:
        bm.faces.new(rings[-1])
    bm.normal_update()
    return bm, rings


def shell_bm(outer, inner, diamond=None):
    """Glass with thickness: outer wall (normals out) + inner wall (normals in) joined at the lip."""
    bm, orings = loft_bm(outer, cap_bottom=True, diamond=diamond)
    irings = []
    for z, hw, p in inner:
        irings.append([bm.verts.new((x, y, z)) for x, y in superellipse(hw, p)])
    for a, b in zip(irings, irings[1:]):
        for i in range(RING):
            j = (i + 1) % RING
            bm.faces.new([b[i], b[j], a[j], a[i]])          # reversed winding: faces point into the vessel
    bm.faces.new(irings[0])                                 # inner floor (faces up)
    top_o, top_i = orings[-1], irings[-1]
    for i in range(RING):
        j = (i + 1) % RING
        bm.faces.new([top_o[i], top_o[j], top_i[j], top_i[i]])
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    return bm


def diamond_rows(z0, z1, hw, p, rows):
    return [(z0 + (z1 - z0) * i / rows, hw, p) for i in range(rows + 1)]


def build(col, P, at, console_top):
    at = Vector((at[0], at[1], console_top))
    M = {
        "crystal": P["crystal"], "whiskey": P["whiskey"], "brass": P["brass_polished"], "marble": P["marble"],
        "ice": L.material("JT_Ice_Frosted", tex="JT_Ice_BaseColor", orm="JT_Ice_ORM", normal="JT_Ice_Normal", rough=0.3,
                          normal_strength=0.6),
        "caustic": L.material("JT_Whiskey_Caustic", tex="JT_Whiskey_Caustic", rough=1.0),
    }
    # ---- display base: black marble with a polished brass band; the top disc turns
    base_r = 0.150
    base = L.lathe("JT_Whiskey_Pedestal", col, [(0, 0), (base_r - 0.003, 0), (base_r, 0.003), (base_r, 0.017),
                                                (base_r - 0.002, 0.019), (0, 0.019)], M["marble"], 128, at)
    band = L.lathe("JT_Whiskey_PedestalBand", col, [(base_r - 0.0005, 0.0185), (base_r + 0.0015, 0.0185),
                                                    (base_r + 0.0015, 0.0245), (base_r - 0.0005, 0.0245),
                                                    (base_r - 0.0005, 0.0185)], M["brass"], 128, at)
    rig = L.empty("JT_Whiskey_Rig", col, at + Vector((0, 0, 0.0245)), size=0.03)
    top = L.lathe("JT_Whiskey_Turntable", col, [(0, 0), (base_r - 0.004, 0), (base_r - 0.005, 0.006), (0, 0.006)],
                  M["marble"], 128, at + Vector((0, 0, 0.0245)))
    surface = at + Vector((0, 0, 0.0305))
    parts = [top]

    # ---- decanter: square body (superellipse p=8) flowing into a round neck, diamond-cut foot band
    dpos = surface + Vector((-0.050, 0.040, 0))
    outer = diamond_rows(0.0, 0.032, 0.0425, 8, 5) + [
        (0.036, 0.0425, 8), (0.128, 0.0425, 8), (0.140, 0.0405, 7), (0.152, 0.033, 4.5), (0.160, 0.024, 3),
        (0.166, 0.0165, 2.2), (0.188, 0.0150, 2), (0.193, 0.0190, 2), (0.199, 0.0185, 2)]
    inner = [(0.014, 0.0380, 8), (0.126, 0.0380, 8), (0.138, 0.0362, 7), (0.150, 0.0295, 4.5), (0.159, 0.0205, 3),
             (0.166, 0.0125, 2.2), (0.188, 0.0113, 2), (0.199, 0.0140, 2)]
    dec = L.obj_from_bm("JT_Whiskey_Bottle", shell_bm(outer, inner, diamond=(0.0, 0.032, 0.0040, 5)), col,
                        M["crystal"], 25)
    dec.location = dpos
    fill = 0.098
    lq_sections = [(0.0145, 0.0376, 8), (fill - 0.0012, 0.0376, 8), (fill, 0.0368, 8)]
    lq_bm, _ = loft_bm(lq_sections, cap_bottom=True, cap_top=True)
    dliq = L.obj_from_bm("JT_Whiskey_BottleLiquid", lq_bm, col, M["whiskey"], 40)
    dliq.location = dpos
    # faceted gem stopper: 8-sided rings rotated half a step on alternate rows -> diamond facets
    st = bmesh.new()
    prof = [(0.0, 0.0105, 0), (0.016, 0.0115, 0), (0.019, 0.0200, 0), (0.026, 0.0215, 0), (0.036, 0.0330, 0.5),
            (0.048, 0.0345, 0), (0.060, 0.0300, 0.5), (0.068, 0.0190, 0)]
    srings = []
    for z, r, rot in prof:
        srings.append([st.verts.new((r * math.cos(2 * math.pi * (i + rot) / 8), r * math.sin(2 * math.pi * (i + rot) / 8), z))
                       for i in range(8)])
    for a, b in zip(srings, srings[1:]):
        for i in range(8):
            j = (i + 1) % 8
            st.faces.new([a[i], a[j], b[j]])
            st.faces.new([a[i], b[j], b[i]])
    st.faces.new(list(reversed(srings[0])))
    st.faces.new(srings[-1])
    bmesh.ops.recalc_face_normals(st, faces=st.faces)
    stopper = L.obj_from_bm("JT_Whiskey_Stopper", st, col, M["crystal"], 10)
    stopper.location = dpos + Vector((0, 0, 0.183))
    parts += [dec, dliq, stopper]

    # ---- rocks glass: diamond-cut lower band, thick base, brass rim
    gpos = surface + Vector((0.062, -0.034, 0))
    g_outer = diamond_rows(0.0, 0.042, 0.0420, 2, 7) + [(0.046, 0.0421, 2), (0.088, 0.0428, 2)]
    g_inner = [(0.016, 0.0376, 2), (0.088, 0.0392, 2)]
    glass = L.obj_from_bm("JT_Whiskey_Tumbler", shell_bm(g_outer, g_inner, diamond=(0.0, 0.042, 0.0040, 7)), col,
                          M["crystal"], 25)
    glass.location = gpos
    rim = L.lathe("JT_Whiskey_TumblerRim", col, [(0.0390, 0.0868), (0.0431, 0.0868), (0.0433, 0.0890), (0.0390, 0.0890),
                                                 (0.0390, 0.0868)], M["brass"], 96, gpos)
    liq_top = 0.050
    lq_bm2, lr = loft_bm([(0.0165, 0.0372, 2), (liq_top - 0.0016, 0.0380, 2), (liq_top, 0.0383, 2)], cap_bottom=True)
    # meniscus: the surface climbs 1.2 mm where it meets the wall
    centre = lq_bm2.verts.new((0, 0, liq_top - 0.0012))
    for i in range(RING):
        j = (i + 1) % RING
        lq_bm2.faces.new([lr[-1][i], lr[-1][j], centre])
    bmesh.ops.recalc_face_normals(lq_bm2, faces=lq_bm2.faces)
    liquid = L.obj_from_bm("JT_Whiskey_Liquid", lq_bm2, col, M["whiskey"], 40)
    liquid.location = gpos
    # ice sphere: slightly melted, irregular
    ib = bmesh.new()
    bmesh.ops.create_uvsphere(ib, u_segments=64, v_segments=40, radius=0.0282, calc_uvs=True)
    for v in ib.verts:
        n = noise.noise(v.co * 60.0)
        v.co *= 1 + 0.025 * n - 0.02 * max(0.0, v.co.z / 0.0282) ** 3      # flatter, melted crown
    ice = L.obj_from_bm("JT_Whiskey_IceSphere", ib, col, M["ice"], 180)
    ice.location = gpos + Vector((0.003, -0.002, liq_top + 0.004))
    # caustic decal on the turntable behind the glass (additive at runtime)
    cb = bmesh.new()
    bmesh.ops.create_circle(cb, cap_ends=True, radius=0.075, segments=48)
    uvl = cb.loops.layers.uv.verify()
    for f in cb.faces:
        for l in f.loops:
            l[uvl].uv = (l.vert.co.x / 0.15 + 0.5, l.vert.co.y / 0.15 + 0.5)
    caustic = L.obj_from_bm("JT_Whiskey_Caustic", cb, col, M["caustic"], None)
    caustic.location = gpos + Vector((0.0, 0.045, 0.0004))
    parts += [glass, rim, liquid, ice, caustic]

    for o in parts:
        L.set_parent(o, rig)
    L.collider("Whiskey", col, (0.32, 0.32, 0.24), at + Vector((0, 0, 0.12)))
    return [base, band, rig]
