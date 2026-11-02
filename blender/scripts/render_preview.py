"""Cycles look-dev preview of JT_Home.blend.

blender -b D:/Jazztor/blender/source/JT_Home.blend --python render_preview.py -- <day|dusk|night> [camera] [samples] [scale%]
"""
import math
import os
import sys
import bpy
from mathutils import Vector

argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
MODE = argv[0] if argv else "day"
CAM = argv[1] if len(argv) > 1 else "JT_Cam_Home"
SAMPLES = int(argv[2]) if len(argv) > 2 else 64
SCALE = int(argv[3]) if len(argv) > 3 else 50
OUT = "D:/Jazztor/blender/renders"
os.makedirs(OUT, exist_ok=True)

S = {
    "day":   dict(sun_el=38, sun_az=200, sun=4.0, sky=1.0, lamp=0, win=0.0, beacon=0.0, exposure=0.0),
    "dusk":  dict(sun_el=1.5, sun_az=250, sun=2.0, sky=0.6, lamp=30, win=0.6, beacon=3.0, exposure=0.6),
    "night": dict(sun_el=-12, sun_az=250, sun=0.0, sky=0.05, lamp=45, win=1.4, beacon=6.0, exposure=1.2),
}[MODE]

sc = bpy.context.scene
sc.render.engine = "CYCLES"
prefs = bpy.context.preferences.addons["cycles"].preferences
for dev_type in ("OPTIX", "CUDA"):
    try:
        prefs.compute_device_type = dev_type
        prefs.get_devices()
        if any(d.type == dev_type for d in prefs.devices):
            for d in prefs.devices:
                d.use = d.type == dev_type
            sc.cycles.device = "GPU"
            break
    except TypeError:
        continue
sc.cycles.samples = SAMPLES
sc.cycles.use_denoising = True
sc.render.resolution_x, sc.render.resolution_y = 1920, 1080
sc.render.resolution_percentage = SCALE
sc.view_settings.view_transform = "AgX"
sc.view_settings.look = "AgX - Base Contrast" if "AgX - Base Contrast" in [
    i.identifier for i in sc.view_settings.bl_rna.properties["look"].enum_items] else "None"
sc.view_settings.exposure = S["exposure"]
sc.camera = bpy.data.objects[CAM]

# world: physical sky
world = bpy.data.worlds.new("JT_World")
sc.world = world
world.use_nodes = True
nt = world.node_tree
bg = nt.nodes["Background"]
sky = nt.nodes.new("ShaderNodeTexSky")
for t in ("MULTIPLE_SCATTERING", "NISHITA"):
    try:
        sky.sky_type = t
        break
    except TypeError:
        continue
sky.sun_elevation = math.radians(S["sun_el"])
sky.sun_rotation = math.radians(S["sun_az"])
try:
    sky.altitude = 80
except AttributeError:
    pass
nt.links.new(sky.outputs["Color"], bg.inputs["Color"])
bg.inputs["Strength"].default_value = S["sky"] * 0.35
if MODE == "night":
    bg.inputs["Color"].default_value = (0.004, 0.006, 0.014, 1)
    nt.links.remove(bg.inputs["Color"].links[0])

if S["sun"] > 0:
    sun = bpy.data.lights.new("JT_Light_Sun", "SUN")
    sun.energy = S["sun"]
    sun.angle = math.radians(1.5)
    sun.color = (1.0, 0.93, 0.84) if MODE == "day" else (1.0, 0.55, 0.3)
    so = bpy.data.objects.new("JT_Light_Sun", sun)
    sc.collection.objects.link(so)
    so.rotation_euler = (math.radians(90 - S["sun_el"]), 0, math.radians(S["sun_az"]))

# window fill (cool sky bounce)
fill = bpy.data.lights.new("JT_Light_WindowFill", "AREA")
fill.shape = "RECTANGLE"
fill.size, fill.size_y = 4.0, 2.8
fill.energy = {"day": 600, "dusk": 180, "night": 25}[MODE]
fill.color = (0.75, 0.85, 1.0) if MODE != "dusk" else (0.8, 0.7, 0.95)
fo = bpy.data.objects.new("JT_Light_WindowFill", fill)
sc.collection.objects.link(fo)
fo.location = (1.55, 2.25, 1.5)
fo.rotation_euler = (math.radians(-90), 0, 0)

if S["lamp"]:
    lp = bpy.data.objects["JT_Lamp_LightPoint"].matrix_world.translation
    pl = bpy.data.lights.new("JT_Light_Lamp", "POINT")
    pl.energy = S["lamp"]
    pl.color = (1.0, 0.7, 0.42)
    pl.shadow_soft_size = 0.04
    po = bpy.data.objects.new("JT_Light_Lamp", pl)
    sc.collection.objects.link(po)
    po.location = lp
    # warm practical pool on the turntable (ceiling pinspot)
    sp = bpy.data.lights.new("JT_Light_Key", "SPOT")
    sp.energy = S["lamp"] * 2.2
    sp.color = (1.0, 0.72, 0.45)
    sp.spot_size = math.radians(55)
    sp.spot_blend = 0.8
    sp.shadow_soft_size = 0.15
    so2 = bpy.data.objects.new("JT_Light_Key", sp)
    sc.collection.objects.link(so2)
    so2.location = (-0.6, -0.4, 2.9)
    d = Vector((0.0, -0.05, 0.74)) - so2.location
    so2.rotation_euler = d.to_track_quat("-Z", "Y").to_euler()

# emissive skyline windows per mode
for m in bpy.data.materials:
    if m.node_tree is None:
        continue
    b = next((n for n in m.node_tree.nodes if n.type == "BSDF_PRINCIPLED"), None)
    if b is None:
        continue
    if m.name.startswith("JT_Facade") or m.name == "JT_Sky_PodLights":
        b.inputs["Emission Strength"].default_value = S["win"] * (2 if m.name == "JT_Sky_PodLights" else 1)
    if m.name == "JT_Sky_Beacon":
        b.inputs["Emission Strength"].default_value = S["beacon"]
    if m.name == "JT_Lamp_Diffuser":
        b.inputs["Emission Strength"].default_value = 6.0 if S["lamp"] else 0.0
    if m.name == "JT_Amber_Indicator":
        b.inputs["Emission Strength"].default_value = 4.0 if MODE != "day" else 1.5
    if m.name == "JT_Water":
        b.inputs["Base Color"].default_value = {"day": (0.05, 0.14, 0.22, 1), "dusk": (0.06, 0.05, 0.09, 1),
                                                "night": (0.005, 0.008, 0.014, 1)}[MODE]

for o in bpy.data.objects:
    if o.name.startswith("COL_"):
        o.hide_render = True

sc.render.filepath = f"{OUT}/preview_{MODE}_{CAM.replace('JT_Cam_', '').lower()}.png"
bpy.ops.render.render(write_still=True)
print("RENDERED", sc.render.filepath)
