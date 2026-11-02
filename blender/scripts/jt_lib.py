"""Shared helpers for JazzTor Blender build scripts (Blender 4.x / 5.x, metres, Z-up)."""
import math
import os
import bpy
import bmesh
from mathutils import Vector, Matrix

TEX = "D:/Jazztor/blender/textures"


# ------------------------------------------------------------------ scene utils
def reset_scene():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    s = bpy.context.scene
    s.unit_settings.system = "METRIC"
    s.unit_settings.scale_length = 1.0


def collection(name, parent=None):
    col = bpy.data.collections.get(name) or bpy.data.collections.new(name)
    if col.name not in [c.name for c in (parent or bpy.context.scene.collection).children]:
        (parent or bpy.context.scene.collection).children.link(col)
    return col


def link(obj, col):
    for c in obj.users_collection:
        c.objects.unlink(obj)
    col.objects.link(obj)
    return obj


def obj_from_bm(name, bm, col, mat=None, smooth_angle=35.0):
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    ob = bpy.data.objects.new(name, me)
    col.objects.link(ob)
    if mat:
        assign(ob, mat)
    shade(ob, smooth_angle)
    return ob


def shade(ob, angle=35.0):
    me = ob.data
    if angle is None:
        return
    for p in me.polygons:
        p.use_smooth = True
    try:
        me.set_sharp_from_angle(angle=math.radians(angle))
    except Exception:
        pass


def assign(ob, *mats):
    """Replace material slots, preserving per-face material indices (clear() resets them)."""
    idx = [p.material_index for p in ob.data.polygons]
    ob.data.materials.clear()
    for m in mats:
        ob.data.materials.append(m)
    for p, i in zip(ob.data.polygons, idx):
        p.material_index = min(i, len(mats) - 1)


def empty(name, col, loc=(0, 0, 0), parent=None, size=0.02):
    e = bpy.data.objects.new(name, None)
    e.empty_display_type = "PLAIN_AXES"
    e.empty_display_size = size
    col.objects.link(e)
    e.location = loc
    if parent:
        set_parent(e, parent)
    return e


def world(ob):
    """World matrix computed from basis (matrix_world is stale until a depsgraph update)."""
    m = ob.matrix_basis.copy()
    if ob.parent:
        m = world(ob.parent) @ ob.matrix_parent_inverse @ m
    return m


def set_world(ob, mw):
    if ob.parent:
        ob.matrix_basis = (world(ob.parent) @ ob.matrix_parent_inverse).inverted() @ mw
    else:
        ob.matrix_basis = mw


def set_parent(child, parent):
    """Parent keeping world transform."""
    mw = world(child)
    child.parent = parent
    child.matrix_parent_inverse = Matrix.Identity(4)
    set_world(child, mw)


def set_origin(ob, world_point):
    """Move object origin to a world point without moving geometry."""
    mw = world(ob)
    kids = [(c, world(c)) for c in ob.children]
    local = mw.inverted() @ Vector(world_point)
    ob.data.transform(Matrix.Translation(-local), shape_keys=True)  # morph targets move with the base shape
    set_world(ob, mw @ Matrix.Translation(local))
    for c, cw in kids:
        set_world(c, cw)


def apply_eval(ob):
    """Bake modifiers into mesh data without bpy.ops."""
    dg = bpy.context.evaluated_depsgraph_get()
    ev = ob.evaluated_get(dg)
    me = bpy.data.meshes.new_from_object(ev)
    old = ob.data
    ob.modifiers.clear()
    ob.data = me
    if old.users == 0:
        bpy.data.meshes.remove(old)


def boolean(ob, cutter, op="DIFFERENCE", self_intersect=False):
    m = ob.modifiers.new("bool", "BOOLEAN")
    m.object = cutter
    m.operation = op
    m.use_self = self_intersect
    bpy.context.view_layer.update()  # cutter transforms must be evaluated before the boolean
    try:
        m.solver = "EXACT"
    except TypeError:
        pass
    apply_eval(ob)


def join(objs, name):
    """Join meshes (keeping materials) into the first object."""
    base = objs[0]
    bm = bmesh.new()
    mats = []
    for o in objs:
        me = o.data.copy()
        me.transform(world(base).inverted() @ world(o))
        offset = []
        for m in me.materials:
            if m not in mats:
                mats.append(m)
            offset.append(mats.index(m))
        for p in me.polygons:
            if offset:
                p.material_index = offset[p.material_index]
        bm.from_mesh(me)
        bpy.data.meshes.remove(me)
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    for m in mats:
        me.materials.append(m)
    for o in objs[1:]:
        bpy.data.objects.remove(o, do_unlink=True)
    old = base.data
    base.data = me
    base.name = name
    if old.users == 0:
        bpy.data.meshes.remove(old)
    return base


# ------------------------------------------------------------------ geometry
def box_bm(sx, sy, sz, center=(0, 0, 0), bevel=0.0, segments=3):
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1.0)
    bmesh.ops.scale(bm, vec=(sx, sy, sz), verts=bm.verts)
    bmesh.ops.translate(bm, vec=Vector(center), verts=bm.verts)
    if bevel > 0:
        bmesh.ops.bevel(bm, geom=list(bm.edges), offset=bevel, segments=segments,
                        profile=0.5, affect="EDGES", clamp_overlap=True)
    return bm


def box(name, col, size, center=(0, 0, 0), mat=None, bevel=0.0, segments=3, uv_scale=0.5):
    bm = box_bm(*size, center=(0, 0, 0), bevel=bevel, segments=segments)
    box_uv(bm, uv_scale, (center[0] / uv_scale, center[2] / uv_scale))
    ob = obj_from_bm(name, bm, col, mat, 35.0 if bevel else 30.0)
    ob.location = center
    return ob


def box_uv(bm, scale=0.5, offset=(0.0, 0.0)):
    """Tri-planar style box projection; texture repeats every `scale` metres."""
    uvl = bm.loops.layers.uv.verify()
    for f in bm.faces:
        n = f.normal
        ax = max(range(3), key=lambda i: abs(n[i]))
        for l in f.loops:
            co = l.vert.co
            if ax == 2:
                u, v = co.x, co.y
            elif ax == 0:
                u, v = co.y, co.z
            else:
                u, v = co.x, co.z
            l[uvl].uv = (u / scale + offset[0], v / scale + offset[1])


def lathe_bm(profile, segments=96, angle=2 * math.pi, center=(0, 0)):
    """Revolve [(r, z), ...] around Z. UV: u = angle (turned/brushed marks), v = profile length.
    Points with r == 0 become poles."""
    bm = bmesh.new()
    uvl = bm.loops.layers.uv.verify()
    full = abs(angle - 2 * math.pi) < 1e-6
    cols = segments if full else segments + 1
    lengths = [0.0]
    for i in range(1, len(profile)):
        (r0, z0), (r1, z1) = profile[i - 1], profile[i]
        lengths.append(lengths[-1] + math.hypot(r1 - r0, z1 - z0))
    total = lengths[-1] or 1.0
    rings = []
    for (r, z) in profile:
        if r < 1e-7:
            rings.append([bm.verts.new((center[0], center[1], z))])
        else:
            ring = []
            for j in range(cols):
                a = angle * j / segments
                ring.append(bm.verts.new((center[0] + r * math.cos(a), center[1] + r * math.sin(a), z)))
            rings.append(ring)
    for i in range(len(profile) - 1):
        A, B = rings[i], rings[i + 1]
        v0, v1 = lengths[i] / total, lengths[i + 1] / total
        for j in range(segments):
            j1 = (j + 1) % cols if full else j + 1
            u0, u1 = j / segments, (j + 1) / segments
            if len(A) == 1 and len(B) == 1:
                continue
            if len(A) == 1:
                verts, uvs = [A[0], B[j], B[j1]], [((u0 + u1) / 2, v0), (u0, v1), (u1, v1)]
            elif len(B) == 1:
                verts, uvs = [A[j], B[0], A[j1]], [(u0, v0), ((u0 + u1) / 2, v1), (u1, v0)]
            else:
                verts, uvs = [A[j], B[j], B[j1], A[j1]], [(u0, v0), (u0, v1), (u1, v1), (u1, v0)]
            try:
                f = bm.faces.new(verts)
            except ValueError:
                continue
            for l, t in zip(f.loops, uvs):
                l[uvl].uv = t
    bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-7)
    bm.normal_update()
    # make normals point outward from axis
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    return bm


def lathe(name, col, profile, mat=None, segments=96, loc=(0, 0, 0), smooth=40.0):
    ob = obj_from_bm(name, lathe_bm(profile, segments), col, mat, smooth)
    ob.location = loc
    return ob


def cylinder(name, col, r, h, loc=(0, 0, 0), mat=None, segments=64, chamfer=0.0005):
    c = min(chamfer, r * 0.3, h * 0.3)
    prof = [(0, 0), (r - c, 0), (r, c), (r, h - c), (r - c, h), (0, h)]
    return lathe(name, col, prof, mat, segments, loc)


def tube_along(name, col, pts, radius, mat=None, sides=24):
    """Sweep a circle along a polyline (pts as Vectors) with parallel-transport frames."""
    bm = bmesh.new()
    uvl = bm.loops.layers.uv.verify()
    pts = [Vector(p) for p in pts]
    tangents = []
    for i in range(len(pts)):
        a = pts[max(i - 1, 0)]
        b = pts[min(i + 1, len(pts) - 1)]
        tangents.append((b - a).normalized())
    up = Vector((0, 0, 1))
    normal = tangents[0].cross(up)
    if normal.length < 1e-6:
        normal = tangents[0].cross(Vector((1, 0, 0)))
    normal.normalize()
    rings = []
    length = [0.0]
    for i in range(1, len(pts)):
        length.append(length[-1] + (pts[i] - pts[i - 1]).length)
    for i, p in enumerate(pts):
        if i > 0:
            axis = tangents[i - 1].cross(tangents[i])
            if axis.length > 1e-8:
                ang = tangents[i - 1].angle(tangents[i])
                normal = Matrix.Rotation(ang, 3, axis.normalized()) @ normal
        bino = tangents[i].cross(normal).normalized()
        ring = []
        for j in range(sides):
            a = 2 * math.pi * j / sides
            ring.append(bm.verts.new(p + (normal * math.cos(a) + bino * math.sin(a)) * radius))
        rings.append(ring)
    for i in range(len(rings) - 1):
        for j in range(sides):
            j1 = (j + 1) % sides
            f = bm.faces.new([rings[i][j], rings[i][j1], rings[i + 1][j1], rings[i + 1][j]])
            for l, t in zip(f.loops, [(j / sides, length[i]), ((j + 1) / sides, length[i]),
                                      ((j + 1) / sides, length[i + 1]), (j / sides, length[i + 1])]):
                l[uvl].uv = (t[0], t[1] * 10)
    # end caps get planar UVs: all-zero UVs give zero derivatives and NaN tangent frames under normal maps
    for cap in (list(reversed(rings[0])), rings[-1]):
        f = bm.faces.new(cap)
        for l in f.loops:
            j = rings[0].index(l.vert) if l.vert in rings[0] else rings[-1].index(l.vert)
            a = 2 * math.pi * j / sides
            l[uvl].uv = (0.5 + 0.5 * math.cos(a) * radius * 10, 0.5 + 0.5 * math.sin(a) * radius * 10)
    bm.normal_update()
    return obj_from_bm(name, bm, col, mat, 60.0)


def catmull(points, samples=12):
    pts = [Vector(p) for p in points]
    out = []
    for i in range(len(pts) - 1):
        p0 = pts[max(i - 1, 0)]
        p1, p2 = pts[i], pts[i + 1]
        p3 = pts[min(i + 2, len(pts) - 1)]
        for s in range(samples):
            t = s / samples
            t2, t3 = t * t, t * t * t
            out.append(0.5 * ((2 * p1) + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 +
                              (-p0 + 3 * p1 - 3 * p2 + p3) * t3))
    out.append(pts[-1])
    return out


def collider(name, col, size, center, parent=None):
    """Simplified invisible collider for pointer picking (COL_ prefix)."""
    ob = box("COL_" + name, col, size, center)
    ob.display_type = "WIRE"
    ob.hide_render = True
    ob["jt_collider"] = True
    if parent:
        set_parent(ob, parent)
    return ob


# ------------------------------------------------------------------ materials
def _img(path, non_color=False):
    img = bpy.data.images.load(path, check_existing=True)
    if non_color:
        img.colorspace_settings.name = "Non-Color"
    return img


def material(name, base=(0.8, 0.8, 0.8), metal=0.0, rough=0.5, tex=None, orm=None, normal=None,
             normal_strength=1.0, emission=None, emission_tex=None, emission_strength=1.0,
             transmission=0.0, ior=1.5, alpha=1.0, coat=0.0, coat_rough=0.1, uv_tint=None):
    m = bpy.data.materials.get(name)
    if m:
        return m
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    nt = m.node_tree
    bsdf = next(n for n in nt.nodes if n.type == "BSDF_PRINCIPLED")
    bsdf.inputs["Base Color"].default_value = (*base, 1)
    bsdf.inputs["Metallic"].default_value = metal
    bsdf.inputs["Roughness"].default_value = rough
    bsdf.inputs["IOR"].default_value = ior
    if transmission:
        bsdf.inputs["Transmission Weight"].default_value = transmission
    if coat:
        bsdf.inputs["Coat Weight"].default_value = coat
        bsdf.inputs["Coat Roughness"].default_value = coat_rough
    if alpha < 1.0:
        bsdf.inputs["Alpha"].default_value = alpha
        try:
            m.surface_render_method = "BLENDED"
        except AttributeError:
            m.blend_method = "BLEND"
    x = -600
    if tex:
        t = nt.nodes.new("ShaderNodeTexImage")
        t.image = _img(f"{TEX}/{tex}.png")
        t.location = (x, 300)
        if uv_tint:
            mix = nt.nodes.new("ShaderNodeMix")
            mix.data_type = "RGBA"
            mix.blend_type = "MULTIPLY"
            mix.inputs["Factor"].default_value = 1.0
            mix.inputs[7].default_value = (*uv_tint, 1)
            nt.links.new(t.outputs["Color"], mix.inputs[6])
            nt.links.new(mix.outputs[2], bsdf.inputs["Base Color"])
        else:
            nt.links.new(t.outputs["Color"], bsdf.inputs["Base Color"])
    if orm:
        t = nt.nodes.new("ShaderNodeTexImage")
        t.image = _img(f"{TEX}/{orm}.png", True)
        t.location = (x, 0)
        sep = nt.nodes.new("ShaderNodeSeparateColor")
        sep.location = (x + 300, 0)
        nt.links.new(t.outputs["Color"], sep.inputs["Color"])
        nt.links.new(sep.outputs["Green"], bsdf.inputs["Roughness"])
        if metal > 0:
            nt.links.new(sep.outputs["Blue"], bsdf.inputs["Metallic"])
    if normal:
        t = nt.nodes.new("ShaderNodeTexImage")
        t.image = _img(f"{TEX}/{normal}.png", True)
        t.location = (x, -300)
        nm = nt.nodes.new("ShaderNodeNormalMap")
        nm.location = (x + 300, -300)
        nm.inputs["Strength"].default_value = normal_strength
        nt.links.new(t.outputs["Color"], nm.inputs["Color"])
        nt.links.new(nm.outputs["Normal"], bsdf.inputs["Normal"])
    if emission:
        bsdf.inputs["Emission Color"].default_value = (*emission, 1)
        bsdf.inputs["Emission Strength"].default_value = emission_strength
    if emission_tex:
        t = nt.nodes.new("ShaderNodeTexImage")
        t.image = _img(f"{TEX}/{emission_tex}.png")
        t.location = (x, -600)
        nt.links.new(t.outputs["Color"], bsdf.inputs["Emission Color"])
        bsdf.inputs["Emission Strength"].default_value = emission_strength
    return m


def palette():
    """The JazzTor material system. Linear-space colours."""
    P = {}
    # walnut: oiled satin lacquer (thin, rough coat) - never a glossy plastic shell
    P["walnut"] = material("JT_Walnut", tex="JT_Walnut_BaseColor", orm="JT_Walnut_ORM",
                           normal="JT_Walnut_Normal", normal_strength=0.8, coat=0.18, coat_rough=0.38)
    # three brass finishes from the same champagne brushed source: satin (platter, knobs), polished (inlays,
    # rings - flat low roughness), aged (screws, collars, small hardware - darker, rougher)
    P["brass"] = material("JT_Brass_Satin", tex="JT_Brass_BaseColor", metal=1.0, orm="JT_Brushed_ORM",
                          normal="JT_Brushed_Normal", normal_strength=0.3)
    P["brass_polished"] = material("JT_Brass_Polished", tex="JT_Brass_BaseColor", metal=1.0, rough=0.13)
    P["brass_aged"] = material("JT_Brass_Aged", tex="JT_Brass_BaseColor", metal=1.0, orm="JT_Brushed_ORM",
                               normal="JT_Brushed_Normal", normal_strength=0.5, uv_tint=(0.70, 0.60, 0.47))
    P["nickel"] = material("JT_Nickel_Satin", base=(0.78, 0.74, 0.66), metal=1.0, rough=0.2)
    P["black_metal"] = material("JT_Blackened_Metal", base=(0.025, 0.024, 0.023), metal=0.8, rough=0.34)
    P["black_gloss"] = material("JT_Black_Gloss", base=(0.01, 0.01, 0.01), metal=0.0, rough=0.12, coat=1.0)
    P["rubber"] = material("JT_Rubber", base=(0.012, 0.012, 0.012), rough=0.85)
    P["vinyl"] = material("JT_Vinyl", tex="JT_Vinyl_BaseColor", orm="JT_Vinyl_ORM", normal="JT_Vinyl_Normal",
                          normal_strength=0.4)
    P["vinyl_edge"] = material("JT_Vinyl_Edge", base=(0.008, 0.008, 0.009), rough=0.25)
    P["led"] = material("JT_Amber_Indicator", base=(0.3, 0.12, 0.02), rough=0.3,
                        emission=(1.0, 0.45, 0.08), emission_strength=4.0)
    P["marble"] = material("JT_Marble_Black", tex="JT_Marble_BaseColor", orm="JT_Marble_ORM",
                           normal="JT_Marble_Normal", normal_strength=0.3)
    P["plaster"] = material("JT_Plaster_Dark", tex="JT_Plaster_BaseColor", rough=0.9,
                            normal="JT_Plaster_Normal", normal_strength=0.3)
    P["fabric"] = material("JT_Curtain_Fabric", tex="JT_Fabric_BaseColor", rough=0.92,
                           normal="JT_Fabric_Normal", normal_strength=0.6)
    P["felt"] = material("JT_Felt", base=(0.03, 0.025, 0.022), rough=1.0)
    P["bronze"] = material("JT_Dark_Bronze", base=(0.06, 0.045, 0.032), metal=1.0, rough=0.38)
    P["glass_window"] = material("JT_Window_Glass", base=(0.02, 0.025, 0.03), rough=0.03, alpha=0.12)
    P["crystal"] = material("JT_Crystal", base=(1, 1, 1), rough=0.02, transmission=1.0, ior=1.52)
    P["whiskey"] = material("JT_Whiskey_Liquid", base=(0.78, 0.36, 0.08), rough=0.02, transmission=1.0, ior=1.36)
    P["ice"] = material("JT_Ice", base=(0.95, 0.97, 1.0), rough=0.08, transmission=1.0, ior=1.31)
    P["stone"] = material("JT_Black_Stone", base=(0.018, 0.018, 0.019), rough=0.22)
    P["lamp_shade_in"] = material("JT_Lamp_Diffuser", base=(0.95, 0.88, 0.75), rough=0.8,
                                  emission=(1.0, 0.72, 0.42), emission_strength=6.0)
    P["paper"] = material("JT_Caption_Paper", base=(0.86, 0.80, 0.68), rough=0.85)
    P["sleeve_paper"] = material("JT_Inner_Sleeve", base=(0.82, 0.78, 0.70), rough=0.9)
    P["spines"] = material("JT_Spines", tex="JT_Spines", rough=0.75)
    P["wood_floor"] = material("JT_Floor_Walnut", tex="JT_Walnut_BaseColor", orm="JT_Walnut_ORM",
                               uv_tint=(0.45, 0.42, 0.40))
    P["ceiling"] = material("JT_Ceiling", base=(0.03, 0.028, 0.026), rough=0.95)
    for i in range(8):
        P[f"cover{i}"] = material(f"JT_Cover_{i:02d}", tex=f"JT_Cover_{i:02d}", rough=0.7)
    return P
