"""Exports LOD1 / LOD2 variants of every GLB group from JT_Home.blend.

blender -b D:/Jazztor/blender/source/JT_Home.blend --python export_lods.py

LOD0 = blender/exports/*.glb (written by build_home.py)
LOD1 = blender/exports/lod1  — decimated ~45 %, textures unchanged
LOD2 = blender/exports/lod2  — decimated ~18 %, textures capped at 1024 px (512 for album art)
Colliders, engraved lettering, morph-target curtains, cameras and small meshes are never decimated.
"""
import os
import bpy

EXP = "D:/Jazztor/blender/exports"
GROUPS = {"JT_Turntable": False, "JT_Cabinet": False, "JT_Whiskey": False, "JT_Room": True, "JT_Skyline": False,
          "JT_Player": False, "JT_MapStation": False}
# minimum triangle counts: simple hard-surface parts (the turntable plinth, knobs) are never decimated - collapse on a
# few hundred bevelled triangles creases their shading badly and saves almost nothing
LODS = {"lod1": (0.45, None, 4000), "lod2": (0.18, 1024, 2500)}
# box-batched meshes (facades, record spines) are already minimal - collapse turns them into spikes
KEEP = ("COL_", "Engraving", "Label", "JT_Curtain_Left", "JT_Curtain_Right", "JT_Skyline_Glass", "JT_Skyline_Concrete",
        "JT_Skyline_Dark", "JT_Cabinet_SleevesBulk", "JT_Map_")



def tris(o):
    return sum(len(p.vertices) - 2 for p in o.data.polygons)


def decimate(ratio, min_tris):
    for o in bpy.data.objects:
        if o.type != "MESH" or o.name.startswith(KEEP[0]) or any(k in o.name for k in KEEP[1:]):
            continue
        if o.data.shape_keys or tris(o) < min_tris:
            continue
        # baked statics keep their exact geometry: collapsing edges shifts the Lightmap UVs off their texels
        # (dark / bright streaks across the turntable plinth on the low tier)
        if "Lightmap" in o.data.uv_layers:
            continue
        m = o.modifiers.new("lod", "DECIMATE")
        m.decimate_type = "COLLAPSE"
        m.ratio = ratio
        m.use_symmetry = False


def cap_textures(px):
    for img in bpy.data.images:
        if not img.size[0]:
            continue
        limit = px // 2 if img.name.startswith("JT_Cover") else px
        w, h = img.size
        if max(w, h) > limit:
            k = limit / max(w, h)
            img.scale(int(w * k), int(h * k))


def export(lod, group, cameras):
    col = bpy.data.collections[group]
    bpy.ops.object.select_all(action="DESELECT")
    for o in col.all_objects:
        o.select_set(True)
    out = os.path.join(EXP, lod, group + ".glb")
    bpy.ops.export_scene.gltf(filepath=out, export_format="GLB", use_selection=True, export_apply=True,
                              export_yup=True, export_cameras=cameras, export_lights=False, export_extras=True,
                              export_morph=True, export_morph_normal=True, export_image_format="JPEG",
                              export_jpeg_quality=88, export_animations=False)
    dg = bpy.context.evaluated_depsgraph_get()
    n = 0
    for o in col.all_objects:
        if o.type == "MESH":
            me = o.evaluated_get(dg).to_mesh()
            n += sum(len(p.vertices) - 2 for p in me.polygons)
            o.evaluated_get(dg).to_mesh_clear()
    return out, n


report = []
src = bpy.data.filepath
for lod, (ratio, px, min_tris) in LODS.items():
    bpy.ops.wm.open_mainfile(filepath=src)
    os.makedirs(os.path.join(EXP, lod), exist_ok=True)
    decimate(ratio, min_tris)
    if px:
        cap_textures(px)
    for group, cams in GROUPS.items():
        out, n = export(lod, group, cams)
        report.append(f"{lod} {group}: {n:,} triangles, {os.path.getsize(out) // 1024} KB")
        print("EXPORTED", out)

with open(os.path.join(EXP, "lod_report.txt"), "w") as f:
    f.write("\n".join(report) + "\n")
print("\n".join(report))
print("LODS DONE")
