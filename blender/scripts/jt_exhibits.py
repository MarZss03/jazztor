"""Museum exhibits: framed photographs / posters and wall text, from data/museum-exhibits.json (the hanging plan).

Frames are models (lacquered moulding, gilt lip, ivory mat, brass picture lamp) baked with the room; the picture and
the wall text are plain quads with 0..1 UVs (also baked) that the app textures with the photograph / canvas text.
Returns per-exhibit metadata for museum.json (centres, sizes, wall normal, picture-lamp specs for the Cycles bake)."""
import json
import bmesh
from mathutils import Vector

MAT_W, MOULD_W, MOULD_D, GAP = 0.06, 0.055, 0.06, 0.1


def walls(VW, VD, WING, T=0.25):
    """axis, fixed coordinate of the wall face, inward normal (museum-local metres)."""
    return {
        "VW": ("x", -VW + 0.045, (1, 0, 0)), "VE": ("x", VW - 0.045, (-1, 0, 0)),
        "VN": ("y", VD - 0.022, (0, -1, 0)),  # the vestibule's north niche (its silk back)
        "WO": ("x", -WING["x1"] + 0.012, (1, 0, 0)), "WI": ("x", -WING["x0"] - 0.012, (-1, 0, 0)),
        "WB": ("y", WING["y1"] - 0.012, (0, -1, 0)), "WF": ("y", VD + T + 0.012, (0, 1, 0)),
        "TO": ("x", WING["x1"] - 0.012, (-1, 0, 0)), "TI": ("x", WING["x0"] + 0.012, (1, 0, 0)),
        "TB": ("y", WING["y1"] - 0.012, (0, -1, 0)), "TF": ("y", VD + T + 0.012, (0, 1, 0)),
    }


def build(col, M, L, bx, V, wall_table, plan_path="D:/Jazztor/data/museum-exhibits.json"):
    with open(plan_path, encoding="utf-8") as f:
        plan = json.load(f)["exhibits"]
    out, meta = [], []
    up = Vector((0, 0, 1))
    for e in plan:
        axis, fixed, n = wall_table[e["wall"]]
        n = Vector(n)
        right = (-n).cross(up)

        def at(s, z, d):
            """s along the viewer's right from the group's u, z height, d off the wall."""
            base = Vector((fixed, e["u"], 0)) if axis == "x" else Vector((e["u"], fixed, 0))
            return base + right * s + up * z + n * d

        def box(name, mat, w, h, t, s, z, d, bevel=0.004):
            size = (t, w, h) if axis == "x" else (w, t, h)
            c = at(s, z, d)
            return bx(name, col, M, mat, size, (c.x, c.y, c.z), bevel=bevel)

        def quad(name, mat, w, h, s, z, d):
            bm = bmesh.new()
            uvl = bm.loops.layers.uv.verify()
            c = at(s, z, d)
            vs = [bm.verts.new(V(*(c + right * (a * w / 2) + up * (b * h / 2)))) for a, b in ((-1, -1), (1, -1), (1, 1), (-1, 1))]
            f = bm.faces.new(vs)
            for lp, uv in zip(f.loops, ((0, 0), (1, 0), (1, 1), (0, 1))):
                lp[uvl].uv = uv
            return L.obj_from_bm(name, bm, col, M[mat], 0)

        kind = e.get("kind", "picture")
        label = e.get("label", "none")
        tw = e.get("tw", 0.52 if label == "side" else 0.6)
        th = e.get("th", 0.7 if label == "side" else 0.3)
        rec = {"id": e["id"], "wall": e["wall"], "kind": kind, "normal": list(n), "right": list(right)}
        lamps = []
        tx_s, tx_z = 0.0, e["z"]
        if kind == "text":
            gw, gh = tw, th
        else:
            ph, pw = e["h"], e["h"] * e["aspect"]
            ow, oh = pw + 2 * (MAT_W + MOULD_W), ph + 2 * (MAT_W + MOULD_W)
            if label == "side":
                gw, gh = ow + GAP + tw, max(oh, th)
                fs, fz = -gw / 2 + ow / 2, e["z"]
                tx_s, tx_z = gw / 2 - tw / 2, e["z"]
            elif label == "below":
                gw, gh = max(ow, tw), oh + 0.06 + th
                fs, fz = 0.0, e["z"] + gh / 2 - oh / 2
                tx_s, tx_z = 0.0, e["z"] - gh / 2 + th / 2
            else:
                gw, gh, fs, fz = ow, oh, 0.0, e["z"]
            parts = []
            for nm, w, h, s, z in (("T", ow, MOULD_W, fs, fz + oh / 2 - MOULD_W / 2), ("B", ow, MOULD_W, fs, fz - oh / 2 + MOULD_W / 2),
                                   ("L", MOULD_W, oh - 2 * MOULD_W, fs - ow / 2 + MOULD_W / 2, fz),
                                   ("R", MOULD_W, oh - 2 * MOULD_W, fs + ow / 2 - MOULD_W / 2, fz)):
                parts.append(box(f"JT_Mus_ExFrame_{e['id']}_{nm}", "frame", w, h, MOULD_D, s, z, MOULD_D / 2, bevel=0.012))
            iw, ih = ow - 2 * MOULD_W, oh - 2 * MOULD_W
            for nm, w, h, s, z in (("T", iw, 0.012, fs, fz + ih / 2 - 0.006), ("B", iw, 0.012, fs, fz - ih / 2 + 0.006),
                                   ("L", 0.012, ih, fs - iw / 2 + 0.006, fz), ("R", 0.012, ih, fs + iw / 2 - 0.006, fz)):
                parts.append(box(f"JT_Mus_ExLip_{e['id']}_{nm}", "brass_polished", w, h, 0.012, s, z, MOULD_D - 0.004, bevel=0.003))
            out.append(L.join(parts, f"JT_Mus_ExFrame_{e['id']}"))
            out.append(box(f"JT_Mus_ExMat_{e['id']}", "mat", iw, ih, 0.01, fs, fz, 0.03, bevel=0.0))
            out.append(quad(f"JT_Mus_ExPic_{e['id']}", "expic", pw, ph, fs, fz, 0.0365))
            rec["picture"] = {"c": list(V(*at(fs, fz, 0.0365))), "w": pw, "h": ph}
            rec["frame"] = {"c": list(V(*at(fs, fz, 0.03))), "w": ow, "h": oh}
            # brass picture lamp over the frame; its Cycles light is a warm strip aimed down the picture
            hood = max(0.3, ow * 0.55)
            lamp = [box(f"JT_Mus_ExLampHood_{e['id']}", "brass_polished", hood, 0.045, 0.06, fs, fz + oh / 2 + 0.11, 0.16, bevel=0.012)]
            for k in (-1, 1):
                lamp.append(box(f"JT_Mus_ExLampArm_{e['id']}{k}", "brass_aged", 0.012, 0.012, 0.15, fs + k * hood * 0.3,
                                fz + oh / 2 + 0.1, 0.075, bevel=0.003))
            lamp.append(box(f"JT_Mus_ExLampPlate_{e['id']}", "brass_aged", 0.1, 0.05, 0.012, fs, fz + oh / 2 + 0.1, 0.006, bevel=0.003))
            out.append(L.join(lamp, f"JT_Mus_ExLamp_{e['id']}"))
            lamps.append({"pos": list(V(*at(fs, fz + oh / 2 + 0.085, 0.16))), "target": list(V(*at(fs, fz - oh * 0.1, 0.0))),
                          "size": [hood * 0.92, 0.03], "power": round(2.5 + 9.5 * ow * oh, 2)})
        if kind == "text" or label in ("side", "below"):
            out.append(box(f"JT_Mus_ExTextBack_{e['id']}", "frame", tw + 0.03, th + 0.03, 0.014, tx_s, tx_z, 0.007, bevel=0.004))
            out.append(quad(f"JT_Mus_ExText_{e['id']}", "textpanel", tw, th, tx_s, tx_z, 0.0145))
            rec["text"] = {"c": list(V(*at(tx_s, tx_z, 0.0145))), "w": tw, "h": th}
            if kind == "text" or label == "side":
                lamps.append({"pos": list(V(*at(tx_s, tx_z + th / 2 + 0.32, 0.45))), "target": list(V(*at(tx_s, tx_z, 0.0))),
                              "size": [tw * 0.8, 0.05], "power": round(0.9 + 2.8 * tw * th, 2)})
        rec["group"] = {"c": list(V(*at(0, e["z"], 0.03))), "w": gw, "h": gh}
        rec["lamps"] = lamps
        c = at(0, e["z"], 0.05)
        L.collider(f"MusEx_{e['id']}", col, (0.1, gw, gh) if axis == "x" else (gw, 0.1, gh), V(c.x, c.y, c.z))
        meta.append(rec)
    return out, meta
