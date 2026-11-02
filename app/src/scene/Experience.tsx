import * as THREE from 'three'
import { useEffect, useMemo, useRef } from 'react'
import { useFrame, useLoader, useThree, type ThreeEvent } from '@react-three/fiber'
import { ContactShadows, Environment, Lightformer } from '@react-three/drei'
import { TorontoBackdrop, WindowReflection } from './TorontoBackdrop'
import { museum, museumBuilt } from './MuseumWorld'
import { mapView } from './mapView'
import { mapLights } from './mapLights'
import { vinylBox } from './prepare'
import { place, roomInstruments, saxStand, sway, type Placed } from './instruments'
import { EXHIBIT_CARD_PX } from '../ui/ExhibitCard'
import { GradeEffect, LOOKS, easeGrade } from './grade'
const _v1 = new THREE.Vector3()
const _v2 = new THREE.Vector3()
import { MAP_PANEL_PX } from '../ui/MapPanel'
import { RectAreaLightUniformsLib } from 'three/examples/jsm/lights/RectAreaLightUniformsLib.js'
import { EffectComposer, Bloom, ToneMapping, Noise, Vignette, N8AO } from '@react-three/postprocessing'
import { BlendFunction, ToneMappingMode } from 'postprocessing'
import { interactiveId, prepareScenes, type Nodes } from './prepare'
import { ROOM_GLBS, initLoaders, useTierGLTF } from './loaders'
import { consoleHeightPx, isOverConsole } from './PlayerConsole'
import { TIERS } from '../quality'
import { panelWidthPx } from '../ui/Panels'
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js'
import { applyBake, bakeUniforms, buildEnvs, pmrem, updateBakeWeights, useBakeData, type BakeMeta } from './bakedLighting'
import { PRESETS, easePreset, makeLivePreset, resolveTorontoMode } from './timeMode'
import { deck, yawTowards } from './deck'
import { useJazz, visibleAlbums, shelfAlbums, shelfOf, shelfPages, type Station, type TimeSetting } from '../state/store'
import { ALBUMS, albumById } from '../data/albums'
import { audio } from '../audio/engine'

RectAreaLightUniformsLib.init()

const TIME_ORDER: TimeSetting[] = ['AUTO', 'DAY', 'DUSK', 'NIGHT']
const TIME_ANGLE: Record<TimeSetting, number> = { AUTO: -54, DAY: -18, DUSK: 18, NIGHT: 54 }
const CURTAIN_VALUE = { OPEN: 0, HALF: 1, CLOSED: 2 } as const
const SLEEVE_OUT = 0.315 * 0.14
const damp = (cur: number, to: number, lambda: number, dt: number) => cur + (to - cur) * (1 - Math.exp(-lambda * dt))

// ------------------------------------------------------------------------- actions shared with the HTML UI
export const actions = {
  cycleTime() {
    const s = useJazz.getState()
    const next = TIME_ORDER[(TIME_ORDER.indexOf(s.timeSetting) + 1) % TIME_ORDER.length]
    s.set({ timeSetting: next })
    audio.sfx('detent')
  },
  setTime(t: TimeSetting) {
    useJazz.getState().set({ timeSetting: t })
    audio.sfx('detent')
  },
  lampToggle() {
    const s = useJazz.getState()
    s.set({ lampLevel: s.lampLevel > 0.02 ? 0 : 0.7 })
    audio.sfx('switch')
  },
  lampStep() {
    const s = useJazz.getState()
    const steps = [0, 0.35, 0.7, 1]
    const i = steps.findIndex((v) => v >= s.lampLevel - 0.01)
    s.set({ lampLevel: steps[(i + 1) % steps.length] })
    audio.sfx('detent')
  },
  curtainCycle() {
    const s = useJazz.getState()
    const order = ['OPEN', 'HALF', 'CLOSED'] as const
    s.set({ curtain: order[(order.indexOf(s.curtain) + 1) % 3] })
    audio.sfx('curtain')
  },
  crateToggle() {
    const s = useJazz.getState()
    const crate = s.crate === 'FOR_YOU' ? 'MY_CRATE' : 'FOR_YOU'
    // the shelf in view follows the record on the deck (or starts at the first shelf)
    s.set({ crate, cabinetPage: shelfOf(crate, s.myCrate, s.albumId) })
    audio.sfx('lever')
    if (crate === 'MY_CRATE' && !visibleAlbums(crate, s.myCrate).length) s.showToast('My Crate is empty — add records in Collection with “+ Crate”')
  },
  selectAlbum(id: string) {
    const s = useJazz.getState()
    audio.sfx('slide')
    void deck.changeAlbum(id, s.prefs.autoplayOnSelect)
  },
  step(dir: 1 | -1) {
    const s = useJazz.getState()
    const list = visibleAlbums(s.crate, s.myCrate)
    if (!list.length) return
    const i = list.findIndex((a) => a.id === s.albumId)
    const next = list[(i + dir + list.length) % list.length]
    audio.sfx('detent')
    s.set({ cabinetPage: shelfOf(s.crate, s.myCrate, next.id) })
    void deck.changeAlbum(next.id, s.deck === 'playing')
  },
  /** Flip to the previous / next shelf of sleeves (a crate larger than the cabinet's 8 sleeves). */
  shelfStep(dir: 1 | -1) {
    const s = useJazz.getState()
    const n = shelfPages(s)
    if (n < 2) return
    audio.sfx('slide')
    s.set({ cabinetPage: (Math.min(s.cabinetPage, n - 1) + dir + n) % n, hovered: null })
  },
  goStation(st: Station) {
    const s = useJazz.getState()
    if (s.station === 'museum' && st !== 'museum') return void museum.exit(() => actions.goStation(st))
    if (st === 'map' && !s.mapRequested) s.showToast('Unrolling the map…')
    s.set({ station: st, ...(st === 'map' ? { mapRequested: true } : { selectedVenue: null }),
      ...(st === 'cabinet' && s.station !== 'cabinet' ? { cabinetPage: shelfOf(s.crate, s.myCrate, s.albumId) } : {}) })
  },
}

/** The sleeve standing out of the cabinet, on screen (ui/SleeveCaption reads it every frame). */
export const sleeveCaption = { x: 0, y: 0, title: '', artist: '', show: 0 }

// ------------------------------------------------------------------------- caption card texture
function drawCaption(canvas: HTMLCanvasElement, title: string, artist: string, crate: string) {
  const g = canvas.getContext('2d')!
  const { width: w, height: h } = canvas
  g.fillStyle = '#e9dfc9'
  g.fillRect(0, 0, w, h)
  for (let i = 0; i < 2500; i++) {
    g.fillStyle = `rgba(90,70,40,${Math.random() * 0.05})`
    g.fillRect(Math.random() * w, Math.random() * h, 1.5, 1.5)
  }
  g.strokeStyle = 'rgba(120,90,50,0.55)'
  g.lineWidth = 2
  g.strokeRect(14, 14, w - 28, h - 28)
  g.fillStyle = '#7b5a33'
  g.font = '500 20px Jost, sans-serif'
  g.letterSpacing = '4px'
  g.fillText(crate, 40, 58)
  g.letterSpacing = '0px'
  g.fillStyle = '#1d1712'
  let size = 54
  g.font = `600 ${size}px "Cormorant Garamond", Georgia, serif`
  while (g.measureText(title).width > w - 80 && size > 30) g.font = `600 ${(size -= 2)}px "Cormorant Garamond", Georgia, serif`
  g.fillText(title, 40, 132)
  g.font = 'italic 500 36px "Cormorant Garamond", Georgia, serif'
  g.fillStyle = '#3a2d22'
  g.fillText(`— ${artist}`, 40, 186)
}

// ------------------------------------------------------------------------- the room
export function Experience() {
  const { gl: renderer } = useThree()
  initLoaders(renderer)
  const tier = useJazz((s) => s.tier)
  const settings = TIERS[tier]
  const loaded = useTierGLTF(settings.assets, [...ROOM_GLBS, 'JT_Instruments'])
  const gltfs = useMemo(() => loaded.slice(0, -1), [loaded])
  const instGltf = loaded[loaded.length - 1]
  const aniso = useLoader(THREE.TextureLoader, '/assets/textures/JT_Vinyl_Anisotropy.png')
  const { camera, gl, scene, size, setFrameloop } = useThree()
  const prepared = useMemo(() => {
    aniso.colorSpace = THREE.NoColorSpace
    aniso.flipY = false
    return prepareScenes(gltfs.map((g) => g.scene), aniso, settings, renderer.capabilities.getMaxAnisotropy())
  }, [gltfs, aniso, settings])
  const n: Nodes = prepared.nodes

  // the two room instruments, where the home view sees them: Miles's trumpet lying across the record shelf under the
  // desk lamp; Coltrane's alto upright on a floor stand in front of the curtain, between the cabinet and the window
  const roomInst = useMemo(() => {
    const out: Placed[] = []
    // a faint display reflection: at night the room's own environment is near black and the brass would vanish
    const studio = pmrem(renderer).fromScene(new RoomEnvironment(), 0.04).texture
    const miles = roomInstruments.find((i) => i.id === 'miles')
    const coltrane = roomInstruments.find((i) => i.id === 'coltrane')
    // (diagonal on the 0.36 m deep shelf top: the mouthpiece end forward, clear of the lamp base)
    const m = miles && place(instGltf.scene, miles, new THREE.Vector3(-0.53, 1.09, -2.18), 0.55, new THREE.Vector3(0.1, 0.85, 1).normalize(), 1.35,
      'room', { env: studio, envIntensity: 0.22 })
    const c = coltrane && place(instGltf.scene, coltrane, new THREE.Vector3(-0.08, 0, -1.86), -0.42, new THREE.Vector3(0.18, 0.8, 1).normalize(), 1.35,
      'room', { upright: true, lift: 0.09, env: studio, envIntensity: 0.42 })
    if (m) out.push(m)
    if (c) {
      const stand = saxStand(0.09)
      c.obj.add(stand) // (sways with it in close-up: the stand turns with the horn)
      out.push(c)
    }
    return out
  }, [instGltf])
  const live = useRef(makeLivePreset(PRESETS[useJazz.getState().resolvedMode]))
  const sun = useRef<THREE.DirectionalLight>(null!)
  const fill = useRef<THREE.RectAreaLight>(null!)
  const key = useRef<THREE.SpotLight>(null!)
  const lampLight = useRef<THREE.PointLight>(null!)
  const grade = useMemo(() => new GradeEffect(), [])
  const goldLight = useRef<THREE.SpotLight>(null!)
  const goldTarget = useRef<THREE.Object3D>(null!)
  useEffect(() => { if (goldLight.current && goldTarget.current) goldLight.current.target = goldTarget.current }, [])
  const hemi = useRef<THREE.HemisphereLight>(null!)
  const homeGroup = useRef<THREE.Group>(null!)
  const anim = useRef({ curtain: CURTAIN_VALUE[useJazz.getState().curtain] as number, lamp: useJazz.getState().lampLevel,
    timeKnob: TIME_ANGLE[useJazz.getState().timeSetting], crate: 0, sleeves: new Array(8).fill(0), whiskey: 0, adapt: 1,
    whiskeyPaused: false, finish: '', panelShift: 0, cam: 1, roomKnob: 0, speed: 0 })

  // ---- one-time scene wiring
  const rig = useMemo(() => {
    const get = <T extends THREE.Object3D>(name: string) => n[name] as T
    // crystal shells draw after the ice / liquid they contain
    for (const o of Object.values(n)) {
      const m = (o as THREE.Mesh).material as THREE.Material | undefined
      if ((o as THREE.Mesh).isMesh && m && !Array.isArray(m) && m.name === 'JT_Crystal') o.renderOrder = 5
    }
    const turntable = get('JT_Turntable_Root')
    const sleeves = Array.from({ length: 8 }, (_, i) => get(`JT_Cabinet_Sleeve_${String(i + 1).padStart(3, '0')}`))
    const sleeveBase = sleeves.map((s) => s.position.clone())
    // real release artwork on the 3D sleeves: one material per record, the sleeve mesh stays geometry
    const coverBase = prepared.materials.get('JT_Cover_00') as THREE.MeshStandardMaterial
    const coverLoader = new THREE.TextureLoader()
    const coverMats = ALBUMS.map((a) => {
      const m = coverBase.clone()
      const t = coverLoader.load(a.cover)
      t.colorSpace = THREE.SRGBColorSpace
      t.flipY = false
      t.anisotropy = renderer.capabilities.getMaxAnisotropy()
      m.map = t
      m.roughness = 0.62 // printed card stock, slightly satin
      return m
    })
    const display = get<THREE.Mesh>('JT_Cabinet_DisplaySleeve')
    const displayMat = (display.material as THREE.MeshStandardMaterial).clone()
    // the lit display rack (cover as a soft glow) is part of the material from the start: adding an emissive map
    // later would recompile it after the first frames
    displayMat.map = displayMat.map ?? coverMats[0]?.map ?? null
    displayMat.emissive.set('#ffffff')
    displayMat.emissiveMap = displayMat.map
    displayMat.emissiveIntensity = 0.42
    display.material = displayMat
    const loose = get<THREE.Mesh>('JT_Loose_Sleeve')
    const looseMat = (loose.material as THREE.MeshStandardMaterial).clone()
    loose.material = looseMat
    const canvas = document.createElement('canvas')
    canvas.width = 640
    canvas.height = 240
    const captionTex = new THREE.CanvasTexture(canvas)
    captionTex.colorSpace = THREE.SRGBColorSpace
    captionTex.anisotropy = 8
    captionTex.flipY = false
    const card = get<THREE.Mesh>('JT_Cabinet_CaptionCard')
    // printed card under the lamp: a touch of self-light so it reads in the shadowed bay (map + emissive from the start)
    card.material = new THREE.MeshStandardMaterial({ map: captionTex, roughness: 0.85, emissive: new THREE.Color('#ffffff'),
      emissiveMap: captionTex, emissiveIntensity: 0.35 })
    const leds = Object.fromEntries(TIME_ORDER.map((m) => [m, get<THREE.Mesh>(`JT_Turntable_TimeLED_${m}`)]))
    const curtains = [get<THREE.Mesh>('JT_Curtain_Left'), get<THREE.Mesh>('JT_Curtain_Right')].map((c) =>
      (c.isMesh ? c : (c.children.find((ch) => (ch as THREE.Mesh).isMesh) as THREE.Mesh)))
    const lampPoint = new THREE.Vector3()
    get('JT_Lamp_LightPoint')?.getWorldPosition(lampPoint)
    const cams: Record<Station, { pos: THREE.Vector3; quat: THREE.Quaternion; fov: number }> = {} as never
    for (const [st, name] of [['home', 'JT_Cam_Home'], ['platter', 'JT_Cam_Platter'], ['cabinet', 'JT_Cam_Cabinet'],
      ['map', 'JT_Cam_Map']] as const) {
      const node = get(name)
      const c = (node as THREE.PerspectiveCamera).isPerspectiveCamera
        ? (node as THREE.PerspectiveCamera)
        : (node.children.find((ch) => (ch as THREE.PerspectiveCamera).isPerspectiveCamera) as THREE.PerspectiveCamera)
      const src = c ?? node
      src.updateWorldMatrix(true, false)
      cams[st] = { pos: src.getWorldPosition(new THREE.Vector3()), quat: src.getWorldQuaternion(new THREE.Quaternion()),
        fov: c?.fov ?? 40 }
    }
    const recordTop = new THREE.Vector3()
    get('SNAP_Tonearm_StylusTip')?.getWorldPosition(recordTop)
    return {
      turntable, platter: get('JT_Turntable_PlatterRig'), yaw: get('JT_Tonearm_Rig'), lift: get('JT_Tonearm_Lift'),
      button: get('JT_Turntable_PlayButton'), buttonY: get('JT_Turntable_PlayButton').position.y,
      playRing: get<THREE.Mesh>('JT_Turntable_PlayRing'), indicator: get<THREE.Mesh>('JT_Turntable_Indicator'),
      timeKnob: get('JT_Turntable_TimeKnob'), roomKnob: get('JT_Turntable_RoomKnob'),
      speedKnob: get('JT_Turntable_SpeedSelector'), cue: get('JT_Turntable_CueLever'),
      lever: get('JT_Cabinet_Selector_Lever'), leverX: get('JT_Cabinet_Selector_Lever').position.x,
      whiskey: get('JT_Whiskey_Rig'), diffuser: get<THREE.Mesh>('JT_Lamp_Diffuser'),
      sleeves, sleeveBase, coverMats, displayMat, looseMat, display, loose, card, captionTex, canvas, leds, curtains, lampPoint, cams,
      recordY: recordTop.y || 0.885,
    }
  }, [n, prepared])

  // cover material per record; records imported later (local files) get one on first use
  const coverMatFor = (a: (typeof ALBUMS)[number]) => {
    const i = ALBUMS.indexOf(a)
    if (!rig.coverMats[i]) {
      const m = rig.coverMats[0].clone()
      const t = new THREE.TextureLoader().load(a.cover)
      t.colorSpace = THREE.SRGBColorSpace
      t.flipY = false
      m.map = t
      rig.coverMats[i] = m
    }
    return rig.coverMats[i]
  }

  // ---- Cycles-baked lighting (lightmaps for static meshes, HDR room panoramas for reflections)
  // (loaded with the models through Suspense and applied before the first frame: one compile, under the loader)
  const bakeData = useBakeData(settings.tier === 'low')
  const bake = useMemo<{ meta: BakeMeta; envs: Record<string, THREE.Texture> } | null>(() => {
    if (!bakeData) return null
    const n2 = applyBake(n, bakeData.meta, bakeData.maps.day)
    console.info(`baked lighting on ${n2} meshes`)
    return { meta: bakeData.meta, envs: buildEnvs(renderer, bakeData.envs) }
  }, [bakeData, n, renderer])

  // ---- initial camera + resolve Toronto time
  useEffect(() => {
    const st = rig.cams.home
    camera.position.copy(st.pos)
    camera.quaternion.copy(st.quat)
    const update = () => {
      const s = useJazz.getState()
      s.set({ resolvedMode: s.timeSetting === 'AUTO' ? resolveTorontoMode() : s.timeSetting })
    }
    update()
    scene.add(key.current.target)
    key.current.target.position.set(0.02, 0.8, 0.08)
    sun.current.target.position.set(0.0, 0.8, 0.0)
    scene.add(sun.current.target)
    const unsub = useJazz.subscribe((s, p) => s.timeSetting !== p.timeSetting && update())
    const id = window.setInterval(update, 60_000)
    // Hold the render loop and hand every room shader to the GPU at once (KHR_parallel_shader_compile): drawing first
    // compiled ~56 programs one after another inside a single frame (10 s on some GPUs). With the final environment
    // and the composer's half-float target, exactly the programs the first frame needs; then draw and reveal.
    let r1 = 0
    let live = true
    setFrameloop('never')
    if (bake) scene.environment = bake.envs[useJazz.getState().resolvedMode.toLowerCase()] ?? scene.environment
    const prevRT = gl.getRenderTarget()
    const rt = settings.post ? new THREE.WebGLRenderTarget(4, 4, { type: THREE.HalfFloatType }) : null
    if (rt) gl.setRenderTarget(rt)
    const compiled = gl.compileAsync(scene, camera)
    gl.setRenderTarget(prevRT)
    // ...then (in sequence, so it never slows that compile) load the museum and wait for its model to be parsed and built:
    // parsing a model of ~600 nodes is a ~0.1 s main-thread task, which belongs under the loading screen, not in the room
    const roomReady = Promise.race([compiled.catch(() => {}), new Promise((r) => setTimeout(r, 20000))])
    void roomReady.then(() => {
      useJazz.getState().set({ museumRequested: true })
      return Promise.race([museumBuilt, new Promise((r) => setTimeout(r, 4000))])
    }).then(() => {
      rt?.dispose()
      if (!live) return
      setFrameloop('always')
      // reveal once the first frames have settled: an integrated GPU finishes first-use work (uploads, driver-side
      // shader setup) over the first second of drawing - under the loading screen, not as stutter in the room
      const t0 = performance.now()
      let prev = t0
      let calm = 0
      const settle = (t: number) => {
        calm = t - prev < 40 ? calm + 1 : 0
        prev = t
        if (calm >= 24 || t - t0 > 2500) useJazz.getState().set({ loaded: true })
        else r1 = requestAnimationFrame(settle)
      }
      r1 = requestAnimationFrame(settle)
    })
    // prefetch the stations while the room is idle (later on the low tier), so visiting them never waits or stutters
    const prefetch = window.setTimeout(() => {
      const s = useJazz.getState()
      s.set({ mapRequested: true })
    }, settings.tier === 'low' ? 10000 : 6000)
    // ...and the museum a little later (its shaders compile in the background, so the door opens without a stall)
    // (the museum is requested once the room's shaders are compiled, still under the loading screen - see above)
    const prefetchMuseum = 0
    if (import.meta.env.DEV) {
      // test hook: screen position of a named node (used by scripts/verify.mjs)
      const w = window as unknown as { __jazz?: Record<string, unknown> }
      w.__jazz = { ...w.__jazz, materials: [...prepared.materials.keys()], scene, gl,
        projectWorld: (x: number, y: number, z: number) => {
          const v = new THREE.Vector3(x, y, z).project(camera)
          const r = gl.domElement.getBoundingClientRect()
          return { x: r.left + (v.x * 0.5 + 0.5) * r.width, y: r.top + (-v.y * 0.5 + 0.5) * r.height }
        },
        project: (name: string) => {
        const o = n[name]
        if (!o) return null
        const v = o.getWorldPosition(new THREE.Vector3()).project(camera)
        const r = gl.domElement.getBoundingClientRect()
        return { x: r.left + (v.x * 0.5 + 0.5) * r.width, y: r.top + (-v.y * 0.5 + 0.5) * r.height }
      } }
    }
    void audio.prepare(albumById(useJazz.getState().albumId))
    return () => {
      unsub()
      window.clearInterval(id)
      window.clearTimeout(prefetch)
      window.clearTimeout(prefetchMuseum)
      cancelAnimationFrame(r1)
      live = false
      setFrameloop('always')
    }
  }, [camera, rig, scene])

  // ---- album-driven textures (display sleeve, loose jacket, caption)
  useEffect(() => {
    const paint = () => {
      const s = useJazz.getState()
      const showId = s.hovered?.startsWith('sleeve:') ? shelfAlbums(s)[Number(s.hovered.slice(7))]?.id
        ?? s.albumId : s.albumId
      const show = albumById(showId)
      const playing = albumById(s.albumId)
      // the face-out sleeve on the stand shows what comes next: the following record in the current crate
      const list = visibleAlbums(s.crate, s.myCrate)
      const at = list.findIndex((a) => a.id === s.albumId)
      const upNext = list.length > 1 ? list[(at + 1) % list.length] : playing
      // (through the meshes' current materials: the baked-lighting pass swaps in its own clones after the rig is built)
      const dm = rig.display.material as THREE.MeshStandardMaterial
      dm.map = coverMatFor(upNext).map
      dm.color.set('#ffffff')
      // a lit display rack: the artwork glows softly so it reads in the cabinet's shadowed bay
      dm.emissive.set('#ffffff')
      dm.emissiveMap = dm.map
      dm.emissiveIntensity = 0.42
      dm.needsUpdate = true
      const lm = rig.loose.material as THREE.MeshStandardMaterial
      lm.map = coverMatFor(playing).map
      lm.color.set('#ffffff')
      lm.needsUpdate = true
      const pages = shelfPages(s)
      const label = `${s.crate === 'FOR_YOU' ? 'FOR YOU' : 'MY CRATE'}${pages > 1 ? `  ·  SHELF ${Math.min(s.cabinetPage, pages - 1) + 1} / ${pages}` : ''}`
      if (!list.length) drawCaption(rig.canvas, 'My Crate is empty', 'add records in Collection', label)
      else drawCaption(rig.canvas, show.title, show.artist, label)
      // (the card's current material: the baked-lighting pass swaps in its own clones after the rig is built)
      const cm = rig.card.material as THREE.MeshStandardMaterial
      if (cm.map !== rig.captionTex) {
        cm.map = rig.captionTex
        cm.color.set('#ffffff')
        cm.emissive.set('#ffffff')
        cm.emissiveMap = rig.captionTex
        cm.emissiveIntensity = 0.35
        cm.needsUpdate = true
      }
      rig.captionTex.needsUpdate = true
    }
    paint()
    void document.fonts?.ready.then(paint)
    return useJazz.subscribe((s, p) => {
      if (s.albumId !== p.albumId || s.hovered !== p.hovered || s.crate !== p.crate || s.myCrate !== p.myCrate ||
        s.catalogVersion !== p.catalogVersion || s.cabinetPage !== p.cabinetPage) paint()
    })
  }, [rig, bake])

  // ---- sleeves in the cabinet follow the crate
  const sleeveAlbums = () => shelfAlbums(useJazz.getState())
  useEffect(() => {
    const apply = () => {
      const list = sleeveAlbums()
      rig.sleeves.forEach((sl, i) => {
        const a = list[i]
        const mesh = (sl as THREE.Mesh).isMesh ? (sl as THREE.Mesh) : (sl.children[0] as THREE.Mesh)
        const parts = sl.children.filter((c) => (c as THREE.Mesh).isMesh) as THREE.Mesh[]
        const targets = parts.length ? parts : [mesh]
        sl.visible = !!a
        if (!a) return
        for (const t of targets) {
          const mats = Array.isArray(t.material) ? t.material : [t.material]
          const newMats = mats.map((m) => (m.name.startsWith('JT_Cover') ? coverMatFor(a) : m))
          t.material = Array.isArray(t.material) ? newMats : newMats[0]
        }
      })
    }
    apply()
    return useJazz.subscribe((s, p) => (s.crate !== p.crate || s.myCrate !== p.myCrate || s.catalogVersion !== p.catalogVersion ||
      s.cabinetPage !== p.cabinetPage) && apply())
  }, [rig])

  // ---- interaction
  const drag = useRef<{ active: boolean; moved: boolean; id: string | null; x: number; y: number }>({
    active: false, moved: false, id: null, x: 0, y: 0 })
  const raycaster = useMemo(() => new THREE.Raycaster(), [])
  const plane = useMemo(() => new THREE.Plane(), [])

  const pointerToYaw = (clientX: number, clientY: number) => {
    const rect = gl.domElement.getBoundingClientRect()
    const ndc = new THREE.Vector2(((clientX - rect.left) / rect.width) * 2 - 1, -((clientY - rect.top) / rect.height) * 2 + 1)
    raycaster.setFromCamera(ndc, camera)
    plane.set(new THREE.Vector3(0, 1, 0), -rig.recordY)
    const hit = new THREE.Vector3()
    if (!raycaster.ray.intersectPlane(plane, hit)) return null
    const local = rig.turntable.worldToLocal(hit)
    return yawTowards(local.x, -local.z) // three local (x, -z) == Blender local (x, y)
  }

  useEffect(() => {
    const move = (e: PointerEvent) => {
      const d = drag.current
      if (!d.active) return
      if (Math.hypot(e.clientX - d.x, e.clientY - d.y) > 4) d.moved = true
      if (d.id === 'tonearm' && useJazz.getState().deck === 'manual') {
        const yaw = pointerToYaw(e.clientX, e.clientY)
        if (yaw !== null) deck.dragYaw(yaw)
      }
    }
    const up = () => {
      const d = drag.current
      if (!d.active) return
      d.active = false
      if (d.id === 'tonearm') void deck.endManual()
      document.body.style.cursor = ''
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
    return () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
    }
  })

  const activate = (id: string) => {
    const s = useJazz.getState()
    audio.ensure()
    if (id === 'play') void deck.toggle(true)
    else if (id === 'time') actions.cycleTime()
    else if (id === 'room') actions.lampStep()
    else if (id === 'lamp') actions.lampToggle()
    else if (id === 'curtain') actions.curtainCycle()
    else if (id === 'crate') actions.crateToggle()
    else if (id === 'speed') s.showToast(deck.toggleSpeed() ? '45 rpm — a little fast for jazz' : '33⅓ rpm')
    else if (id === 'cue') {
      audio.sfx('cue')
      void deck.toggle(false)
    } else if (id === 'record') actions.goStation(s.station === 'platter' ? 'home' : 'platter')
    else if (id === 'cabinet') actions.goStation(s.station === 'cabinet' ? 'home' : 'cabinet')
    else if (id === 'whiskey') anim.current.whiskeyPaused = !anim.current.whiskeyPaused
    else if (id.startsWith('sleeve:')) {
      const a = sleeveAlbums()[Number(id.slice(7))]
      if (a) actions.selectAlbum(a.id)
    }
  }

  // sleeves are edge-on from the Home view: there the shelf is one target that moves the camera to the cabinet
  const pick = (o: THREE.Object3D, clientX?: number) => {
    const id = interactiveId(o)
    if (!id?.startsWith('sleeve:')) return id
    if (useJazz.getState().station !== 'cabinet') return 'cabinet'
    // an empty slot (fewer records on this shelf than sleeves) is not a target
    if (!sleeveAlbums()[Number(id.slice(7))]) return null
    return clientX === undefined ? id : `sleeve:${sleeveAtX(clientX)}`
  }
  // the sleeves stand nearly edge-on (7 mm card, ~50 px for all eight): left to themselves most would own a 2-4 px
  // strip. Share the whole strip evenly between the records on the shelf instead.
  const sleeveBox = useMemo(() => new THREE.Box3(), [])
  const sleeveAtX = (clientX: number) => {
    const count = sleeveAlbums().length
    const r = gl.domElement.getBoundingClientRect()
    let x0 = Infinity, x1 = -Infinity
    for (let i = 0; i < count; i++) {
      const col = n[`COL_Sleeve_${String(i + 1).padStart(3, '0')}`]
      if (!col) continue
      sleeveBox.setFromObject(col)
      for (const x of [sleeveBox.min.x, sleeveBox.max.x]) for (const z of [sleeveBox.min.z, sleeveBox.max.z]) {
        const v = new THREE.Vector3(x, (sleeveBox.min.y + sleeveBox.max.y) / 2, z).project(camera)
        const px = r.left + (v.x * 0.5 + 0.5) * r.width
        x0 = Math.min(x0, px)
        x1 = Math.max(x1, px)
      }
    }
    if (!(x1 > x0)) return 0
    return Math.max(0, Math.min(count - 1, Math.floor(((clientX - x0) / (x1 - x0)) * count)))
  }
  // an empty sleeve slot lets the pointer through to whatever is behind it (the display sleeve, the bay)
  const emptySlot = (o: THREE.Object3D) => !!interactiveId(o)?.startsWith('sleeve:') && pick(o) === null
  const onDown = (e: ThreeEvent<PointerEvent>) => {
    if (useJazz.getState().station === 'museum') return
    if (isOverConsole(e.clientY, renderer.domElement) || emptySlot(e.object)) return
    e.stopPropagation()
    const id = pick(e.object, e.clientX)
    drag.current = { active: true, moved: false, id, x: e.clientX, y: e.clientY }
    if (id === 'tonearm') {
      document.body.style.cursor = 'grabbing'
      void deck.beginManual()
    }
  }
  const onUp = (e: ThreeEvent<PointerEvent>) => {
    if (useJazz.getState().station === 'museum' || emptySlot(e.object)) return
    e.stopPropagation()
    const d = drag.current
    const id = pick(e.object, e.clientX)
    if (d.id && d.id === id && !d.moved && id !== 'tonearm') activate(id)
  }
  const onMove = (e: ThreeEvent<PointerEvent>) => {
    if (useJazz.getState().station === 'museum') return
    if (isOverConsole(e.clientY, renderer.domElement)) return onOut()
    if (emptySlot(e.object)) {
      // (whatever lies behind the empty slot sets its own hover after this)
      if (useJazz.getState().hovered?.startsWith('sleeve:')) useJazz.getState().set({ hovered: null })
      return
    }
    e.stopPropagation()
    const id = pick(e.object, e.clientX)
    if (useJazz.getState().hovered !== id) useJazz.getState().set({ hovered: id })
    if (!drag.current.active) document.body.style.cursor = id ? (id === 'tonearm' ? 'grab' : 'pointer') : ''
  }
  const instAt = (e: ThreeEvent<PointerEvent | MouseEvent>) => (e.object.userData.pick as { id: string } | undefined)?.id ?? null
  const onInstMove = (e: ThreeEvent<PointerEvent>) => {
    if (useJazz.getState().station === 'museum' || isOverConsole(e.clientY, renderer.domElement)) return
    e.stopPropagation()
    const id = instAt(e)
    const h = id ? `instrument:${id}` : null
    if (useJazz.getState().hovered !== h) useJazz.getState().set({ hovered: h })
    document.body.style.cursor = id ? 'pointer' : ''
  }
  const onInstClick = (e: ThreeEvent<MouseEvent>) => {
    const s = useJazz.getState()
    if (s.station === 'museum' || isOverConsole(e.clientY, renderer.domElement)) return
    e.stopPropagation()
    const id = instAt(e)
    if (!id) return
    audio.ensure()
    audio.sfx('detent')
    s.set({ instrument: id, panel: null, hovered: null })
    actions.goStation('instrument')
  }
  const onOut = () => {
    if (!drag.current.active) document.body.style.cursor = ''
    useJazz.getState().set({ hovered: null })
  }

  // ---- per-frame: mechanics, lighting crossfade, camera
  const camAnim = useRef({ from: new THREE.Vector3(), fromQ: new THREE.Quaternion(), fromFov: 40, t: 1,
    station: 'home' as Station, fromStation: 'home' as Station })
  const pointer = useRef(new THREE.Vector2())
  useEffect(() => {
    const pm = (e: PointerEvent) => pointer.current.set(e.clientX / window.innerWidth - 0.5, e.clientY / window.innerHeight - 0.5)
    window.addEventListener('pointermove', pm)
    return () => window.removeEventListener('pointermove', pm)
  }, [])

  useFrame((state, dtRaw) => {
    const dt = Math.min(dtRaw, 0.05)
    const s = useJazz.getState()
    const a = anim.current
    const time = state.clock.elapsedTime
    deck.tick(dt, performance.now())

    // turntable mechanics
    rig.platter.rotation.y = deck.platterAngle
    rig.yaw.rotation.y = deck.armYaw
    rig.lift.rotation.x = -deck.armLift * 0.048
    rig.button.position.y = rig.buttonY - deck.buttonDepth * 0.002
    if (rig.cue) rig.cue.rotation.x = deck.armLift * 0.35
    a.timeKnob = damp(a.timeKnob, TIME_ANGLE[s.timeSetting], 10, dt)
    rig.timeKnob.rotation.y = THREE.MathUtils.degToRad(a.timeKnob)
    a.roomKnob = damp(a.roomKnob, -120 + 240 * s.lampLevel, 10, dt)
    rig.roomKnob.rotation.y = THREE.MathUtils.degToRad(-a.roomKnob)
    a.speed = damp(a.speed, deck.speed45 ? -35 : 35, 10, dt)
    rig.speedKnob.rotation.y = THREE.MathUtils.degToRad(a.speed)
    for (const m of TIME_ORDER) {
      const mat = rig.leds[m]?.material as THREE.MeshStandardMaterial
      if (mat) mat.emissiveIntensity = damp(mat.emissiveIntensity, m === s.timeSetting ? 5 : 0.05, 8, dt)
    }
    const ind = rig.indicator.material as THREE.MeshStandardMaterial
    const indTarget = s.deck === 'stopped' ? (s.hovered === 'play' ? 1.2 : 0.08) : s.deck === 'playing' ? 5 : 2.5 + Math.sin(time * 10)
    ind.emissiveIntensity = damp(ind.emissiveIntensity, indTarget, 10, dt)
    const ringMat = rig.playRing.material as THREE.MeshStandardMaterial
    if (ringMat) {
      ringMat.emissive.set('#ffb36b')
      ringMat.emissiveIntensity = damp(ringMat.emissiveIntensity, s.hovered === 'play' ? 0.12 : 0, 8, dt)
    }

    // cabinet
    a.crate = damp(a.crate, s.crate === 'MY_CRATE' ? 1 : 0, 9, dt)
    rig.lever.position.x = rig.leverX + a.crate * 0.17
    const list = sleeveAlbums()
    rig.sleeves.forEach((sl, i) => {
      const al = list[i]
      const target = !al ? 0 : al.id === s.albumId ? SLEEVE_OUT : s.hovered === `sleeve:${i}` ? SLEEVE_OUT * 0.55 : 0
      // critically-damped-ish with <2% overshoot
      a.sleeves[i] = damp(a.sleeves[i], target * 1.015, 11, dt)
      if (Math.abs(a.sleeves[i] - target) < 0.0008) a.sleeves[i] = target
      sl.position.z = rig.sleeveBase[i].z + a.sleeves[i]
    })
    // the caption follows the hovered sleeve, else the one on the deck, while it is out (cabinet view only)
    {
      const hov = s.hovered?.startsWith('sleeve:') ? Number(s.hovered.slice(7)) : -1
      const cur = list.findIndex((al) => al?.id === s.albumId)
      const i = hov >= 0 && list[hov] ? hov : cur
      const out = i >= 0 ? a.sleeves[i] / SLEEVE_OUT : 0
      const want = s.station === 'cabinet' && i >= 0 && out > 0.4 && camAnim.current.t >= 0.95 ? 1 : 0
      sleeveCaption.show += (want - sleeveCaption.show) * Math.min(1, dt * (want ? 5 : 9))
      if (i >= 0) {
        const sl = rig.sleeves[i]
        const box = new THREE.Box3().setFromObject(sl)
        const top = new THREE.Vector3((box.min.x + box.max.x) / 2, box.max.y, box.max.z).project(camera)
        const r = renderer.domElement.getBoundingClientRect()
        sleeveCaption.x = r.left + (top.x * 0.5 + 0.5) * r.width
        sleeveCaption.y = r.top + (-top.y * 0.5 + 0.5) * r.height
        sleeveCaption.title = list[i]!.title
        sleeveCaption.artist = list[i]!.artist
      }
    }

    // whiskey display: one revolution every 52 s
    // whiskey display: one revolution every 52 s (slow) or 30 s (fast)
    const wSpeed = s.prefs.whiskeySpeed === 'off' ? 0 : s.prefs.whiskeySpeed === 'fast' ? 30 : 52
    if (!a.whiskeyPaused && wSpeed && rig.whiskey) rig.whiskey.rotation.y += (Math.PI * 2 / wSpeed) * dt
    // room finish: retint the walnut (the grain map stays; lacquer adds a deeper gloss coat)
    if (a.finish !== s.prefs.roomFinish) {
      a.finish = s.prefs.roomFinish
      const w = prepared.materials.get('JT_Walnut') as THREE.MeshPhysicalMaterial | undefined
      if (w) {
        w.color.set(a.finish === 'lacquer' ? '#2a2420' : a.finish === 'oak' ? '#9a9088' : '#ffffff')
        if ('clearcoat' in w) { w.clearcoat = a.finish === 'lacquer' ? 0.9 : 0.18; w.clearcoatRoughness = a.finish === 'lacquer' ? 0.08 : 0.38 }
      }
    }

    // curtains morph targets
    a.curtain = damp(a.curtain, CURTAIN_VALUE[s.curtain], s.reducedMotion ? 30 : 1.4, dt)
    const half = a.curtain <= 1 ? a.curtain : 2 - a.curtain
    const closed = Math.max(0, a.curtain - 1)
    for (const c of rig.curtains) if (c?.morphTargetInfluences) {
      c.morphTargetInfluences[0] = half
      c.morphTargetInfluences[1] = closed
    }

    // inside the museum (a separate interior, MuseumWorld): the listening room is hidden and unlit, the deck keeps playing
    const inMuseum = s.station === 'museum'
    if (inMuseum) bakeUniforms.uGoldCol.value.set(0, 0, 0)
    // colour grade: the room's warm look / the museum's gallery white balance (eased; a cut behind the door's fade)
    easeGrade(grade, LOOKS[inMuseum ? 'museum' : 'room'], s.reducedMotion ? 1 : Math.min(1, dt * 3))
    homeGroup.current.visible = !inMuseum
    // hidden (not just dimmed) lights leave the shaders' light count: museum and room programs never share lights
    for (const l of [sun.current, hemi.current, key.current, lampLight.current, fill.current, goldLight.current]) if (l) l.visible = !inMuseum
    {
      // the record's soft box (shader-side, see prepare.ts): behind the record, window side, low and wide, so its
      // reflection sweeps the vinyl from the room view and from above; brighter in the evening and with the lamp on
      const c = rig.platter.getWorldPosition(_v1)
      const dir = _v2.set(-0.05, 0.55, -0.55).normalize()
      void c
      vinylBox.uBoxDir.value.copy(dir).transformDirection(camera.matrixWorldInverse)
      vinylBox.uBoxGain.value = (0.55 + 0.9 * (1 - live.current.envDay)) * (0.45 + 0.55 * a.lamp)
    }
    const ml = mapLights(settings.tier)
    ml.focus.visible = !inMuseum
    ml.fill.visible = !inMuseum && settings.tier !== 'low'
    if (inMuseum) {
      camAnim.current.station = 'museum'
      return
    }
    // the golden east light: strongest in the evening (it reads as late sun / a lamp in the next room), always present
    if (goldLight.current) {
      const gs = goldLight.current
      gs.intensity = 26 + 30 * (1 - live.current.envDay)
      // its diffuse on the baked surfaces (see bakedLighting): position / direction in view space, colour x intensity
      bakeUniforms.uGoldPos.value.setFromMatrixPosition(gs.matrixWorld).applyMatrix4(camera.matrixWorldInverse)
      bakeUniforms.uGoldDir.value.setFromMatrixPosition(gs.target.matrixWorld).sub(_v1.setFromMatrixPosition(gs.matrixWorld)).normalize()
        .transformDirection(camera.matrixWorldInverse)
      bakeUniforms.uGoldCol.value.set(gs.color.r, gs.color.g, gs.color.b).multiplyScalar(gs.intensity)
      bakeUniforms.uGoldCone.value.set(Math.cos(gs.angle), Math.cos(gs.angle * (1 - gs.penumbra)))
    }
    for (const p of roomInst) sway(p, s.station === 'instrument' && s.instrument === p.inst.id, state.clock.elapsedTime, dt)

    // lighting crossfade (1.8–3 s)
    const p = live.current
    // lighting runs on wall-clock time (frame hitches right after load must not stall the crossfade)
    const dtLight = Math.min(dtRaw, 0.25)
    easePreset(p, PRESETS[s.resolvedMode], 1 - Math.exp(-dtLight / (s.reducedMotion ? 0.08 : 0.75)))
    const shade = 1 - 0.42 * a.curtain
    a.lamp = damp(a.lamp, s.lampLevel, 6, dt)
    sun.current.color.copy(p.sunColor)
    // exposure per time of day (day 0, dusk +0.6, night +1.3 stop: the Cycles night reference read too dark on screens)
    // eye adaptation: the cabinet corner (far from the window, lit by the desk lamp) opens up by ~0.75 stop
    a.adapt = damp(a.adapt, s.station === 'cabinet' ? 1.68 : 1, s.reducedMotion ? 40 : 2.2, dt)
    const exposure = (p.envDay * 1.8 + p.envDusk * 1.9 + p.envNight * 3.2) * a.adapt
    const night = p.envNight
    if (bake) {
      // at night the reading lamp carries the room (x1.5), and the city glow alone still shows the furniture (x1.3)
      updateBakeWeights(bake.meta, { day: p.envDay, dusk: p.envDusk, night: p.envNight * 1.3 }, a.lamp * (1 + 0.5 * night), shade, exposure)
      const dominant = p.envDay >= p.envDusk && p.envDay >= p.envNight ? 'day' : p.envDusk >= p.envNight ? 'dusk' : 'night'
      if (scene.environment !== bake.envs[dominant]) scene.environment = bake.envs[dominant]
    }
    // sun in the bake's units (W/m^2): 6.5 day, 3.4 dusk, none at night
    // (x0.55: three's point-sized sun concentrates the specular more than Cycles' 1.2 deg disc)
    sun.current.intensity = (bake ? (6.5 * p.envDay + 3.4 * p.envDusk) * exposure * 0.55 : p.sunIntensity) * shade
    sun.current.position.copy(p.sunDir).multiplyScalar(12).add(new THREE.Vector3(0.6, 0.8, -1.5))
    if (fill.current) {
      fill.current.intensity = p.windowFill * shade * 6
      fill.current.color.copy(p.windowColor)
    }
    // without the window area light (low tier) the hemisphere carries the window's share
    hemi.current.intensity = bake ? 0 : p.ambient + (settings.tier === 'low' ? p.windowFill * shade * 0.45 : 0)
    if (bake && fill.current) fill.current.intensity = 0
    hemi.current.color.copy(p.skyHorizon)
    if (bake) {
      // Cycles point / spot watts -> three candela: radiant intensity P / (4 pi); the bake rig uses 28 W and 40 W
      // the deck light over the turntable: brighter at night, and a dim record light even with the lamp off
      key.current.intensity = (40 / (4 * Math.PI)) * (a.lamp * (1 + 1.2 * night) + 0.35 * night) * exposure
      lampLight.current.intensity = (28 / (4 * Math.PI)) * a.lamp * exposure
      // a soft source: Cycles' lamp is a 5 cm sphere, so the highlight is a sheen, not a pin-point
      lampLight.current.shadow.radius = 4
      ;(scene as THREE.Scene & { environmentIntensity: number }).environmentIntensity = exposure
    } else {
      key.current.intensity = p.keyIntensity * (0.25 + 0.75 * a.lamp) * 6
      lampLight.current.intensity = a.lamp * 7
      ;(scene as THREE.Scene & { environmentIntensity: number }).environmentIntensity = p.envIntensity
    }
    const blink = 0.55 + 0.45 * Math.sin(time * 2.2)
    for (const [name, m] of prepared.materials) {
      const mat = m as THREE.MeshStandardMaterial
      if (name.startsWith('JT_Facade')) mat.emissiveIntensity = p.facadeEmissive
      else if (name === 'JT_Sky_PodLights') mat.emissiveIntensity = p.facadeEmissive * 2
      else if (name === 'JT_Sky_Beacon') mat.emissiveIntensity = p.beacon * blink
      else if (name === 'JT_Lamp_Diffuser') mat.emissiveIntensity = a.lamp * 7
      else if (name === 'JT_Whiskey_Caustic')
        (m as THREE.MeshBasicMaterial).opacity = settings.tier === 'low' ? 0 : Math.min(0.85, p.sunIntensity * shade * 0.22 + a.lamp * 0.3)
    }

    // camera stations + subtle parallax
    const ca = camAnim.current
    if (ca.station !== s.station) {
      ca.from.copy(camera.position)
      ca.fromQ.copy(camera.quaternion)
      ca.fromFov = (camera as THREE.PerspectiveCamera).fov
      ca.t = ca.station === 'museum' ? 1 : 0 // back through the door (behind a fade): cut, no fly-over
      ca.fromStation = ca.station
      ca.station = s.station
    }
    const st = s.station === 'instrument'
      ? (roomInst.find((p) => p.inst.id === s.instrument)?.pose ?? rig.cams.home) : rig.cams[s.station]
    const dur = s.reducedMotion ? 0.2 : s.station === 'platter' || s.station === 'map' || ca.fromStation === 'map' ? 1.1 : 0.9
    ca.t = Math.min(1, ca.t + dt / dur)
    const k = ca.t < 0.5 ? 4 * ca.t ** 3 : 1 - (-2 * ca.t + 2) ** 3 / 2
    const cam = camera as THREE.PerspectiveCamera
    // compose the room for the area above the 3D console; the strip below extends the frame off-composition
    const strip = consoleHeightPx()
    const viewH = Math.max(1, size.height - strip)
    // a side card / the map's venue panel takes part of the width: compose the station for the part left visible (the
    // view is shifted beside it below) - framed for the full width, the map table ran off the left edge
    const mapPanel = s.station === 'map' && s.mapPanelOpen && size.width >= 900 ? MAP_PANEL_PX : 0
    const sideW = s.station === 'map' ? (mapPanel ? mapPanel + 32 : 0) : 0
    const aspectFix = Math.max(1, (16 / 9) / (Math.max(1, size.width - sideW) / viewH))
    const fov = THREE.MathUtils.radToDeg(2 * Math.atan(Math.tan(THREE.MathUtils.degToRad(st.fov) / 2) * aspectFix))
    if (s.reducedMotion) {
      cam.position.copy(st.pos)
      cam.quaternion.copy(st.quat)
    } else {
      cam.position.lerpVectors(ca.from, st.pos, k)
      cam.quaternion.slerpQuaternions(ca.fromQ, st.quat, k)
      if (s.station === 'home' && ca.t >= 1) {
        const off = new THREE.Vector3(pointer.current.x * 0.025, -pointer.current.y * 0.012, 0).applyQuaternion(st.quat)
        cam.position.add(off)
      }
    }
    cam.fov = THREE.MathUtils.lerp(ca.fromFov, Math.min(fov, 72), k)
    cam.aspect = size.width / viewH
    // an open station panel covers the left side: slide the room's view right so it stays visible beside it
    // (the Jazz Map's venue panel sits on the right: the table slides left beside it)
    const instCard = s.station === 'instrument' && size.width >= 900 ? EXHIBIT_CARD_PX + 40 : 0
    a.panelShift = damp(a.panelShift, panelWidthPx(s.panel, size.width) * (size.width < 760 ? 0 : 0.5) - mapPanel / 2 - instCard / 2, s.reducedMotion ? 40 : 7, dt)
    const z = s.station === 'map' ? mapView.zoom : 1
    // the map magnifier crops the projection window (zoom z, top-left L/T of the unzoomed view)
    cam.setViewOffset(size.width * z, viewH * z, (z > 1 ? mapView.L * size.width * z : 0) - a.panelShift, z > 1 ? mapView.T * viewH * z : 0, size.width, size.height)
    cam.updateProjectionMatrix()
  })

  const s0 = useJazz.getState()
  const grain = useJazz((st) => st.prefs.grain)
  useJazz((st) => st.resolvedMode) // re-key the static environment on lower tiers
  return (
    <>
      <TorontoBackdrop live={live} />
      {settings.contactShadows && (
        <>
          {/* soft contact shadows on the marble, baked once (the turntable and decanter don't move) */}
          <ContactShadows frames={1} position={[0.05, 0.7405, 0.1]} scale={[2.7, 0.92]} resolution={1024} blur={2.2}
            far={0.25} opacity={0.55} color="#140c06" />
        </>
      )}
      {/* reflections: the window panel carries the actual Toronto photograph, crossfaded with the time of day */}
      {!bake && (
      <Environment resolution={settings.envResolution} frames={settings.tier === 'high' ? Infinity : 1}
        key={settings.tier === 'high' ? 'env' : s0.resolvedMode}>
        <WindowReflection live={live} />
        <Lightformer form="rect" intensity={0.5} color="#ffd9b0" scale={[3, 3, 1]} position={[0, 3.2, 0]}
          rotation-x={Math.PI / 2} />
        <Lightformer form="rect" intensity={0.25} color="#ffcf9e" scale={[5, 2, 1]} position={[0, 1.4, 3]}
          rotation-y={Math.PI} />
        <Lightformer form="rect" intensity={0.3} color="#b0a090" scale={[3, 2, 1]} position={[-3.5, 1.5, 0]}
          rotation-y={Math.PI / 2} />
      </Environment>
      )}

      <hemisphereLight ref={hemi} args={['#c9dbe8', '#2a1d14', 0.3]} />
      <directionalLight ref={sun} castShadow={settings.sunShadow} intensity={2}
        shadow-mapSize={[settings.shadowMap, settings.shadowMap]} shadow-bias={-0.0004}
        shadow-normalBias={0.02} shadow-camera-left={-3} shadow-camera-right={3} shadow-camera-top={3}
        shadow-camera-bottom={-3} shadow-camera-near={1} shadow-camera-far={40} />
      {settings.tier !== 'low' && (
        <rectAreaLight ref={fill} width={3.6} height={2.8} position={[1.9, 1.45, -2.2]} intensity={2} />
      )}
      <spotLight ref={key} castShadow={settings.keyShadow} position={[-0.7, 2.9, 0.5]} angle={0.55} penumbra={0.85} distance={8} decay={2}
        intensity={8} color="#ffc48a" shadow-mapSize={[settings.shadowMap, settings.shadowMap]} shadow-bias={-0.0003} />
      {/* the Jazz Map's task lights: in the room from the first frame (see mapLights.ts) */}
      <primitive object={mapLights(settings.tier).focus} />
      <primitive object={mapLights(settings.tier).focus.target} />
      <primitive object={mapLights(settings.tier).fill} />
      <pointLight ref={lampLight} position={rig.lampPoint} color="#ffb877" distance={6} decay={2} intensity={1} />
      <spotLight ref={goldLight} position={[2.6, 1.5, 1.75]} angle={0.3} penumbra={0.75} distance={7} decay={2} intensity={6}
        color="#ffae4f" castShadow={settings.keyShadow} shadow-mapSize={[1024, 1024]} shadow-bias={-0.0004} />
      <object3D ref={goldTarget} position={[0.12, 0.82, 0.22]} />

      <group ref={homeGroup} onPointerDown={onDown} onPointerUp={onUp} onPointerMove={onMove} onPointerOut={onOut}>
        {gltfs.map((g, i) => (
          <primitive key={i} object={g.scene} />
        ))}
        <group onPointerMove={onInstMove} onPointerOut={onOut} onClick={onInstClick}>
          {roomInst.map((p) => <primitive key={p.inst.id} object={p.obj} />)}
        </group>
      </group>

      {settings.post && (
      <EffectComposer multisampling={settings.multisampling} enableNormalPass={false}
        ref={(c) => { if (import.meta.env.DEV && c) (window as unknown as { __jazz: Record<string, unknown> }).__jazz = { ...(window as unknown as { __jazz: Record<string, unknown> }).__jazz, composer: c } }}>
        {settings.ao !== 'off' ? (
          <N8AO aoRadius={0.12} distanceFalloff={0.3} intensity={bake ? 0.7 : 1.6} quality="medium"
            // the composer's ToneMapping pass encodes the output; N8AO must stay linear (default gamma-encodes)
            ref={(e) => { if (e) (e as unknown as { configuration: { gammaCorrection: boolean } }).configuration.gammaCorrection = false }}
            halfRes={settings.ao === 'half' || size.width * renderer.getPixelRatio() > 3000} />
        ) : (
          <></>
        )}
        <Bloom mipmapBlur intensity={0.22} luminanceThreshold={1.35} luminanceSmoothing={0.2} radius={0.55} />
        {/* Khronos PBR Neutral: filmic highlight roll-off that keeps material and photograph colours (AgX greyed the city) */}
        <ToneMapping mode={ToneMappingMode.NEUTRAL} />
        <primitive object={grade} dispose={null} />
        <Vignette offset={0.32} darkness={0.55} />
        <Noise premultiply blendFunction={BlendFunction.SOFT_LIGHT} opacity={settings.grain ? grain : 0} />
      </EffectComposer>
      )}
    </>
  )
}
