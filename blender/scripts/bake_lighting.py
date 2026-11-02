"""Photoreal lighting bake for the JazzTor listening room (Cycles path tracing -> WebGL).

blender -b D:/Jazztor/blender/source/JT_Home.blend --python bake_lighting.py -- [size] [samples] [--only-env] [--ref]

1. Light rig per time of day (physically based: Nishita sky + sun through the window, the Toronto photograph as an
   emissive backdrop for dusk/night city glow) and a separate PRACTICAL rig (table lamp + ceiling pin-spot).
2. Lightmap UVs ('Lightmap', second UV layer -> glTF TEXCOORD_1) for every static mesh, packed into ONE atlas.
3. Bake DIFFUSE (direct + indirect, no colour) = irradiance for DAY / DUSK / NIGHT / LAMP, OIDN-denoise, encode
   sRGB(E / scale) into 8-bit PNGs; scales -> lightmaps.json. Runtime: E = scale * decode(texel); blended by time
   of day and lamp level.
4. Equirect HDR panoramas of the room (per time of day, lamp on for dusk/night) from the turntable for reflections.
5. Save the .blend (with lightmap UVs) and re-export the LOD0 GLBs.
"""
import json
import math
import os
import sys
import numpy as np
import bpy
from mathutils import Vector

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from jt_denoise import denoise_image  # noqa: E402

argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
SIZE = int(argv[0]) if argv and argv[0].isdigit() else 4096
SAMPLES = int(argv[1]) if len(argv) > 1 and argv[1].isdigit() else 512
ONLY_ENV = "--only-env" in argv
REF = "--ref" in argv
WEB = "D:/Jazztor/app/public/assets/lighting"
SRC_TEX = "D:/Jazztor/blender/textures"
ENV_SRC = "D:/Jazztor/assets/environment/source"
EXP = "D:/Jazztor/blender/exports"
os.makedirs(WEB, exist_ok=True)

STATIC = {
    "JT_Room": r"^JT_(Console_|Curtain_Track|Lamp_(Base|BaseRing|Stem|Shade|Switch|Dimmer)$|Loose_|Room_|Window_(Head|Mullion|Sill))",
    "JT_Turntable": r"^JT_(Turntable_(Plinth|Foot_|Screw_|Label_|Engraving|PlayRing|RoomKnob_Base|TimeKnob_Base|SpeedSelector_Base|CueBase|AntiSkate)|Tonearm_(Base|BaseRing)$)",
    "JT_Cabinet": r"^JT_(Cabinet_(Carcass|Top|Foot_|Drawer_|Pull_|SelectorPlate|SelectorSlot|Label_|SleevesBulk|DisplaySleeve|CaptionCard)|Shelf_)",
    "JT_Whiskey": r"^JT_Whiskey_(Pedestal|PedestalBand)$",
}

# lightmap texel density multipliers (relative, after equalising) - first matching prefix wins
TEXEL_WEIGHT = {
    "JT_Turntable_": 4.0, "JT_Tonearm_": 4.0,
    "JT_Whiskey_": 2.0, "JT_Loose_": 2.0, "JT_Lamp_": 1.6,
    "JT_Console_": 1.5, "JT_Cabinet_": 1.5, "JT_Shelf_": 1.5,
    "JT_Window_": 0.5, "JT_Curtain_": 0.5, "JT_Room_": 0.3,
}

# time-of-day rigs (sun azimuth from the window normal (+Y) towards +X, elevation) - must match app timeMode.ts
# Natural light through the window is the key light in every state (project owner, 2026-10-20).
# The window spans x 0.2..3.6 on the +Y wall and the turntable sits at x~0: the sun must be slightly RIGHT of the
# window normal for its light to land on the console and turntable; the open left curtain covers x 0.15..0.57, so
# the day sun sits at +20 deg and enters through the middle of the window.
MODES = {
    "day":   dict(sky_el=34, sky_az=20, sky=3.2, sun=6.5, sun_color=(1.0, 0.95, 0.88), city=0.25),
    "dusk":  dict(sky_el=5, sky_az=18, sky=1.2, sun=3.4, sun_color=(1.0, 0.55, 0.26), city=0.9),
    "night": dict(sky_el=-14, sky_az=8, sky=0.0, sun=0.0, sun_color=(1, 1, 1), city=2.2),
}
# the lamp is a supplement: modest output, scaled at runtime by the dimmer
PRACTICAL = dict(lamp_w=28.0, spot_w=40.0)  # at lamp level 1.0


# ------------------------------------------------------------------ scene helpers
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
                print("CYCLES DEVICE", t)
                return sc
        except TypeError:
            continue
    return sc


RIG = []


def clear_rig():
    for o in RIG:
        bpy.data.objects.remove(o, do_unlink=True)
    RIG.clear()


def add_light(name, kind, loc, energy, color, size=None, target=None, spot=None):
    l = bpy.data.lights.new(name, kind)
    l.energy = energy
    l.color = color
    if size is not None:
        l.shadow_soft_size = size
    if spot:
        l.spot_size, l.spot_blend = spot
    o = bpy.data.objects.new(name, l)
    bpy.context.scene.collection.objects.link(o)
    o.location = loc
    if target is not None:
        o.rotation_euler = (Vector(target) - Vector(loc)).to_track_quat("-Z", "Y").to_euler()
    RIG.append(o)
    return o


def world(mode):
    m = MODES[mode] if mode in MODES else None
    w = bpy.data.worlds.get("JT_BakeWorld") or bpy.data.worlds.new("JT_BakeWorld")
    bpy.context.scene.world = w
    w.use_nodes = True
    nt = w.node_tree
    nt.nodes.clear()
    out = nt.nodes.new("ShaderNodeOutputWorld")
    bg = nt.nodes.new("ShaderNodeBackground")
    nt.links.new(bg.outputs[0], out.inputs[0])
    if not m or m["sky"] <= 0:
        bg.inputs["Color"].default_value = (0.004, 0.006, 0.014, 1) if m else (0, 0, 0, 1)
        bg.inputs["Strength"].default_value = 1.0 if m else 0.0
        return
    sky = nt.nodes.new("ShaderNodeTexSky")
    for t in ("MULTIPLE_SCATTERING", "NISHITA"):
        try:
            sky.sky_type = t
            break
        except TypeError:
            continue
    sky.sun_elevation = math.radians(m["sky_el"])
    sky.sun_rotation = math.radians(90 - m["sky_az"])          # Nishita rotation is measured from +X
    sky.sun_disc = False                                     # the sun is a separate lamp (controllable)
    try:
        sky.altitude = 80
    except AttributeError:
        pass
    nt.links.new(sky.outputs[0], bg.inputs["Color"])
    bg.inputs["Strength"].default_value = m["sky"] * 0.35


def city_backdrop(mode):
    """The Toronto photograph as an emissive panel 120 m beyond the window (city glow at dusk / night)."""
    m = MODES[mode]
    if m["city"] <= 0:
        return
    me = bpy.data.meshes.new("JT_BakeCity")
    w, h = 260.0, 260.0 * 941 / 1672
    me.from_pydata([(-w / 2, 0, -h * 0.65), (w / 2, 0, -h * 0.65), (w / 2, 0, h * 0.35), (-w / 2, 0, h * 0.35)], [], [(0, 1, 2, 3)])
    uv = me.uv_layers.new()
    for i, c in enumerate([(0, 0), (1, 0), (1, 1), (0, 1)]):
        uv.data[i].uv = c
    mat = bpy.data.materials.new("JT_BakeCityMat")
    mat.use_nodes = True
    nt = mat.node_tree
    nt.nodes.clear()
    out = nt.nodes.new("ShaderNodeOutputMaterial")
    em = nt.nodes.new("ShaderNodeEmission")
    tex = nt.nodes.new("ShaderNodeTexImage")
    tex.image = bpy.data.images.load(f"{ENV_SRC}/toronto-{mode}-master.png", check_existing=True)
    nt.links.new(tex.outputs[0], em.inputs["Color"])
    em.inputs["Strength"].default_value = m["city"]
    nt.links.new(em.outputs[0], out.inputs[0])
    me.materials.append(mat)
    o = bpy.data.objects.new("JT_BakeCity", me)
    bpy.context.scene.collection.objects.link(o)
    o.location = (1.9, 2.4 + 120, 1.0 + h * 0.15)
    o.visible_shadow = False
    RIG.append(o)


def sun(mode):
    m = MODES[mode]
    if m["sun"] <= 0:
        return
    az, el = math.radians(m["sky_az"]), math.radians(m["sky_el"])
    to_sun = Vector((math.sin(az) * math.cos(el), math.cos(az) * math.cos(el), math.sin(el)))
    o = add_light("JT_BakeSun", "SUN", (0, 0, 0), m["sun"], m["sun_color"])
    o.data.angle = math.radians(1.2)
    o.rotation_euler = (-to_sun).to_track_quat("-Z", "Y").to_euler()


def practical(level=1.0):
    lp = bpy.data.objects["JT_Lamp_LightPoint"].matrix_world.translation
    add_light("JT_BakeLamp", "POINT", lp, PRACTICAL["lamp_w"] * level, (1.0, 0.70, 0.42), size=0.05)
    add_light("JT_BakeKey", "SPOT", (-0.6, -0.4, 2.9), PRACTICAL["spot_w"] * level, (1.0, 0.72, 0.45), size=0.12,
              target=(0.02, -0.08, 0.80), spot=(math.radians(55), 0.8))


def emissives(on):
    """Practical emitters (lamp diffuser, LEDs) only belong to the PRACTICAL bake."""
    for m in bpy.data.materials:
        if not m.use_nodes:
            continue
        b = next((n for n in m.node_tree.nodes if n.type == "BSDF_PRINCIPLED"), None)
        if b is None:
            continue
        if "_orig_emit" not in m:
            m["_orig_emit"] = b.inputs["Emission Strength"].default_value
        if m.name in ("JT_Lamp_Diffuser",):
            b.inputs["Emission Strength"].default_value = m["_orig_emit"] if on else 0.0
        elif m.name.startswith(("JT_Facade", "JT_Sky_")) or m.name == "JT_Amber_Indicator":
            b.inputs["Emission Strength"].default_value = 0.0


def rig(mode):
    clear_rig()
    if mode == "lamp":
        world(None)
        practical(1.0)
        emissives(True)
    else:
        world(mode)
        sun(mode)
        city_backdrop(mode)
        emissives(False)


# ------------------------------------------------------------------ lightmap UVs
def static_objects():
    import re
    out = []
    for col, pat in STATIC.items():
        rx = re.compile(pat)
        out += [o for o in bpy.data.collections[col].all_objects if o.type == "MESH" and rx.match(o.name)]
    return out


def lightmap_uvs(objs):
    for o in objs:
        me = o.data
        if me.users > 1:
            o.data = me = me.copy()                       # shared meshes need their own lightmap UVs
        if "Lightmap" not in me.uv_layers:
            if len(me.uv_layers) == 0:
                me.uv_layers.new(name="UVMap")
            me.uv_layers.new(name="Lightmap")
        me.uv_layers.active = me.uv_layers["Lightmap"]
        for i, l in enumerate(me.uv_layers):
            l.active_render = i == 0                      # textures keep using the first layer
    bpy.ops.object.select_all(action="DESELECT")
    for o in objs:
        o.select_set(True)
    bpy.context.view_layer.objects.active = objs[0]
    bpy.ops.object.mode_set(mode="EDIT")
    bpy.ops.mesh.select_all(action="SELECT")
    bpy.ops.uv.smart_project(angle_limit=math.radians(60), island_margin=0.0, area_weight=0.0, scale_to_bounds=False)
    bpy.ops.uv.average_islands_scale()                    # equal texel density across every object ...
    bpy.ops.object.mode_set(mode="OBJECT")
    # ... then weighted by what the camera sees: the hero turntable gets the most texels, the room shell the fewest
    for o in objs:
        k = TEXEL_WEIGHT[next(p for p in TEXEL_WEIGHT if o.name.startswith(p))]
        uvl = o.data.uv_layers["Lightmap"].data
        for d in uvl:
            d.uv = d.uv * k
    bpy.ops.object.mode_set(mode="EDIT")
    bpy.ops.mesh.select_all(action="SELECT")
    bpy.ops.uv.select_all(action="SELECT")
    bpy.ops.uv.pack_islands(rotate=True, scale=True, margin=0.003)
    bpy.ops.object.mode_set(mode="OBJECT")
    print("LIGHTMAP UVS", len(objs), "objects")


# ------------------------------------------------------------------ bake
def bake(objs, mode, img):
    sc = bpy.context.scene
    sc.cycles.samples = SAMPLES
    sc.cycles.use_denoising = False
    sc.render.bake.use_clear = True
    sc.render.bake.margin = 6
    sc.render.bake.use_pass_direct = True
    sc.render.bake.use_pass_indirect = True
    sc.render.bake.use_pass_color = False
    added = []
    for o in objs:
        for slot in o.material_slots:
            m = slot.material
            if not m or not m.use_nodes:
                continue
            n = m.node_tree.nodes.get("JT_BakeTarget")
            if not n:
                n = m.node_tree.nodes.new("ShaderNodeTexImage")
                n.name = "JT_BakeTarget"
                added.append((m, n))
            n.image = img
            m.node_tree.nodes.active = n
    bpy.ops.object.select_all(action="DESELECT")
    for o in objs:
        o.select_set(True)
    bpy.context.view_layer.objects.active = objs[0]
    print("BAKING", mode, SIZE, SAMPLES)
    bpy.ops.object.bake(type="DIFFUSE", pass_filter={"DIRECT", "INDIRECT"}, uv_layer="Lightmap", margin=6, use_clear=True)
    for m, n in added:
        m.node_tree.nodes.remove(n)


def encode(px, name):
    """irradiance (linear) -> 8-bit sRGB(E / scale). Scale = 99.7th percentile so highlights keep detail."""
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


def env_panorama(mode, lamp_level):
    sc = bpy.context.scene
    rig(mode)
    if lamp_level > 0:
        practical(lamp_level)
        emissives(True)
    cam = bpy.data.objects.new("JT_EnvCam", bpy.data.cameras.new("JT_EnvCam"))
    sc.collection.objects.link(cam)
    cam.data.type = "PANO"
    try:
        cam.data.panorama_type = "EQUIRECTANGULAR"
    except AttributeError:
        cam.data.cycles.panorama_type = "EQUIRECTANGULAR"
    cam.location = (0.05, -0.05, 0.95)                  # just above the turntable
    cam.rotation_euler = (math.radians(90), 0, 0)         # looks along +Y (the window), Z up
    hidden = []
    for o in [x for x in bpy.data.collections["JT_Turntable"].all_objects if x]:   # the turntable must not reflect itself
        if not o.hide_render:
            o.hide_render = True
            hidden.append(o)
    sc.camera = cam
    sc.render.resolution_x, sc.render.resolution_y, sc.render.resolution_percentage = 2048, 1024, 100
    sc.cycles.samples = 256
    sc.cycles.use_denoising = True
    sc.view_settings.view_transform = "Standard"
    sc.view_settings.look = "None"
    sc.view_settings.exposure = 0
    sc.render.image_settings.file_format = "HDR"
    sc.render.filepath = f"{WEB}/env-{mode}.hdr"
    bpy.ops.render.render(write_still=True)
    for o in hidden:
        o.hide_render = False
    bpy.data.objects.remove(cam, do_unlink=True)
    print("ENV", mode)


def reference(mode, lamp_level):
    """A Cycles beauty render from the Home camera with the same rig - the target the web view is tuned to."""
    sc = bpy.context.scene
    rig(mode)
    if lamp_level > 0:
        practical(lamp_level)
        emissives(True)
    sc.camera = bpy.data.objects["JT_Cam_Home"]
    sc.render.resolution_x, sc.render.resolution_y, sc.render.resolution_percentage = 1920, 1080, 50
    sc.cycles.samples = 256
    sc.cycles.use_denoising = True
    sc.view_settings.view_transform = "Khronos PBR Neutral" if "Khronos PBR Neutral" in [
        i.identifier for i in sc.view_settings.bl_rna.properties["view_transform"].enum_items] else "AgX"
    sc.render.image_settings.file_format = "PNG"
    sc.view_settings.exposure = {"day": 0.0, "dusk": 0.6, "night": 1.0}[mode]
    sc.render.filepath = f"D:/Jazztor/blender/renders/reference_{mode}.png"
    bpy.ops.render.render(write_still=True)
    print("REFERENCE", mode)


def export_glbs():
    for group, cams in (("JT_Room", True), ("JT_Turntable", False), ("JT_Cabinet", False), ("JT_Whiskey", False)):
        bpy.ops.object.select_all(action="DESELECT")
        for o in bpy.data.collections[group].all_objects:
            o.select_set(True)
        bpy.ops.export_scene.gltf(filepath=f"{EXP}/{group}.glb", export_format="GLB", use_selection=True,
                                  export_apply=True, export_yup=True, export_cameras=cams, export_lights=False,
                                  export_extras=True, export_morph=True, export_morph_normal=True,
                                  export_image_format="JPEG", export_jpeg_quality=90, export_animations=False)
        print("EXPORTED", group)


def main():
    cycles()
    objs = static_objects()
    if REF:
        for mode, lamp in (("day", 0), ("dusk", 0.7), ("night", 0.7)):
            reference(mode, lamp)
        return
    if not ONLY_ENV:
        lightmap_uvs(objs)
        meta = {"size": SIZE, "samples": SAMPLES, "objects": [o.name for o in objs], "maps": {}}
        for mode in ("day", "dusk", "night", "lamp"):
            rig(mode)
            img = bpy.data.images.new(f"JT_LM_{mode}", SIZE, SIZE, float_buffer=True, alpha=False)
            img.colorspace_settings.name = "Non-Color"
            bake(objs, mode, img)
            px = denoise_image(img)
            meta["maps"][mode] = {"file": f"lm-{mode}.png", "scale": encode(px, f"lm-{mode}")}
            bpy.data.images.remove(img)
            print("LIGHTMAP", mode, meta["maps"][mode])
        with open(f"{WEB}/lightmaps.json", "w") as f:
            json.dump(meta, f, indent=1)
        clear_rig()
        bpy.ops.wm.save_mainfile()
        export_glbs()
    for mode, lamp in (("day", 0.0), ("dusk", 0.7), ("night", 0.7)):
        env_panorama(mode, lamp)
    clear_rig()
    print("BAKE DONE")


main()
