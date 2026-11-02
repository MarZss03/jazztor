"""Legendary jazz instruments for the museum vestibule and the listening room (procedural, real size, PBR).

blender -b --factory-startup --python jt_instruments.py
Writes blender/exports/JT_Instruments.glb (LOD0) and lod1/, lod2/ (rebuilt with fewer segments, smaller textures - the
tubes stay round, which decimation does not guarantee). One root per instrument, origin at the centre of its footprint
on the display surface, long axis along +X, the side a visitor sees facing -Y:

  JT_Inst_Miles      Martin Committee "Moon and Stars" trumpet, c. 1980: black lacquer, gold-plated hardware, gilt
                     crescent moons and stars on the bell (decoration after the reference, not a copy of the engraving)
  JT_Inst_Armstrong  Selmer Model 19 Balanced Action trumpet, 1948: gold plate worn to the brass where hands rest
  JT_Inst_Gillespie  King "Silver Flair" trumpet, 1977: silver plate, the bell bent up ~45 deg as part of the tubing
  JT_Inst_Coltrane   1966 prototype Yamaha alto saxophone: aged lacquered brass, pearloid key touches
  JT_Inst_Parker     Grafton acrylic alto saxophone (1953 Massey Hall): ivory acrylic body, brass keywork

The reference sheets in assets/museum/legendary-jazz-instruments-2026-10-21 are AI concept art: used for proportions
and finish only. No maker's engraving, serial number or inscription is modelled.
"""
import math
import os
import sys

import bmesh
import bpy
import numpy as np
from mathutils import Matrix, Vector

sys.path.append(os.path.dirname(__file__))
import jt_lib as L  # noqa: E402

EXP = "D:/Jazztor/blender/exports"
TEXD = L.TEX
LEVELS = {"": (1.0, 1024), "lod1": (0.6, 1024), "lod2": (0.38, 512)}


# ------------------------------------------------------------------ procedural textures (numpy -> PNG in blender/textures)
def noise(n, scale, seed, octaves=4):
    """tileable value noise in 0..1"""
    rng = np.random.default_rng(seed)
    out = np.zeros((n, n))
    amp, tot = 1.0, 0.0
    for o in range(octaves):
        g = max(2, int(scale * 2 ** o))
        grid = rng.random((g, g))
        xs = np.linspace(0, g, n, endpoint=False)
        i0 = xs.astype(int) % g
        i1 = (i0 + 1) % g
        f = xs - np.floor(xs)
        f = f * f * (3 - 2 * f)
        a = grid[i0][:, i0] * (1 - f)[None, :] + grid[i0][:, i1] * f[None, :]
        b = grid[i1][:, i0] * (1 - f)[None, :] + grid[i1][:, i1] * f[None, :]
        out += amp * (a * (1 - f)[:, None] + b * f[:, None])
        tot += amp
        amp *= 0.5
    return out / tot


def save_png(name, rgb, size):
    """rgb: HxWx3 floats 0..1 (sRGB for colour maps, linear for ORM). Saved at `size`."""
    h, w = rgb.shape[:2]
    if (h, w) != (size, size):
        ys = (np.arange(size) * h / size).astype(int)
        xs = (np.arange(size) * w / size).astype(int)
        rgb = rgb[ys][:, xs]
    img = bpy.data.images.get(name) or bpy.data.images.new(name, size, size, alpha=False)
    if img.size[0] != size:
        img.scale(size, size)
    px = np.ones((size, size, 4), dtype=np.float32)
    px[:, :, :3] = np.clip(rgb[::-1], 0, 1)  # Blender images are bottom-up
    img.pixels.foreach_set(px.ravel())
    img.filepath_raw = f"{TEXD}/{name}.png"
    img.file_format = "PNG"
    img.save()
    bpy.data.images.remove(img)


def textures(size):
    """finish maps for each instrument: colour + ORM (R occlusion 1, G roughness, B metalness)."""
    n = 1024
    one = np.ones((n, n))

    def orm(rough, metal):
        return np.dstack([one, rough, metal])

    # Miles: black lacquer bell with gilt crescent moons and stars (lathe UV: u around the bell, v along its profile)
    col = np.zeros((n, n, 3)) + np.array([0.035, 0.035, 0.04])
    mask = np.zeros((n, n))
    yy, xx = np.mgrid[0:n, 0:n] / n          # yy = v (0 = tube end, 1 = rim), xx = u (around)

    def star(cx, cy, r, ar=1.0):
        dx, dy = (xx - cx) * ar, yy - cy
        ang = np.arctan2(dy, dx)
        rad = np.hypot(dx, dy)
        k = 0.5 + 0.5 * np.cos(5 * (ang + math.pi / 2))
        return rad < r * (0.42 + 0.58 * k ** 2.2)

    rng = np.random.default_rng(7)
    for side in (0.25, 0.75):                 # both faces of the bell
        # crescent: a disc minus an offset disc
        cx, cy, r = side, 0.55, 0.075
        d0 = np.hypot((xx - cx) * 2.6, yy - cy) < r
        d1 = np.hypot((xx - cx - 0.012) * 2.6, yy - cy + 0.018) < r * 0.86
        mask[d0 & ~d1] = 1
        for _ in range(11):
            sx, sy = side + rng.uniform(-0.09, 0.09), rng.uniform(0.22, 0.86)
            if abs(sx - cx) < 0.035 and abs(sy - cy) < 0.09:
                continue
            mask[star(sx, sy, rng.uniform(0.012, 0.024), 2.6)] = 1
    gold = np.array([0.93, 0.70, 0.30])
    col = col * (1 - mask[..., None]) + gold * mask[..., None] * (0.85 + 0.15 * noise(n, 40, 3)[..., None])
    save_png("JT_Inst_MilesBell", col, size)
    save_png("JT_Inst_MilesBell_ORM", orm(0.16 + 0.14 * mask, mask), size)
    # Armstrong: gold plate, worn through to the brass in patches (hand contact areas get the most, via the noise)
    wear = np.clip((noise(n, 6, 11) - 0.58) * 6, 0, 1) * np.clip(noise(n, 24, 12) * 1.6, 0, 1)
    gold = np.array([0.98, 0.78, 0.40])
    brass = np.array([0.80, 0.58, 0.28])
    save_png("JT_Inst_ArmstrongGold", gold * (1 - wear[..., None]) + brass * wear[..., None]
             - 0.05 * noise(n, 64, 13)[..., None], size)
    save_png("JT_Inst_ArmstrongGold_ORM", orm(0.2 + 0.2 * wear + 0.06 * noise(n, 80, 14), one), size)
    # Gillespie: silver plate, light tarnish in the recesses (low-frequency), polished highs
    tarn = np.clip((noise(n, 8, 21) - 0.5) * 2.2, 0, 1)
    silver = np.array([0.93, 0.93, 0.94])
    save_png("JT_Inst_GillespieSilver", silver - tarn[..., None] * np.array([0.16, 0.18, 0.12]), size)
    save_png("JT_Inst_GillespieSilver_ORM", orm(0.12 + 0.18 * tarn, one), size)
    # Coltrane: aged lacquered brass - mottled, the lacquer worn darker in places
    mott = noise(n, 18, 31)
    save_png("JT_Inst_ColtraneBrass", np.array([0.72, 0.52, 0.25]) * (0.82 + 0.3 * mott[..., None])
             - 0.06 * np.clip((noise(n, 5, 32) - 0.55) * 4, 0, 1)[..., None], size)
    save_png("JT_Inst_ColtraneBrass_ORM", orm(0.3 + 0.16 * mott, one), size)
    # Parker: ivory acrylic with a faint cast swirl
    sw = noise(n, 10, 41)
    save_png("JT_Inst_ParkerAcrylic", np.array([0.90, 0.84, 0.70]) + 0.05 * (sw[..., None] - 0.5), size)
    # pearl / pearloid touches
    pr = noise(n, 30, 51)
    save_png("JT_Inst_Pearl", np.dstack([0.9 + 0.08 * pr, 0.88 + 0.06 * noise(n, 30, 52), 0.86 + 0.1 * noise(n, 30, 53)]), size)


def mats():
    # (with a packed ORM map the glTF factors multiply the texture: metal / rough must be 1 or the metal reads as plastic)
    M = {}
    M["miles_body"] = L.material("JT_Inst_MilesLacquer", base=(0.03, 0.03, 0.035), rough=0.14, coat=1.0, coat_rough=0.06)
    M["miles_bell"] = L.material("JT_Inst_MilesBell", tex="JT_Inst_MilesBell", orm="JT_Inst_MilesBell_ORM", metal=1.0, rough=1.0, coat=0.8, coat_rough=0.08)
    M["gold"] = L.material("JT_Inst_GoldPlate", base=(1.0, 0.77, 0.36), metal=1.0, rough=0.17)
    M["armstrong"] = L.material("JT_Inst_ArmstrongGold", tex="JT_Inst_ArmstrongGold", orm="JT_Inst_ArmstrongGold_ORM", metal=1.0, rough=1.0)
    M["gillespie"] = L.material("JT_Inst_GillespieSilver", tex="JT_Inst_GillespieSilver", orm="JT_Inst_GillespieSilver_ORM", metal=1.0, rough=1.0)
    M["coltrane"] = L.material("JT_Inst_ColtraneBrass", tex="JT_Inst_ColtraneBrass", orm="JT_Inst_ColtraneBrass_ORM", metal=1.0, rough=1.0)
    M["parker_body"] = L.material("JT_Inst_ParkerAcrylic", tex="JT_Inst_ParkerAcrylic", rough=0.3, coat=0.6, coat_rough=0.12)
    M["parker_keys"] = L.material("JT_Inst_ParkerKeys", base=(0.82, 0.62, 0.30), metal=1.0, rough=0.3)
    M["pearl"] = L.material("JT_Inst_Pearl", tex="JT_Inst_Pearl", rough=0.18, coat=0.7, coat_rough=0.05)
    M["ebonite"] = L.material("JT_Inst_Ebonite", base=(0.015, 0.015, 0.015), rough=0.28, coat=0.5, coat_rough=0.1)
    M["cork"] = L.material("JT_Inst_Cork", base=(0.55, 0.40, 0.25), rough=0.85)
    M["pad"] = L.material("JT_Inst_Pad", base=(0.32, 0.12, 0.06), rough=0.7)
    M["felt"] = L.material("JT_Inst_Felt", base=(0.05, 0.05, 0.05), rough=0.95)
    return M


# ------------------------------------------------------------------ geometry helpers
def sweep(name, col, pts, radii, mat, sides=20, caps=True):
    """circle swept along a polyline with a radius per point (tapered tubes: sax body, bells); parallel transport."""
    bm = bmesh.new()
    uvl = bm.loops.layers.uv.verify()
    pts = [Vector(p) for p in pts]
    tang = [(pts[min(i + 1, len(pts) - 1)] - pts[max(i - 1, 0)]).normalized() for i in range(len(pts))]
    nrm = tang[0].cross(Vector((0, 0, 1)))
    if nrm.length < 1e-6:
        nrm = tang[0].cross(Vector((1, 0, 0)))
    nrm.normalize()
    rings, length = [], [0.0]
    for i in range(1, len(pts)):
        length.append(length[-1] + (pts[i] - pts[i - 1]).length)
    for i, p in enumerate(pts):
        if i:
            ax = tang[i - 1].cross(tang[i])
            if ax.length > 1e-9:
                nrm = Matrix.Rotation(tang[i - 1].angle(tang[i]), 3, ax.normalized()) @ nrm
        bino = tang[i].cross(nrm).normalized()
        rings.append([bm.verts.new(p + (nrm * math.cos(2 * math.pi * j / sides) + bino * math.sin(2 * math.pi * j / sides)) * radii[i])
                      for j in range(sides)])
    for i in range(len(rings) - 1):
        for j in range(sides):
            j1 = (j + 1) % sides
            f = bm.faces.new([rings[i][j], rings[i][j1], rings[i + 1][j1], rings[i + 1][j]])
            for lp, (u, v) in zip(f.loops, [(j / sides, length[i]), ((j + 1) / sides, length[i]), ((j + 1) / sides, length[i + 1]), (j / sides, length[i + 1])]):
                lp[uvl].uv = (u, v * 4)
    if caps:
        for ring in (list(reversed(rings[0])), rings[-1]):
            f = bm.faces.new(ring)
            for lp in f.loops:
                lp[uvl].uv = (0.5, 0.5)
    bm.normal_update()
    return L.obj_from_bm(name, bm, col, mat, 50.0)


def smooth(pts, samples):
    return [tuple(p) for p in L.catmull(pts, samples)]


def lathe_at(name, col, profile, mat, seg, origin, direction):
    """lathe about its local Z, then turned so Z points along `direction` and placed at `origin`."""
    ob = L.lathe(name, col, profile, mat, seg)
    q = Vector((0, 0, 1)).rotation_difference(Vector(direction).normalized())
    ob.rotation_mode = "QUATERNION"
    ob.rotation_quaternion = q
    ob.location = origin
    return ob


def disc_at(name, col, r, t, mat, seg, origin, direction):
    return lathe_at(name, col, [(0, 0), (r, 0), (r, t), (0, t)], mat, seg, origin, direction)


def bell(name, col, origin, direction, length, r0, r1, outer, inner, seg, rim):
    """flared bell: an outer surface and an inner one (a hair smaller, different finish for a lacquered horn),
    both double-sided in the export; a rolled bead at the rim."""
    zs = [0, 0.3, 0.55, 0.72, 0.83, 0.91, 0.96, 1.0]
    rs = [0, 0.06, 0.15, 0.27, 0.42, 0.6, 0.8, 1.0]
    prof = [(r0 + (r1 - r0) * r ** 1.0, length * z) for z, r in zip(zs, rs)]
    o = lathe_at(name + "Out", col, prof, outer, seg, origin, direction)
    i = lathe_at(name + "In", col, [(max(0.001, r - 0.0009), z) for r, z in prof], inner, seg, origin, direction)
    d = Vector(direction).normalized()
    b = lathe_at(name + "Bead", col, [(r1 - 0.002, 0), (r1 + 0.0022, 0.0004), (r1 + 0.0025, 0.0028), (r1 - 0.002, 0.0032)], rim, seg,
                 Vector(origin) + d * (length - 0.002), direction)
    for ob in (o, i):
        for m in ob.data.materials:
            m.use_backface_culling = False
    return [o, i, b]


# ------------------------------------------------------------------ trumpet
def trumpet(root, col, M, q, body, bell_out, bell_in, hw, slides, bent=False):
    """Bb trumpet, ~0.5 m: mouthpiece at x 0, bell rim forward (+x); valves up (+z); the visitor's side is -y.
    body = tubing finish, hw = hardware (valve casings' rings, caps, slides' crooks), slides = slide tubes."""
    S = max(10, int(22 * q))
    R = 0.0058
    o = []
    # mouthpiece (cup at the back) into the receiver
    o.append(lathe_at("Mouthpiece", col, [(0, 0.012), (0.0075, 0.0), (0.0135, 0.0015), (0.014, 0.006), (0.0115, 0.016), (0.0072, 0.032),
                                          (0.0057, 0.06), (0.0052, 0.085), (0, 0.086)], hw, int(40 * q), (0.0, 0.022, -0.008), (1, 0, 0)))
    o.append(lathe_at("Receiver", col, [(0.0066, 0), (0.0066, 0.035), (0.0062, 0.036)], hw, S, (0.082, 0.022, -0.008), (1, 0, 0)))
    # leadpipe -> front tuning crook -> lower tube into the third valve
    lead = smooth([(0.115, 0.022, -0.008), (0.25, 0.022, -0.008), (0.39, 0.022, -0.009), (0.418, 0.017, -0.022), (0.42, 0.008, -0.05),
                   (0.405, 0.0, -0.071), (0.36, 0.0, -0.074), (0.282, 0.0, -0.072)], 6)
    o.append(sweep("Leadpipe", col, lead, [R * 0.92] + [R] * (len(lead) - 1), body, S))
    o.append(sweep("TuningCrook", col, smooth([(0.402, 0.02, -0.012), (0.42, 0.012, -0.035), (0.414, 0.004, -0.06), (0.398, 0.0, -0.072)], 5),
                   [R * 1.12] * 16, hw, S))
    # valve block: casings, rings, caps, stems, pearl-topped buttons, bottom caps
    for k, x in enumerate((0.215, 0.243, 0.271)):
        o.append(L.cylinder(f"Casing{k}", col, 0.0088, 0.11, (x, 0, -0.075), body, S))
        for z in (-0.077, -0.03, 0.033):
            o.append(L.cylinder(f"Ring{k}{z}", col, 0.0096, 0.006, (x, 0, z), hw, S))
        o.append(L.cylinder(f"TopCap{k}", col, 0.0098, 0.009, (x, 0, 0.037), hw, S))
        o.append(L.cylinder(f"BotCap{k}", col, 0.0096, 0.01, (x, 0, -0.088), hw, S))
        o.append(L.cylinder(f"Stem{k}", col, 0.0022, 0.028, (x, 0, 0.046), hw, max(8, S // 2)))
        o.append(L.cylinder(f"Button{k}", col, 0.0085, 0.006, (x, 0, 0.073), hw, S))
        o.append(L.cylinder(f"Pearl{k}", col, 0.0072, 0.0016, (x, 0, 0.0788), M["pearl"], S))
    # back: from the first valve to the rear bow, up and over into the bell tube (the bell tube passes the visitor's side)
    rear = smooth([(0.205, 0.0, -0.046), (0.13, 0.0, -0.046), (0.098, -0.003, -0.044), (0.075, -0.011, -0.022), (0.078, -0.019, 0.004),
                   (0.1, -0.022, 0.016), (0.14, -0.022, 0.017)], 6)
    o.append(sweep("RearBow", col, rear, [R] * len(rear), body, S))
    if not bent:
        tube = [(0.14, -0.022, 0.017), (0.25, -0.022, 0.017), (0.31, -0.022, 0.017)]
        o.append(sweep("BellTube", col, tube, [R, R * 1.08, R * 1.2], body, S))
        o += bell("Bell", col, Vector((0.305, -0.022, 0.017)), (1, 0, 0), 0.225, R * 1.2, 0.061, bell_out, bell_in, int(56 * q), hw)
    else:
        # Dizzy's horn: the bell section turns up ~45 deg after the valve block - one continuous run of tubing
        bend = smooth([(0.14, -0.022, 0.017), (0.24, -0.022, 0.017), (0.275, -0.022, 0.02), (0.3, -0.022, 0.033), (0.322, -0.022, 0.052)], 6)
        o.append(sweep("BellTube", col, bend, [R + (R * 0.25) * i / (len(bend) - 1) for i in range(len(bend))], body, S))
        d = Vector((1, 0, 1)).normalized()
        o += bell("Bell", col, Vector((0.319, -0.022, 0.049)), tuple(d), 0.215, R * 1.25, 0.059, bell_out, bell_in, int(56 * q), hw)
    # valve slides (crooks below the block) and their tubes
    for nm, pts in (("Slide1", [(0.222, 0, -0.088), (0.222, 0, -0.1), (0.17, 0, -0.1), (0.152, 0, -0.112), (0.17, 0, -0.124), (0.207, 0, -0.124), (0.207, 0, -0.092)]),
                    ("Slide2", [(0.236, 0, -0.092), (0.236, 0, -0.108), (0.243, 0, -0.114), (0.25, 0, -0.108), (0.25, 0, -0.092)]),
                    ("Slide3", [(0.264, 0, -0.092), (0.264, 0, -0.1), (0.322, 0, -0.1), (0.338, 0, -0.112), (0.322, 0, -0.124), (0.278, 0, -0.124), (0.278, 0, -0.092)])):
        o.append(sweep(nm, col, smooth(pts, 4), [R * 0.82] * (4 * (len(pts) - 1) + 1), slides, max(8, S - 4)))
    # third-slide ring and the little finger hook on the leadpipe; braces between the pipes
    ring = [(0.33 + 0.009 * math.cos(a), -0.008, -0.112 + 0.009 * math.sin(a)) for a in np.linspace(0, 2 * math.pi, 17)]
    o.append(sweep("SlideRing", col, ring, [0.0016] * len(ring), hw, 8, caps=False))
    hook = [(0.3, 0.024, -0.002), (0.3, 0.025, 0.012), (0.306, 0.026, 0.02), (0.314, 0.025, 0.016)]
    o.append(sweep("FingerHook", col, smooth(hook, 4), [0.0017] * 13, hw, 8))
    for x in (0.16, 0.36):
        o.append(sweep(f"Brace{x}", col, [(x, 0.022, -0.008), (x, -0.022, 0.017)], [0.0021, 0.0021], hw, 8))
    for ob in o:
        L.set_parent(ob, root)
    return o


# ------------------------------------------------------------------ alto saxophone
def alto(root, col, M, q, body, keys, touch):
    """Eb alto, ~0.62 m tall standing; built upright (bell up), the keys facing -y (the visitor), then laid on its
    back for the display (see build)."""
    S = max(12, int(28 * q))
    o = []
    # body centre line: neck (mouthpiece end, up-left) -> body tube down -> bow -> bell section up
    neck = [(-0.105, 0, 0.655), (-0.075, 0, 0.664), (-0.042, 0, 0.652), (-0.018, 0, 0.622), (-0.004, 0, 0.585), (0.0, 0, 0.55)]
    tubepts = [(0.0, 0, 0.55 - 0.38 * t) for t in np.linspace(0, 1, 9)][1:]
    bow = [(0.065 - 0.065 * math.cos(a), 0, 0.17 - 0.068 * math.sin(a)) for a in np.linspace(0, math.pi, 13)][1:]
    up = [(0.132 + 0.004 * t, 0, 0.17 + 0.17 * t) for t in np.linspace(0, 1, 6)][1:]
    path = neck + tubepts + bow + up
    radii = []
    for p in path:
        z = p[2]
        if p[0] < 0:           # neck: 7.5 -> 11 mm
            radii.append(0.0075 + 0.0035 * (z - 0.655) / (0.55 - 0.655) if z < 0.655 else 0.0075)
        elif p[0] < 0.01 and z >= 0.17:   # body tube 13 -> 30 mm
            radii.append(0.011 + 0.019 * (0.55 - z) / 0.38)
        elif z < 0.17:                    # bow
            radii.append(0.031 + 0.004 * (p[0] / 0.13))
        else:                             # bell section
            radii.append(0.036 + 0.01 * (z - 0.17) / 0.17)
    o.append(sweep("Body", col, smooth(path, 3), [radii[0]] + list(np.interp(np.linspace(0, len(radii) - 1, 3 * (len(path) - 1) + 1)[1:],
                                                                               np.arange(len(radii)), radii)), body, S))
    o += bell("Bell", col, Vector((0.136, 0, 0.338)), (0.12, -0.18, 1.0), 0.07, 0.046, 0.066, body, body, int(64 * q), keys)
    # body rings (bell ring, bow guard band)
    for z, r in ((0.305, 0.0475), (0.17, 0.0315)):
        o.append(lathe_at(f"Band{z}", col, [(r, 0), (r + 0.002, 0.001), (r + 0.002, 0.007), (r, 0.008)], keys, S,
                          (0.134 if z > 0.2 else 0.0, 0, z), (0, 0, 1)))
    # mouthpiece, ligature, cork
    tip = Vector(neck[0])
    dirn = (Vector(neck[0]) - Vector(neck[1])).normalized()
    o.append(lathe_at("Cork", col, [(0.0078, 0), (0.0082, 0.002), (0.0082, 0.024), (0.0078, 0.026)], M["cork"], S, tip - dirn * 0.02, tuple(dirn)))
    o.append(lathe_at("Mouthpiece", col, [(0.0105, 0), (0.0115, 0.01), (0.0108, 0.05), (0.0085, 0.07), (0.004, 0.082), (0, 0.083)],
                      M["ebonite"], S, tip, tuple(dirn)))
    o.append(lathe_at("Ligature", col, [(0.0122, 0), (0.0122, 0.012)], keys, S, tip + dirn * 0.012, tuple(dirn)))
    o.append(sweep("OctaveKey", col, smooth([(-0.02, -0.006, 0.63), (-0.045, -0.01, 0.655), (-0.07, -0.011, 0.668)], 4), [0.0016] * 9, keys, 8))

    # keywork on the front (-y): tone-hole cups up the body, pearl touches for the six main fingers, two long rods with
    # pillars, the palm keys high, the bell keys low (believable layout after the reference, not a key-by-key copy)
    def body_r(z):
        return 0.011 + 0.019 * (0.55 - z) / 0.38

    cups = [(0.52, -0.006, 0.0075), (0.49, 0.008, 0.008), (0.465, -0.004, 0.0095), (0.44, 0.006, 0.0105), (0.415, -0.003, 0.0112),
            (0.385, 0.007, 0.012), (0.355, -0.004, 0.0128), (0.33, 0.006, 0.0135), (0.3, -0.003, 0.0145), (0.27, 0.007, 0.0155),
            (0.245, -0.004, 0.016), (0.215, 0.006, 0.0168), (0.19, -0.002, 0.0172)]
    for i, (z, dx, r) in enumerate(cups):
        y = -(body_r(z) + 0.003)
        o.append(disc_at(f"Pad{i}", col, r * 0.96, 0.002, M["pad"], S, (dx, y + 0.001, z), (0, -1, 0)))
        o.append(lathe_at(f"Cup{i}", col, [(0, 0.004), (r, 0.0035), (r + 0.0012, 0.0005), (r + 0.0006, 0)], keys, S, (dx, y, z), (0, -1, 0)))
        o.append(sweep(f"Arm{i}", col, [(dx, y - 0.003, z), (0.018 if dx < 0.002 else -0.018, -body_r(z) + 0.002, z)], [0.0014, 0.0014], keys, 6))
    for i, z in enumerate((0.47, 0.435, 0.40, 0.31, 0.275, 0.24)):
        y = -(body_r(z) + 0.013)
        o.append(disc_at(f"Touch{i}", col, 0.0068, 0.0022, touch, S, (0.0, y, z), (0, -1, 0)))
        o.append(disc_at(f"TouchCup{i}", col, 0.0078, 0.0016, keys, S, (0.0, y + 0.0018, z), (0, -1, 0)))
    for sx in (-1, 1):
        rod = [(sx * 0.018, -body_r(z) + 0.002, z) for z in np.linspace(0.18, 0.53, 8)]
        o.append(sweep(f"Rod{sx}", col, rod, [0.0019] * len(rod), keys, 6))
        for z in np.linspace(0.2, 0.5, 5):
            o.append(sweep(f"Pillar{sx}{z:.2f}", col, [(sx * 0.018, -body_r(z) + 0.002, z), (sx * 0.012, -body_r(z) * 0.6, z)], [0.0022, 0.0022], keys, 6))
    # palm keys (left hand, high on the side) and the side keys
    for i, z in enumerate((0.545, 0.53, 0.512)):
        o.append(sweep(f"Palm{i}", col, smooth([(-0.012, -0.008, z - 0.03), (-0.024, -0.012, z - 0.012), (-0.026, -0.014, z)], 4), [0.0035] * 9, keys, 8))
    # bell keys: large cups on the bow and the bell section, a key guard
    for i, (x, z, r) in enumerate(((0.12, 0.215, 0.02), (0.128, 0.26, 0.021), (0.03, 0.12, 0.019))):
        o.append(disc_at(f"BellPad{i}", col, r * 0.95, 0.002, M["pad"], S, (x, -0.04, z), (0, -1, 0)))
        o.append(lathe_at(f"BellCup{i}", col, [(0, 0.005), (r, 0.0045), (r + 0.0014, 0.0006), (r + 0.0008, 0)], keys, S, (x, -0.041, z), (0, -1, 0)))
    guard = smooth([(0.1, -0.035, 0.19), (0.098, -0.07, 0.205), (0.1, -0.072, 0.26), (0.11, -0.04, 0.29)], 5)
    o.append(sweep("KeyGuard", col, guard, [0.0016] * len(guard), keys, 6))
    # thumb rest + strap ring on the back
    o.append(disc_at("ThumbRest", col, 0.007, 0.004, keys, 12, (0.0, body_r(0.33) + 0.002, 0.33), (0, 1, 0)))
    ring = [(0.0, body_r(0.45) + 0.004 + 0.005 * math.cos(a), 0.45 + 0.005 * math.sin(a)) for a in np.linspace(0, 2 * math.pi, 13)]
    o.append(sweep("StrapRing", col, ring, [0.0012] * len(ring), keys, 6, caps=False))
    for ob in o:
        L.set_parent(ob, root)
    return o


# ------------------------------------------------------------------ build + export
def build(q):
    L.reset_scene()
    col = L.collection("JT_Instruments")
    M = mats()
    roots = {}

    def root(name):
        r = L.empty(name, col, (0, 0, 0), size=0.05)
        roots[name] = r
        return r

    trumpet(root("JT_Inst_Miles"), col, M, q, M["miles_body"], M["miles_bell"], M["gold"], M["gold"], M["miles_body"])
    trumpet(root("JT_Inst_Armstrong"), col, M, q, M["armstrong"], M["armstrong"], M["armstrong"], M["armstrong"], M["armstrong"])
    trumpet(root("JT_Inst_Gillespie"), col, M, q, M["gillespie"], M["gillespie"], M["gillespie"], M["gillespie"], M["gillespie"], bent=True)
    alto(root("JT_Inst_Coltrane"), col, M, q, M["coltrane"], M["coltrane"], M["pearl"])
    alto(root("JT_Inst_Parker"), col, M, q, M["parker_body"], M["parker_keys"], M["pearl"])
    bpy.context.view_layer.update()
    # every root: children re-expressed about the footprint centre on the display surface (lowest point at z 0);
    # the saxophones lie on their backs (keys up) as in a display case: rotate about X so -y (keys) faces +z
    for name, r in roots.items():
        if "Coltrane" in name or "Parker" in name:
            for c in r.children:
                c.matrix_world = Matrix.Rotation(math.radians(-90), 4, "X") @ Matrix.Rotation(math.radians(90), 4, "Y") @ c.matrix_world
        bpy.context.view_layer.update()
        pts = [c.matrix_world @ Vector(v) for c in r.children if c.type == "MESH" for v in c.bound_box]
        lo = Vector((min(p.x for p in pts), min(p.y for p in pts), min(p.z for p in pts)))
        hi = Vector((max(p.x for p in pts), max(p.y for p in pts), max(p.z for p in pts)))
        shift = Vector(((lo.x + hi.x) / 2, (lo.y + hi.y) / 2, lo.z))
        for c in r.children:
            c.matrix_world = Matrix.Translation(-shift) @ c.matrix_world
        r["jt_size"] = [round(v, 3) for v in (hi - lo)]
        print("INSTRUMENT", name, "size", r["jt_size"], "parts", len(r.children))
        # a pick collider over the whole instrument
        L.collider(name.replace("JT_Inst_", "Inst_"), col, tuple(max(0.03, v) for v in (hi - lo)), (0, 0, (hi.z - lo.z) / 2), parent=r)
    return col


def export(sub):
    os.makedirs(os.path.join(EXP, sub) if sub else EXP, exist_ok=True)
    path = os.path.join(EXP, sub, "JT_Instruments.glb") if sub else os.path.join(EXP, "JT_Instruments.glb")
    for o in bpy.data.objects:
        o.select_set(True)
    bpy.ops.export_scene.gltf(filepath=path, export_format="GLB", use_selection=True, export_apply=True, export_yup=True,
                              export_cameras=False, export_lights=False, export_extras=True, export_image_format="JPEG",
                              export_jpeg_quality=90, export_animations=False)
    print("EXPORTED", path, os.path.getsize(path) // 1024, "KB")


def main():
    for sub, (q, tex) in LEVELS.items():
        textures(tex)
        for img in list(bpy.data.images):
            bpy.data.images.remove(img)
        build(q)
        export(sub)
    print("INSTRUMENTS DONE")


main()
