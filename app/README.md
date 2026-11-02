# JazzTor — homepage

Vite + React + react-three-fiber. Every visible object, including the player console, is a 3D asset built
procedurally in Blender (`../blender/scripts`); HTML is used only for navigation text and accessible mirrors.

```bash
npm install
npm run sync-assets    # decoders (Draco, Basis), album art, brand SVGs -> public/
npm run dev            # http://localhost:5173   (?quality=high|medium|low to force a tier)
```

## Asset pipeline (run from D:\Jazztor)

```bash
blender -b --factory-startup --python blender/scripts/gen_textures.py          # procedural PBR textures
blender -b --factory-startup --python blender/scripts/build_home.py            # model + LOD0 GLBs + .blend
blender -b blender/source/JT_Home.blend --python blender/scripts/export_lods.py # LOD1 / LOD2 (+1K textures)
node app/scripts/compress.mjs [high|medium|low] [--only JT_Player]              # Draco + KTX2 -> public/assets/3d/<tier>
```

Jazz Map data (cached in `D:\Jazztor\data`, re-fetch only to refresh):

```bash
node app/scripts/fetch-map-data.mjs          # OSM roads/shore/parks/rivers (Overpass) + venue geocoding (Nominatim)
copy data\venues.json app\public\data\       # build_home.py writes app/public/data/map_projection.json
```

Map data © OpenStreetMap contributors (ODbL) — engraved on the table rail. Venue entries are names, addresses and
categories only; event listings on the archival card are clearly marked samples until an events source is connected.

Look-dev renders: `render_preview.py -- <day|dusk|night> JT_Cam_Home 64 50` and `render_closeup.py` (wordmark, controls).

| Source | Content |
|---|---|
| `jt_letters.py` | original JazzTor wordmark (Didone pointed-pen construction) + monoline engraving face; also writes `assets/brand/*.svg` |
| `jt_turntable.py` | A01 turntable, engraved wordmark with brass inlay |
| `jt_player.py` | A09 console modules (stretch parts, VU needles, canvas text zones) |
| `build_home.py` | room, cabinet, lamp, whiskey, curtains (morph targets), skyline, cameras, exports |

## Performance tiers

| Tier | Assets | Render |
|---|---|---|
| high | LOD0 (turntable 41.6k tris), 2K textures | DPR ≤1.75, sun + key shadows, MSAA 4, bloom, grain, refractive crystal |
| medium | LOD1 (34.6k) | DPR ≤1.25, key shadow, MSAA 2, bloom, refractive crystal |
| low | LOD2 (22.9k), 1K textures | DPR 0.8, no shadows, no post (AgX on the renderer), alpha crystal, cheap water |

The tier is guessed from the GPU name and device memory, then a frame-rate monitor steps it down if the device
can't keep up (auto mode only). Textures ship as KTX2/ETC1S (transcoded to BC/ETC/ASTC on the GPU), geometry as Draco.

## Smoke test

```bash
node scripts/verify.mjs [auto|high|medium|low] [dgpu|igpu]   # drives the installed Microsoft Edge headlessly
```

Screenshots land in `blender/renders/web/<quality>-<gpu>/`. `scripts/probe.mjs` loads one tier and screenshots it.

## Interactions

| Object | Action |
|---|---|
| Black button on the plinth (unlabelled) | one-click play / stop |
| Tonearm headshell | drag onto the record to drop the needle anywhere (seeks) |
| AUTO·DAY·DUSK·NIGHT knob | cycle time of day (AUTO = Toronto local time) |
| ROOM knob / lamp | lamp dimmer / on-off |
| Curtain cord or curtains | open → half → closed |
| Record | top-down platter view (`R`) |
| Shelf | cabinet view (`B`); hover a sleeve to preview, click to load it |
| FOR YOU · MY CRATE lever | switch crate |
| Console: transport buttons, groove (drag), volume knob (drag/wheel), crate rocker | player controls |
| MAP (nav) / `M` | fly to the Jazz Map table (lazy-loaded; prefetched when idle except on the low tier) |
| Map pins | raise the archival card; SAVE plate on the card saves the venue |
| SHOW dial / WHEN wheel | filter All · Live · Halls · Historic / Tonight · This week · This month |
| Whiskey display | pause / resume rotation |
| JazzTor wordmark (top left) | main menu drawer: Listening Room, Jazz Map, Museum, Legacy, Collection, My Listening Room, Connect Music, Account |
| COLLECTION | My Crate panel: For You / My Crate / Recently Played, search, sort, + Crate, choose a record to play |
| MUSEUM / TORONTO JAZZ LEGACY | sourced timeline chapters and featured figures; venues open on the Jazz Map (content: `src/data/archive.ts`) |
| My Listening Room | time, curtains, lamp, whiskey speed, room finish, sound levels, picture quality / grain / motion, listening memory |
| Connect Music | import your own audio files (kept in this browser via IndexedDB, ID3 tags + cover art read) |
| Account | on-device profile (no server accounts yet); erase all local data |
| CREDITS | CC attribution for every track |
| 33 / 45 selector | honest pitch shift |

Keyboard: `Space` play/pause · `T` time · `L` lamp · `C` curtains · `Shift+←/→` records · `Esc` home.
Tab reveals the semantic player and room controls.

Music is procedurally synthesised placeholder audio (`src/audio/composer.worker.ts`); album titles and ensembles are fictional.
