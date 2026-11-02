"""Cycles lighting for the JazzTor Museum: reference renders, lightmaps (door closed / open), reflection panoramas.

blender -b D:/Jazztor/blender/source/JT_Museum.blend --python bake_museum.py -- [--ref] [size] [samples]
Outputs: app/public/assets/museum/{lm-closed,lm-open}.png + lightmaps.json, env-{vestibule,world,toronto}.hdr,
         blender/renders/museum_ref_<cam>.png, blender/exports/JT_Museum.glb (with the Lightmap UV layer).
"""
import json
import math
import os
import re
import sys
import numpy as np
import bpy
from mathutils import Vector

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from jt_denoise import denoise_image  # noqa: E402

argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
REF = "--ref" in argv
PREVIEW = "--preview" in argv  # fast low-sample pass for front-end work: no .blend save, cheap panoramas
nums = [int(a) for a in argv if a.isdigit()]
SIZE = nums[0] if nums else 4096
SAMPLES = nums[1] if len(nums) > 1 else 640
WEB = "D:/Jazztor/app/public/assets/museum"
os.makedirs(WEB, exist_ok=True)
MX = 400.0

DYNAMIC = re.compile(r"^(COL_|JT_Mus_(Door(Leaf|Panel|Medallion|MedRing|Strip)|Hinge|Handle|Keyhole|Lever|Latch|Portrait\d$|WorldPlacard|TorPlacard|"
                     r"TorontoView|ChandGlass|ChandDisc|SconceGlass|Downlight|VitrineLED|VitrineGlass|TorWindowGlass))")
DOOR = re.compile(r"^JT_Mus_(Door(Leaf|Panel|Medallion|MedRing|Strip)|Hinge|Handle|Keyhole|Lever|Latch)")
TEXEL = [  # (prefix, weight) - first match wins
    ("JT_Mus_Table", 3.0), ("JT_Mus_Book", 3.0), ("JT_Mus_Bowl", 3.0), ("JT_Mus_Relief", 2.5), ("JT_Mus_Trumpet", 2.5),
    ("JT_Mus_World", 1.6), ("JT_Mus_Tor", 1.6), ("JT_Mus_Vitrine", 2.0), ("JT_Mus_Drawer", 1.4), ("JT_Mus_Globe", 2.0),
    ("JT_Mus_ExPic", 3.0), ("JT_Mus_ExText", 2.6), ("JT_Mus_ExMat", 1.8), ("JT_Mus_ExFrame", 1.4), ("JT_Mus_ExLamp", 1.4),
    ("JT_Mus_Runner", 1.2), ("JT_Mus_Floor", 0.8), ("JT_Mus_Panel", 1.0), ("JT_Mus_Coffer", 0.5), ("JT_Mus_Beam", 0.5),
    ("JT_Mus_Ceiling", 0.35), ("JT_Mus_Ante", 0.6), ("JT_Mus_", 1.0),
]


def P(x, y, z):
    return Vector((MX + x, y, z))


def cycles():
    sc = bpy.context.scene
    sc.render.engine = "CYCLES"
    prefs = bpy.context.preferences.addons["cycles"].preferences
    for t in ("OPTIX", "CUDA"):
        try:
            prefs.compute_device_type = t
            prefs.get_devices()
            if any(d.type == t for d in prefs.devices):
                for d in prefs.devices:
                    d.use = d.type == t
                sc.cycles.device = "GPU"
                break
        except TypeError:
            continue
    sc.cycles.max_bounces = 10
    sc.cycles.diffuse_bounces = 6
    sc.cycles.glossy_bounces = 4
    sc.cycles.transmission_bounces = 8
    sc.cycles.caustics_reflective = False
    sc.cycles.caustics_refractive = False
    sc.cycles.sample_clamp_indirect = 10.0
    w = bpy.data.worlds.new("JT_MusWorld")
    sc.world = w
    w.use_nodes = True
    w.node_tree.nodes["Background"].inputs["Color"].default_value = (0.002, 0.003, 0.006, 1)
    w.node_tree.nodes["Background"].inputs["Strength"].default_value = 1.0
    return sc


def light(name, kind, loc, watts, kelvin, size=0.05, target=None, spot=None, area=None):
    l = bpy.data.lights.new(name, kind)
    l.energy = watts
    l.color = blackbody(kelvin)
    if kind in ("POINT", "SPOT"):
        l.shadow_soft_size = size
    if spot:
        l.spot_size, l.spot_blend = math.radians(spot[0]), spot[1]
    if area:
        l.shape = "RECTANGLE"
        l.size, l.size_y = area
    o = bpy.data.objects.new(name, l)
    bpy.context.scene.collection.objects.link(o)
    o.location = loc
    if target is not None:
        o.rotation_euler = (Vector(target) - Vector(loc)).to_track_quat("-Z", "Y").to_euler()
    return o


def blackbody(k):
    """Approximate linear sRGB of a blackbody (Tanner Helland fit), normalised to max 1."""
    t = k / 100.0
    r = 255 if t <= 66 else 329.698727446 * ((t - 60) ** -0.1332047592)
    g = 99.4708025861 * math.log(t) - 161.1195681661 if t <= 66 else 288.1221695283 * ((t - 60) ** -0.0755148492)
    b = 255 if t >= 66 else (0 if t <= 19 else 138.5177312231 * math.log(t - 10) - 305.0447927307)
    c = [max(0.0, min(255.0, v)) / 255.0 for v in (r, g, b)]
    c = [v ** 2.2 for v in c]
    m = max(c)
    return tuple(v / m for v in c)


def rig():
    ob = bpy.data.objects
    # chandelier: soft sphere among the glass tiers
    # premium gallery balance (2026-10-22): a dim, warm room and bright neutral-warm pools on the works - contrast
    # between the room and what it shows; 3000-3500 K keys (the walnut stays warm, the light itself no longer orange)
    light("JT_MusL_Chandelier", "POINT", P(0, 3.35, 3.1), 260, 2800, size=0.3)
    # coffer downlights
    for o in [o for o in ob if o.name.startswith("JT_Mus_Downlight")]:
        p = o.matrix_world.translation
        light(f"JT_MusL_{o.name}", "SPOT", p - Vector((0, 0, 0.03)), 85, 3200, size=0.03, target=p - Vector((0, 0, 3)), spot=(70, 0.7))
    # sconces
    for o in [o for o in ob if o.name.startswith("JT_Mus_SconceGlass")]:
        p = o.matrix_world.translation + Vector((0, 0, 0.15))
        light(f"JT_MusL_{o.name}", "POINT", p, 30, 2800, size=0.05)
    # (the niche painting is lit by its own exhibit lamp, below)
    # wing track spots -> back-wall maps
    for name, xs in (("World", [-5.6, -4.45, -3.3, -2.15, -1.0]), ("Toronto", [1.3, 2.45, 3.6, 4.75, 5.9])):
        for i, x in enumerate(xs):
            tx = x * 0.85 + (-0.36 if name == "World" else 0.36)
            light(f"JT_MusL_{name}Track{i}", "SPOT", P(x, 10.8 - 1.5, 3.3), 80, 3300, size=0.04,
                  target=P(tx, 10.8, 1.9), spot=(62, 0.9))
        # soft ceiling fill for the wing
        light(f"JT_MusL_{name}Fill", "AREA", P(sum(xs) / 5, 8.7, 3.35), 60, 3300, target=P(sum(xs) / 5, 8.7, 0), area=(2.4, 1.8))
    # portrait picture lights
    for k in range(4):
        yy = 8.7 - 1.2 + k * 0.8
        light(f"JT_MusL_Portrait{k}", "AREA", P(6.2 - 0.12, yy, 2.3), 6, 2800, target=P(6.2, yy, 1.85), area=(0.05, 0.3))
    # vitrine top strip
    light("JT_MusL_Vitrine", "AREA", P(-0.7 - 0.45, 8.7, 1.43), 14, 3200, target=P(-1.15, 8.7, 0.9), area=(0.45, 1.4))
    # antechamber: one dim wall wash, so the door reads before it opens
    light("JT_MusL_Ante", "SPOT", P(0, -2.2, 2.85), 75, 2700, size=0.08, target=P(0, 0, 1.3), spot=(75, 0.9))
    # concealed cove: up-lights behind the crown wash the coffered ceiling (indirect fill for the whole room)
    for sx in (-1, 1):
        for yy in (1.6, 5.0):
            light(f"JT_MusL_Cove{sx}{yy}", "AREA", P(sx * 3.3, yy, 3.62), 42, 3000, target=P(sx * 3.3, yy, 9), area=(0.1, 3.0))
    # sign lights over the two arches
    for sx in (-1, 1):
        light(f"JT_MusL_Sign{sx}", "AREA", P(sx * 2.45, 6.6 - 0.45, 3.64), 16, 2800, target=P(sx * 2.45, 6.6, 3.3), area=(2.6, 0.05))
    # gallery picture lamps (one warm strip per brass lamp; wall-text lamps from the ceiling) - see jt_exhibits.py
    with open("D:/Jazztor/app/public/data/museum.json", encoding="utf-8") as fh:
        exhibits = json.load(fh).get("exhibits", [])
    for e in exhibits:
        for k, lp in enumerate(e["lamps"]):
            light(f"JT_MusL_Ex_{e['id']}_{k}", "AREA", Vector(lp["pos"]), lp["power"] * 1.35, 3500,  # gallery-neutral: photos stay black & white
                  target=Vector(lp["target"]),
                  area=tuple(lp["size"]))
    # a narrow ceiling spot on each instrument plinth: the velvet top in a pool of light, the room around it dim
    with open("D:/Jazztor/app/public/data/museum.json", encoding="utf-8") as fh:
        plinths = json.load(fh).get("instruments", [])
    for pl in plinths:
        c = Vector(pl["c"])
        light(f"JT_MusL_Inst_{pl['id']}", "SPOT", c + Vector((-0.35 * pl["face"][0], 0, 3.5 - c.z)), 34, 3500, size=0.03,
              target=c, spot=(24, 0.55))


def web_lights():
    """The real-time rig for the browser, condensed from the Cycles rig (one source of truth). On baked surfaces the
    runtime shader drops real-time diffuse, so these only add the specular Cycles gets from its lamps (brass, lacquer,
    marble); dynamic objects (portraits, placards, pins) get full lighting. Groups of small lamps become one strip
    rect light with the same on-axis radiant intensity (n spots of P W -> rect of n*P/4 W). Blender coordinates."""
    bpy.context.view_layer.update()
    L = {o.name: o for o in bpy.data.objects if o.type == "LIGHT"}
    out = []

    def fwd(o):
        return list(o.matrix_world.to_quaternion() @ Vector((0, 0, -1)))

    def col(o):
        return list(o.data.color)

    def rect(name, pos, q, w, h, power, color):
        # q: world orientation (emits along local -Z, width along local X) - same light frame as three's RectAreaLight
        out.append({"name": name, "type": "rect", "pos": list(pos), "quat": list(q), "size": [w, h], "power": power, "color": color})

    c = L["JT_MusL_Chandelier"]
    out.append({"name": c.name, "type": "point", "pos": list(c.location), "power": c.data.energy, "color": col(c)})
    a = L["JT_MusL_Ante"]
    out.append({"name": a.name, "type": "spot", "pos": list(a.location), "dir": fwd(a), "power": a.data.energy,
                "angle": a.data.spot_size, "blend": a.data.spot_blend, "color": col(a)})
    for wing in ("World", "Toronto"):
        tr = [o for n, o in L.items() if n.startswith(f"JT_MusL_{wing}Track")]
        xs = [o.location.x for o in tr]
        pos = sum((o.location for o in tr), Vector()) / len(tr)
        d = (sum((Vector(fwd(o)) for o in tr), Vector()) / len(tr)).normalized()
        rect(f"{wing}Track", pos, d.to_track_quat("-Z", "Y"), max(xs) - min(xs) + 0.4, 0.14, sum(o.data.energy for o in tr) / 4, col(tr[0]))
    for n in ("JT_MusL_WorldFill", "JT_MusL_TorontoFill", "JT_MusL_Vitrine", "JT_MusL_Sign-1", "JT_MusL_Sign1"):
        o = L[n]
        rect(n, o.location, o.matrix_world.to_quaternion(), o.data.size, o.data.size_y, o.data.energy, col(o))
    # the niche painting's lamp keeps the vestibule's "picture" slot (the oil paint's sheen under its lamp)
    p = L.get("JT_MusL_Ex_v-jazzband_0")
    if p:
        rect("JT_MusL_Picture", p.location, p.matrix_world.to_quaternion(), p.data.size, p.data.size_y, p.data.energy, col(p))
    pr = [o for n, o in L.items() if n.startswith("JT_MusL_Portrait")]
    ys = [o.location.y for o in pr]
    rect("Portraits", sum((o.location for o in pr), Vector()) / len(pr), Vector(fwd(pr[0])).to_track_quat("-Z", "Y"),
         max(ys) - min(ys) + 0.4, 0.05,
         sum(o.data.energy for o in pr), col(pr[0]))
    return out


def set_doors(visible):
    for o in bpy.data.objects:
        if DOOR.match(o.name):
            o.hide_render = not visible


def static_objects():
    return [o for o in bpy.data.collections["JT_Museum"].all_objects if o and o.type == "MESH" and not DYNAMIC.match(o.name)]


def lightmap_uvs(objs):
    for o in objs:
        me = o.data
        if me.users > 1:
            o.data = me = me.copy()
        if "Lightmap" not in me.uv_layers:
            if len(me.uv_layers) == 0:
                me.uv_layers.new(name="UVMap")
            me.uv_layers.new(name="Lightmap")
        me.uv_layers.active = me.uv_layers["Lightmap"]
        for i, l in enumerate(me.uv_layers):
            l.active_render = i == 0
    bpy.ops.object.select_all(action="DESELECT")
    for o in objs:
        o.select_set(True)
    bpy.context.view_layer.objects.active = objs[0]
    bpy.ops.object.mode_set(mode="EDIT")
    bpy.ops.mesh.select_all(action="SELECT")
    bpy.ops.uv.smart_project(angle_limit=math.radians(60), island_margin=0.0, area_weight=0.0, scale_to_bounds=False)
    bpy.ops.uv.average_islands_scale()
    bpy.ops.object.mode_set(mode="OBJECT")
    for o in objs:
        k = next(w for p, w in TEXEL if o.name.startswith(p))
        for d in o.data.uv_layers["Lightmap"].data:
            d.uv = d.uv * k
    bpy.ops.object.mode_set(mode="EDIT")
    bpy.ops.mesh.select_all(action="SELECT")
    bpy.ops.uv.select_all(action="SELECT")
    bpy.ops.uv.pack_islands(rotate=True, scale=True, margin=0.0025)
    bpy.ops.object.mode_set(mode="OBJECT")


def bake_proxy(objs):
    """All static meshes joined into ONE temporary object (world-space, modifiers applied, materials kept).
    Blender bakes a multi-object selection object by object, re-syncing the scene and allocating full-size bake
    buffers for each - with ~470 objects that overhead dwarfs the path tracing. One proxy = one sync, one pass."""
    dg = bpy.context.evaluated_depsgraph_get()
    parts = []
    for o in objs:
        me = bpy.data.meshes.new_from_object(o.evaluated_get(dg), preserve_all_data_layers=True, depsgraph=dg)
        me.transform(o.matrix_world)
        for i, slot in enumerate(o.material_slots):
            if i < len(me.materials):
                me.materials[i] = slot.material
            else:
                me.materials.append(slot.material)
        p = bpy.data.objects.new("JT_BakeProxy", me)
        bpy.context.scene.collection.objects.link(p)
        parts.append(p)
    bpy.ops.object.select_all(action="DESELECT")
    for p in parts:
        p.select_set(True)
    bpy.context.view_layer.objects.active = parts[0]
    bpy.ops.object.join()
    proxy = bpy.context.view_layer.objects.active
    hidden = {o.name: o.hide_render for o in objs}
    for o in objs:
        o.hide_render = True                       # the proxy stands in for them (no doubled geometry)
    print("MUSEUM BAKE PROXY", len(proxy.data.polygons), "faces")
    return proxy, hidden


def drop_proxy(proxy, hidden):
    me = proxy.data
    bpy.data.objects.remove(proxy, do_unlink=True)
    bpy.data.meshes.remove(me)
    for n, h in hidden.items():
        bpy.data.objects[n].hide_render = h


def bake(objs, img):
    sc = bpy.context.scene
    sc.cycles.samples = SAMPLES
    sc.cycles.use_denoising = False
    added = []
    for o in objs:
        for slot in o.material_slots:
            m = slot.material
            if not m or not m.use_nodes:
                continue
            n = m.node_tree.nodes.get("JT_BakeTarget") or m.node_tree.nodes.new("ShaderNodeTexImage")
            n.name = "JT_BakeTarget"
            n.image = img
            m.node_tree.nodes.active = n
            added.append((m, n))
    bpy.ops.object.select_all(action="DESELECT")
    for o in objs:
        o.select_set(True)
    bpy.context.view_layer.objects.active = objs[0]
    bpy.ops.object.bake(type="DIFFUSE", pass_filter={"DIRECT", "INDIRECT"}, uv_layer="Lightmap", margin=6, use_clear=True)
    for m, n in added:
        if n.name in m.node_tree.nodes:
            m.node_tree.nodes.remove(n)


def encode(px, name):
    lit = px[(px.sum(-1) > 1e-5)]
    scale = float(np.percentile(lit.max(-1), 99.7)) if len(lit) else 1.0
    v = np.clip(px / max(scale, 1e-6), 0, 1)
    srgb = np.where(v <= 0.0031308, v * 12.92, 1.055 * np.power(v, 1 / 2.4) - 0.055)
    h, w = px.shape[:2]
    img = bpy.data.images.new(name, w, h, alpha=False)
    img.colorspace_settings.name = "Non-Color"
    img.pixels.foreach_set(np.concatenate([srgb, np.ones((h, w, 1), np.float32)], -1).astype(np.float32).ravel())
    img.filepath_raw = f"{WEB}/{name}.png"
    img.file_format = "PNG"
    img.save()
    bpy.data.images.remove(img)
    return scale


def render_cam(cam, path, samples=256, res=(1920, 1080), pct=50, exposure=0.0):
    sc = bpy.context.scene
    sc.camera = bpy.data.objects[cam]
    sc.render.resolution_x, sc.render.resolution_y, sc.render.resolution_percentage = res[0], res[1], pct
    sc.cycles.samples = samples
    sc.cycles.use_denoising = True
    names = [i.identifier for i in sc.view_settings.bl_rna.properties["view_transform"].enum_items]
    sc.view_settings.view_transform = "Khronos PBR Neutral" if "Khronos PBR Neutral" in names else "AgX"
    sc.view_settings.exposure = exposure
    sc.render.image_settings.file_format = "PNG"
    sc.render.filepath = path
    bpy.ops.render.render(write_still=True)


def env(name, loc):
    sc = bpy.context.scene
    cam = bpy.data.objects.new("JT_MusEnvCam", bpy.data.cameras.new("JT_MusEnvCam"))
    sc.collection.objects.link(cam)
    cam.data.type = "PANO"
    try:
        cam.data.panorama_type = "EQUIRECTANGULAR"
    except AttributeError:
        cam.data.cycles.panorama_type = "EQUIRECTANGULAR"
    cam.location = loc
    cam.rotation_euler = (math.radians(90), 0, 0)
    sc.camera = cam
    sc.render.resolution_x, sc.render.resolution_y, sc.render.resolution_percentage = 1024, 512, 100
    sc.cycles.samples = 32 if PREVIEW else 256
    sc.cycles.use_denoising = True
    sc.view_settings.view_transform = "Standard"
    sc.view_settings.exposure = 0
    sc.render.image_settings.file_format = "HDR"
    sc.render.filepath = f"{WEB}/env-{name}.hdr"
    bpy.ops.render.render(write_still=True)
    bpy.data.objects.remove(cam, do_unlink=True)


def block_align_images():
    """GPU block compression (KTX2 -> BC/ETC/ASTC) needs width and height in multiples of 4; a 1672 x 941 photo
    otherwise uploads as black on desktop GPUs."""
    for img in bpy.data.images:
        w, h = img.size
        if w and h and (w % 4 or h % 4):
            img.scale(max(4, w // 4 * 4), max(4, h // 4 * 4))
            print("MUSEUM ALIGNED", img.name, (w, h), "->", tuple(img.size))


def main():
    cycles()
    rig()
    if REF:
        set_doors(True)
        render_cam("JT_MusCam_Door", "D:/Jazztor/blender/renders/museum_ref_door.png", exposure=0.4)
        set_doors(False)
        for cam in ("JT_MusCam_Vestibule", "JT_MusCam_World", "JT_MusCam_Toronto"):
            render_cam(cam, f"D:/Jazztor/blender/renders/museum_ref_{cam.split('_')[-1].lower()}.png", exposure=0.4)
        print("MUSEUM REF DONE")
        return
    objs = static_objects()
    lightmap_uvs(objs)
    meta = {"size": SIZE, "samples": SAMPLES, "objects": [o.name for o in objs], "maps": {}}
    proxy, hidden = bake_proxy(objs)
    for state, doors in (("closed", True), ("open", False)):
        set_doors(doors)
        img = bpy.data.images.new(f"JT_MusLM_{state}", SIZE, SIZE, float_buffer=True, alpha=False)
        img.colorspace_settings.name = "Non-Color"
        bake([proxy], img)
        meta["maps"][state] = {"file": f"lm-{state}.png", "scale": encode(denoise_image(img), f"lm-{state}")}
        bpy.data.images.remove(img)
        print("MUSEUM LIGHTMAP", state, meta["maps"][state])
    drop_proxy(proxy, hidden)
    meta["lights"] = web_lights()
    with open(f"{WEB}/lightmaps.json", "w") as f:
        json.dump(meta, f, indent=1)
    set_doors(False)
    for name, loc in (("vestibule", P(0, 3.0, 1.6)), ("world", P(-2.9, 8.9, 1.6)), ("toronto", P(2.9, 8.9, 1.6))):
        env(name, loc)
    set_doors(True)
    for o in [o for o in bpy.data.objects if o.type == "LIGHT"]:
        bpy.data.objects.remove(o, do_unlink=True)
    if not PREVIEW:
        bpy.ops.wm.save_mainfile()
    # the window photo only lights the bake (city glow through the glass); the web shows the modelled skyline instead
    if "JT_Mus_TorontoView" in bpy.data.objects:
        bpy.data.objects.remove(bpy.data.objects["JT_Mus_TorontoView"], do_unlink=True)
    block_align_images()
    sc = bpy.context.scene
    sc.render.resolution_x, sc.render.resolution_y, sc.render.resolution_percentage = 1920, 1080, 100  # glTF yfov uses this aspect
    bpy.ops.object.select_all(action="DESELECT")
    for o in bpy.data.collections["JT_Museum"].all_objects:
        if o:
            o.select_set(True)
    bpy.ops.export_scene.gltf(filepath="D:/Jazztor/blender/exports/JT_Museum.glb", export_format="GLB", use_selection=True,
                              export_apply=True, export_yup=True, export_cameras=True, export_lights=False, export_extras=True,
                              export_image_format="JPEG", export_jpeg_quality=90, export_animations=False)
    print("MUSEUM BAKE DONE")


main()
