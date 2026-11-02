"""Look-dev renders of the instrument models (Eevee, studio light) -> blender/renders/instruments/<name>.png

blender -b --factory-startup --python render_instruments.py
"""
import math
import os

import bpy
from mathutils import Vector

OUT = "D:/Jazztor/blender/renders/instruments"
os.makedirs(OUT, exist_ok=True)
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath="D:/Jazztor/blender/exports/JT_Instruments.glb")
sc = bpy.context.scene
sc.render.engine = "BLENDER_EEVEE_NEXT" if "BLENDER_EEVEE_NEXT" in [e.identifier for e in bpy.types.RenderSettings.bl_rna.properties["engine"].enum_items] else "BLENDER_EEVEE"
sc.render.resolution_x, sc.render.resolution_y = 1200, 800
sc.view_settings.view_transform = "AgX"
world = bpy.data.worlds.new("w")
world.use_nodes = True
world.node_tree.nodes["Background"].inputs[0].default_value = (0.02, 0.018, 0.016, 1)
world.node_tree.nodes["Background"].inputs[1].default_value = 1.0
sc.world = world
for o in bpy.data.objects:
    if o.name.startswith("COL_"):
        o.hide_render = True


def light(name, loc, energy, size, color=(1, 0.9, 0.78)):
    d = bpy.data.lights.new(name, "AREA")
    d.energy, d.size, d.color = energy, size, color
    o = bpy.data.objects.new(name, d)
    sc.collection.objects.link(o)
    o.location = loc
    o.rotation_euler = (Vector((0, 0, 0)) - Vector(loc)).to_track_quat("-Z", "Y").to_euler()


cam_d = bpy.data.cameras.new("cam")
cam = bpy.data.objects.new("cam", cam_d)
sc.collection.objects.link(cam)
sc.camera = cam
roots = [o for o in bpy.data.objects if o.name.startswith("JT_Inst_")]
for r in roots:
    for o in roots:
        for c in [o] + list(o.children_recursive):
            c.hide_render = o is not r or c.name.startswith("COL_")
    for o in [o for o in bpy.data.objects if o.type == "LIGHT"]:
        bpy.data.objects.remove(o)
    pts = [c.matrix_world @ Vector(v) for c in r.children_recursive if c.type == "MESH" and not c.name.startswith("COL_") for v in c.bound_box]
    lo = Vector((min(p.x for p in pts), min(p.y for p in pts), min(p.z for p in pts)))
    hi = Vector((max(p.x for p in pts), max(p.y for p in pts), max(p.z for p in pts)))
    c = (lo + hi) / 2
    size = (hi - lo).length
    light("key", c + Vector((0.4, -0.6, 0.9)) * size, 60 * size, 0.6 * size)
    light("rim", c + Vector((-0.7, 0.6, 0.4)) * size, 40 * size, 0.4 * size, (0.85, 0.9, 1.0))
    light("fill", c + Vector((-0.2, -1.0, 0.1)) * size, 12 * size, 1.0 * size)
    cam.location = c + Vector((0.25, -0.75, 0.55)) * size * 1.25
    cam.rotation_euler = (c - cam.location).to_track_quat("-Z", "Y").to_euler()
    cam_d.lens = 50
    sc.render.filepath = f"{OUT}/{r.name}.png"
    bpy.ops.render.render(write_still=True)
    print("RENDERED", r.name, "size", [round(v, 3) for v in (hi - lo)])
