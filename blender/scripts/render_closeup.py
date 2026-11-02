"""Adds look-dev close-up cameras, then runs render_preview.py with the remaining args.

blender -b JT_Home.blend --python render_closeup.py -- <mode> <JT_Cam_Closeup_Wordmark|JT_Cam_Closeup_Controls> [samples] [scale]
"""
import os
import sys
import bpy
from mathutils import Vector

root = bpy.data.objects["JT_Turntable_Root"]
mw = root.matrix_world


def cam(name, local_loc, local_target, lens):
    c = bpy.data.cameras.new(name)
    c.lens = lens
    c.clip_start = 0.005
    ob = bpy.data.objects.new(name, c)
    bpy.context.scene.collection.objects.link(ob)
    loc, tgt = mw @ Vector(local_loc), mw @ Vector(local_target)
    ob.location = loc
    ob.rotation_euler = (tgt - loc).to_track_quat("-Z", "Y").to_euler()


cam("JT_Cam_Closeup_Wordmark", (0.05, -0.33, 0.10), (0.035, -0.185, 0.06), 35)
ob_w = bpy.data.cameras.new("JT_Cam_Closeup_Whiskey")
ob_w.lens = 55
cw = bpy.data.objects.new("JT_Cam_Closeup_Whiskey", ob_w)
bpy.context.scene.collection.objects.link(cw)
cw.location = Vector((0.36, -0.52, 0.93))
cw.rotation_euler = (Vector((0.50, -0.07, 0.83)) - cw.location).to_track_quat("-Z", "Y").to_euler()
cam("JT_Cam_Closeup_Controls", (0.10, -0.33, 0.30), (0.08, -0.12, 0.10), 60)
exec(open(os.path.join(os.path.dirname(os.path.abspath(__file__)), "render_preview.py"), encoding="utf-8").read())
