"""Museum materials (procedural, no third-party imagery): herringbone oak, Persian runner, green velvet.
blender -b --factory-startup --python gen_museum_textures.py"""
import os
import sys
import numpy as np

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from gen_textures import save, normal_from_height, orm, fbm, uv, smoothstep  # noqa: E402
from gen_upgrade_textures import load, resize, blur, lum, norm01  # noqa: E402


def herringbone(n=2048):
    """Herringbone parquet, 5 x 30 cm planks; the texture spans 1.2 m and tiles.
    Built in a 45-degree frame: columns of two half-columns whose planks run at +-45 deg, the right half staggered by
    half a plank width so plank ends butt against the neighbour's side (herringbone, not chevron)."""
    grain_src = resize(load("walnut-smoked-seamless.png"), 1024)
    g = lum(grain_src)
    g = (g - g.mean()) / (g.std() + 1e-6)
    S = 1.2
    u, v = uv(n, n)
    x, y = u * S, v * S
    r2 = np.sqrt(2.0)
    A = (x + y) / r2                       # along the column
    B = (x - y) / r2                       # across
    col_w = (S / r2) / 2                   # 2 columns per tile
    h = col_w / 2
    band = (S / r2) / 12                   # plank width measured along A (= W * sqrt 2)
    ci = np.floor(B / col_w)
    sx = B - ci * col_w
    left = sx < h
    along = np.where(left, sx, col_w - sx)                        # 0..h across the half column
    t = A + along + np.where(left, 0.0, band / 2)
    pid = np.floor(t / band)
    across = t / band - pid
    pl = along / h                                                # 0..1 along the plank
    key = (pid * 7 + ci * 13 + np.where(left, 0, 5)).astype(np.int64) % 211
    rng = np.random.default_rng(7)
    tone = rng.uniform(0.80, 1.14, 211)[key]
    off = rng.random(211)[key]
    gx = ((pl * 0.6 + off) % 1 * 1023).astype(int)                 # grain runs along the plank
    gy = ((across * 0.05 + off * 0.7) % 1 * 1023).astype(int)
    grain = g[gy, gx]
    seam = 1 - smoothstep(0.0, 1.0, np.minimum(np.minimum(across, 1 - across) / 0.06, np.minimum(pl, 1 - pl) / 0.012))
    base = np.array([0.46, 0.30, 0.165], np.float32)              # honey oak, matte oil finish
    col = base * (tone * (1 + 0.14 * grain))[..., None] * (1 - 0.5 * seam)[..., None]
    rough = np.clip(0.34 + 0.07 * grain + 0.28 * seam + 0.06 * (fbm(u, v, 12, 12, 3, seed=501) - 0.5), 0.22, 0.8)
    save("JT_Mus_Floor_BaseColor", np.clip(col, 0, 1))
    save("JT_Mus_Floor_ORM", orm(1 - 0.35 * seam, rough, np.zeros_like(rough)), "Non-Color")
    save("JT_Mus_Floor_Normal", normal_from_height(-seam * 0.8 + grain * 0.03, 1.4), "Non-Color")


def persian(n=2048):
    """Runner 1.4 m x 4.2 m mapped to the full texture: border bands, field lattice, central medallion."""
    u, v = uv(n, n)
    x, y = (u - 0.5) * 2, (v - 0.5) * 2                        # -1..1; runner is 3x longer along v
    d = np.minimum(1 - np.abs(x), (1 - np.abs(y)) * 3)         # distance to edge in "width" units
    madder = np.array([0.36, 0.06, 0.05])
    indigo = np.array([0.05, 0.07, 0.16])
    ivory = np.array([0.72, 0.62, 0.46])
    gold = np.array([0.55, 0.36, 0.12])
    col = np.empty((n, n, 3), np.float32)
    col[:] = madder
    # field lattice of small guls
    fx, fy = (x * 6) % 1 - 0.5, (y * 18) % 1 - 0.5
    gul = (np.abs(fx) + np.abs(fy) < 0.34)
    gul_core = (np.abs(fx) + np.abs(fy) < 0.16)
    col[gul] = indigo
    col[gul_core] = gold
    # central medallion (lozenge with stepped rim)
    r = np.abs(x) / 0.55 + np.abs(y * 3) / 1.1
    col[r < 1.0] = indigo
    col[(r < 0.82)] = madder
    col[(r < 0.55)] = ivory
    col[(r < 0.36)] = madder
    col[(r < 0.16)] = gold
    for lo, hi, c in ((0.0, 0.05, indigo), (0.05, 0.075, ivory), (0.075, 0.20, indigo), (0.20, 0.225, gold),
                      (0.225, 0.25, madder)):
        band = (d >= lo) & (d < hi)
        col[band] = c
    # border motif: rosettes in the indigo band
    t = np.where(np.abs(x) > np.abs(y) * 3, y * 9, x * 3)
    ros = ((d > 0.09) & (d < 0.19) & ((np.abs((t % 1) - 0.5) < 0.18)))
    col[ros] = madder * 1.2
    # wool: abrash (dye variation along the length), knot texture, wear in the walking line
    abrash = 0.9 + 0.12 * fbm(u * 0 + 0.5, v, 1, 24, 3, seed=502)
    knots = 0.85 + 0.3 * fbm(u, v, 220, 220, 1, seed=503)
    wear = 1 - 0.18 * np.exp(-(x / 0.45) ** 2) * (fbm(u, v, 6, 18, 3, seed=504))
    col = col * (abrash * knots * wear)[..., None]
    save("JT_Mus_Rug_BaseColor", np.clip(col, 0, 1))
    save("JT_Mus_Rug_Normal", normal_from_height(knots * 0.5, 1.0), "Non-Color")


def velvet(n=1024):
    u, v = uv(n, n)
    pile = fbm(u, v, 64, 64, 3, seed=505)
    crush = fbm(u, v, 4, 4, 4, seed=506)
    col = np.array([0.03, 0.12, 0.08], np.float32) * (0.8 + 0.35 * crush + 0.1 * pile)[..., None]
    save("JT_Mus_Velvet_BaseColor", np.clip(col, 0, 1))
    save("JT_Mus_Velvet_Normal", normal_from_height(pile * 0.6 + crush * 0.4, 0.8), "Non-Color")


def plaster_green(n=1024):
    """Deep green wall fabric for the vitrine backs and alcove walls (silk moire)."""
    u, v = uv(n, n)
    moire = 0.5 + 0.5 * np.sin((v * 140 + 6 * fbm(u, v, 3, 3, 3, seed=507)) * np.pi)
    col = np.array([0.025, 0.07, 0.05], np.float32) * (0.85 + 0.25 * moire)[..., None]
    save("JT_Mus_Silk_BaseColor", np.clip(col, 0, 1))


if __name__ == "__main__":
    herringbone()
    persian()
    velvet()
    plaster_green()
    print("MUSEUM TEXTURES DONE")
