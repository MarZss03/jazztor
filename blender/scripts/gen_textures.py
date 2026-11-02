"""JazzTor procedural PBR texture generator.

Run:  blender -b --factory-startup --python D:/Jazztor/blender/scripts/gen_textures.py
Writes PNGs to D:/Jazztor/blender/textures. Everything is procedural (numpy) so
no third-party photography or copyrighted artwork is involved.

Array convention: row 0 = bottom of the image (v = 0), matching Blender pixels.
ORM maps follow glTF: R = occlusion, G = roughness, B = metallic.
"""
import os
import numpy as np
import bpy

OUT = "D:/Jazztor/blender/textures"
os.makedirs(OUT, exist_ok=True)


# ---------------------------------------------------------------- noise utils
def _sample(grid, x, y):
    gy, gx = grid.shape
    x0 = np.floor(x).astype(np.int64)
    y0 = np.floor(y).astype(np.int64)
    fx = x - x0
    fy = y - y0
    sx = fx * fx * (3 - 2 * fx)
    sy = fy * fy * (3 - 2 * fy)
    x0m, x1m = x0 % gx, (x0 + 1) % gx
    y0m, y1m = y0 % gy, (y0 + 1) % gy
    a = grid[y0m, x0m]
    b = grid[y0m, x1m]
    c = grid[y1m, x0m]
    d = grid[y1m, x1m]
    return (a + (b - a) * sx) + ((c + (d - c) * sx) - (a + (b - a) * sx)) * sy


def fbm(u, v, gx, gy, octaves=4, seed=0, gain=0.5):
    """Tileable fractal value noise in [0,1]. u,v in [0,1) units."""
    rng = np.random.default_rng(seed)
    total = np.zeros_like(u)
    amp, norm = 1.0, 0.0
    for o in range(octaves):
        cx, cy = gx * 2 ** o, gy * 2 ** o
        grid = rng.random((cy, cx))
        total += _sample(grid, u * cx, v * cy) * amp
        norm += amp
        amp *= gain
    return total / norm


def uv(h, w):
    v, u = np.meshgrid(np.arange(h) / h, np.arange(w) / w, indexing="ij")
    return u, v


def smoothstep(a, b, x):
    t = np.clip((x - a) / (b - a), 0, 1)
    return t * t * (3 - 2 * t)


def normal_from_height(hgt, strength):
    dx = (np.roll(hgt, -1, 1) - np.roll(hgt, 1, 1)) * strength
    dy = (np.roll(hgt, -1, 0) - np.roll(hgt, 1, 0)) * strength
    n = np.stack([-dx, -dy, np.ones_like(hgt)], -1)
    n /= np.linalg.norm(n, axis=-1, keepdims=True)
    return n * 0.5 + 0.5


def lerp3(a, b, t):
    a = np.asarray(a, np.float32) / 255.0
    b = np.asarray(b, np.float32) / 255.0
    return a + (b - a) * t[..., None]


def save(name, arr, colorspace="sRGB"):
    arr = np.clip(arr, 0, 1).astype(np.float32)
    if arr.ndim == 2:
        arr = np.repeat(arr[..., None], 3, -1)
    h, w = arr.shape[:2]
    if arr.shape[2] == 3:
        arr = np.concatenate([arr, np.ones((h, w, 1), np.float32)], -1)
    img = bpy.data.images.new(name, w, h, alpha=True)
    img.colorspace_settings.name = colorspace
    img.pixels.foreach_set(arr.ravel())
    img.filepath_raw = os.path.join(OUT, name + ".png")
    img.file_format = "PNG"
    img.save()
    bpy.data.images.remove(img)
    print("wrote", name, w, h)


def orm(occ, rough, metal):
    return np.stack([occ, rough, metal], -1)


# ---------------------------------------------------------------- walnut
def walnut(n=2048):
    u, v = uv(n, n)
    warp = fbm(u, v, 2, 6, 4, seed=11)
    warp2 = fbm(u, v, 6, 24, 3, seed=12)
    rings = v * 34 + warp * 7.0 + warp2 * 1.2
    t = rings - np.floor(rings)
    late = np.exp(-((t - 0.55) / 0.16) ** 2)          # dark latewood bands
    fibre = fbm(u, v, 3, 600, 2, seed=13)              # fine stretched fibres
    figure = fbm(u, v, 8, 3, 3, seed=14)               # soft cross figure
    pores_n = fbm(u, v, 40, 1400, 1, seed=15)
    pores = smoothstep(0.80, 0.93, pores_n)            # elongated pores

    tone = 0.55 - 0.42 * late + 0.18 * (fibre - 0.5) + 0.20 * (figure - 0.5)
    tone = np.clip(tone, 0, 1)
    col = lerp3((74, 34, 17), (168, 88, 46), tone)
    col = col * (1 - 0.45 * pores[..., None])
    hgt = -pores * 1.0 + late * 0.15 + fibre * 0.25
    rough = 0.36 + 0.10 * late + 0.30 * pores
    save("JT_Walnut_BaseColor", col)
    save("JT_Walnut_Normal", normal_from_height(hgt, 1.6), "Non-Color")
    save("JT_Walnut_ORM", orm(1 - 0.25 * pores, rough, np.zeros_like(rough)), "Non-Color")


# ---------------------------------------------------------------- black marble
def marble(n=2048):
    """Black marble: veins are thin contour lines of a domain-warped fbm (Nero Marquina-like)."""
    u, v = uv(n, n)
    w1 = fbm(u, v, 2, 2, 5, seed=21)
    w2 = fbm(u, v, 2, 2, 5, seed=22)
    uu, vv = (u + 0.45 * (w1 - 0.5)) % 1, (v + 0.45 * (w2 - 0.5)) % 1
    f1 = fbm(uu, vv, 3, 3, 6, seed=23)
    f2 = fbm(uu, vv, 5, 5, 5, seed=24)
    f3 = fbm(u, v, 9, 9, 4, seed=25)
    major = np.exp(-((f1 - 0.5) * 95) ** 2)
    minor = np.exp(-((f2 - 0.47) * 160) ** 2) * 0.55
    hair = np.exp(-((f3 - 0.52) * 260) ** 2) * 0.3
    halo = np.exp(-((f1 - 0.5) * 22) ** 2) * 0.12
    veins = np.clip(major + minor + hair, 0, 1)
    cloud = fbm(u, v, 5, 5, 4, seed=26)
    base = lerp3((8, 8, 9), (22, 21, 21), cloud) + halo[..., None] * 0.18
    vein_col = lerp3((120, 116, 110), (205, 200, 190), major)
    col = base * (1 - veins[..., None]) + vein_col * veins[..., None]
    rough = 0.22 + 0.08 * veins + 0.05 * cloud
    save("JT_Marble_BaseColor", col)
    save("JT_Marble_ORM", orm(np.ones_like(rough), rough, np.zeros_like(rough)), "Non-Color")
    save("JT_Marble_Normal", normal_from_height(-veins * 0.3, 0.6), "Non-Color")

# ---------------------------------------------------------------- brushed metal (streaks along u)
def brushed(n=1024):
    u, v = uv(n, n)
    streak = fbm(u, v, 2, 512, 3, seed=31)
    fine = fbm(u, v, 1, 1024, 1, seed=32)
    blot = fbm(u, v, 4, 4, 3, seed=33)
    rough = 0.26 + 0.10 * (streak - 0.5) + 0.05 * fine + 0.06 * (blot - 0.5)
    save("JT_Brushed_ORM", orm(np.ones_like(rough), rough, np.ones_like(rough)), "Non-Color")
    save("JT_Brushed_Normal", normal_from_height(streak * 0.6 + fine * 0.4, 0.35), "Non-Color")


# ---------------------------------------------------------------- vinyl record (planar UV over disc)
def record(n=2048):
    u, v = uv(n, n)
    x, y = (u - 0.5) * 2, (v - 0.5) * 2               # -1..1, record radius = 1
    r = np.sqrt(x * x + y * y)
    label_r = 50.0 / 152.4
    lead_in, run_out = 146.0 / 152.4, 60.0 / 152.4
    groove_zone = (r > run_out) & (r < lead_in)
    gaps = np.zeros_like(r)
    for gr in (0.88, 0.79, 0.69, 0.60, 0.51):          # track separators
        gaps = np.maximum(gaps, np.exp(-((r - gr) / 0.0045) ** 2))
    groove = 0.5 + 0.5 * np.sin(r * 2 * np.pi * 380)
    wear = fbm(u, v, 6, 6, 3, seed=41)
    hgt = np.where(groove_zone, groove * (1 - gaps) * 0.6, 0) + 0.05 * wear

    base = np.full(r.shape + (3,), 9 / 255.0, np.float32)
    base[groove_zone] = 13 / 255.0
    rough = np.where(groove_zone, 0.2 - 0.1 * gaps, 0.12) + 0.06 * (wear - 0.5)

    # terracotta label with printed rings (no text, no marks)
    lab = r < label_r
    lr = r / label_r
    ring = (np.abs(lr - 0.86) < 0.012) | (np.abs(lr - 0.80) < 0.004) | (np.abs(lr - 0.30) < 0.006)
    paper = fbm(u, v, 40, 40, 2, seed=42)
    label_col = lerp3((150, 70, 42), (196, 104, 66), paper * 0.6 + (1 - lr) * 0.4)
    label_col[ring] = np.asarray((120, 54, 32), np.float32) / 255
    base[lab] = label_col[lab]
    rough = np.where(lab, 0.62, rough)
    hgt = np.where(lab, 0.0, hgt)
    hole = r < (3.6 / 152.4)
    base[hole] = 0.02
    save("JT_Vinyl_BaseColor", base)
    save("JT_Vinyl_ORM", orm(np.ones_like(r), rough, np.zeros_like(r)), "Non-Color")
    save("JT_Vinyl_Normal", normal_from_height(hgt, 0.9), "Non-Color")

    # anisotropy direction map for three.js (tangential to grooves), RG = dir, B = strength
    tx, ty = -y / np.maximum(r, 1e-4), x / np.maximum(r, 1e-4)
    strength = np.where(groove_zone, 0.85, 0.0)
    save("JT_Vinyl_Anisotropy", np.stack([tx * 0.5 + 0.5, ty * 0.5 + 0.5, strength], -1), "Non-Color")


# ---------------------------------------------------------------- album covers (abstract, original)
PALETTES = [
    [(232, 222, 200), (20, 20, 22), (190, 88, 58)],    # cream / black / rust
    [(26, 38, 62), (214, 172, 92), (230, 224, 210)],   # navy / ochre / cream
    [(150, 162, 140), (34, 30, 28), (226, 216, 194)],  # sage / ink / paper
    [(120, 32, 34), (236, 228, 210), (24, 24, 26)],    # oxblood / cream / black
    [(60, 92, 112), (220, 120, 64), (238, 232, 216)],  # blue / tangerine / cream
    [(32, 32, 34), (198, 160, 96), (110, 120, 128)],   # charcoal / brass / slate
    [(222, 206, 170), (88, 58, 40), (40, 70, 64)],     # sand / umber / teal-dark
    [(16, 18, 26), (210, 70, 52), (220, 212, 196)],    # night / red / cream
]


def cover(idx, n=1024):
    rng = np.random.default_rng(100 + idx)
    u, v = uv(n, n)
    pal = [np.asarray(c, np.float32) / 255 for c in PALETTES[idx % len(PALETTES)]]
    col = np.empty((n, n, 3), np.float32)
    col[:] = pal[0]
    grain = fbm(u, v, 64, 64, 2, seed=200 + idx)
    distress = fbm(u, v, 24, 24, 3, seed=300 + idx)
    style = idx % 3
    if style == 0:      # blocky mosaic like the concept sleeve
        cells = 6
        cu, cv = (u * cells).astype(int), (v * cells).astype(int)
        mask = rng.random((cells, cells))[cv, cu] > 0.55
        col[mask] = pal[1]
        x0, y0 = rng.uniform(0.35, 0.6), rng.uniform(0.05, 0.3)
        blk = (u > x0) & (u < x0 + 0.3) & (v > y0) & (v < y0 + 0.28)
        col[blk] = pal[2]
    elif style == 1:    # stacked horizontal bars
        bars = rng.uniform(0, 1, 7)
        for i, b in enumerate(np.sort(bars)):
            band = np.abs(v - b) < rng.uniform(0.01, 0.06)
            col[band & (u > rng.uniform(0, 0.3)) & (u < rng.uniform(0.6, 1))] = pal[1 + i % 2]
    else:               # circle + offset rectangle
        cx, cy, rr = rng.uniform(0.35, 0.65), rng.uniform(0.4, 0.7), rng.uniform(0.18, 0.3)
        col[(u - cx) ** 2 + (v - cy) ** 2 < rr * rr] = pal[1]
        col[(u > 0.08) & (u < 0.5) & (v > 0.08) & (v < 0.22)] = pal[2]
    wear = smoothstep(0.62, 0.75, distress)[..., None]
    col = col * (1 - wear) + pal[0] * wear * 0.92 + col * wear * 0.08
    col *= (0.93 + 0.12 * grain)[..., None]
    edge = np.minimum(np.minimum(u, 1 - u), np.minimum(v, 1 - v))
    col *= (0.82 + 0.18 * smoothstep(0.0, 0.02, edge))[..., None]
    save(f"JT_Cover_{idx:02d}", col)


def spine_atlas(n=1024, count=64):
    """Vertical spine strips for the bulk sleeves; column i = spine i."""
    rng = np.random.default_rng(77)
    u, v = uv(n, n)
    col = np.empty((n, n, 3), np.float32)
    idx = np.minimum((u * count).astype(int), count - 1)
    base_cols = []
    choices = [(28, 30, 36), (196, 186, 164), (120, 40, 36), (38, 58, 92), (170, 120, 60),
               (60, 72, 64), (210, 200, 180), (24, 24, 24), (140, 70, 44), (90, 96, 110)]
    for _ in range(count):
        c = np.asarray(choices[rng.integers(len(choices))], np.float32) / 255
        base_cols.append(c * rng.uniform(0.8, 1.1))
    base_cols = np.asarray(base_cols)
    col[:] = base_cols[idx]
    # thin title bars and catalogue marks rendered as abstract rules, not text
    for i in range(count):
        m = idx == i
        accent = np.asarray(choices[rng.integers(len(choices))], np.float32) / 255
        for _ in range(rng.integers(1, 4)):
            a = rng.uniform(0.1, 0.85)
            col[m & (v > a) & (v < a + rng.uniform(0.02, 0.09))] = accent
    local = (u * count) % 1
    col *= (0.75 + 0.25 * smoothstep(0, 0.15, local) * smoothstep(1, 0.85, local))[..., None]
    col *= (0.92 + 0.1 * fbm(u, v, 64, 8, 2, seed=78))[..., None]
    save("JT_Spines", col)


# ---------------------------------------------------------------- fabric, plaster, facades
def fabric(n=1024):
    u, v = uv(n, n)
    weave = 0.5 + 0.25 * np.sin(u * 2 * np.pi * 220) + 0.25 * np.sin(v * 2 * np.pi * 220)
    slub = fbm(u, v, 8, 160, 2, seed=51)
    tone = 0.55 + 0.25 * (slub - 0.5) + 0.15 * (weave - 0.5)
    col = lerp3((70, 58, 46), (132, 112, 90), tone)
    save("JT_Fabric_BaseColor", col)
    save("JT_Fabric_Normal", normal_from_height(weave * 0.6 + slub * 0.4, 1.2), "Non-Color")


def plaster(n=1024):
    u, v = uv(n, n)
    m = fbm(u, v, 6, 6, 5, seed=61)
    col = lerp3((24, 22, 21), (40, 37, 34), m)
    save("JT_Plaster_BaseColor", col)
    save("JT_Plaster_Normal", normal_from_height(fbm(u, v, 32, 32, 3, seed=62), 1.0), "Non-Color")


def facades(n=1024, cols=16, rows=32):
    rng = np.random.default_rng(91)
    u, v = uv(n, n)
    cu = np.minimum((u * cols).astype(int), cols - 1)
    cv = np.minimum((v * rows).astype(int), rows - 1)
    lu, lv = (u * cols) % 1, (v * rows) % 1
    pane = (lu > 0.08) & (lu < 0.92) & (lv > 0.18) & (lv < 0.9)
    punched = (lu > 0.22) & (lu < 0.78) & (lv > 0.25) & (lv < 0.85)

    lit = rng.random((rows, cols))
    warmth = rng.random((rows, cols))
    level = np.where(lit > 0.8, rng.uniform(0.25, 1.0, (rows, cols)), 0.0)
    lvl = level[cv, cu]
    warm = np.stack([np.full_like(warmth, 1.0), 0.72 + 0.12 * warmth, 0.42 + 0.3 * warmth], -1)
    emis = warm[cv, cu] * lvl[..., None]
    glass_tint = fbm(u, v, 4, 8, 2, seed=92)

    glass = lerp3((46, 62, 78), (92, 116, 134), glass_tint)
    glass[~pane] = np.asarray((58, 62, 66), np.float32) / 255
    save("JT_Facade_Glass_BaseColor", glass)
    save("JT_Facade_Glass_Emissive", np.where(pane[..., None], emis, 0))

    conc = lerp3((120, 116, 108), (150, 146, 138), glass_tint)
    conc[punched] = np.asarray((40, 48, 56), np.float32) / 255
    save("JT_Facade_Concrete_BaseColor", conc)
    save("JT_Facade_Concrete_Emissive", np.where(punched[..., None], emis, 0))


if __name__ == "__main__":
    walnut()
    marble()
    brushed()
    record()
    for i in range(8):
        cover(i)
    spine_atlas()
    fabric()
    plaster()
    facades()
    print("TEXTURES DONE")
