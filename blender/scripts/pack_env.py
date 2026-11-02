"""Downsample the reflection panoramas for the web (PMREM blurs them anyway): env-<mode>.hdr -> 1024 x 512.
blender -b --factory-startup --python pack_env.py"""
import sys
import bpy

# -- museum: the three museum rooms
MUSEUM = "museum" in sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else False
DIR = "D:/Jazztor/app/public/assets/" + ("museum" if MUSEUM else "lighting")
for mode in (("vestibule", "world", "toronto") if MUSEUM else ("day", "dusk", "night")):
    img = bpy.data.images.load(f"{DIR}/env-{mode}.hdr")
    if img.size[0] > 1024:
        img.scale(1024, 512)
    img.filepath_raw = f"{DIR}/env-{mode}.hdr"
    img.file_format = "HDR"
    img.save()
    print("PACKED", mode, img.size[:])
