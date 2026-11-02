"""Visual upgrade v1 — PBR sets derived from the supplied material photographs.

Sources (never modified): D:/Jazztor/assets/materials/source/*.png (supplied by the project owner).
Outputs overwrite the procedural v0 maps in D:/Jazztor/blender/textures with the same names, so every
material that references them upgrades without remapping:
  JT_Walnut_{BaseColor,Normal,ORM}   JT_Brass_BaseColor + JT_Brushed_{ORM,Normal}   JT_Marble_{BaseColor,Normal,ORM}
  JT_Vinyl_{BaseColor,Normal,ORM,Anisotropy} at 4K with finer, lower-amplitude grooves.

Run: blender -b --factory-startup --python gen_upgrade_textures.py   (inside Use-JazztorEnv.ps1)
"""
import os
import sys
import numpy as np
import bpy

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from gen_textures import save, normal_from_height, orm, fbm, uv, smoothstep  # noqa: E402

SRC = "D:/Jazztor/assets/materials/source"


def load(name):
    img = bpy.data.images.load(f"{SRC}/{name}")
    img.colorspace_settings.name = "Non-Color"         # read stored (display-referred) values unchanged
    w, h = img.size
    px = np.empty(w * h * 4, np.float32)
    img.pixels.foreach_get(px)
    bpy.data.images.remove(img)
    return px.reshape(h, w, 4)[..., :3]


def blur(a, r):
    """Separable box blur with wrap-around (inputs are seamless tiles); 3 passes ~ gaussian."""
    out = a
    for _ in range(3):
        for axis in (0, 1):
            acc = np.zeros_like(out)
            for k in range(-r, r + 1):
                acc += np.roll(out, k, axis=axis)
            out = acc / (2 * r + 1)
    return out


def resize(a, n):
    """Bilinear resample to n x n (wrapping)."""
    h, w = a.shape[:2]
    ys = (np.arange(n) + 0.5) * h / n - 0.5
    xs = (np.arange(n) + 0.5) * w / n - 0.5
    y0 = np.floor(ys).astype(int)
    x0 = np.floor(xs).astype(int)
    fy = (ys - y0)[:, None, None] if a.ndim == 3 else (ys - y0)[:, None]
    fx = (xs - x0)[None, :, None] if a.ndim == 3 else (xs - x0)[None, :]
    y0m, y1m, x0m, x1m = y0 % h, (y0 + 1) % h, x0 % w, (x0 + 1) % w
    a00 = a[y0m][:, x0m]
    a01 = a[y0m][:, x1m]
    a10 = a[y1m][:, x0m]
    a11 = a[y1m][:, x1m]
    return (a00 * (1 - fx) + a01 * fx) * (1 - fy) + (a10 * (1 - fx) + a11 * fx) * fy


def lum(c):
    return c[..., 0] * 0.2126 + c[..., 1] * 0.7152 + c[..., 2] * 0.0722


def norm01(a, lo=1, hi=99):
    p0, p1 = np.percentile(a, [lo, hi])
    return np.clip((a - p0) / max(p1 - p0, 1e-6), 0, 1)


# ------------------------------------------------------------------ walnut (smoked American black walnut)
def walnut(n=2048):
    c = resize(load("walnut-smoked-seamless.png"), n)
    L = lum(c)
    fine = L - blur(L, 3)                    # pores and fibre
    figure = blur(L, 3) - blur(L, 24)        # growth rings / figure
    pores = smoothstep(0.35, 0.9, norm01(-fine))
    height = 0.55 * norm01(fine) + 0.45 * norm01(figure)
    rough = np.clip(0.40 + 0.22 * pores + 0.08 * (1 - norm01(figure)) + 0.05 * (fbm(*uv(n, n), 6, 6, 3, seed=301) - 0.5), 0.3, 0.8)
    occ = 1 - 0.28 * pores
    # gentle grade: keep the smoked tone, lift a touch of red so it reads as walnut under warm light
    base = np.clip(c * np.array([1.05, 0.98, 0.94], np.float32), 0, 1)
    save("JT_Walnut_BaseColor", base)
    save("JT_Walnut_Normal", normal_from_height(height, 2.2), "Non-Color")
    save("JT_Walnut_ORM", orm(occ, rough, np.zeros_like(rough)), "Non-Color")


# ------------------------------------------------------------------ brass (champagne, brushed along U)
def brass(n=2048):
    c = resize(load("brass-champagne-brushed.png"), n)
    low = blur(c, 48)                         # photographed light falloff, not part of the metal
    flat = c / np.maximum(low, 1e-3) * c.reshape(-1, 3).mean(0)
    L = lum(flat)
    streak = norm01(L - blur(L, 6))
    scratches = smoothstep(0.92, 0.99, norm01(np.abs(L - blur(L, 2))))
    # albedo of champagne brass (metallic F0), with the photo's micro-variation
    target = np.array([0.86, 0.72, 0.48], np.float32)
    base = np.clip(target * (0.88 + 0.24 * (flat / np.maximum(flat.reshape(-1, 3).mean(0), 1e-3)) * 0.5), 0, 1)
    rough = np.clip(0.30 + 0.16 * (1 - streak) + 0.12 * scratches + 0.05 * (fbm(*uv(n, n), 4, 4, 3, seed=302) - 0.5), 0.15, 0.7)
    save("JT_Brass_BaseColor", base)
    save("JT_Brushed_ORM", orm(np.ones_like(rough), rough, np.ones_like(rough)), "Non-Color")
    save("JT_Brushed_Normal", normal_from_height(streak * 0.7 + scratches * 0.3, 0.45), "Non-Color")


# ------------------------------------------------------------------ black marble with gold veins (polished)
def marble(n=2048):
    c = resize(load("marble-black-gold.png"), n)
    L = lum(c)
    veins = smoothstep(0.08, 0.35, norm01(L - blur(L, 10), 2, 99.7))
    pits = smoothstep(0.85, 1.0, norm01(blur(L, 1) - L))
    rough = np.clip(0.07 + 0.16 * veins + 0.25 * pits + 0.03 * fbm(*uv(n, n), 8, 8, 3, seed=303), 0.05, 0.6)
    save("JT_Marble_BaseColor", np.clip(c * 1.02, 0, 1))
    save("JT_Marble_ORM", orm(1 - 0.15 * pits, rough, np.zeros_like(rough)), "Non-Color")
    save("JT_Marble_Normal", normal_from_height(-veins * 0.5 - pits * 0.5, 0.8), "Non-Color")


# ------------------------------------------------------------------ vinyl (4K, fine grooves, lead-in / run-out)
def vinyl(n=3072):          # KTX2/Basis encoder limit is ~12 Mpx per image
    u, v = uv(n, n)
    x, y = (u - 0.5) * 2, (v - 0.5) * 2
    r = np.sqrt(x * x + y * y)
    R = 152.4
    label_r = 50.0 / R
    lead_in = (146.0 / R, 150.0 / R)            # smooth lead-in band at the edge
    run_out = (55.0 / R, 61.0 / R)              # run-out area with a single locked groove
    music = (r > run_out[1]) & (r < lead_in[0])
    gaps = np.zeros_like(r)
    for gr in (0.90, 0.80, 0.71, 0.62, 0.53, 0.45):
        gaps = np.maximum(gaps, np.exp(-((r - gr) / 0.0035) ** 2))
    grooves = 0.5 + 0.5 * np.sin(r * 2 * np.pi * 820)          # filtered by mips at distance; reads as sheen
    modulation = fbm(np.arctan2(y, x) / (2 * np.pi) % 1, r % 1, 64, 4, 2, seed=304)
    hgt = np.where(music, grooves * (0.35 + 0.25 * modulation) * (1 - gaps), 0)
    locked = np.exp(-((r - 57.5 / R) / 0.0012) ** 2)
    hgt = hgt + locked * 0.5
    wear = fbm(u, v, 6, 6, 3, seed=305)
    base = np.full(r.shape + (3,), 0.032, np.float32)
    base[music] = 0.040
    rough = np.where(music, 0.20 - 0.08 * gaps, 0.10) + 0.04 * (wear - 0.5)
    lab = r < label_r
    lr = r / label_r
    paper = fbm(u, v, 48, 48, 2, seed=306)
    label_col = (np.array([150, 70, 42], np.float32) + (np.array([196, 104, 66], np.float32) - [150, 70, 42])
                 * (paper * 0.6 + (1 - lr) * 0.4)[..., None]) / 255
    ring = (np.abs(lr - 0.86) < 0.010) | (np.abs(lr - 0.80) < 0.003) | (np.abs(lr - 0.30) < 0.005)
    label_col[ring] = np.array([120, 54, 32], np.float32) / 255
    base[lab] = label_col[lab]
    rough = np.where(lab, 0.62, rough)
    hgt = np.where(lab, 0.0, hgt)
    base[r < 3.6 / R] = 0.02
    save("JT_Vinyl_BaseColor", base)
    save("JT_Vinyl_ORM", orm(np.ones_like(r), rough, np.zeros_like(r)), "Non-Color")
    save("JT_Vinyl_Normal", normal_from_height(hgt, 0.35), "Non-Color")
    tx, ty = -y / np.maximum(r, 1e-4), x / np.maximum(r, 1e-4)
    save("JT_Vinyl_Anisotropy", np.stack([tx * 0.5 + 0.5, ty * 0.5 + 0.5, np.where(music, 0.9, 0.15)], -1), "Non-Color")


def _voronoi_f2_f1(n, count, seed):
    rng = np.random.default_rng(seed)
    pts = rng.random((count, 2)).astype(np.float32)
    u, v = uv(n, n)
    f1 = np.full((n, n), 9.0, np.float32)
    f2 = np.full((n, n), 9.0, np.float32)
    for px, py in pts:                       # tileable distance (wrap) to every feature point
        dx = np.abs(u - px)
        dy = np.abs(v - py)
        d = np.sqrt(np.minimum(dx, 1 - dx) ** 2 + np.minimum(dy, 1 - dy) ** 2)
        f2 = np.where(d < f1, f1, np.minimum(f2, d))
        f1 = np.minimum(f1, d)
    return f2 - f1


# ------------------------------------------------------------------ ice sphere (frosted shell, bubbles, cracks)
def ice(n=1024):
    u, v = uv(n, n)
    frost = fbm(u, v, 6, 3, 5, seed=401)
    cracks = smoothstep(0.985, 0.999, 1 - np.abs(fbm(u, v, 3, 3, 5, seed=402) - 0.5) * 2)
    rng = np.random.default_rng(403)
    bub = np.zeros((n, n), np.float32)
    for _ in range(260):                     # small air bubbles trapped near the surface
        cx, cy, r = rng.random(), rng.random(), rng.uniform(0.002, 0.009)
        d = np.sqrt(np.minimum(np.abs(u - cx), 1 - np.abs(u - cx)) ** 2 + np.minimum(np.abs(v - cy), 1 - np.abs(v - cy)) ** 2)
        bub = np.maximum(bub, np.clip(1 - d / r, 0, 1) ** 0.5)
    base = np.stack([0.86 + 0.08 * frost, 0.90 + 0.07 * frost, 0.96 + 0.04 * frost], -1)
    base = base * (1 - 0.18 * bub[..., None]) + 0.1 * cracks[..., None]
    rough = np.clip(0.10 + 0.42 * smoothstep(0.45, 0.75, frost) + 0.2 * bub - 0.05 * cracks, 0.05, 0.7)
    save("JT_Ice_BaseColor", np.clip(base, 0, 1))
    save("JT_Ice_ORM", orm(np.ones_like(rough), rough, np.zeros_like(rough)), "Non-Color")
    save("JT_Ice_Normal", normal_from_height(bub * 0.8 - cracks * 0.6 + frost * 0.3, 1.2), "Non-Color")


# ------------------------------------------------------------------ whiskey caustic (projected under the glass)
def caustic(n=1024):
    u, v = uv(n, n)
    lines = np.exp(-(_voronoi_f2_f1(n, 70, 404) / 0.012) ** 2)
    lines = lines * (0.6 + 0.4 * fbm(u, v, 8, 8, 3, seed=405))
    # light enters the glass and focuses into a crescent behind it
    x, y = (u - 0.5) * 2, (v - 0.5) * 2
    lobe = np.exp(-((x / 0.75) ** 2 + ((y - 0.25) / 0.45) ** 2) * 2.2)
    core = np.exp(-((x / 0.35) ** 2 + ((y - 0.35) / 0.18) ** 2) * 3.0)
    amt = np.clip(lines * lobe * 1.4 + core * 0.35, 0, 1)
    col = np.stack([amt, amt * 0.66, amt * 0.30], -1)    # amber, as light through whiskey
    save("JT_Whiskey_Caustic", col)


if __name__ == "__main__":
    walnut()
    brass()
    marble()
    vinyl()
    ice()
    caustic()
    print("UPGRADE TEXTURES DONE")
