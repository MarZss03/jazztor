# Music licence register

Machine-readable register: `fma-tracks.json` (one entry per track, written by `app/scripts/fetch-fma.mjs`,
extended with quality measurements by `blender/scripts/audio_qc.py`). Evidence: the archived FMA track page for every
track in `pages/` (HTML snapshot with timestamp, including the Creative Commons deed link).

## Rules applied (2026-10-20)

- Every track is checked **individually on its own FMA page**, including tracks fetched via an album page.
- Accepted: **CC0 1.0** and **CC BY** (any version). Rejected automatically: NC, ND, SA, missing or ambiguous licence.
- FMA hosts music but does not license it — the licence is the creator's, as stated on the track page.
- Quality gate (`reports/audio-qc.md`): ≥192 kbps, ≥44.1 kHz, no audible hiss, ≤40 isolated crackle clicks/min.
  Files are never re-encoded; loudness is normalised at playback (target −16 dB gated RMS, never above −1 dBFS peak).

## In use (12 tracks, 5 records)

| Record | Artist | Licence | Tracks |
|---|---|---|---|
| Public Domain | Maarten Schellekens | CC0 1.0 | Sax and Piano |
| City Slacker | HoliznaCC0 | CC0 1.0 | Busking In the SunLight, Busted AC Unit, Nowhere To Be Nothing To Do, Hooptie With The Windows Down, Moving Forward, Day Trips, Fresh Fit |
| CC BY: Free to Use for Anything | Ketsa | **CC BY 4.0 — attribution required** | Night Jazz, Life is Great |
| To Chill and Stay Awake | Loyalty Freak Music | CC0 1.0 | Monarch of the street |
| Fever Dreams | Mr Smith | **CC BY 4.0 — attribution required** | Django |

Attribution is shown in the app: the player plaque (licence line) and the CREDITS sheet (title, author, source link,
licence link — TASL).

## Licensed but excluded for sound quality (deliberate vinyl-crackle / lo-fi noise)

Robot Gypsy Jazz (John Bartmann, CC0); Bus Stop, Endless Grind, Sky Scrapers, On Foot, Studio Apartment (HoliznaCC0, CC0).

## Open points before launch

- **Album artwork:** the artwork is the artist's release art from FMA. A CC licence on a track does not automatically
  cover its artwork. It is very likely fine for CC0 releases, but should be confirmed with the artists, or the
  artwork replaced.
- **Quality gate:** it is automatic. Each kept track should still be listened to once on studio headphones.
