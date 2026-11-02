"""A09 — physical player console, built as modules the frontend lays out to the viewport width.

Front face points -Y, top +Z, metres. Every module is an empty `JT_Player_Mod_<Name>` at the origin with its
parts parented; the frontend positions modules along X and scales the stretchable parts (`*_Stretch`).
Text zones are UV-mapped 0..1 on their front faces for runtime canvas textures — no baked text.

Pivots:  knobs/buttons rotate or travel along local -Y (their axis); VU needles rotate about Y at the pivot.
"""
import math
from mathutils import Vector
import jt_lib as L

H = 0.090          # console height
DEPTH = 0.050
FRONT = -DEPTH / 2  # chassis front plane (y)


def front_uv(ob):
    """Map faces pointing -Y to 0..1 over the object's X/Z extent (canvas texture zones)."""
    me = ob.data
    xs = [v.co.x for v in me.vertices]
    zs = [v.co.z for v in me.vertices]
    x0, x1, z0, z1 = min(xs), max(xs), min(zs), max(zs)
    uvl = me.uv_layers.active or me.uv_layers.new()
    for p in me.polygons:
        for li in p.loop_indices:
            co = me.vertices[me.loops[li].vertex_index].co
            uvl.data[li].uv = ((co.x - x0) / (x1 - x0), (co.z - z0) / (z1 - z0)) if p.normal.y < -0.5 else (0.02, 0.02)


def facing(ob, loc):
    """Lathe objects are built along +Z; turn them to face the viewer (-Y)."""
    ob.rotation_euler = (math.radians(90), 0, 0)
    ob.location = loc
    return ob


def frame(name, col, P, w, h, y, cx=0.0, cz=0.0, t=0.0018, depth=0.004):
    parts = [
        L.box(f"{name}_T", col, (w, depth, t), (cx, y, cz + h / 2 - t / 2), P["brass_polished"]),
        L.box(f"{name}_B", col, (w, depth, t), (cx, y, cz - h / 2 + t / 2), P["brass_polished"]),
        L.box(f"{name}_L", col, (t, depth, h), (cx - w / 2 + t / 2, y, cz), P["brass_polished"]),
        L.box(f"{name}_R", col, (t, depth, h), (cx + w / 2 - t / 2, y, cz), P["brass_polished"]),
    ]
    return L.join(parts, name)


def module(name, col):
    return L.empty(f"JT_Player_Mod_{name}", col, (0, 0, 0), size=0.03)


def adopt(root, objs):
    for o in objs:
        L.set_parent(o, root)


def build(col, P):
    M = {
        "insert": L.material("JT_Player_Insert", base=(0.9, 0.9, 0.9), rough=0.18, coat=1.0, coat_rough=0.05),
        "meta": L.material("JT_Player_MetaFace", base=(0.86, 0.80, 0.68), rough=0.8),
        "time": L.material("JT_Player_TimeFace", base=(0.02, 0.015, 0.012), rough=0.15,
                           emission=(1.0, 0.6, 0.25), emission_strength=1.0),
        "vu": L.material("JT_Player_VUFace", base=(0.92, 0.82, 0.62), rough=0.7,
                         emission=(1.0, 0.75, 0.45), emission_strength=0.15),
        "vuglass": L.material("JT_Player_VUGlass", base=(0.02, 0.02, 0.02), rough=0.05, alpha=0.12),
        "cover": P["cover0"],
    }

    # ---- chassis (stretchable 1 m units + end caps)
    ch = module("Chassis", col)
    body = L.box("JT_Player_Chassis_Stretch", col, (1.0, DEPTH, H), (0, 0, 0), P["walnut"], bevel=0.003, segments=3,
                 uv_scale=0.35)
    trim_t = L.box("JT_Player_TrimTop_Stretch", col, (1.0, DEPTH + 0.002, 0.004), (0, 0, H / 2 + 0.001),
                   P["bronze"], bevel=0.001, segments=1)
    trim_b = L.box("JT_Player_TrimBottom_Stretch", col, (1.0, DEPTH + 0.002, 0.003), (0, 0, -H / 2 - 0.001),
                   P["black_metal"])
    adopt(ch, [body, trim_t, trim_b])
    cap = module("EndCap", col)
    capb = L.box("JT_Player_EndCap", col, (0.018, DEPTH + 0.004, H + 0.006), (0, 0, 0), P["black_metal"],
                 bevel=0.002, segments=2)
    screws = [facing(L.lathe(f"JT_Player_EndScrew_{i}", col, [(0, 0.0012), (0.0032, 0.0008), (0.0035, 0), (0, 0)],
                             P["brass_polished"], 24), (0, -DEPTH / 2 - 0.002, z)) for i, z in enumerate((0.028, -0.028))]
    adopt(cap, [capb] + screws)

    def panel(name, w, h=0.072):
        return L.box(name, col, (w, 0.004, h), (0, FRONT - 0.001, 0), P["black_metal"], bevel=0.0015, segments=2)

    # ---- album plaque module (w 0.30): accent acrylic insert, cover inset, metadata plaque, crate rocker
    W = 0.30
    pl = module("Plaque", col)
    tray = panel("JT_Player_PlaqueTray", W)
    insert = L.box("JT_Player_Insert", col, (W - 0.012, 0.003, 0.062), (0, FRONT - 0.0035, 0), M["insert"],
                   bevel=0.001, segments=1)
    cov = L.box("JT_Player_Cover", col, (0.054, 0.003, 0.054), (-W / 2 + 0.040, FRONT - 0.0055, 0), M["cover"])
    front_uv(cov)
    covf = frame("JT_Player_CoverFrame", col, P, 0.058, 0.058, FRONT - 0.0055, -W / 2 + 0.040, 0)
    meta = L.box("JT_Player_MetaPlate", col, (0.162, 0.004, 0.046), (0.012, FRONT - 0.006, 0), M["meta"],
                 bevel=0.0006, segments=1)
    front_uv(meta)
    metaf = frame("JT_Player_MetaFrame", col, P, 0.168, 0.052, FRONT - 0.006, 0.012, 0)
    rocker = L.box("JT_Player_Btn_Crate", col, (0.024, 0.008, 0.016), (W / 2 - 0.030, FRONT - 0.006, 0), P["brass"],
                   bevel=0.0015, segments=2)
    crate_led = L.lathe("JT_Player_CrateLED", col, [(0, 0.0012), (0.0013, 0.0009), (0.0014, 0), (0, 0)], P["led"], 16)
    facing(crate_led, (W / 2 - 0.030, FRONT - 0.0035, 0.018))
    adopt(pl, [tray, insert, cov, covf, meta, metaf, rocker, crate_led])

    # ---- progress groove module (stretchable rail, brass puck)
    gr = module("Groove", col)
    rail_panel = L.box("JT_Player_RailPanel_Stretch", col, (1.0, 0.004, 0.030), (0, FRONT - 0.001, 0), P["black_metal"],
                       bevel=0.001, segments=1)
    channel = L.box("JT_Player_Rail_Stretch", col, (1.0, 0.002, 0.0035), (0, FRONT - 0.0032, 0), P["rubber"])
    lip_t = L.box("JT_Player_RailLipTop_Stretch", col, (1.0, 0.003, 0.0008), (0, FRONT - 0.0034, 0.0022),
                  P["brass_polished"])
    lip_b = L.box("JT_Player_RailLipBottom_Stretch", col, (1.0, 0.003, 0.0008), (0, FRONT - 0.0034, -0.0022),
                  P["brass_polished"])
    fill = L.box("JT_Player_RailFill_Stretch", col, (1.0, 0.0022, 0.0016), (0.5, FRONT - 0.0036, 0), M["insert"])
    L.set_origin(fill, (0, FRONT - 0.0036, 0))          # grows to the right from its left end
    puck = L.lathe("JT_Player_Slider", col, [(0, 0.006), (0.0045, 0.0056), (0.0058, 0.004), (0.0060, 0), (0, 0)],
                   P["brass_polished"], 48)
    facing(puck, (0, FRONT - 0.003, 0))
    col_rail = L.collider("Player_Rail", col, (1.0, 0.01, 0.026), (0, FRONT - 0.004, 0))
    adopt(gr, [rail_panel, channel, lip_t, lip_b, fill, puck, col_rail])

    # ---- time readout carrier (w 0.11)
    tm = module("Time", col)
    tpanel = panel("JT_Player_TimePanel", 0.11, 0.05)
    tface = L.box("JT_Player_TimeFace", col, (0.090, 0.003, 0.030), (0, FRONT - 0.0045, 0), M["time"])
    front_uv(tface)
    tframe = frame("JT_Player_TimeFrame", col, P, 0.094, 0.034, FRONT - 0.0045, 0, 0)
    adopt(tm, [tpanel, tface, tframe])

    # ---- VU meters module (w 0.25)
    vm = module("Meters", col)
    mpanel = panel("JT_Player_MeterPanel", 0.25, 0.080)
    objs = [mpanel]
    for side, cx in (("L", -0.0615), ("R", 0.0615)):
        face = L.box(f"JT_Player_VUFace_{side}", col, (0.104, 0.002, 0.060), (cx, FRONT - 0.0042, 0), M["vu"])
        front_uv(face)
        bez = frame(f"JT_Player_VUBezel_{side}", col, P, 0.110, 0.066, FRONT - 0.0068, cx, 0, t=0.003, depth=0.007)
        glass = L.box(f"JT_Player_VUGlass_{side}", col, (0.104, 0.0015, 0.060), (cx, FRONT - 0.0095, 0), M["vuglass"])
        pivot = Vector((cx, FRONT - 0.0058, -0.026))
        needle = L.box(f"JT_Player_VUNeedle_{side}", col, (0.0009, 0.0006, 0.046), (cx, FRONT - 0.0058, -0.026 + 0.023),
                       P["black_metal"])
        L.set_origin(needle, pivot)
        hub = L.lathe(f"JT_Player_VUHub_{side}", col, [(0, 0.003), (0.0035, 0.0025), (0.004, 0), (0, 0)],
                      P["black_gloss"], 24)
        facing(hub, (cx, FRONT - 0.0056, -0.026))
        objs += [face, bez, glass, needle, hub]
    adopt(vm, objs)

    # ---- transport module (w 0.24): prev, play, next, volume
    tr = module("Transport", col)
    tpan = panel("JT_Player_TransportPanel", 0.24, 0.074)
    objs = [tpan]

    def button(name, x, r, depth, mat):
        bezel = L.lathe(name + "_Bezel", col, [(r * 0.9, 0.0025), (r + 0.004, 0.0025), (r + 0.0045, 0), (r * 0.9, 0),
                                                (r * 0.9, 0.0025)], P["black_gloss"], 64)
        facing(bezel, (x, FRONT - 0.003, 0))
        b = L.lathe(name, col, [(0, depth), (r * 0.8, depth), (r * 0.95, depth - 0.0012), (r, depth - 0.003),
                                (r, 0), (0, 0)], mat, 72)
        facing(b, (x, FRONT - 0.003, 0))
        return [bezel, b]

    objs += button("JT_Player_Btn_Prev", -0.085, 0.0105, 0.008, P["brass"])
    objs += button("JT_Player_Btn_Play", -0.030, 0.0185, 0.011, P["brass"])
    objs += button("JT_Player_Btn_Next", 0.025, 0.0105, 0.008, P["brass"])
    pilot = L.lathe("JT_Player_PlayPilot", col, [(0, 0.0016), (0.0028, 0.0012), (0.003, 0), (0, 0)], P["led"], 24)
    facing(pilot, (-0.030, FRONT - 0.014, 0))
    objs.append(pilot)
    for i, (x, sym) in enumerate(((-0.085, -1), (0.025, 1))):           # engraved transport arrows
        tri = L.lathe(f"JT_Player_Arrow_{i}", col, [(0, 0.0006), (0.0035, 0.0006), (0.0035, 0), (0, 0)],
                      P["black_metal"], 3)
        facing(tri, (x, FRONT - 0.0112, 0))
        tri.rotation_euler.y = math.radians(90 if sym > 0 else -90)
        objs.append(tri)
    vbez = L.lathe("JT_Player_Volume_Bezel", col, [(0.013, 0.0025), (0.021, 0.0025), (0.0215, 0), (0.013, 0),
                                                    (0.013, 0.0025)], P["black_gloss"], 64)
    facing(vbez, (0.080, FRONT - 0.003, 0))
    knurl = [(0, 0.015), (0.013, 0.015), (0.0155, 0.0135)]
    knurl += [(0.016 + (0.0006 if i % 2 else 0), 0.012 - i * 0.0011) for i in range(10)] + [(0.016, 0), (0, 0)]
    vol = L.lathe("JT_Player_VolumeKnob", col, knurl, P["brass"], 96)
    facing(vol, (0.080, FRONT - 0.003, 0))
    tick = L.box("JT_Player_VolumeTick", col, (0.0012, 0.0006, 0.007), (0.080, FRONT - 0.0182, 0.0085), P["black_metal"])
    L.set_parent(tick, vol)
    objs += [vbez, vol]
    adopt(tr, objs)
    return [ch, cap, pl, gr, tm, vm, tr]
