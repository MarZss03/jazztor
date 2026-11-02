# JazzTor — UI Concept, Image Prompts & Blender Production Bible

> Version 1.0 · Desktop-first immersive web/app concept · Toronto jazz listening room

## Windows project location

The canonical local project root is:

```text
D:\Jazztor
```

All paths in production prompts and handoff instructions resolve from this location:

| Content | Windows path |
|---|---|
| Design bible | `D:\Jazztor\JazzTor-UI-Prompts-and-Blender-Brief.md` |
| UI and 3D reference images | `D:\Jazztor\assets\ui` |
| Blender source files | `D:\Jazztor\blender\source` |
| GLB exports | `D:\Jazztor\blender\exports` |
| PBR textures | `D:\Jazztor\blender\textures` |
| Audio assets | `D:\Jazztor\audio` |
| Frontend public assets | `D:\Jazztor\app\public\assets` |

The Markdown image embeds remain relative (`assets/ui/...`) so they render correctly after the folder is placed at `D:\Jazztor`. Do not move the MD away from the project root.

## 1. Product North Star

JazzTor is an immersive, online-first jazz product in which a photorealistic 3D turntable is the homepage, primary player and emotional centre. It combines:

- instant jazz listening through a tactile, unlabelled physical play control;
- an optional “ritual” interaction: remove a record from its sleeve, place it on the platter, move the tonearm and drop the needle;
- live Day / Dusk / Night atmosphere driven by Toronto local time, with manual override;
- a Toronto Jazz Map, Jazz Museum, Toronto Jazz Legacy archive and personal collection;
- a persistent, customisable listening room whose materials, lighting, curtains, skyline, albums and props remember the user;
- a premium retro-jazz aesthetic: black walnut, champagne brass, smoked glass, black marble, oxblood leather, warm tungsten light and restrained typography.

The experience must feel like a real, privately owned listening room—not a dashboard, game UI, casino, neon lounge, steampunk set or AI-generated fantasy interior.

## 2. Shared Visual Prompt Foundation

Use this foundation in every UI generation prompt unless a screen overrides it:

```text
Create a production-quality, highly photorealistic 16:9 desktop web-app UI concept for “JazzTor”, a premium immersive jazz listening product based in Toronto. Show app content only: no browser chrome, no device mockup, no presentation board.

Visual language: understated 1960s–1970s audiophile luxury; black walnut, satin champagne brass, smoked glass, black marble, oxblood leather, cream paper, subtle record wear, restrained warm typography. Physically plausible construction, realistic material roughness, accurate reflections, imperfect micro-scratches, soft film grain, natural depth of field, cinematic but believable lighting. The full UI should feel designed and buildable, not decorative concept art.

The room is a sophisticated high-rise Toronto listening room with a large floor-to-ceiling window and an elegant, recognisable but not exaggerated Toronto skyline. The hero object is a large, mechanically credible vintage turntable. Engrave the word “JazzTor” subtly into its walnut plinth in a refined retro serif or custom wordmark. Keep generous negative space and remove unrelated furniture or clutter.

UI controls should look like physical objects integrated into the room: engraved labels, metal knobs, restrained amber indicators, tactile switches, paper cards and compact typography. Keep accessibility and legibility. Avoid giant floating glass cards and generic streaming-service layouts.

Negative prompt: synthetic AI texture, warped geometry, impossible tonearm, duplicated knobs, fake readable brand marks, misspelled text, molten metal, excessive gloss, plastic wood, oversaturated teal-orange grading, neon, cyberpunk, steampunk, nightclub, clutter, chairs, bookcases, unrelated decor, people, browser frame, phone frame.
```

## 3. UI Concept Gallery & Prompts

### 01 — Midnight Walnut

![Midnight Walnut](assets/ui/01-midnight-walnut.png)

```text
Create a realistic production-quality 1440×1024 desktop web-app UI concept for JazzTor. Direction: “Midnight Walnut.” Build the immersive homepage around an oversized vintage turntable in dark walnut and satin brass, viewed at an intimate three-quarter angle. Place it in a refined Toronto high-rise listening room at night. Include a restrained skyline through floor-to-ceiling glass, a record shelf, one crystal whiskey glass and a compact physical-console player. Use deep charcoal, oxblood, amber and walnut. Keep navigation minimal and integrated into the furniture. The screen should feel warm, private, cinematic and immediately playable. No slogan in the centre. No generic music-app cards.
```

### 02 — Blue Note Apartment

![Blue Note Apartment](assets/ui/02-blue-note-apartment.png)

```text
Create a second JazzTor homepage exploration called “Blue Note Apartment.” A sophisticated Toronto apartment at blue hour, with cooler navy ambient light balanced by warm lamp and brass highlights. Make the turntable the obvious dominant object, surrounded only by a compact record collection, album sleeve and subtle physical player controls. Use smoky blue, walnut, brass and cream. Suggest a cultured jazz listener’s private apartment, but keep the composition clean, realistic and buildable. Avoid nightclub imagery, neon, posters everywhere or generic luxury staging.
```

### 03 — Analog Museum

![Analog Museum](assets/ui/03-analog-museum.png)

```text
Create a third JazzTor homepage direction called “Analog Museum.” Treat the turntable and records like living museum objects in a quiet editorial gallery, using dark walnut vitrines, cream archive labels, brass details and focused museum lighting. The turntable remains functional and inviting, not roped off. Integrate tiny archival captions and a restrained navigation rail hinting at Map, Museum, Legacy and Collection. Blend jazz scholarship with tactile listening. Keep it photorealistic, historically grounded, uncluttered and emotionally warm rather than sterile.
```

### 04 — Time Mode: Day, Early Study

![Day Mode](assets/ui/04-time-day-v1.png)

```text
Refine the selected JazzTor direction into Day mode. Enlarge the turntable so it owns the foreground. Use soft late-morning Toronto daylight, realistic sky and city haze through a much larger window. Retain a small curated record shelf, one whiskey glass, one architectural lamp and a few jazz objects only. Light should reveal walnut pores, brushed metal, record grooves and fabric without looking like a furniture advertisement. Add a very subtle Day / Dusk / Night selector and keep the physical music controls integrated into the bottom edge.
```

### 05 — Time Mode: Dusk, Early Study

![Dusk Mode](assets/ui/05-time-dusk-v1.png)

```text
Create the same exact JazzTor room and camera composition at Toronto dusk. Preserve every object and UI location. Outside: layered indigo, mauve and residual amber sky, with a few city lights beginning to glow. Inside: lamp warmth slowly becomes visible, brass catches controlled highlights and the record surface remains legible. Maintain deep photographic shadow detail; do not overuse orange-and-teal grading. The transition should clearly be the same persistent room at a different real-world time.
```

### 06 — Time Mode: Night, Early Study

![Night Mode](assets/ui/06-time-night-v1.png)

```text
Create the same exact JazzTor room and camera composition at Toronto night. Preserve every object and UI location. The skyline is elegant and recognisable, with realistic office and residential window patterns. Use warm tungsten pools on the turntable and record shelf, subtle glass reflections, dark walnut shadows and restrained amber indicators. Keep controls readable and materials believable. The room should feel intimate and calm, never like a club, casino or cyberpunk scene.
```

### 07 — Photoreal Dusk Baseline

![Photoreal Dusk Baseline](assets/ui/07-photoreal-dusk-baseline.png)

```text
Rebuild JazzTor as a photographic, physically plausible Toronto listening room at dusk. Reduce every sign of AI concept-art rendering: correct perspective, consistent furniture joins, real turntable mechanics, sensible cable-free staging, accurate glass and metal reflections, subtle film grain and restrained lens bloom. Enlarge the floor-to-ceiling view. Use a dark black-and-gold affluent interior without ornamental excess. The hero objects are only the large turntable, record collection, loose vinyl record, whiskey with a spherical ice ball, architectural lamp and Toronto view. Add a discreet time control set to AUTO / DUSK.
```

### 08 — Hidden Play Button & Album-Reactive Player

![Play Button Refinement](assets/ui/08-play-button-player-refinement.png)

```text
Refine the photoreal JazzTor dusk homepage. Add one real physical one-click play button on the turntable, but do not label it “play” and do not add an obvious digital icon. Guide discovery through slightly different material, a fine machined ring, tactile relief and a controlled specular highlight. It must look like a genuine vintage hardware control. Keep the manual record-and-tonearm ritual as an optional easter egg.

At the lower left, create an album-responsive physical player module whose accent colour, paper label and subtle light derive from the current album cover. Show small readable track and artist metadata, compact transport controls and warm analog meters. Keep it integrated into the furniture and visually subordinate to the turntable.
```

### 09 — Final Hero Simplification

![Final Hero Simplification](assets/ui/09-final-hero-simplified.png)

```text
Create a simplified final JazzTor hero view. Remove chairs, bookcases and all unrelated background decoration. Keep only: a much larger walnut-and-brass turntable; a compact cabinet of vinyl records; one loose vinyl record and sleeve; one whiskey bottle; one crystal glass with a single spherical ice ball on a small motorised display base; an architectural lamp; black marble and tasteful black-gold furniture; and an enlarged Toronto skyline through the floor-to-ceiling window. Engrave “JazzTor” into the turntable plinth with convincing carved depth and metal inlay. Prioritise material realism, quiet wealth, negative space and total immersion.
```

### 10 — Final Homepage: Day

![Final Day Homepage](assets/ui/10-home-day-final.png)

```text
Create the definitive JazzTor DAY homepage, 16:9 desktop app content only. Use one continuous photorealistic high-rise listening room. Large foreground vintage turntable in warm black walnut, satin champagne brass and smoked acrylic; “JazzTor” finely engraved into the front plinth. Show a vinyl record ready to play and a mechanically correct tonearm. Include the subtle tactile one-click play control with no explicit play label. At left, show a compact built-in vinyl cabinet with one selected album sleeve projecting slightly and a tiny caption on the exposed record: album/song title and “— artist name.” The cabinet may switch between system recommendations and My Crate.

Use clean late-morning Toronto light, soft cloud detail and true-to-life city haze. Show the whiskey glass with ice sphere on its rotating pedestal and one lamp. Add a retro physical bottom player: slim walnut/brass console, album-reactive colour insert, track and artist, warm VU meters, progress groove, small transport knobs. Add discreet AUTO / DAY / DUSK / NIGHT controls. No central slogan.
```

### 11 — Final Homepage: Dusk

![Final Dusk Homepage](assets/ui/11-home-dusk-final.png)

```text
Create the definitive JazzTor DUSK homepage using the identical camera, geometry, layout, UI and objects from the final Day screen. Outside the large Toronto window: realistic sunset afterglow moving from warm horizon to mauve and indigo, with city lights gradually appearing. Inside: mixed cool ambient window light and warm practical lamp, precise brass highlights, rich walnut, believable smoked glass and controlled reflections. Preserve the pop-out selected album caption, unlabelled tactile play button, engraved JazzTor mark, rotating whiskey pedestal and retro album-responsive player. Make it cinematic but photographic, not AI-fantasy.
```

### 12 — Final Homepage: Night

![Final Night Homepage](assets/ui/12-home-night-final.png)

```text
Create the definitive JazzTor NIGHT homepage using the identical camera, geometry, layout, UI and objects from the final Day and Dusk screens. Toronto is fully dark with believable street and building light distribution. The room is lit by one warm architectural lamp, tiny amber hardware indicators and reflected city light. Keep the turntable readable, premium and dominant; maintain shadow detail, authentic walnut and brushed brass roughness. Preserve the pop-out album caption, hidden tactile play control, engraved JazzTor mark, whiskey ice sphere and retro physical bottom player. Quiet late-night intimacy; no blue neon, club lighting or excessive bloom.
```

### 13 — Vinyl Cabinet Interaction

![Vinyl Cabinet Interaction](assets/ui/13-vinyl-cabinet-interaction.png)

```text
Design a focused JazzTor vinyl-cabinet interaction screen in the same room. On hover, touch or click, a chosen album sleeve slides outward by roughly 12–15% with realistic easing and shadow. A small portion of the record is visible. On that exposed record, show an elegant, readable caption: album or song title on the first line and “— artist name” beneath it. Nearby sleeves remain matched to their album art and spine colours. Add a restrained selector for “For You” and “My Crate.” Show states for idle, hover/focus, selected and drag-ready without breaking immersion. Use tiny engraved controls rather than floating app cards.
```

### 14 — Toronto Jazz Map

![Jazz Map](assets/ui/14-jazz-map.png)

```text
Design the JazzTor “Jazz Map” as another physical station in the same listening room, not a separate generic map app. A beautifully detailed dark paper or leather Toronto map lies beneath smoked glass on a walnut-and-brass map table. Use warm brass pins for venues and events, subtle neighbourhood labels, a compact filter dial and an archival event card that rises from the surface when a pin is selected. Include date, venue, artist, style and save action. The window, turntable ambience and persistent bottom player remain visible. Prioritise legibility and geographic usefulness while maintaining the vintage jazz aesthetic.
```

### 15 — Jazz Museum

![Jazz Museum](assets/ui/15-jazz-museum.png)

```text
Design the JazzTor “Jazz Museum” as a living digital archive inside the same room. Use a walnut museum console with cream archival cards, a brass timeline rail, record labels, photographs, ticket stubs and listening excerpts behind subtle smoked glass. The selected story expands into a clean editorial reading area with title, era, key artists, context and a “listen to this chapter” control. Keep hierarchy calm and scholarly. Avoid scrapbook clutter and fake historical logos. Maintain the persistent turntable player and environment lighting.
```

### 16 — Toronto Jazz Legacy

![Toronto Jazz Legacy](assets/ui/16-toronto-jazz-legacy.png)

```text
Design a respectful JazzTor “Toronto Jazz Legacy” page honouring local jazz people, musicians, composers, venues and recordings. Present one featured figure in an elegant archival frame with a large licensed or placeholder monochrome portrait, name, lifespan or active years, Toronto connection, concise biography, key works and listening links. Add a horizontal brass timeline and a small related-people / related-places rail. Make attribution and source links visible. Preserve the black-walnut, cream-paper and brass design language without romanticising or inventing facts.
```

### 17 — Collection / My Crate

![Collection](assets/ui/17-collection-my-crate.png)

```text
Design JazzTor “My Crate,” the user’s personal collection, as a tactile record wall and sorting console in the same listening room. Display coherent album covers and spines in walnut cubbies, with filters represented by engraved tabs for albums, artists, playlists, saved history and mood. Selected records slide forward physically. Show compact metadata, source service, last played and add-to-room action. Include grid and shelf views while avoiding a generic streaming library. Keep the persistent player, room state and album-reactive accents.
```

### 18 — Main Menu

![Main Menu](assets/ui/18-main-menu.png)

```text
Design the JazzTor main menu as an immersive physical overlay within the room. Dim the environment slightly but do not blur it into a generic backdrop. Present Home, Jazz Map, Museum, Toronto Legacy, My Crate, Listening Room and Settings as engraved brass-and-walnut selectors, compact and easy to scan. Indicate the current destination with a fine amber pilot light. Include profile and connection status subtly. The menu should feel like opening the control panel of a rare hi-fi console, with excellent keyboard focus and touch targets.
```

### 19 — Login

![Login](assets/ui/19-login.png)

```text
Design JazzTor login and account creation inside the same listening-room world. Use a minimal cream-paper and smoked-glass account panel inset into walnut, with email, passkey/social options, continue as guest and concise privacy language. Keep the turntable visible in the background and let the user hear a preview without an account. Use large accessible inputs, clear focus rings and restrained typography. Avoid aggressive subscription messaging, giant logos, fake OAuth brands and generic SaaS card styling.
```

### 20 — My Listening Room / Preferences

![Preferences](assets/ui/20-listening-room-preferences.png)

```text
Design “My Listening Room,” JazzTor’s preference and room-customisation screen. Show a live room preview plus tactile controls for automatic Toronto local time or manual Day / Dusk / Night; curtains open / half / closed; lamp on/off and dim level; walnut, marble, metal and upholstery variants; skyline weather intensity; dust and film-grain strength; whiskey display rotation; ambient room tone; interaction sensitivity; reduced motion; and default play behaviour. Also include jazz preferences—eras, subgenres, instruments, energy, familiarity, local/global balance—and memory/privacy controls. Make every adjustment visibly update the room without leaving the page.
```

### 21 — Connect Music & Playlists

![Connect Music](assets/ui/21-connect-music-playlists.png)

```text
Design JazzTor “Connect Music & Playlists” as a premium source-routing console. Provide clearly separated connection slots for supported streaming services, local files and imported playlist links without using unauthorised brand imitation. Show connection status, permissions, sync scope, last sync, disconnect and source priority. Explain that playback availability depends on the connected provider and region. Let the user map playlists to the physical record cabinet and choose whether recommendations or My Crate appears by default. Preserve room immersion, privacy clarity and the persistent player.
```

## 4. Interaction and Transition Direction

The product is one continuous 3D room. Navigation should use camera movement and believable physical transformations rather than hard page cuts.

| From → To | Transition | Duration |
|---|---|---:|
| Home → Record ritual | Camera eases from three-quarter room view to top-down platter view; sleeve and vinyl become draggable | 900–1200 ms |
| Home → Vinyl cabinet | Short lateral dolly toward cabinet; selected sleeve slides forward | 650–850 ms |
| Home → Jazz Map | Camera glides to map table; smoked-glass cover catches light; pins resolve from ambient bokeh | 900–1200 ms |
| Home → Museum | Lamp pool expands into archive illumination; console panels unfold | 850–1100 ms |
| Museum → Legacy | Selected archive card enlarges and becomes the featured biography frame | 650–900 ms |
| Home → My Crate | Cabinet expands into a browsable wall while current record and player persist | 750–1000 ms |
| Any page → Menu | Physical control drawer opens; room exposure drops by 0.5–0.8 stop | 300–450 ms |
| Time mode change | Crossfade environment lighting, skyline emissives and sky; never swap geometry | 1800–3000 ms |

Persistent state across every transition: track position, platter rotation, tonearm state, selected album, room materials, curtain state, lamp brightness, whiskey pedestal rotation, camera accessibility settings and time-mode preference.

Reduced Motion mode replaces camera travel with 150–250 ms exposure fades and immediate focus placement.

## 5. Sound Design Brief

- One-click play: muted machined-button travel, relay click, platter motor ramp, needle contact and very short vinyl lead-in; music follows without artificial delay.
- Manual ritual: sleeve friction, paper scuff, vinyl edge handling, spindle contact, platter start, tonearm bearing movement, cue lever and stylus touchdown.
- Never loop loud vinyl crackle over clean recordings. Crackle is a brief transition layer or optional ambience.
- Cabinet: soft felt-and-cardboard slide with a small wooden stop.
- Menu and settings: restrained rotary detents, switch travel and relay sounds; no casino ticks.
- Curtains, lamp and whiskey base: quiet cloth movement, real switch click, nearly inaudible precision motor.
- Spatial ambience: subtle room tone and distant Toronto city bed, user-adjustable and disabled by default during focused listening.

## 6. Blender Master Prompt

Use this as the top-level brief for a Blender artist or Blender-capable generation agent:

```text
Build a production-ready, physically plausible 3D asset library and hero room for “JazzTor,” an immersive WebGL jazz listening application. Use Blender 4.x. The final look is a restrained 1960s–1970s audiophile listening room in a Toronto high-rise: black walnut, satin champagne brass, smoked glass, black marble, oxblood leather, cream paper and warm tungsten practical light. It must look handcrafted, affluent and authentic—not ornate, neon, cyberpunk, steampunk or AI-surreal.

Windows project root: D:\Jazztor. Save editable .blend sources under D:\Jazztor\blender\source, texture sources and baked PBR maps under D:\Jazztor\blender\textures, and final optimized GLB files under D:\Jazztor\blender\exports. Do not write project assets outside this root.

The large vintage-inspired turntable is the hero and must be mechanically credible, but it must not copy the protected industrial design or branding of any real product. Engrave the custom word “JazzTor” into the front walnut plinth. Build all interactive objects as separate named meshes with correct origins and pivots. Provide clean topology, real-world scale, bevels that catch light, UVs, PBR textures, animation rigs, LODs and tested glTF/GLB exports for Three.js/WebGPU/WebGL.

Create one persistent room with three lighting states—Day, Dusk and Night—sharing identical geometry and camera framing. Include only the hero turntable, record credenza, vinyl records and sleeves, architectural lamp, black-marble surface, restrained furniture shell, whiskey bottle, crystal tumbler with spherical ice on a motorised rotating base, floor-to-ceiling window and optimised Toronto skyline. Avoid unrelated chairs, bookcases and decorative clutter.
```

## 7. Blender Asset Prompts

### A01 — Hero Turntable

```text
Model an original vintage-inspired audiophile turntable, approximately 460 × 370 × 155 mm, with a solid black-walnut plinth, heavy aluminium platter, black rubber mat, mechanically plausible bearing, speed selector, cue lever, counterweight, anti-skate component, cartridge and stylus. Use a satin champagne-brass accent system and smoked acrylic where appropriate. Do not clone any existing brand or model. Engrave “JazzTor” into the front plinth as real geometry or a clean normal/decal option.

Separate objects: plinth, platter, spindle, mat, record, tonearm base, arm tube, headshell, cartridge, stylus, counterweight, cue lever, speed selector, hidden one-click play button and tiny indicator. Set pivots for platter rotation, tonearm horizontal arc, tonearm vertical cue motion and button travel. Add micro-bevels, subtle machining marks, correct metal anisotropy and walnut pores. Deliver LOD0/1/2.
```

### A02 — Vinyl Record & Sleeve System

```text
Create a 12-inch vinyl record, inner sleeve and outer album jacket at real-world scale. The record needs accurate grooves, run-in/run-out bands, centre label and edge thickness without excessive displacement. Build an interaction-ready hierarchy for pulling the record from the inner sleeve, dragging it in world space and snapping it onto the spindle. Provide neutral editable album-art material slots. Create closed, partly extracted and fully extracted states. Avoid warped circles, impossible grooves and copyrighted cover art.
```

### A03 — Record Credenza / Interactive Cabinet

```text
Model a compact black-walnut record credenza holding approximately 40–60 visible sleeves while keeping the WebGL asset efficient. Use modular slots and instancing. Each featured sleeve must be independently selectable and able to slide out 12–15% along a constrained local axis. Include a small physical selector for “For You” and “My Crate,” plus an optional thin caption carrier revealed with the record. Use realistic joinery, felt slot liners, brass label rails and soft-contact shadows. Set origins and constraints for idle, hover, selected and drag-ready states.
```

### A04 — Whiskey Still-Life & Rotating Pedestal

```text
Create one unbranded premium whiskey bottle, a heavy cut-crystal tumbler, amber liquid, one large spherical ice ball and a low motorised display pedestal. Keep all parts separate. Use physically based glass thickness, IOR, absorption and roughness; model the liquid meniscus; make the ice translucent with subtle internal imperfections and no cloudy plastic look. The pedestal is black stone with a fine brass ring and rotates the glass smoothly through 360 degrees in 45–60 seconds. Optimise transparent-material overdraw for real-time rendering and provide a cheaper mobile shader variant.
```

### A05 — Architectural Lamp

```text
Model a restrained 1960s architectural table lamp in blackened metal and champagne brass with a warm diffused shade. Create separate switch and dimmer components, correct pivots and emissive/light-linked materials. Provide on, off and dim states. The design must cast a controlled pool onto the turntable without blocking it. Avoid ornate Art Deco clichés or exposed industrial steampunk parts.
```

### A06 — Curtains

```text
Create premium dark acoustic curtains for a floor-to-ceiling window. Simulate believable heavy woven cloth and bake stable geometry for three states: open, half and closed. Provide shape keys or skeletal controls and collision-safe animation between states. Use efficient cloth folds, two-sided shading and 2K tileable fabric textures. Keep silhouettes elegant and avoid impossible pinching or explosive cloth simulation.
```

### A07 — Window & Toronto Skyline

```text
Build a floor-to-ceiling window system and an optimised Toronto skyline environment. The skyline should evoke an accurate downtown view, including a proportionally credible CN Tower, but avoid copying protected photography. Use layered 2.5D or low-poly geometry with depth separation for foreground roofs, mid-rise buildings, towers and atmospheric distance. Prepare Day, Dusk and Night sky/environment states and separate emissive building-window masks. Use subtle parallax and haze; do not turn the city into a futuristic neon skyline.
```

### A08 — Room Shell, Black Marble & Furniture

```text
Model a minimal high-rise listening-room shell with dark plaster, floor-to-ceiling glazing, black-marble hero surface and custom walnut/brass furniture supports. Remove chairs, bookcases and nonfunctional decor. Use accurate scale, clean architectural junctions, soft edge bevels and physically plausible thickness. Build reusable material slots for user customisation: walnut tone, marble variant, brass finish and upholstery accent. Keep draw calls and occluded geometry under control.
```

### A09 — Physical Player Console

```text
Create a slim physical bottom player console in walnut and brass. Components: album-colour paper/acrylic insert, small metadata plate, two warm VU meters, progress groove, play/pause/skip controls, volume knob and time readout carrier. Every control must be a separate interactive mesh with correct pivot and pressed/turned states. VU needles should be rigged for audio-reactive animation. Typography will be rendered as HTML/CSS or replaceable texture, so supply clean label zones rather than baked fake text.
```

### A10 — Jazz Map Table

```text
Model a walnut-and-brass map table with a dark printed Toronto map below smoked glass, modular brass location pins, compact filter dial and one archival information card that can rise from a concealed slot. Pins must be instanced and selectable. Separate the map graphic as a replaceable texture layer. Provide focus-light and selected-pin animation hooks. Keep the table visually connected to the listening room and suitable for close camera inspection.
```

### A11 — Museum & Legacy Archive Modules

```text
Create modular archive-display components: walnut console, brass timeline rail, smoked-glass cover, cream paper cards, photo frame, record-label disc, ticket-stub holder and listening control. Cards and frames must accept dynamic HTML/canvas textures or DOM overlays. Rig panels to slide, unfold or rise with restrained museum-display motion. Do not bake invented historical content into textures.
```

### A12 — Login, Menu & Settings Hardware

```text
Create a reusable hi-fi control drawer for JazzTor navigation, authentication and settings. Use engraved brass tabs, walnut housing, rotary selectors, toggle switches, amber pilot lamps and clean inset areas for accessible HTML form overlays. Make touch targets visually clear without oversized game UI. Provide pressed, focused, selected, disabled and warning states through geometry/material parameters rather than separate heavy meshes.
```

### A13 — Atmospheric FX

```text
Create restrained real-time ambience: a sparse dust-mote particle system visible only in direct light, subtle glass reflection cards, optional film-grain post-process guidance and low-cost caustic approximation for the whiskey glass. Effects must be individually disableable and have mobile-quality variants. Avoid heavy fog, glitter, constant lens flares or obvious looping particles.
```

## 8. Blender Animation Prompt

```text
Rig and animate the JazzTor asset library with restrained physically motivated motion. Name every action clearly and make it exportable through glTF where possible.

Required actions:
1. Platter start, steady 33⅓ rpm rotation and stop with realistic acceleration/deceleration.
2. Tonearm horizontal arc from rest to lead-in groove, vertical cue-lift and gentle stylus touchdown; never intersect the record.
3. Hidden one-click play button travel of 1.5–2.5 mm with a short return and indicator response.
4. Record extraction from sleeve, drag-ready pose, spindle snap and release.
5. Album sleeve hover and selected slide-out at 12–15%, with controlled overshoot under 2%.
6. Cabinet selector switch between For You and My Crate.
7. Curtains transition among open, half and closed without cloth instability.
8. Lamp switch and continuous dimmer animation.
9. Whiskey pedestal continuous 360-degree revolution over 45–60 seconds; separate subtle ice/liquid response if performance allows.
10. VU needles driven by normalised left/right audio amplitude with damped attack and release.
11. Menu drawer, museum panels, archive cards, map pins and information card motions.
12. Camera actions for Home, Platter Top, Cabinet, Map, Museum, Legacy, Collection, Menu, Login and Settings.

Use smooth custom curves, small mechanical settling, no elastic mobile-app bounce, no cinematic camera shake and no excessive depth-of-field hunting. Provide reduced-motion alternatives with static cameras and short exposure fades.
```

## 9. Day / Dusk / Night Lighting Prompt

```text
Create three physically coherent lighting states using the same room geometry and cameras.

DAY: soft Toronto late-morning daylight, neutral-to-slightly-warm sun/sky balance, gentle atmospheric haze, crisp but soft-edged shadows, practical lamp optional and low intensity.

DUSK: residual amber near horizon grading into mauve and indigo, cool window fill balanced by warm 2400–2700 K lamp, first city emissives appearing, controlled brass highlights and preserved shadow detail.

NIGHT: realistic dark city with varied building-window emissives, cool low-level exterior contribution, one warm practical key, tiny amber hardware indicators and readable turntable silhouette. No cyan neon wash.

Expose all three states consistently so materials retain identity. Prepare light collections and world nodes for smooth runtime crossfades or bake matched lightmaps/reflection probes for each state. Keep bloom subtle and use filmic/AgX colour management without crushed blacks or clipped gold highlights.
```

## 10. Technical Delivery Specification

- Canonical Windows root: `D:\Jazztor`.
- Blender working files: `D:\Jazztor\blender\source\`.
- Texture sources and baked maps: `D:\Jazztor\blender\textures\`.
- Runtime exports: `D:\Jazztor\blender\exports\`.
- Frontend copies: `D:\Jazztor\app\public\assets\3d\` and `D:\Jazztor\app\public\assets\textures\`.
- Blender: 4.x; meters; transforms applied; Y-up glTF export tested.
- Rendering: Cycles for final look development; real-time materials validated in Eevee and target WebGL/WebGPU viewer.
- Shaders: Principled BSDF and glTF-compatible nodes; avoid unsupported procedural dependencies in exported assets.
- Textures: 4K only for hero close-up surfaces; 2K for secondary props; 1K or atlas for small objects. Supply Base Color, Normal, ORM (occlusion/roughness/metallic), Emissive and opacity only where needed.
- Compression: KTX2/BasisU textures and Draco or Meshopt geometry after visual QA.
- UVs: non-overlapping baked UV set plus lightmap UV where used; consistent texel density.
- Geometry: clean normals, weighted normals where useful, realistic bevels, no hidden high-poly interiors.
- Suggested triangle budgets at LOD0 / LOD1 / LOD2:
  - turntable and tonearm: 150k / 60k / 20k;
  - room and architectural shell: 250k / 120k / 50k;
  - cabinet plus visible record set: 100k / 45k / 18k;
  - whiskey still-life: 45k / 20k / 8k;
  - lamp and each console module: 25k / 12k / 5k.
- Mobile target: load only the current station; use instancing for records, pins and repeated hardware; simplify refraction and shadows.
- Origins: at mechanical pivot or logical grab point; no object origins at world zero unless intentional.
- Naming example: `JT_Turntable_Platter_LOD0`, `JT_Tonearm_Rig`, `JT_Cabinet_Sleeve_001`, `JT_Light_Dusk_Key`.
- Interactivity: every clickable object gets a simplified invisible collider prefixed `COL_`; drag surfaces and snap points prefixed `DRAG_` and `SNAP_`.
- Export groups: `D:\Jazztor\blender\exports\JT_Room.glb`, `D:\Jazztor\blender\exports\JT_Turntable.glb`, `D:\Jazztor\blender\exports\JT_Cabinet.glb`, `D:\Jazztor\blender\exports\JT_Whiskey.glb`, `D:\Jazztor\blender\exports\JT_UI_Stations.glb`, plus separate environment/light configuration.
- Supply `.blend` source, exported `.glb`, texture folder, material manifest, animation list, polygon report and one test viewer.

## 11. Blender Negative Prompt / Quality Guardrails

```text
Do not produce: AI-melted geometry; asymmetric accidental parts; impossible screws or tonearm mechanics; paper-thin glass; plastic-looking walnut; mirror-polished brass everywhere; distorted engraved text; fake commercial logos; copyrighted album art; ornate billionaire-mansion clichés; Art Deco overload; steampunk pipes; cyberpunk neon; nightclub smoke; random chairs or bookcases; excessive props; giant UI screens; illegible labels; exaggerated depth of field; crushed blacks; oversaturated teal-orange grading; constant dust; expensive volumetrics; unoptimised transparent layers; baked text that must change dynamically.
```

## 12. Handoff Checklist

- [ ] All 21 UI references reviewed and mapped to reusable components.
- [ ] Identical room geometry across Day, Dusk and Night.
- [ ] Turntable mechanics verified by a real reference video or subject-matter reviewer.
- [ ] JazzTor engraving clean at hero distance and close-up.
- [ ] Every interactive mesh has a named pivot, collider and state list.
- [ ] Album artwork and archival images are replaceable/licensed placeholders.
- [ ] Toronto map and skyline accuracy reviewed independently.
- [ ] Desktop, tablet and phone performance profiles tested.
- [ ] Reduced Motion, keyboard navigation, focus visibility and high-contrast labels supported.
- [ ] Transparent materials tested on target devices.
- [ ] GLB files open without missing textures or unsupported node warnings.
- [ ] Audio, camera and animation timelines documented for frontend integration.

---

## 13. Additional 3D & Annotation Assets

### 22 — Isolated JazzTor Turntable (Transparent PNG)

![Transparent JazzTor Turntable](assets/ui/22-turntable-3d-transparent.png)

```text
Create a genuinely transparent-background PNG cutout of one complete, original, mechanically credible premium vintage-inspired JazzTor turntable. Use a three-quarter front view from slightly above; centre the entire object with generous transparent margin. Match the product language of the selected homepage: deep black-walnut rectangular plinth, satin champagne-brass platter, black vinyl record with subtle grooves and terracotta centre label, accurate spindle, complete tonearm mechanism, discrete brass controls and one unlabelled black one-click play button. Engrave the exact word “JazzTor” into the front face. Use clean premium studio key and rim light, realistic micro-bevels and restrained reflections. No room, floor, skyline, callouts, unrelated props, real-world branding or cropped edges. Preserve actual alpha transparency.
```

### 23 — Turntable Component Map

![JazzTor Turntable Component Map](assets/ui/23-turntable-component-map.png)

```text
Preserve the supplied JazzTor turntable model, camera angle, scale and materials. Place it on a warm ivory industrial-design reference sheet. Add thin champagne-brass leader lines, numbered markers and a crisp right-side legend using these exact labels: 01 WALNUT PLINTH; 02 VINYL RECORD; 03 CENTRE SPINDLE; 04 BRASS PLATTER; 05 TONEARM PIVOT; 06 COUNTERWEIGHT; 07 TONEARM; 08 HEADSHELL; 09 CARTRIDGE + STYLUS; 10 SPEED SELECTOR; 11 ONE-CLICK PLAY; 12 TIME / ROOM SELECTOR; 13 ISOLATION FOOT; 14 JAZZTOR ENGRAVING. Title: “JAZZTOR TURNTABLE — COMPONENT MAP”. Subtitle: “3D production reference · not to scale”. Keep text correctly spelled, horizontal and readable; do not redesign or obscure the product.
```

### 24 — Homepage Interaction Map

![JazzTor Homepage Interaction Map](assets/ui/24-home-interaction-map.png)

```text
Preserve the supplied JazzTor Day homepage, room, Toronto skyline, turntable, cabinet, lamp, whiskey display, navigation and bottom player. Overlay a restrained premium UX annotation system with thin brass leader lines, numbered markers and compact ivory label cards. Use these exact labels: 01 PRIMARY 3D TURNTABLE; 02 HIDDEN ONE-CLICK PLAY; 03 MANUAL NEEDLE RITUAL; 04 FOR YOU / MY CRATE; 05 INTERACTIVE ALBUM SHELF; 06 ALBUM + ARTIST REVEAL; 07 TORONTO LIVE VIEW; 08 MAP / MUSEUM / LEGACY; 09 AUTO TIME MODE; 10 DAY / DUSK / NIGHT; 11 ROTATING WHISKEY DISPLAY; 12 ALBUM-REACTIVE PLAYER; 13 VU METERS + TRANSPORT; 14 CURTAINS + LAMP CONTROLS. Title: “JAZZTOR HOME — INTERACTION MAP”. Subtitle: “Persistent 3D listening room · Day state”. Keep all annotations clear of critical controls and preserve the original visual identity.
```

## 14. Full 3D Homepage Asset Library — No Flat UI

### Implementation rule

The JazzTor homepage must not use 2D cards, billboard meshes, pre-rendered furniture, fake-depth panels or image textures pretending to be physical objects. Turntable, cabinet, sleeves, record, lamp, curtains, whiskey display, table, window, skyline layers, player, navigation, time selector and page stations are separate 3D assets with thickness, pivots, colliders and interactive states. Normal PBR material maps and replaceable album/archival content textures remain permitted and necessary for realism.

Shared prompt foundation for assets 25–36:

```text
Create an isolated 3D production reference for the JazzTor WebGL experience. Match the established design system: deep black walnut, satin champagne brass, black marble, smoked glass and restrained 1960s–1970s audiophile luxury. Use physically plausible construction, micro-bevels and premium Blender/Cycles realism. Show one complete asset in three-quarter front view from slightly above, centered with generous margin. Output genuine transparent PNG alpha. No room, floor, annotations, people, watermark, real-world logos, floating pieces or cropped edges. Every visible control and panel must have real modeled thickness and depth—no flat UI card, billboard or texture plane.

Windows output root: D:\Jazztor. Save concept/reference PNG files under D:\Jazztor\assets\ui, Blender source assets under D:\Jazztor\blender\source, PBR textures under D:\Jazztor\blender\textures, and optimized GLB output under D:\Jazztor\blender\exports. Do not create project files outside D:\Jazztor.
```

### 25 — Interactive Record Credenza

![Interactive Record Credenza](assets/ui/25-record-credenza-3d.png)

```text
Create a compact interactive vinyl-record credenza: solid black-walnut carcass, subtle black-marble top, satin-brass feet and label rail, realistic joinery and felt-lined vertical slots. Include approximately 24 varied sleeves as individually thick objects; one selected sleeve projects 12–15%. Integrate a real machined-brass lever for For You / My Crate, using small replaceable engraved plates. No turntable, lamp or whiskey.
```

### 26 — Vinyl Record & Sleeve System

![Vinyl Sleeve System](assets/ui/26-vinyl-sleeve-system-3d.png)

```text
Create a modular album interaction set: one thick 12-inch outer jacket, paper inner sleeve and separate black vinyl record partly extracted. Add record grooves, terracotta center label, cardboard edges, paper wear and real shadow gaps. Use abstract black, cream and muted-rust placeholder cover art with no copyrighted imagery. Arrange as a coherent interaction reference, not a flat collage.
```

### 27 — Architectural Lamp

![Architectural Lamp](assets/ui/27-architectural-lamp-3d.png)

```text
Create a restrained adjustable table lamp with heavy blackened-metal base, champagne-brass stem, dome shade, warm diffuser, real toggle and separate rotary dimmer. Use manufacturable joints and premium vintage-modern geometry. No ornate decoration, exposed bulb or furniture.
```

### 28 — Whiskey Rotation Display

![Whiskey Display](assets/ui/28-whiskey-display-3d.png)

```text
Create an unbranded whiskey bottle, heavy cut-crystal tumbler, amber liquid, spherical ice and low motorized black-stone pedestal with brass ring. Keep bottle, liquid, glass, ice and pedestal as separate objects. Use physical glass thickness, refraction and liquid meniscus. Center the tumbler on the rotating pedestal. No labels or logos.
```

### 29 — Curtain System

![Curtain System](assets/ui/29-curtain-system-3d.png)

```text
Create full-height acoustic curtains on a recessed champagne-brass ceiling track. Use heavy taupe-brown woven cloth, elegant folds, weighted hems, visible carriers and real modeled cloth geometry. Show a partially open state. No window, skyline, wall or opacity-card curtains.
```

### 30 — Black-Marble Turntable Console

![Marble Console](assets/ui/30-marble-console-3d.png)

```text
Create a long low architectural turntable console: thick veined black-marble slab, black-walnut apron, recessed cable-management cavity, champagne-brass structural frame and adjustable isolation feet. Minimal, affluent and structurally credible. Keep the top empty.
```

### 31 — Floor-to-Ceiling Window Module

![Window Module](assets/ui/31-window-module-3d.png)

```text
Create a real architectural window module: low-iron glass panes with thickness, slender dark-bronze mullions, deep walnut sill, concealed curtain-track pocket, gaskets and brass hardware. Show the complete freestanding assembly without city backdrop. Do not use a flat glass card.
```

### 32 — Toronto 3D Skyline Module

![Toronto Skyline](assets/ui/32-toronto-skyline-3d.png)

```text
Create an optimized layered 3D Toronto skyline for parallax: proportionally credible CN Tower, waterfront, varied towers, foreground roofs and multiple depth bands. Use muted realistic materials and modeled emissive window apertures. No photographic panorama, flat backdrop or futuristic neon. Treat the image as a direction; production geometry must be checked against accurate city references.
```

### 33 — Physical Music Player Console

![Physical Music Player](assets/ui/33-player-console-3d.png)

```text
Create only a slim freestanding physical player: walnut chassis, blackened-metal faceplate, brass frame, two recessed analog VU meters with real needles, volume knob, three transport buttons, mechanical progress rail and a thick replaceable album-information plaque. No turntable, screen, floating UI or flat card.
```

### 34 — Navigation & Room Controls

![Navigation and Room Controls](assets/ui/34-navigation-room-controls-3d.png)

```text
Create a modular physical navigation and room-control console. Include seven raised brass destination keys in a walnut housing; four time-mode positions; lamp dimmer; curtain lever; and amber pilot lights. Use exact short labels HOME, MAP, MUSEUM, LEGACY, CRATE, ROOM, SETTINGS, AUTO, DAY, DUSK and NIGHT. All keys, knobs and levers require real travel and separate geometry. No touchscreen.
```

### 35 — 3D Jazz Map Station

![Jazz Map Station](assets/ui/35-jazz-map-station-3d.png)

```text
Create a real walnut-and-brass Jazz Map station: dark three-dimensional relief map of Toronto beneath thick smoked glass, raised modular venue pins, rotary filter dial, date wheel and a cream archival card emerging from a mechanical slot. Streets, shoreline and pins are modeled relief, not a flat printed image.
```

### 36 — Museum & Legacy Archive Station

![Museum and Legacy Station](assets/ui/36-museum-legacy-station-3d.png)

```text
Create only a freestanding museum archive station: black-walnut console, brass timeline rail with movable markers, smoked-glass vitrine, physically layered blank archival cards, deep brass photo frame with blank insert, record-label specimen discs, ticket holders and listening button. Every layer has thickness. No turntable, map, people, portrait or invented historical claim.
```

### Homepage composition constraint

When rebuilding the main screen, assemble the actual 3D assets above inside one scene. Use HTML only for accessible semantic mirrors, screen-reader content and optional high-resolution dynamic text; visible controls should be anchored to or rendered onto modeled plaques, meters and controls. Album cover imagery may populate the physical sleeve material, but the sleeve itself must remain a true 3D mesh.

---

This file is intended to live at `D:\Jazztor\JazzTor-UI-Prompts-and-Blender-Brief.md`. The accompanying images live at `D:\Jazztor\assets\ui\`. Keep their relative layout unchanged so every image continues to render inside the Markdown document.
