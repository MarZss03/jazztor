"""OIDN denoise for baked lightmaps / panoramas through the compositor (Blender 5.x node-group API, 4.x fallback).

denoise_image(img) -> numpy (h, w, 3) float32, linear. The input image is not modified.
"""
import os
import tempfile
import numpy as np
import bpy


def _pixels(img):
    w, h = img.size
    px = np.empty(w * h * 4, np.float32)
    img.pixels.foreach_get(px)
    return px.reshape(h, w, 4)


def denoise_image(img, hdr=True):
    w, h = img.size
    main = bpy.context.scene
    sc = bpy.data.scenes.new("JT_Denoise")
    sc.render.engine = "BLENDER_EEVEE" if "BLENDER_EEVEE" in [e.identifier for e in bpy.types.RenderSettings.bl_rna.properties["engine"].enum_items] else main.render.engine
    sc.render.resolution_x, sc.render.resolution_y = w, h
    sc.render.resolution_percentage = 100
    sc.render.film_transparent = False
    sc.view_settings.view_transform = "Standard"
    sc.view_settings.look = "None"
    sc.render.image_settings.file_format = "OPEN_EXR"
    sc.render.image_settings.color_depth = "32"
    cam = bpy.data.objects.new("JT_DenoiseCam", bpy.data.cameras.new("JT_DenoiseCam"))
    sc.collection.objects.link(cam)
    sc.camera = cam
    # compositor tree
    if hasattr(sc, "compositing_node_group"):            # Blender 5.x
        tree = bpy.data.node_groups.new("JT_DenoiseTree", "CompositorNodeTree")
        sc.compositing_node_group = tree
        out = tree.nodes.new("NodeGroupOutput")
        tree.interface.new_socket("Image", in_out="OUTPUT", socket_type="NodeSocketColor")
        out_socket = out.inputs[0]
    else:                                                # Blender 4.x
        sc.use_nodes = True
        tree = sc.node_tree
        tree.nodes.clear()
        out = tree.nodes.new("CompositorNodeComposite")
        out_socket = out.inputs[0]
    src = tree.nodes.new("CompositorNodeImage")
    src.image = img
    dn = tree.nodes.new("CompositorNodeDenoise")
    for name in ("use_hdr",):
        if hasattr(dn, name):
            setattr(dn, name, hdr)
    if "HDR" in dn.inputs:
        dn.inputs["HDR"].default_value = hdr
    if hasattr(dn, "prefilter"):
        dn.prefilter = "ACCURATE"
    tree.links.new(src.outputs["Image"], dn.inputs["Image"])
    tree.links.new(dn.outputs["Image"], out_socket)
    path = os.path.join(os.environ.get("TEMP", tempfile.gettempdir()), f"jt_denoise_{img.name}.exr")
    sc.render.filepath = path
    win_scene = bpy.context.window.scene if bpy.context.window else None
    with bpy.context.temp_override(scene=sc):
        bpy.ops.render.render(write_still=True, scene=sc.name)
    res = bpy.data.images.load(path)
    res.colorspace_settings.name = "Non-Color"
    out_px = _pixels(res)[..., :3].copy()
    bpy.data.images.remove(res)
    bpy.data.objects.remove(cam)
    bpy.data.scenes.remove(sc)
    if win_scene:
        bpy.context.window.scene = win_scene
    try:
        os.remove(path)
    except OSError:
        pass
    return out_px


if __name__ == "__main__":
    # self-test: noisy gradient in, smoother gradient out
    n = 256
    img = bpy.data.images.new("JT_NoiseTest", n, n, float_buffer=True)
    rng = np.random.default_rng(1)
    base = np.linspace(0, 2, n, dtype=np.float32)[None, :].repeat(n, 0)
    noisy = np.clip(base[..., None] * (1 + 0.6 * rng.standard_normal((n, n, 1))), 0, None).repeat(3, -1)
    img.pixels.foreach_set(np.concatenate([noisy, np.ones((n, n, 1), np.float32)], -1).astype(np.float32).ravel())
    out = denoise_image(img)
    print("DENOISE TEST noise before", float(np.std(noisy - base[..., None])), "after", float(np.std(out - base[..., None])))
