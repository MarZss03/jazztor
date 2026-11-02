# JazzTor — Museum gallery, night lighting, map room and player readability

Date: 2026-10-20 · Build checked in headless Microsoft Edge on the RTX 2080 SUPER (high tier) and the Intel UHD 630 (auto → low tier).

## What changed

### Museum (World Jazz History / Toronto Jazz Legacy)
- **Real pictures, framed like a gallery.** 15 photographs and period posters hang across the vestibule and both wings (17 exhibits including two text panels). The frames are modelled in Blender (lacquered moulding, gilt lip, ivory mat, brass picture lamp) and baked with the room. The photographs are applied as textures on top of their baked light.
- **Readable information.** Every exhibit has a printed wall text in the room, plus a crisp **reading card** in exhibit view: title, date and place, the history, what the picture shows, photographer, licence and source links. Clicking a picture, a timeline marker or a map pin walks the camera to that exhibit. Previous / Next steps along the wall.
- **Door.** The door now moves smoothly. The leaf accelerates gently, swings, and settles with a soft 0.8 % overshoot (smootherstep curve; handle 0.26 s, latch 0.13 s, swing 1.4 s, camera dolly 1.8 s, overlapping). There is no first-frame stall any more: shaders are compiled before the fade, and the museum is prefetched while the room is idle.
- **The brass bar across the doorway and arches is gone.** The dado rail and the marble skirting now stop at the door and arch openings.
- **Lighting.**
  - The real-time rig is exported from the Cycles rig: 1 point, 1 spot and 3 rect "slots" re-aimed per room. On baked surfaces they add specular only.
  - Picture lamps are baked at a gallery-neutral 3400 K, so black-and-white photographs stay black and white.
  - The world-map land is untextured satin brass, which removes the compression blocks visible before.
- **Wall text and pictures are labelled with their licence and maker.** Portraits without a licensable photograph remain marked "Portrait pending rights clearance".

### Listening room at night
- Night exposure is +1.3 stops (was +1).
- The reading lamp carries 50 % more of the room at night.
- The turntable deck light is brighter at night and stays dimly on even with the lamp off.

### Map room
- **Magnifier.**
  - The wheel or a trackpad pinch zooms up to 4× toward the cursor.
  - Drag to pan.
  - The panel has + / − / "Whole map" buttons.
  - The zoom crops the camera's projection window, so pins stay clickable at every zoom.
- **Reading panel.**
  - A venue list with filter and date chips.
  - The selected venue's card: address, sample listings, save, and "Its story in the museum →".
- **Brighter task light** (and fill) at night.
- **The window no longer shows the skyline upside down** when looking down at the table. The lake continuation now folds within the photo's water band.

### Player and cabinet
- **Console:** artist and track are set in two large upright lines, readable at console size.
- **Now Playing card:**
  - Hover or focus the console's cover/title module to see a 132 px cover, the track, artist, record, licence and the Free Music Archive link.
  - It also peeks for about 4 s when the track changes.
  - It never blocks console controls.
- **Cabinet:** a small italic title and small-caps artist caption floats above the sleeve as it slides out. It has no box and fades with the sleeve.

## Pipeline (one command)

```
D:\Jazztor\Make-Museum.ps1            # textures + build + Cycles bake + pack + LODs + compress  (~1.5 min)
D:\Jazztor\Make-Museum.ps1 -Preview   # 1024 px / 24 spp, for front-end work
D:\Jazztor\Make-Museum.ps1 -Ref       # Cycles reference renders only
```

| Step | Before | Now | Why |
|---|---|---|---|
| Cycles bake (2 lightmaps) | > 60 min (4096 / 640, stopped) | ~65 s (2048 / 512 + OIDN) | all static meshes are joined into one bake proxy (Blender re-synced the scene once per object) |
| KTX2 compression | ~290 s | ~3–6 s | persistent encode cache `D:\Jazztor\.cache\ktx2\<tier>\<hash>.ktx2` |
| First museum entry | 15–60 s of stalls | ~1.4 s compile, async | `checkShaderErrors` off, compile for the composer's render target, light count not doubled, fixed light slots |

Exhibit layout lives in `data/museum-exhibits.json` → `blender/scripts/jt_exhibits.py` (frames, lamps, colliders, metadata) → `app/public/data/museum.json`. Captions are in `app/src/data/exhibits.ts`. Images and credits come from `app/scripts/fetch-museum-images.mjs`.

## Image credits (all checked from each file's Commons metadata; only Public domain / CC0 / CC BY accepted)

Licence evidence for every file: `D:\Jazztor\assets\museum\licences\<id>.json`.

| id | file | author | licence | source |
|---|---|---|---|---|
| v-armstrong | Louis Armstrong, Aquarium, New York, ca. July 1946 (Gottlieb 00161) | William P. Gottlieb | Public domain | [Commons](https://commons.wikimedia.org/wiki/File:Louis_Armstrong,_Aquarium,_New_York,_N.Y.,_ca._July_1946_(William_P._Gottlieb_00161).jpg) |
| v-holiday | Billie Holiday, Downbeat, New York, ca. Feb. 1947 (Gottlieb 04251) | William P. Gottlieb | Public domain | [Commons](https://commons.wikimedia.org/wiki/File:Billie_Holiday,_Downbeat,_New_York,_N.Y.,_ca._Feb._1947_(William_P._Gottlieb_04251).jpg) |
| v-ellington | Duke Ellington, Aquarium, New York, 1946–48 (LOC) | The Library of Congress | Public domain | [Commons](https://commons.wikimedia.org/wiki/File:(Portrait_of_Duke_Ellington,_Aquarium,_New_York,_N.Y.,_between_1946_and_1948)_(LOC)_(4932369098).jpg) |
| v-gillespie | Gillespie, Lewis, Payne, Davis, Brown, Downbeat, 1946–48 (LOC) | The Library of Congress | Public domain | [Commons](https://commons.wikimedia.org/wiki/File:(Portrait_of_Dizzy_Gillespie,_John_Lewis,_Cecil_Payne,_Miles_Davis,_and_Ray_Brown,_Downbeat,_New_York,_N.Y.,_between_1946_and_1948)_(LOC)_(5306379575).jpg) |
| w-odjb | ODJB — "A Brass Band Gone Crazy", Victor ad, 1917 | Victor Talking Machine Co. | Public domain | [Commons](https://commons.wikimedia.org/wiki/File:Original_Dixieland_Jass_Band_-_A_Brass_Band_Gone_Crazy_1917.jpg) |
| w-hotfive | "West End Blues", Okeh ad, 1928 | Okeh Records | Public domain | [Commons](https://commons.wikimedia.org/wiki/File:West_End_Blues_Louis_Armstrong_Okeh_Ad_1928.jpg) |
| w-django | Django Reinhardt (Gottlieb 07301) | William P. Gottlieb / Adam Cuerden (restoration) | Public domain | [Commons](https://commons.wikimedia.org/wiki/File:Django_Reinhardt_(Gottlieb_07301).jpg) |
| w-carnegie | Bernstein, Goodman, Hollander, Carnegie Hall, 1946–48 (Gottlieb 00731) | William P. Gottlieb | Public domain | [Commons](https://commons.wikimedia.org/wiki/File:Leonard_Bernstein,_Benny_Goodman,_and_Max_Hollander,_Carnegie_Hall,_New_York,_between_1946_and_1948_(William_P._Gottlieb_00731).jpg) |
| w-mintons | Monk, McGhee, Eldridge, Hill, Minton's Playhouse, 1947 (Gottlieb 06281) | William P. Gottlieb | Public domain | [Commons](https://commons.wikimedia.org/wiki/File:Thelonious_Monk,_Howard_McGhee,_Roy_Eldridge,_and_Teddy_Hill,_Minton%27s_Playhouse,_New_York,_N.Y.,_ca._Sept._1947_(William_P._Gottlieb_06281).jpg) |
| w-kob | Parker, Potter, Davis, Jordan, Roach (Gottlieb 06851) | William P. Gottlieb | Public domain | [Commons](https://commons.wikimedia.org/wiki/File:Charlie_Parker,_Tommy_Potter,_Miles_Davis,_Duke_Jordan,_Max_Roach_(Gottlieb_06851).jpg) |
| w-getz | João Gilberto e Stan Getz em Nova York, 1972 | Unknown author | Public domain (Commons tag) | [Commons](https://commons.wikimedia.org/wiki/File:Jo%C3%A3o_Gilberto_e_Stan_Getz_em_Nova_York_1972_cr.jpg) |
| t-massey | Interior of Massey Hall, 1894 | B. W. Kilburn | Public domain | [Commons](https://commons.wikimedia.org/wiki/File:Interior_of_Massey_Hall,_r-4116.jpg) |
| t-yonge | Yonge Street looking north from Temperance, c. 1903 | Alexander W. Galbraith | Public domain | [Commons](https://commons.wikimedia.org/wiki/File:Yonge_Street_looking_north_from_Temperance.jpg) |
| t-peterson-1944 | Oscar Peterson with his sister Daisy at the piano, 1944 | Library and Archives Canada (Oscar Peterson fonds) | Public domain | [Commons](https://commons.wikimedia.org/wiki/File:Oscar_Peterson_with_his_sister,_Daisy,_at_the_piano_-_1944.jpg) |
| t-ella-oscar | Oscar Peterson en Ella Fitzgerald (1964) | Hugo van Gelderen / Anefo | CC BY 4.0 | [Commons](https://commons.wikimedia.org/wiki/File:Oscar_Peterson_en_Ella_Fitzgerald_(1964).jpg) |

**Check before publishing:** `w-getz` is tagged public domain on Commons with an unknown author (1972). Confirm the stated PD rationale on its file page, or swap it for the CC0 Anefo Stan Getz concert photo (1959) found in the same search.

## Verification (`app/scripts/verify.mjs`)

- RTX 2080 SUPER, high tier: **49 / 49 passed**, 75 fps, no page errors.
- Intel UHD 630, auto (→ low tier): **49 / 49 passed**, 64 fps, no page errors.

New checks:
- Exhibit view opens from the accessible list.
- Next walks to the following exhibit.
- A timeline marker walks to its chapter's picture.
- The map magnifier zooms (4×) with the wheel.
- The map panel shows the selected venue.

## Screenshots (`shots/`)

| | |
|---|---|
| door sequence | `18-door-closed`, `19-door-handle`, `20-door-swing`, `21-door-open` |
| vestibule | `13-museum-vestibule`, `ex-v-intro`, `ex-v-armstrong` |
| World wing | `14-museum-world`, `ex-w-hotfive`, `ex-w-mintons` |
| Toronto wing | `16-museum-toronto`, `ex-t-massey`, `ex-t-ella-oscar` |
| night | `platter-lampon`, `platter-lampoff`, `map-lampon`, `map-lampoff` |
| map magnifier | `09b-map-zoomed` |
| Cycles references | `museum_ref_vestibule`, `museum_ref_world`, `museum_ref_toronto` |

## Known limitations

- The web view is still about 0.6–0.9× the luminance of the Cycles references. This was measured on matching regions and is deliberate: the browser's neutral tone mapping plus the reading-card UI favour legibility over the references' brighter +0.4-stop look.
- Toronto portraits (Koffman, Alleyne, McConnell and one more) have no licensable photograph, so they stay as labelled placeholders.
- The event listings on the map are samples, as before. They are labelled "sample listings" in the panel.
