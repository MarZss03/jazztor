"""Audio quality check for the licensed FMA tracks (Blender's `aud` decoder + numpy; no re-encoding).

blender -b --factory-startup --python audio_qc.py
Reads D:/Jazztor/audio/licenses/fma-tracks.json, writes per-track measurements back into it and a
human-readable table to D:/Jazztor/reports/audio-qc.md.

Measures (all on the decoded PCM):
  bitrate        file size / duration
  loudness       gated block RMS in dBFS (approximation of integrated loudness, no K-weighting)
  peak           sample peak dBFS
  floor          10th-percentile 400 ms block RMS minus median (low = big quiet-to-loud range or long silences)
  hiss           share of energy above 10 kHz in the quietest blocks (tape / vinyl-simulation noise)
  clicks/min     impulsive crackle: samples whose 2nd difference exceeds 8x the local median absolute 2nd difference
"""
import json
import os
import aud
import numpy as np

ROOT = "D:/Jazztor/audio"
REG = f"{ROOT}/licenses/fma-tracks.json"
TARGET_LUFS = -16.0


def analyse(path):
    snd = aud.Sound(path)
    rate = int(snd.specs[0])
    data = snd.data()                     # (frames, channels) float32
    mono = data.mean(axis=1) if data.ndim == 2 else data
    dur = len(mono) / rate
    blk = int(rate * 0.4)
    n = len(mono) // blk
    blocks = mono[: n * blk].reshape(n, blk)
    rms = np.sqrt((blocks ** 2).mean(1) + 1e-12)
    db = 20 * np.log10(rms)
    gated = db[db > -70]
    rel = gated[gated > (10 * np.log10(np.mean(10 ** (gated / 10))) - 10)]
    loud = 10 * np.log10(np.mean(10 ** (rel / 10)))
    peak = 20 * np.log10(np.abs(data).max() + 1e-12)
    floor = np.percentile(gated, 10) - np.median(gated)
    # hiss: spectrum of the quietest 10 % of (non-silent) blocks
    quiet = blocks[np.argsort(rms)][int(n * 0.05): max(int(n * 0.15), int(n * 0.05) + 1)]
    spec = np.abs(np.fft.rfft(quiet * np.hanning(blk), axis=1)) ** 2
    freqs = np.fft.rfftfreq(blk, 1 / rate)
    hiss = spec[:, freqs > 10000].sum() / (spec.sum() + 1e-12)
    # clicks: impulsive 2nd-difference outliers, measured on a 60 s excerpt from the middle
    # A crackle is an ISOLATED impulse: huge 2nd difference at one point, but the surrounding 2 ms (excluding
    # +/-0.15 ms around it) is quiet. Pick / drum / hi-hat attacks stay elevated for milliseconds and are excluded.
    mid = mono[int(len(mono) / 2 - rate * 30): int(len(mono) / 2 + rate * 30)]
    d2 = np.abs(np.diff(mid, 2)).astype(np.float64)
    w = int(rate * 0.002)
    c = int(rate * 0.00015) + 1
    cs = np.concatenate([[0.0], np.cumsum(d2)])
    idx = np.arange(len(d2))
    lo, hi = np.clip(idx - w, 0, len(d2)), np.clip(idx + w + 1, 0, len(d2))
    clo, chi = np.clip(idx - c, 0, len(d2)), np.clip(idx + c + 1, 0, len(d2))
    ring = (cs[hi] - cs[lo]) - (cs[chi] - cs[clo])
    ring_mean = ring / np.maximum((hi - lo) - (chi - clo), 1) + 1e-7
    cand = np.nonzero((d2 > 15 * ring_mean) & (d2 > 0.02))[0]
    clicks = int((np.diff(cand) > rate * 0.005).sum() + (1 if len(cand) else 0))   # merge hits within 5 ms
    return {
        "durationSec": round(dur, 1), "sampleRate": rate, "channels": int(data.shape[1]) if data.ndim == 2 else 1,
        "loudnessDb": round(float(loud), 1), "peakDb": round(float(peak), 1), "floorDb": round(float(floor), 1),
        "hissRatio": round(float(hiss), 4), "clicksPerMin": clicks,
        "gainDb": round(float(min(TARGET_LUFS - loud, -1.0 - peak)), 1),   # normalise, never clip
    }


reg = json.load(open(REG, encoding="utf-8"))
rows = []
for t in reg:
    path = f"{ROOT}/{t['audioFile']}"
    m = analyse(path)
    m["bitrateKbps"] = round(os.path.getsize(path) * 8 / m["durationSec"] / 1000)
    issues = []
    if m["bitrateKbps"] < 192:
        issues.append("low bitrate")
    if m["hissRatio"] > 0.08:
        issues.append("audible hiss")
    if m["clicksPerMin"] > 40:
        issues.append("crackle / clicks")
    if m["sampleRate"] < 44100:
        issues.append("low sample rate")
    m["issues"] = issues
    m["qualityPass"] = not issues
    t["qc"] = m
    rows.append((t, m))
    print("QC", t["artist"], "-", t["title"], m)

json.dump(reg, open(REG, "w", encoding="utf-8"), indent=2, ensure_ascii=False)
os.makedirs("D:/Jazztor/reports", exist_ok=True)
with open("D:/Jazztor/reports/audio-qc.md", "w", encoding="utf-8") as f:
    f.write("# Audio QC — licensed FMA tracks\n\nTarget loudness -16 dBFS (gated RMS); gain applied at playback, files are not re-encoded.\n\n")
    f.write("| Track | Licence | kbps | Hz | Loud dB | Peak dB | Hiss | Clicks/min | Gain dB | Result |\n|---|---|---|---|---|---|---|---|---|---|\n")
    for t, m in rows:
        f.write(f"| {t['artist']} — {t['title']} | {t['licence']} | {m['bitrateKbps']} | {m['sampleRate']} | {m['loudnessDb']} | "
                f"{m['peakDb']} | {m['hissRatio']:.3f} | {m['clicksPerMin']} | {m['gainDb']} | "
                f"{'pass' if m['qualityPass'] else ', '.join(m['issues'])} |\n")
print("QC DONE")
