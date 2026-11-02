"""A01 — JazzTor hero turntable. Original design; dimensions ~460 x 370 x 155 mm.

Hierarchy / pivots (Blender Z-up, metres, local to JT_Turntable_Root):
  JT_Turntable_Root
    JT_Turntable_Plinth (+ engraved JazzTor brass inlay)
    JT_Turntable_PlatterRig (empty, rotates about Z at platter centre)
       JT_Turntable_Platter, _Mat, _Spindle, JT_Turntable_Record
    JT_Tonearm_Rig (empty at bearing, rotates about Z = horizontal arc)
       JT_Tonearm_Lift (empty, rotates about local X = vertical cue; negative = up)
          arm tube, headshell, cartridge, stylus, counterweight
    JT_Turntable_PlayButton (origin at base, travels -Z 2 mm)
    JT_Turntable_TimeKnob / RoomKnob / SpeedSelector (rotate about Z)
    JT_Turntable_TimeLED_<MODE>, JT_Turntable_Indicator
    COL_* colliders
"""
import math
import bmesh
from mathutils import Vector
import jt_lib as L
import jt_letters as LT

W, D = 0.46, 0.37
FOOT_H = 0.018
PLINTH_H = 0.085
TOP = FOOT_H + PLINTH_H                    # 0.103
PLATTER_C = Vector((-0.060, 0.025))
PLATTER_Z = TOP + 0.004
PLATTER_H = 0.030
MAT_H = 0.003
REC_R = 0.1524
REC_H = 0.0018
REC_Z = PLATTER_Z + PLATTER_H + MAT_H       # record bottom
REC_TOP = REC_Z + REC_H
PIVOT = Vector((0.155, 0.105))
STYLUS_DROP = 0.0162                       # lift pivot height above record surface
LIFT_Z = REC_TOP + STYLUS_DROP
EFF_LEN = 0.2444                           # pivot -> stylus (15 mm overhang)
OFFSET_ANGLE = math.radians(22)
WORDMARK_CAP = 0.024

TIME_MODES = ["AUTO", "DAY", "DUSK", "NIGHT"]
TIME_ANGLES = [-54, -18, 18, 54]          # degrees, detents (0 = pointing to front)
TIME_KNOB = Vector((0.105, -0.148))
ROOM_KNOB = Vector((0.110, -0.082))
PLAY_BTN = Vector((0.032, -0.150))
SPEED_SEL = Vector((-0.198, -0.142))


def record_mesh(name, col, P, center=(0, 0), z=0.0):
    """12-inch record: planar UV on faces for groove/label texture, edge material slot 1."""
    h, r, hole = REC_H, REC_R, 0.00365
    prof = [(hole, 0), (r - 0.002, 0), (r, 0.0005), (r, h - 0.0005), (r - 0.002, h),
            (0.050, h), (0.049, h + 0.0002), (0.012, h + 0.0002), (0.011, h), (hole, h), (hole, 0)]
    bm = L.lathe_bm(prof, 192)
    uvl = bm.loops.layers.uv.verify()
    for f in bm.faces:
        if abs(f.normal.z) > 0.7:
            f.material_index = 0
            for l in f.loops:
                co = l.vert.co
                l[uvl].uv = (0.5 + co.x / (2 * r), 0.5 + co.y / (2 * r))
        else:
            f.material_index = 1
    ob = L.obj_from_bm(name, bm, col, None, 30)
    L.assign(ob, P["vinyl"], P["vinyl_edge"])
    ob.location = (center[0], center[1], z)
    return ob


def knob(name, col, P, xy, r=0.012, h=0.016, base_r=0.018):
    base = L.lathe(name + "_Base", col, [(0, 0), (base_r, 0), (base_r, 0.0025), (base_r - 0.001, 0.003),
                                          (0, 0.003)], P["black_gloss"], 64, (xy.x, xy.y, TOP))
    k = L.lathe(name, col, [(0, 0), (r, 0), (r, h - 0.002), (r - 0.0006, h - 0.0004),
                            (r - 0.0016, h), (0, h)], P["brass"], 72, (xy.x, xy.y, TOP + 0.003))
    tick = L.box(name + "_Tick", col, (0.0012, 0.005, 0.0004), (xy.x, xy.y - r + 0.0035, TOP + 0.003 + h),
                 P["black_metal"])
    L.set_parent(tick, k)
    return k, base


def label(name, col, P, text, xy, rot_deg=0.0, size=0.0042):
    t = LT.mono_object(name, col, text, size * 0.72, 0.0003, P["brass_polished"])
    t.location = (xy[0], xy[1], TOP + 0.00005)
    t.rotation_euler = (0, 0, math.radians(rot_deg))
    return t


def build(col, P):
    root = L.empty("JT_Turntable_Root", col, (0, 0, 0), size=0.1)
    parts = []

    # ---- plinth with engraved wordmark
    plinth = L.box("JT_Turntable_Plinth", col, (W, D, PLINTH_H), (0, 0, FOOT_H + PLINTH_H / 2),
                   P["walnut"], bevel=0.004, segments=4, uv_scale=0.34)
    # custom wordmark (jt_letters), engraved 1.2 mm deep with a brass inlay recessed 0.2 mm
    cutter = LT.wordmark_object("JT_cut", col, WORDMARK_CAP, 0.0024)
    cutter.rotation_euler = (math.radians(90), 0, 0)
    cutter.location = (0.035, -D / 2 + 0.0012, FOOT_H + PLINTH_H * 0.5)
    L.boolean(plinth, cutter)
    L.bpy.data.objects.remove(cutter, do_unlink=True)
    L.assign(plinth, P["walnut"])
    L.shade(plinth, 30)  # crisp engraved walls: re-mark sharp edges created by the boolean
    inlay = LT.wordmark_object("JT_Turntable_Engraving", col, WORDMARK_CAP, 0.0010, P["brass_polished"])
    inlay.rotation_euler = (math.radians(90), 0, 0)
    inlay.location = (0.035, -D / 2 + 0.0012, FOOT_H + PLINTH_H * 0.5)
    parts += [plinth, inlay]

    # ---- feet + corner screws
    for sx in (-1, 1):
        for sy in (-1, 1):
            x, y = sx * (W / 2 - 0.045), sy * (D / 2 - 0.045)
            f = L.lathe(f"JT_Turntable_Foot_{'LR'[sx > 0]}{'FB'[sy > 0]}", col,
                        [(0, 0.002), (0.019, 0.002), (0.021, 0.004), (0.022, 0.016), (0.020, FOOT_H),
                         (0, FOOT_H)], P["brass"], 64, (x, y, 0))
            pad = L.cylinder(f.name + "_Pad", col, 0.018, 0.002, (x, y, 0), P["rubber"], 48)
            sc = L.lathe(f"JT_Turntable_Screw_{len(parts)}", col,
                         [(0, 0.0007), (0.0028, 0.0004), (0.003, 0), (0, 0)], P["brass_aged"], 24,
                         (sx * (W / 2 - 0.014), sy * (D / 2 - 0.014), TOP))
            parts += [f, pad, sc]

    # ---- platter group
    prig = L.empty("JT_Turntable_PlatterRig", col, (PLATTER_C.x, PLATTER_C.y, PLATTER_Z), size=0.05)
    platter = L.lathe("JT_Turntable_Platter", col,
                      [(0, 0.004), (0.146, 0.004), (0.150, 0), (0.157, 0), (0.160, 0.003),
                       (0.160, PLATTER_H - 0.004), (0.1593, PLATTER_H - 0.0012), (0.158, PLATTER_H),
                       (0.1525, PLATTER_H), (0.152, PLATTER_H - 0.001), (0, PLATTER_H - 0.001)],
                      P["brass"], 192, (PLATTER_C.x, PLATTER_C.y, PLATTER_Z))
    mat = L.lathe("JT_Turntable_Mat", col,
                  [(0.004, 0), (0.149, 0), (0.150, MAT_H * 0.5), (0.149, MAT_H), (0.004, MAT_H)],
                  P["rubber"], 160, (PLATTER_C.x, PLATTER_C.y, PLATTER_Z + PLATTER_H - 0.001))
    rec = record_mesh("JT_Turntable_Record", col, P, PLATTER_C, REC_Z)
    spindle = L.lathe("JT_Turntable_Spindle", col,
                      [(0, 0), (0.0036, 0), (0.0036, 0.016), (0.0030, 0.0185), (0.0016, 0.0198), (0, 0.020)],
                      P["brass_polished"], 32, (PLATTER_C.x, PLATTER_C.y, PLATTER_Z + PLATTER_H - 0.002))
    for o in (platter, mat, rec, spindle):
        L.set_parent(o, prig)

    # ---- tonearm base (static)
    tbase = L.lathe("JT_Tonearm_Base", col,
                    [(0, 0), (0.026, 0), (0.026, 0.005), (0.024, 0.007), (0.014, 0.009), (0.012, 0.012),
                     (0, 0.012)], P["brass_aged"], 72, (PIVOT.x, PIVOT.y, TOP))
    tring = L.cylinder("JT_Tonearm_BaseRing", col, 0.030, 0.002, (PIVOT.x, PIVOT.y, TOP), P["black_gloss"])
    parts += [tbase, tring]

    # ---- yaw rig
    yaw = L.empty("JT_Tonearm_Rig", col, (PIVOT.x, PIVOT.y, TOP), size=0.04)
    pillar = L.cylinder("JT_Tonearm_Pillar", col, 0.0075, LIFT_Z - TOP - 0.024, (PIVOT.x, PIVOT.y, TOP + 0.012),
                        P["nickel"], 32)
    housing = L.box("JT_Tonearm_BearingHousing", col, (0.026, 0.022, 0.022), (PIVOT.x, PIVOT.y, LIFT_Z),
                    P["brass"], bevel=0.0015, segments=2, uv_scale=0.05)
    cap = L.lathe("JT_Tonearm_BearingCap", col, [(0, 0), (0.007, 0), (0.007, 0.004), (0.005, 0.006), (0, 0.006)],
                  P["brass_polished"], 32, (PIVOT.x, PIVOT.y, LIFT_Z + 0.011))
    for side in (-1, 1):
        pin = L.cylinder(f"JT_Tonearm_GimbalPin_{'LR'[side > 0]}", col, 0.0035, 0.006,
                         (PIVOT.x + side * 0.016, PIVOT.y, LIFT_Z), P["black_metal"], 24)
        pin.rotation_euler = (0, math.radians(90), 0)
        pin.location.x -= 0.003
        L.set_parent(pin, yaw)
    for o in (pillar, housing, cap):
        L.set_parent(o, yaw)

    # ---- lift rig (arm geometry built in rest pose: arm points to -Y)
    lift = L.empty("JT_Tonearm_Lift", col, (PIVOT.x, PIVOT.y, LIFT_Z), parent=yaw, size=0.03)
    p0 = Vector((PIVOT.x, PIVOT.y, LIFT_Z))
    stylus = Vector((0.0, -EFF_LEN, -STYLUS_DROP))
    d = Vector((-math.sin(OFFSET_ANGLE), -math.cos(OFFSET_ANGLE), 0))
    collar = stylus.copy()
    collar.z = 0
    collar -= d * 0.040
    pre = collar - d * 0.016
    path = L.catmull([(0, 0.004, 0), (0.006, -0.06, 0), (0.016, -0.12, 0), (pre.x, pre.y, 0),
                      (collar.x, collar.y, 0)], 10)
    path = [p0 + p for p in path]
    arm = L.tube_along("JT_Tonearm_Arm", col, path, 0.0042, P["nickel"])
    rear = L.tube_along("JT_Tonearm_RearStub", col, [p0 + Vector((0, 0.0, 0)), p0 + Vector((0, 0.07, 0))],
                        0.0038, P["nickel"])
    cw = L.lathe("JT_Tonearm_Counterweight", col,
                 [(0.004, 0), (0.016, 0), (0.0175, 0.0015), (0.0175, 0.028), (0.016, 0.030), (0.004, 0.030),
                  (0.004, 0)], P["black_metal"], 64)
    cw.rotation_euler = (math.radians(-90), 0, 0)
    cw.location = p0 + Vector((0, 0.036, 0))
    cwr = L.lathe("JT_Tonearm_CounterweightRing", col,
                  [(0.004, 0), (0.0182, 0), (0.0182, 0.008), (0.004, 0.008), (0.004, 0)], P["brass_polished"], 64)
    cwr.rotation_euler = (math.radians(-90), 0, 0)
    cwr.location = p0 + Vector((0, 0.030, 0))
    # headshell: oriented along d
    ang = math.atan2(d.y, d.x) + math.pi / 2
    hs_center = p0 + collar + d * 0.022 + Vector((0, 0, -0.003))
    headshell = L.box("JT_Tonearm_Headshell", col, (0.019, 0.040, 0.003), (0, 0, 0), P["black_metal"],
                      bevel=0.0008, segments=2, uv_scale=0.05)
    headshell.location, headshell.rotation_euler = hs_center, (0, 0, ang)
    ferrule = L.lathe("JT_Tonearm_Collar", col, [(0, 0), (0.0055, 0), (0.0055, 0.010), (0, 0.010)],
                      P["brass_polished"], 32)
    ferrule.rotation_euler = (math.radians(90), 0, ang)
    ferrule.location = p0 + collar + d * 0.003
    cart_c = p0 + stylus + Vector((0, 0, 0.0075)) - d * 0.006
    cart = L.box("JT_Tonearm_Cartridge", col, (0.017, 0.024, 0.0105), (0, 0, 0), P["black_gloss"],
                 bevel=0.0007, segments=2, uv_scale=0.05)
    cart.location, cart.rotation_euler = cart_c, (0, 0, ang)
    for i, sx in enumerate((-0.0055, 0.0055)):
        sc = L.cylinder(f"JT_Tonearm_CartScrew_{i}", col, 0.0012, 0.0012, (0, 0, 0), P["brass_polished"], 16)
        sc.location = p0 + collar + d * 0.024 + Vector((sx * math.cos(ang), sx * math.sin(ang), 0))
        L.set_parent(sc, lift)
    stylus_ob = L.lathe("JT_Tonearm_Stylus", col, [(0, 0), (0.0006, 0.0005), (0.0005, 0.003), (0, 0.003)],
                        P["nickel"], 12, p0 + stylus)
    finger = L.tube_along("JT_Tonearm_FingerLift", col,
                          [hs_center + d * 0.020 + Vector((0.008 * math.cos(ang), 0.008 * math.sin(ang), 0)),
                           hs_center + d * 0.022 + Vector((0.016 * math.cos(ang), 0.016 * math.sin(ang), 0.004))],
                          0.0009, P["nickel"], 12)
    for o in (arm, rear, cw, cwr, headshell, ferrule, cart, stylus_ob, finger):
        L.set_parent(o, lift)
    tip = L.empty("SNAP_Tonearm_StylusTip", col, p0 + stylus, parent=lift, size=0.005)

    # ---- arm rest + cue lever + anti-skate (static / own pivots)
    rest_xy = (p0 + Vector((0.0175, -0.165, 0)))
    rest = L.lathe("JT_Tonearm_Rest", col, [(0, 0), (0.0045, 0), (0.0045, 0.002), (0.0025, 0.004),
                                            (0.0025, LIFT_Z - TOP - 0.0062), (0, LIFT_Z - TOP - 0.0062)],
                   P["nickel"], 24, (rest_xy.x, rest_xy.y, TOP))
    cradle = L.box("JT_Tonearm_RestCradle", col, (0.012, 0.004, 0.0035),
                   (rest_xy.x, rest_xy.y, LIFT_Z - 0.0062), P["rubber"], bevel=0.0008, segments=2)
    cue_base = L.lathe("JT_Turntable_CueBase", col, [(0, 0), (0.0055, 0), (0.0055, 0.016), (0, 0.016)],
                       P["brass_aged"], 32, (PIVOT.x + 0.036, PIVOT.y - 0.028, TOP))
    cue = L.tube_along("JT_Turntable_CueLever", col,
                       [Vector((PIVOT.x + 0.036, PIVOT.y - 0.028, TOP + 0.014)),
                        Vector((PIVOT.x + 0.046, PIVOT.y - 0.048, TOP + 0.016))], 0.0016, P["nickel"], 12)
    cue_knob = L.lathe("JT_Turntable_CueKnob", col, [(0, -0.003), (0.0032, -0.002), (0.0032, 0.002), (0, 0.003)],
                       P["black_gloss"], 24, (PIVOT.x + 0.046, PIVOT.y - 0.048, TOP + 0.016))
    L.set_parent(cue_knob, cue)
    L.set_origin(cue, (PIVOT.x + 0.036, PIVOT.y - 0.028, TOP + 0.014))
    skate = L.lathe("JT_Turntable_AntiSkate", col, [(0, 0), (0.007, 0), (0.007, 0.006), (0.006, 0.007), (0, 0.007)],
                    P["brass"], 48, (PIVOT.x - 0.032, PIVOT.y + 0.026, TOP))
    parts += [rest, cradle, cue_base, cue, skate]

    # ---- controls
    play_ring = L.lathe("JT_Turntable_PlayRing", col,
                        [(0.0140, 0.0045), (0.0172, 0.0045), (0.0182, 0.0032), (0.0182, 0), (0.0140, 0),
                         (0.0140, 0.0045)], P["brass_polished"], 96, (PLAY_BTN.x, PLAY_BTN.y, TOP))
    play = L.lathe("JT_Turntable_PlayButton", col,
                   [(0, 0.0105), (0.0108, 0.0105), (0.0124, 0.0098), (0.0132, 0.0085), (0.0132, 0), (0, 0)],
                   P["black_gloss"], 96, (PLAY_BTN.x, PLAY_BTN.y, TOP))
    play_fine = L.lathe("JT_Turntable_PlayButtonRing", col,
                        [(0.0080, 0.01052), (0.0084, 0.01052), (0.0084, 0.01065), (0.0080, 0.01065),
                         (0.0080, 0.01052)], P["brass_polished"], 96, (PLAY_BTN.x, PLAY_BTN.y, TOP))
    L.set_parent(play_fine, play)
    indicator = L.lathe("JT_Turntable_Indicator", col, [(0, 0.0016), (0.0014, 0.0012), (0.0016, 0), (0, 0)],
                        P["led"], 24, (PLAY_BTN.x + 0.024, PLAY_BTN.y - 0.004, TOP))
    parts += [play_ring, play, indicator]

    tk, tkb = knob("JT_Turntable_TimeKnob", col, P, TIME_KNOB, 0.0125, 0.017, 0.019)
    parts += [tk, tkb]
    for mode, a in zip(TIME_MODES, TIME_ANGLES):
        ar = math.radians(a)
        led_p = TIME_KNOB + Vector((math.sin(ar), -math.cos(ar))) * 0.0235
        led = L.lathe(f"JT_Turntable_TimeLED_{mode}", col, [(0, 0.0012), (0.0011, 0.0009), (0.0012, 0), (0, 0)],
                      P["led"], 16, (led_p.x, led_p.y, TOP))
        lab_p = TIME_KNOB + Vector((math.sin(ar), -math.cos(ar))) * 0.033
        label(f"JT_Turntable_Label_{mode}", col, P, mode, lab_p, a)
        parts += [led]
    rk, rkb = knob("JT_Turntable_RoomKnob", col, P, ROOM_KNOB, 0.010, 0.014, 0.015)
    label("JT_Turntable_Label_ROOM", col, P, "ROOM", ROOM_KNOB + Vector((0, -0.024)), 0)
    sk, skb = knob("JT_Turntable_SpeedSelector", col, P, SPEED_SEL, 0.0105, 0.012, 0.016)
    label("JT_Turntable_Label_33", col, P, "33", SPEED_SEL + Vector((-0.012, -0.024)), 0, 0.0038)
    label("JT_Turntable_Label_45", col, P, "45", SPEED_SEL + Vector((0.012, -0.024)), 0, 0.0038)
    parts += [rk, rkb, sk, skb]

    # ---- colliders
    L.collider("PlayButton", col, (0.036, 0.036, 0.016), (PLAY_BTN.x, PLAY_BTN.y, TOP + 0.007))
    L.collider("TimeKnob", col, (0.05, 0.04, 0.022), (TIME_KNOB.x, TIME_KNOB.y - 0.006, TOP + 0.011))
    L.collider("RoomKnob", col, (0.032, 0.032, 0.02), (ROOM_KNOB.x, ROOM_KNOB.y, TOP + 0.01))
    L.collider("SpeedSelector", col, (0.034, 0.034, 0.018), (SPEED_SEL.x, SPEED_SEL.y, TOP + 0.009))
    L.collider("Record", col, (0.31, 0.31, 0.012), (PLATTER_C.x, PLATTER_C.y, REC_TOP))
    L.collider("CueLever", col, (0.02, 0.03, 0.02), (PIVOT.x + 0.042, PIVOT.y - 0.04, TOP + 0.014))
    head_col = L.collider("Tonearm", col, (0.04, 0.07, 0.03),
                          (PIVOT.x + collar.x, PIVOT.y + collar.y - 0.02, LIFT_Z - 0.006), parent=lift)

    # ---- hierarchy under root
    for o in list(col.objects):
        if o.parent is None and o is not root:
            L.set_parent(o, root)
    return root
