# JazzTor visual upgrade v1 — report

Date: 2026-10-20 · Brief: `JazzTor-Visual-Upgrade-Prompt-and-Asset-Manifest.md` · Sources: `upgrade v1 pics`

## Before / after

Screenshots (Home, `?quality=high`, RTX 2080 SUPER):

| | Before | After |
|---|---|---|
| Day 2560 | `before/home-day-2560.png` | `after/home-day-2560.png` |
| Dusk 2560 | `before/home-dusk-2560.png` | `after/home-dusk-2560.png` |
| Night 2560 | `before/home-night-2560.png` | `after/home-night-2560.png` |
| 4K (3840) | `before/home-*-3840.png` | `after/home-*-3840.png` |

## What changed

| Area | Before | After |
|---|---|---|
| Toronto view | procedural low-poly blocks + shader sky | the three supplied Day/Dusk/Night photographs, pixel-aligned; three depth layers (in-painted sky plate · city · water) projected from the Home eye point for light parallax; night window lights masked for restrained bloom |
| Light direction | arbitrary sun | sun reconstructed from the photographs (Day: upper-left; Dusk: low on the west horizon; Night: none, city fill only); the room shell no longer blocks the west sun |
| Reflections | four abstract light cards | the environment cube contains the actual Toronto photograph, crossfading with the time of day |
| Walnut | procedural rings | PBR set from the supplied smoked-walnut photo: albedo, pore/figure normal, roughness with pores, AO; denser UVs; thin satin lacquer (coat 0.18 / 0.38) instead of glossy plastic |
| Brass | one flat colour | three finishes from the supplied brushed-brass photo (photographed shading removed): satin (anisotropic), polished, aged (screws, tonearm base, cue) |
| Marble | procedural veins | black-and-gold marble from the supplied photo; optically flat polish (no relief normal, which caused bloom "glitter") |
| Vinyl | 2K grooves | 3K maps, finer and shallower grooves, smooth lead-in band, locked run-out groove, label |
| Whiskey | cylinder glass, alpha liquid | rebuilt after the reference: square decanter with diamond-cut foot and faceted gem stopper; diamond-cut rocks glass with brass rim; both with real wall thickness; whiskey with transmission + volume absorption (IOR 1.36) and a modelled meniscus; frosted, slightly melted ice sphere with bubbles and cracks; marble display base with brass band; amber caustic projected on the base |
| Window glass | 10 % grey card | low-iron glass (faint green-white, IOR 1.5, reflections only at grazing angles) |
| Rendering | DPR ≤1.75, AgX | DPR ≤2 (high), anisotropic filtering at the GPU maximum, N8AO ambient occlusion (full/half by tier), baked contact shadows, Khronos PBR Neutral tone mapping (AgX greyed the photographs: Dusk saturation 13 → 28, Day contrast 43.6 → 53.6) |
| Delivery | textures embedded per GLB | `.gltf` + `.bin` per model with shared `tex/*.ktx2`, so each texture downloads and caches once (walnut/marble/brass appear in five models); Draco geometry |

## Performance (headless Edge, measured)

| Device / tier | Load (warm cache) | Frame rate |
|---|---|---|
| RTX 2080 SUPER, high, 2560×1440 | 2–10 s | 75 fps (display-capped), 13.3 ms |
| RTX 2080 SUPER, high, 3840×2160 | 1–3 s | 43–45 fps, ~22.5 ms (before: 53 fps; cost of AO + DPR 2) |
| Intel UHD 630, auto → low | 5.5 s | 75 fps (before: 38 fps) |

Regression suite: 29/29 on both GPUs (`app/scripts/verify.mjs`).
Runtime download per tier: high ≈ 8.8 MB shared textures + 1.9 MB geometry; low ≈ 3.0 MB + 1.6 MB.

## Not done / limitations

- **Photo resolution:** the supplied photographs are 1672×941. The brief asks for ≥6000 px masters and 1920/2560/3840 variants. At 4K the window shows them upscaled about 2×, softer than the room. Supplying 6–8K masters needs no code changes: rerun `gen_environment.py`.
- **Licences:** the author, licence and commercial-use terms of all seven supplied images are unknown (see `assets/environment/licenses/README.md`). They must be confirmed before launch.
- **HDRI:** there is no Toronto HDRI. Reflections use the photograph in a procedural environment cube, which is the fallback the brief allows.
- **Whiskey refraction:** three.js cannot show refraction through two transmissive layers, so the crystal is a strong-Fresnel alpha shell and only the liquid refracts. The low tier also drops refraction and the caustic.
- **Lighthouse:** not run, because it needs Chrome plus a production build. Frame timing comes from the headless measurements above.
- **Missing model files:** the manifest's `JT_VinylSet`, `JT_Lamp`, `JT_Curtains`, `JT_Console`, `JT_RoomControls`, `JT_ArchiveStation` and `JT_TorontoDepth` aren't split out yet; those parts still live in `JT_Room` / `JT_Turntable`.
- **Sound effects:** the brief's WAV/Opus SFX set is still the synthesised placeholder set.
- **Mobile:** not tested on a real phone.

## Asset provenance

See `assets/environment/licenses/README.md`. The supplied photographs are kept unmodified in `assets/environment/source` and `assets/materials/source`. Everything else (ice, caustic, vinyl maps and all geometry) is procedural. Map data © OpenStreetMap contributors (ODbL).
