"""Museum LODs. The museum is lit by a lightmap atlas, so its geometry is never decimated (collapse would shift
the Lightmap UVs off the baked texels); the tiers differ only in texture size.
LOD1 = same as LOD0, LOD2 = textures capped at 1024 px.

blender -b D:/Jazztor/blender/exports/JT_Museum.glb is not loadable directly, so this imports the LOD0 GLB:
blender -b --factory-startup --python export_museum_lods.py
"""
import os
import shutil
import bpy

EXP = "D:/Jazztor/blender/exports"
SRC = f"{EXP}/JT_Museum.glb"
os.makedirs(f"{EXP}/lod1", exist_ok=True)
os.makedirs(f"{EXP}/lod2", exist_ok=True)
shutil.copyfile(SRC, f"{EXP}/lod1/JT_Museum.glb")

bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=SRC)
for img in bpy.data.images:
    w, h = img.size
    k = min(1.0, 1024 / max(w, h)) if w and h else 1.0
    nw, nh = max(4, int(w * k) // 4 * 4), max(4, int(h * k) // 4 * 4)  # keep 4 px blocks for GPU compression
    if w and h and (nw, nh) != (w, h):
        img.scale(nw, nh)
bpy.ops.export_scene.gltf(filepath=f"{EXP}/lod2/JT_Museum.glb", export_format="GLB", export_yup=True, export_cameras=True,
                          export_lights=False, export_extras=True, export_image_format="JPEG", export_jpeg_quality=88,
                          export_animations=False)
print("MUSEUM LODS DONE", os.path.getsize(f"{EXP}/lod2/JT_Museum.glb") // 1024, "KB")
