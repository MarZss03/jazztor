"""Toronto window environment: layer masks, sky plates and web exports from the three supplied photographs.

Sources (never modified): D:/Jazztor/assets/environment/source/toronto-{day,dusk,night}-master.png
(same composition from the Toronto Islands; supplied by the project owner).

Outputs:
  D:/Jazztor/assets/environment/masks/toronto-layers.png   R = sky, G = night window lights, B = water
  D:/Jazztor/app/public/assets/environment/toronto-<mode>.webp        full photo (city + water layers)
  D:/Jazztor/app/public/assets/environment/toronto-<mode>-sky.webp    sky plate, buildings in-painted (parallax backing)
  D:/Jazztor/app/public/assets/environment/toronto-layers.png         masks
  D:/Jazztor/app/public/assets/environment/environment.json           geometry + calibration for the renderer
"""
import json
import os
import sys
import numpy as np
import bpy

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from gen_upgrade_textures import blur  # noqa: E402

SRC = "D:/Jazztor/assets/environment/source"
MASKS = "D:/Jazztor/assets/environment/masks"
WEB = "D:/Jazztor/app/public/assets/environment"
MODES = ("day", "dusk", "night")
# calibration: CN Tower (553.3 m) from Centre Island (~2.25 km) spans tip->base in the frames
CN_TOWER_M, CN_DIST_M = 553.3, 2250.0


def load(path):
    img = bpy.data.images.load(path)
    img.colorspace_settings.name = "Non-Color"
    w, h = img.size
    px = np.empty(w * h * 4, np.float32)
    img.pixels.foreach_get(px)
    bpy.data.images.remove(img)
    return px.reshape(h, w, 4)[::-1, :, :3].copy()      # row 0 = top


def save(path, arr, fmt="PNG", quality=92):
    h, w = arr.shape[:2]
    if arr.ndim == 2:
        arr = np.repeat(arr[..., None], 3, -1)
    rgba = np.concatenate([np.clip(arr, 0, 1), np.ones((h, w, 1), np.float32)], -1)[::-1]
    img = bpy.data.images.new(os.path.basename(path), w, h, alpha=False)
    img.colorspace_settings.name = "Non-Color"
    img.pixels.foreach_set(rgba.astype(np.float32).ravel())
    img.filepath_raw = path
    img.file_format = fmt
    sc = bpy.context.scene
    sc.render.image_settings.file_format = fmt
    sc.render.image_settings.quality = quality
    img.save(filepath=path, quality=quality) if fmt != "PNG" else img.save()
    bpy.data.images.remove(img)
    print("wrote", path, w, h)


def grad(L):
    p = np.pad(L, 1, mode="edge")                       # no wrap-around at the frame borders
    return np.abs(p[1:-1, 2:] - p[1:-1, :-2]) + np.abs(p[2:, 1:-1] - p[:-2, 1:-1])


def lum(c):
    return c[..., 0] * 0.2126 + c[..., 1] * 0.7152 + c[..., 2] * 0.0722


def main():
    os.makedirs(MASKS, exist_ok=True)
    os.makedirs(WEB, exist_ok=True)
    img = {m: load(f"{SRC}/toronto-{m}-master.png") for m in MODES}
    h, w = img["day"].shape[:2]

    # --- alignment check between the three frames (should be ~0 px if shot/generated from one viewpoint)
    edges = {m: grad(lum(img[m])) for m in MODES}
    shifts = {}
    for m in ("dusk", "night"):
        best = (1e9, 0, 0)
        for dy in range(-6, 7):
            for dx in range(-6, 7):
                e = np.mean(np.abs(np.roll(np.roll(edges[m], dy, 0), dx, 1) - edges["day"])[50:-50, 50:-50])
                best = min(best, (e, dx, dy))
        shifts[m] = best[1:]
    print("ALIGN", shifts)

    # --- sky: smooth and sky-coloured in all three frames, then made monotonic per column (top-down)
    day, dusk, night = img["day"], img["dusk"], img["night"]
    # night decides "smooth and dark" (lit windows break it), day confirms sky or cloud colour
    g_night = blur(grad(lum(night)), 2)
    sat_d = day.max(-1) - day.min(-1)
    sky_day = (day[..., 2] > day[..., 0] + 0.04) | ((lum(day) > 0.45) & (sat_d < 0.25))
    candidate = sky_day & (lum(night) < 0.30) & (g_night < 0.06)
    top_city = np.full(w, h, np.int32)
    for x in range(w):
        col = candidate[:, x]
        run = 0
        for y in range(h - 30):
            run = 0 if col[y] else run + 1
            # a building top: 5 non-sky rows in a row AND mostly non-sky below it
            if run >= 5 and (~col[y:y + 30]).mean() > 0.7:
                top_city[x] = y - 4
                break
    # 5-column median removes isolated spikes; real masts (CN Tower ~10 px) survive
    pad = np.pad(top_city, 2, mode="edge")
    top_city = np.median(np.stack([pad[i:i + w] for i in range(5)]), 0).astype(np.int32)
    rows = np.arange(h)[:, None]
    sky = (rows < top_city[None, :]).astype(np.float32)

    # --- waterline: first row (from the top, below the skyline) where the frames become water-like
    #     (night water is dark between bright reflections; day water is saturated blue)
    water_like = (day[..., 2] > day[..., 0] + 0.10) & (lum(night) < 0.45)
    row_score = water_like.mean(1)
    search = np.arange(int(h * 0.55), int(h * 0.75))
    shore = int(search[np.argmax(row_score[search] > 0.75)])
    water = smooth_step_rows(h, w, shore + 2, 4)

    # --- night window lights in the city band (feeds bloom / emissive boost)
    city = (1 - sky) * (1 - water)
    lights = np.clip((lum(night) - 0.45) / 0.4, 0, 1) * city

    sky_f = blur(sky, 1)
    layers = np.stack([sky_f, lights, water], -1)
    save(f"{MASKS}/toronto-layers.png", layers)
    save(f"{WEB}/toronto-layers.png", layers)

    # --- sky plates: replace everything below the skyline with the column's sky colour (for parallax backing)
    # row-wise in-painting: each row is filled from its own sky pixels (dusk/day gradients are mostly vertical);
    # rows with too little sky reuse the last row that had enough, so the plate fades into a clean horizon band
    hard = sky > 0.5
    for _ in range(3):                                   # erode: never sample pixels touching a building edge
        hard = hard & np.roll(hard, 1, 0) & np.roll(hard, -1, 0) & np.roll(hard, 1, 1) & np.roll(hard, -1, 1)
    for m in MODES:
        c = img[m]
        fill = np.empty_like(c)
        last = None
        xs = np.arange(w)
        for y in range(h):
            idx = np.nonzero(hard[y])[0]
            if len(idx) > w * 0.3:
                row = np.stack([np.interp(xs, idx, c[y, idx, ch]) for ch in range(3)], -1)
                # horizon colour carried below the skyline: heavily smoothed so no column structure survives
                k = 90
                p = np.pad(row, ((k, k), (0, 0)), mode="edge")
                last = np.stack([np.convolve(p[:, ch], np.ones(2 * k + 1) / (2 * k + 1), mode="same")[k:-k] for ch in range(3)], -1)
            elif last is not None:
                row = last
            else:
                row = c[y]
            fill[y] = row
        fill = blur(fill, 3)
        plate = c * sky_f[..., None] + fill * (1 - sky_f[..., None])
        save(f"{WEB}/toronto-{m}-sky.webp", plate, "WEBP", 90)
        save(f"{WEB}/toronto-{m}.webp", c, "WEBP", 94)

    # --- calibration: angular scale from the CN Tower height (tip found as the topmost city pixel)
    mid = slice(int(w * 0.2), int(w * 0.8))             # the tower is the tallest thing near the middle
    tip_x = int(np.argmin(top_city[mid]) + w * 0.2)
    tip_y = int(top_city[tip_x])
    deg = np.degrees(np.arctan(CN_TOWER_M / CN_DIST_M))
    px_per_deg = (shore - tip_y) / deg
    meta = {
        "width": w, "height": h, "pxPerDeg": px_per_deg, "hfovDeg": w / px_per_deg, "vfovDeg": h / px_per_deg,
        "shoreRow": shore, "cnTower": {"x": tip_x, "tipRow": tip_y}, "alignment": shifts,
        "source": "Supplied by the project owner (upgrade v1 pics); licence to be confirmed — see assets/environment/licenses",
    }
    with open(f"{WEB}/environment.json", "w") as f:
        json.dump(meta, f, indent=1)
    print("META", json.dumps(meta))


def smooth_step_rows(h, w, row, feather):
    y = np.arange(h, dtype=np.float32)[:, None]
    return np.clip((y - row + feather) / (2 * feather), 0, 1).repeat(w, 1)


main()
