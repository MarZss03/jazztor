# JazzTor — final QA (2026-10-21)

Scope: image quality, smoothness, the page opening without stutter, music playback, lighting, the museum window (a modelled view, not a photograph), and the lake outside the home window.

Tested in headless Microsoft Edge (Direct3D 11) on both GPUs of this machine, against the dev server:
- NVIDIA GeForce RTX 2080 SUPER, auto → **high** tier
- Intel UHD Graphics 630, auto → **low** tier

Tools: `app/scripts/qa.mjs` (29 checks: load, idle smoothness, music, frame rate and lighting in every space, museum entry, museum window) and `app/scripts/verify.mjs` (49 functional checks). Raw results: `qa-rtx2080s.json`, `qa-uhd630.json`.

## Results

| | QA | Functional | Page opens | Steady frame rate |
|---|---|---|---|---|
| RTX 2080 SUPER (high) | **29 / 29** | **49 / 49** | 12.2 s* | 75 fps in every space, 0 long frames |
| Intel UHD 630 (low) | **29 / 29** | **49 / 49** | 5.8 s | 47–64 fps, museum 56 fps |

\* Headless runs start with an empty shader cache, so this includes about 5 s of cold shader compilation behind the loading screen. A normal browser keeps compiled shaders on disk, so repeat visits are faster.

What each check covers:
- **Music:**
  - The position advances 3.0 s in 3 s, with signal on the VU meters.
  - It keeps playing through the museum door and inside the museum.
- **Lighting:** every view is checked for a plausible mean brightness, no black-frame failure and no clipped highlights. The views are home day, dusk and night, the record view, the cabinet, the map, and the museum vestibule, both wings and an exhibit.
- **Museum entry:** the worst *visible* frame is 14 ms on the RTX and 27 ms on the UHD 630. The single heavy frame (first use of the museum) is drawn under the black of the door fade.
- **Museum window:** the photo plane is absent, and the modelled exterior is present (CN Tower, skyline, lake, sky).
- **Idle in the room:** while the map and museum preload in the background, no frame reaches the 120 ms freeze threshold. A handful of 50–100 ms frames occur once, about 10 s after opening (worst 107 ms RTX, 120 ms UHD 630).

## What was fixed for this QA

**The lake outside the home window had a "cliff":** below the bottom edge of the Toronto photograph, the water layer mirrored the whole image, so an upside-down city appeared in the lake. You could see it in taller windows and from the map table. Now:
- The lake continues within the photo's own water band, then settles into calm open water of the same colour.
- The low tier (one layer) gets the same treatment; it showed a streaked band at the sill.

**Museum window: a modelled city, not a photograph:**
- **City:** the procedural Toronto skyline (about 550 buildings, the CN Tower with its uplighting, the Rogers Centre dome, cranes, blinking beacons) at night.
- **Lake:** a reflective lake with moving ripples; its mirror camera sees only the outside, so the museum's walls never block the reflection.
- **Sky:** a night sky with the city's glow on the horizon.
- **Glass:** the window glass now only reflects (it no longer glows under the room lights).
- **Bake:** the photo is used only inside the Cycles bake, as the window's light.

**Freezes found and removed:**

| Symptom | Cause | Fix |
|---|---|---|
| 3.6 s freeze about 4 s after opening | the baked lighting arrived after the first frames, so every room material recompiled at once | bake loaded with the models (Suspense) and applied before the first frame |
| 10.5 s single frame while loading | 56 shaders compiled one after another inside one frame | the render loop is held and all programs are compiled in parallel (KHR_parallel_shader_compile), matching the composer's render target |
| 1.8 s freeze when the map preloads | adding the map's lights changed the light count, so every room material recompiled | the map's lights exist from the first frame |
| 0.8 s stall when the museum preloads | 50 programs handed to the GPU process at once | compiled in batches of 2 |
| 0.5–1.6 s frames painting wall text | font faces set up synchronously, 17 canvases painted in one frame, text re-measured per word | fonts preloaded, one panel per frame, cached word metrics |
| repeated 100 ms frames | the window backdrop re-uploaded its 3 photographs on every re-render (JSON re-parsed each render) | metadata memoised |
| 120 ms per lightmap upload | 4096 JPEGs decoded synchronously in `texImage2D` | decoded off-thread as `ImageBitmap` |
| 67 ms every second while music plays (integrated GPU) | the console's time readout, a GPU-accelerated canvas with a blur, re-uploaded each second (forces a GPU sync) | CPU-backed canvas, glow without blur |
| 1.3 s on the first museum frame | texture uploads and uniform lookups on first use | textures pre-uploaded while hidden; the first frame drawn under the door fade |
| museum 31 fps on the UHD 630 | real-time lights and the lit city shaders | the low tier keeps the chandelier light and uses unlit night materials outside: 56 fps |

**Image quality:**
- **Cabinet corner:** it opens up by about 0.75 stop when you step up to it, like an eye adapting. It was 73% near-black.
- **Low-tier turntable:** the dark diagonal streaks are gone. Lightmapped (baked) meshes are never decimated in the LOD exports, and small hard-surface parts are not simplified either.

## Screenshots (`shots/`)

- `rtx-*.png`, `uhd630-*.png`: every space on both GPUs.
- `lake-tall-window.png`: a tall viewport showing the lake running continuously to the sill.
- `lake-from-map-table.png`: the steep downward view from the map table.
- `museum-window-3d-city.png`: the modelled night skyline and its reflection.
- `low-tier-home-day.png`: the clean plinth on the low tier.

## Follow-up round (user feedback)

**Fixes:**
- **Town Tavern exhibit:** the background is fixed. The wings now have a modelled front wall (silk, dado, rail), so an exhibit's backdrop is a wall, not the void.
- **Vinyl gloss:** the record is glossy black. A warm soft-box reflection is computed in the record's own shader (fresnel, a broad lobe plus a tight core), so it adds no scene light and no extra compile cost; the rect light it replaces added about 1.8 s of shader compile. It is brighter in the evening and with the lamp on.
- **Museum navigation:** next/previous now step through every picture in the museum, including the vestibule, with a counter.
- **Jazz Map panel:** narrowed to 280 px and minimisable to a small "Venues" tab; the state is remembered.
- **Cabinet:** the face-out sleeve shows the next record's cover with a soft glow.

**Smoothness:**
- The museum loads after the room's shaders compile, not in parallel. In parallel, the compile grew to 22 s.
- The loading screen stays up until the museum's wall texts are painted and the first frames have settled: 24 frames under 40 ms in a row, or 2.5 s at most. On the UHD 630, the first second after the reveal had 100–130 ms frames; the main thread was idle during them, which points to the GPU's first-use work. The museum's background shader warm-up starts 1.5 s after the reveal, or at once if the museum is entered.

**Results (headless Edge):**

| Check | RTX 2080 SUPER (high tier) | UHD 630 (low tier) |
|---|---|---|
| QA (`qa.mjs auto`) | 29/29 | 29/29 |
| Verify (`verify.mjs auto`) | 50/50 | 50/50 |
| Load | 13.5 s | 8.2 s |
| Worst idle frame | 40 ms | 67 ms |

Music plays in the room and keeps playing inside the museum. The museum window shows the modelled city.

## Follow-up round 2

**Lectern placards (developed):**
- **Placard was invisible:** the sheet was modelled about 2 mm inside the walnut desk, so the reading view showed bare wood. It now sits on the desk face (`placard_on_desk` in `build_museum.py`), and at runtime it is lifted clear if a build ever buries it again.
- **World lectern moved:** it stood 0.2 m inside the vitrine, whose brass cap hung over the reading view. It moved 0.3 m and the museum was rebuilt and re-baked (3.5 min).
- **Reading view:** the camera now looks square onto the page with the text upright, taking orientation from the sheet's UVs (a mirrored layout is flipped back). It frames the whole sheet beside the reading card and steps sideways if anything blocks the view.
- **Content:**
  - With nothing chosen, the placard is the wing's contents page: an introduction plus every entry by year. World has 7 milestones; Toronto has 9 venues and moments and 4 portraits.
  - Otherwise it shows the chosen entry, text fitted to the sheet, with a page number.
  - A reading card mirrors the placard in crisp type, with source links; clicking an entry in the contents opens it.
  - Previous / Next turn the pages, and Contents goes back.
  - Text comes from `data/placards.ts`, shared by the 3D sheet and the card.
- **Verify:** two new checks: the sheet is in plain view (rays to five points hit the placard first), and Next turns the page with the card following.

**Room:**
- **Vinyl:** a charcoal base (`#26262b`) instead of near-black, so the record and its grooves read at dusk and at night. Daylight is unchanged: the clear coat mirrors the window, as before.
- **Whisky glass and decanter:**
  - Crystal glass with lead-crystal IOR 1.56. Premultiplied blending: reflections and glints add over what is behind, the body stays clear, coverage rises with Fresnel toward the rims, and the rims carry a faint spectral fringe.
  - It replaces a 16 % white shell that read as milky plastic.

**Results:**

| Check | RTX 2080 SUPER | UHD 630 |
|---|---|---|
| QA | 29/29 | 29/29 |
| Verify | 52/52 | 52/52 |

The first UHD 630 QA run straight after the bake ran at about 32 fps throughout, the museum included. Two reruns were back to normal: 56–58 fps, worst idle frame 80 ms.

## Follow-up round 3: record cabinet and more music

**Cabinet bugs found (`scripts/cabinet-probe.mjs`, `cabinet-scan.mjs`, `cabinet-shelves.mjs`) and fixed:**

| Bug | Fix |
|---|---|
| The 8 sleeves stand almost edge-on in a ~50 px strip, so most owned a 2–4 px hover strip and were nearly impossible to pick | the strip is shared evenly between the records on the shelf; a row of real cover thumbnails above the cabinet bar (hover pulls the 3D sleeve out with its caption, click plays) |
| Empty sleeve slots stayed hoverable and clickable, and blocked the display sleeve behind them | empty slots are not targets and let the pointer through |
| Clicking a sleeve while stopped only loaded the record | it follows the "Choosing a record" preference (play by default) |
| The caption card on the display stand was blank (the baked-lighting pass replaced its material) | painted through the mesh's current material, with a little self-light |
| Two labels on a hovered sleeve (pointer hint and floating caption) | only the caption |
| Only the first 8 records could ever be in the cabinet | shelves of 8 (‹ Shelf 1 / 2 ›, ← → keys); the cabinet opens on the shelf holding the record on the deck, and next / previous record moves the shelf with it |
| An empty My Crate showed an empty cabinet with no explanation | a toast, the card says so, and the bar offers "add records" |
| After clicking any on-screen button, the room's keys (Esc, B, arrows) stopped working | a focused button keeps only Space / Enter |

**More music (Free Music Archive, the source used before):**
- **Shortlist:** FMA's Jazz advanced search, filtered to CC BY (attribution only, commercial and remix allowed) and public domain. The list is `audio/licenses/candidates-2026-10-21.json`. Then `fetch-fma.mjs` checked every track page and archived it as licence evidence.
- **Licence check:** 23 tracks accepted; 5 Breuss Arrizabalaga Quintet tracks rejected because the pages carry no CC licence.
- **Audio QC:** 17 new tracks pass. 5 were rejected for crackle (Ahmad, Signs To Nowhere, Speakeasy, Round the Clock) or a low bitrate (Opening Move). One duplicate was dropped (the same audio, "Faster Does It", under two FMA pages).
- **Catalogue:** 5 records / 12 tracks before, 13 records / 29 tracks now.
  - New artists: Kevin MacLeod, William Ross Chernoff's Nomads, Jesse Spillane, Shane Ivers.
  - More from Ketsa and HoliznaCC0 ("Busted Guitar (JAZZ)").
- **Shane Ivers' singles:** released without artwork, so they get a typographic JazzTor sleeve (`scripts/make-type-cover.mjs`). It is marked as such in the catalogue and in Credits.
- **Credits:** each track now links to its own FMA page.

**Results:**

| Check | RTX 2080 SUPER | UHD 630 |
|---|---|---|
| QA | 29/29 | 29/29 |
| Verify | 52/52 | 52/52 |
| Load | 18.1 s | 12.2 s |
| Worst idle frame | 67 ms | 67 ms |

## Follow-up round 4: instruments, museum, free walk (2026-10-22 .. 29)

**Legendary instruments:**
- **Models:** five real-size models built in Blender (`blender/scripts/jt_instruments.py`, LOD0/1/2): Miles Davis' Martin "Moon and Stars" trumpet, Coltrane's 1966 Yamaha prototype alto, Armstrong's 1948 Selmer, Gillespie's bent King "Silver Flair", Parker's Grafton acrylic alto. The concept sheets were used for proportion and finish only; no engraving or serial is reproduced.
- **Placement:** two in the listening room (trumpet on the record shelf; alto on a floor stand) and three on lit plinths in the vestibule.
- **Interaction:** click, the camera walks up, the horn sways, and a card shows the player, the story, where the instrument is now, sources, and that the model is an interpretation.
- **Facts:** checked against the Christie's and Smithsonian pages; points the sources disagree on (Armstrong's and Parker's sale prices) are left out.

**Museum:**
- **Painting:** the centre of the vestibule now holds Max Oppenheimer's *Jazzband (Weintraubs Syncopators)* (1927; public domain - the painter died in 1954; evidence in `assets/museum/images/oppenheimer-jazzband/`).
- **Door:** the levers point to the hinges and press down; the leaves open outward.
- **Look:** gallery white balance in the colour grade, a rebalanced bake (dim room, lit works), and a neutral display reflection on the instruments.
- **Toronto window:** the lake sat at floor level and drowned the low-rise city. It now sits at the city's water line, and the view is turned 13 deg so the CN Tower shows both from the guided view and from the window itself (measured: `scripts/probe-tor-angles.mjs`, `probe-tor-sight.mjs`). The dome has its own, softer uplight.
- **Time switch:** works inside the museum. Day, dusk and night skies, daylit facades (with a sky fill on the shaded faces), lit windows at night.
- **Photograph row:** the Toronto wing's four upside-down placeholder portraits are now four CC BY 2.0 photographs: Massey Hall, Yonge Street at Shuter, Rob McConnell, Toronto Jazz Festival. Each is printed with its caption and credit, and clicking one opens its chapter or musician.
- **Free walk:**
  - "Explore freely": W A S D / arrows / drag / wheel, or a touch stick.
  - Push-out collision against walls, plinths and furniture, and a floor-plan minimap.
  - Opening a picture and coming back returns you to where you stood.
- **Benches:** the World wing bench moved out of the walkway, in front of the world map. It and the vestibule bench can be sat on (walking stands you up), by click or from the accessible list.

**Listening room:**
- **Golden east light:** a warm spot from screen right raking across the turntable, the JazzTor logo and the whisky glass. Its diffuse is added analytically in the baked shader, so it lights baked surfaces too.
- **Water:** procedural, perspective-correct wavelets near the window instead of magnified photo blotches.
- **Map room:** with the venue panel open, the table is framed for the area beside it. Measured at 1280x720 to 2560x1080 (`scripts/map-fit.mjs`); it no longer runs off the left edge.
- **Audio:** the next track is preloaded while one plays (the 2 s band between tracks stays 2 s), and a stalled start is retried once.

**Credits:** the Credits dialog now also lists every picture in the museum (title, author, licence, source), and works inside the museum.
**Access:** the room instruments and the benches are in the hidden accessible lists (keyboard / screen reader).

**Results:**

| Check | RTX 2080 SUPER | UHD 630 |
|---|---|---|
| Verify | 61/61 (before the card failed) | 62/62 (2026-10-29, incl. the credits check) |
| QA | 27/29, see below | 29/29 (2026-10-29) |
| Load time (3 runs, after a warm-up) | 3/3 pass: 24.0, 24.1, 20.3 s | |
| First flight to the map table (3 runs) | 3/3 pass | |

On the RTX, the full QA run failed on load time and the map flight just after a cold reboot; the two were then re-tested separately (`scripts/qa-load-map.mjs`), 3/3 each.

**The RTX itself:**
- **Failures:** the RTX 2080 SUPER failed twice under sustained load during testing ("GPU is lost", recovered by a reboot).
- **Current state:** on 2026-10-29 Windows no longer detects it (device status Unknown, `CM_PROB_PHANTOM`).
- **Assessment:** this is a fault of the PC's hardware or driver, not of the app. Until it is fixed, every result above for 2026-10-29 comes from the integrated GPU.
- A production build (`vite build`) compiles cleanly: one 1.9 MB bundle, 624 KB gzipped.

## Known limits

- On integrated graphics, the one-time map preload costs a few 50–80 ms frames about 10 s after opening.
- RTX load time in dev mode sits close to the 25 s line (20-24 s); a production build loads faster.
- Cold-cache load on this machine's RTX includes about 5 s of shader compilation behind the loading screen.
