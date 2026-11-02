// A10 Jazz Map station: lazy-loaded walnut map table with a modelled relief of Toronto.
// Pins are placed from data/venues.json with the projection written by blender/scripts/jt_map.py.
import * as THREE from 'three'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useFrame, useLoader, useThree, type ThreeEvent } from '@react-three/fiber'
import { initLoaders, useTierGLTF } from './loaders'
import { prepareScenes } from './prepare'
import { isOverConsole, consoleHeightPx } from './PlayerConsole'
import { mapView, panBy, resetMapView, stepMapView, zoomAt } from './mapView'
import { createWarmup } from './warmup'
import { mapLights } from './mapLights'
import { useJazz } from '../state/store'
import { TIERS } from '../quality'
import { audio } from '../audio/engine'
import {
  CATEGORY_LABEL, FILTERS, RANGES, fmtEventDate, loadMapData, matchesFilter, project, sampleEvents,
  type Projection, type Venue,
} from '../data/venues'

const FILTER_ANGLES = [-50, -17, 17, 50]
const CARD_TILT = -0.24
const SAVE_RECT = { u0: 0.62, u1: 0.95, v0: 0.04, v1: 0.17 } // card UV zone of the SAVE plate (v from bottom)

/** Venue names for hover hints / accessibility (filled once data loads). */
export const venueIndex = new Map<string, Venue>()
export let mapReady = false

export const mapActions = {
  select(id: string | null) {
    const s = useJazz.getState()
    if (id === s.selectedVenue) id = null
    s.set({ selectedVenue: id })
    audio.sfx(id ? 'slide' : 'lever')
  },
  cycleFilter() {
    const s = useJazz.getState()
    const next = FILTERS[(FILTERS.indexOf(s.mapFilter) + 1) % FILTERS.length]
    const sel = s.selectedVenue ? venueIndex.get(s.selectedVenue) : null
    s.set({ mapFilter: next, selectedVenue: sel && !matchesFilter(sel, next) ? null : s.selectedVenue })
    audio.sfx('detent')
  },
  cycleRange() {
    const s = useJazz.getState()
    s.set({ mapRange: RANGES[(RANGES.indexOf(s.mapRange) + 1) % RANGES.length] })
    audio.sfx('detent')
  },
  toggleSave(id: string) {
    const s = useJazz.getState()
    const saved = s.savedVenues.includes(id)
    s.set({ savedVenues: saved ? s.savedVenues.filter((x) => x !== id) : [...s.savedVenues, id] })
    audio.sfx('switch')
    s.showToast(saved ? 'Removed from saved venues' : 'Saved to your map')
  },
}

function canvasTex(w: number, h: number) {
  const c = document.createElement('canvas')
  c.width = w
  c.height = h
  const t = new THREE.CanvasTexture(c)
  t.colorSpace = THREE.SRGBColorSpace
  t.flipY = false
  t.anisotropy = 8
  return { c, t, g: c.getContext('2d')! }
}

function drawCard(g: CanvasRenderingContext2D, v: Venue | null, range: string, saved: boolean) {
  const { width: w, height: h } = g.canvas
  g.fillStyle = '#ebe1cb'
  g.fillRect(0, 0, w, h)
  for (let i = 0; i < 2600; i++) {
    g.fillStyle = `rgba(90,70,40,${Math.random() * 0.05})`
    g.fillRect(Math.random() * w, Math.random() * h, 2, 2)
  }
  g.strokeStyle = 'rgba(120,90,50,0.55)'
  g.lineWidth = 3
  g.strokeRect(22, 22, w - 44, h - 44)
  if (!v) return
  const serif = '"Cormorant Garamond", Georgia, serif'
  g.fillStyle = '#7b5a33'
  g.font = '500 24px Jost, sans-serif'
  g.letterSpacing = '5px'
  g.fillText(CATEGORY_LABEL[v.category], 60, 86)
  g.letterSpacing = '0px'
  g.fillStyle = '#1d1712'
  let size = 66
  g.font = `600 ${size}px ${serif}`
  while (g.measureText(v.name).width > w - 120 && size > 38) g.font = `600 ${(size -= 2)}px ${serif}`
  g.fillText(v.name, 58, 158)
  g.font = `italic 500 32px ${serif}`
  g.fillStyle = '#4a3a2c'
  g.fillText(v.address.replace(', Toronto', ' · Toronto'), 60, 204)
  g.fillStyle = 'rgba(120,90,50,0.6)'
  g.fillRect(60, 232, w - 120, 2)

  const events = sampleEvents(v, range as never)
  if (v.category === 'historic') {
    g.fillStyle = '#2d241c'
    g.font = `500 34px ${serif}`
    g.fillText('A site in Toronto’s jazz history.', 60, 300)
    g.font = `italic 500 28px ${serif}`
    g.fillStyle = '#5a4a3a'
    g.fillText('Archive notes pending review — see Toronto Jazz Legacy.', 60, 346)
  } else {
    g.fillStyle = '#7b5a33'
    g.font = '500 20px Jost, sans-serif'
    g.letterSpacing = '4px'
    g.fillText(range, 60, 276)
    g.letterSpacing = '0px'
    events.forEach((e, i) => {
      const y = 330 + i * 92
      g.fillStyle = '#1d1712'
      g.font = '500 24px Jost, sans-serif'
      g.fillText(fmtEventDate(e.date), 60, y)
      g.font = `600 38px ${serif}`
      g.fillText(e.artist, 60, y + 44)
      g.font = `italic 500 28px ${serif}`
      g.fillStyle = '#5a4a3a'
      g.fillText(e.style, w - 60 - g.measureText(e.style).width, y + 44)
    })
  }
  g.fillStyle = '#8a7660'
  g.font = 'italic 500 22px "Cormorant Garamond", Georgia, serif'
  g.fillText(v.category === 'historic' ? 'Details to be verified' : 'Sample listing — connect an events source', 60, h - 58)
  // SAVE plate (hit zone = SAVE_RECT)
  const x0 = SAVE_RECT.u0 * w
  const x1 = SAVE_RECT.u1 * w
  const y0 = (1 - SAVE_RECT.v1) * h
  const y1 = (1 - SAVE_RECT.v0) * h
  g.fillStyle = saved ? '#7b4a22' : '#1d1712'
  g.fillRect(x0, y0, x1 - x0, y1 - y0)
  g.fillStyle = saved ? '#ffcf8a' : '#ebe1cb'
  g.font = '500 24px Jost, sans-serif'
  g.letterSpacing = '5px'
  const label = saved ? '★ SAVED' : '☆ SAVE'
  g.fillText(label, (x0 + x1) / 2 - g.measureText(label).width / 2, (y0 + y1) / 2 + 9)
  g.letterSpacing = '0px'
}

function drawDate(g: CanvasRenderingContext2D, range: string) {
  const { width: w, height: h } = g.canvas
  g.fillStyle = '#0b0705'
  g.fillRect(0, 0, w, h)
  g.font = '500 64px Jost, sans-serif'
  g.textAlign = 'center'
  g.shadowColor = 'rgba(255,150,60,0.9)'
  g.shadowBlur = 14
  g.fillStyle = '#ffb45a'
  g.fillText(range, w / 2, h / 2 + 22)
  g.shadowBlur = 0
  g.textAlign = 'left'
}

export function MapStation() {
  const { gl, scene: world, camera } = useThree()
  initLoaders(gl)
  const tier = useJazz((s) => s.tier)
  const settings = TIERS[tier]
  const [gltf] = useTierGLTF(settings.assets, ['JT_MapStation'])
  const aniso = useLoader(THREE.TextureLoader, '/assets/textures/JT_Vinyl_Anisotropy.png')
  const [data, setData] = useState<{ venues: Venue[]; projection: Projection } | null>(null)
  useEffect(() => {
    void loadMapData().then((d) => {
      d.venues.forEach((v) => venueIndex.set(v.id, v))
      setData(d)
    })
  }, [])

  const rig = useMemo(() => {
    if (!data) return null
    const { nodes } = prepareScenes([gltf.scene], aniso, settings, gl.capabilities.getMaxAnisotropy())
    const get = <T extends THREE.Object3D>(n: string) => nodes[n] as T
    const glass = get<THREE.Mesh>('JT_Map_Glass')
    glass.raycast = () => {} // pointer passes through the glass to the pins
    const gm = glass.material as THREE.MeshStandardMaterial
    gm.transparent = true
    gm.depthWrite = false
    gm.envMapIntensity = 1.2
    glass.renderOrder = 2

    // pins
    const origin = get('JT_Map_Origin')
    const proto = get('JT_Map_Pin')
    proto.visible = false
    gltf.scene.updateMatrixWorld(true)
    const pins = data.venues.map((v) => {
      const [x, y] = project(data.projection, v.lon, v.lat)
      const pin = proto.clone(true)
      pin.visible = true
      pin.userData.venueId = v.id
      const worldPos = origin.localToWorld(new THREE.Vector3(x, data.projection.land, -y))
      proto.parent!.add(pin)
      pin.position.copy(proto.parent!.worldToLocal(worldPos))
      const jewel = pin.getObjectByName('JT_Map_PinJewel') as THREE.Mesh
      jewel.material = (jewel.material as THREE.MeshStandardMaterial).clone()
      pin.traverse((o) => (o.userData.venueId = v.id))
      return { v, pin, jewel, rise: 0, baseY: pin.position.y }
    })

    const card = get('JT_Map_Card')
    const cardBox = new THREE.Box3().setFromObject(card)
    const cardRise = (cardBox.max.y - cardBox.min.y) * 1.04 // fully out of the slot
    const cardMat = (card as THREE.Mesh).material as THREE.MeshStandardMaterial
    const cardTex = canvasTex(1024, 716)
    cardMat.map = cardTex.t
    cardMat.needsUpdate = true
    const dateMesh = get<THREE.Mesh>('JT_Map_DateWindow')
    const dateMat = dateMesh.material as THREE.MeshStandardMaterial
    const dateTex = canvasTex(512, 160)
    dateMat.map = dateTex.t
    dateMat.emissiveMap = dateTex.t
    dateMat.emissive.set('#ffffff')
    dateMat.emissiveIntensity = 1.4
    dateMat.needsUpdate = true
    const leds = Object.fromEntries(FILTERS.map((f) => {
      const m = get<THREE.Mesh>(`JT_Map_FilterLED_${f}`)
      m.material = (m.material as THREE.MeshStandardMaterial).clone()
      return [f, m]
    }))
    const wheel = get('JT_Map_DateWheel')
    // the map's own task light (2800 K), independent of the room lamp and the window: the map reads at night
    // (both lights already live in the room - see mapLights.ts - so loading the map never changes the light set)
    const { focus, fill } = mapLights(settings.tier)
    const fl = get('JT_Map_FocusLight')
    fl.getWorldPosition(focus.position)
    focus.target.position.copy(origin.getWorldPosition(new THREE.Vector3()))
    focus.target.updateMatrixWorld()
    // a soft 2900 K fill from above the reading position: no black corners when the room lamp is off
    fill.position.copy(focus.position).lerp(focus.target.position, 0.35)
    fill.position.y += 0.35
    return {
      pins, card, cardRiseH: cardRise, cardBase: { y: card.position.y, rx: card.rotation.x }, cardTex, dateTex, leds,
      dial: get('JT_Map_FilterDial'), wheel, wheelQ: wheel.quaternion.clone(), focus, cardRise: 0,
      dial0: get('JT_Map_FilterDial').rotation.y, fill, night: 0, warm: createWarmup(gl, gltf.scene), arrivedAt: -1, wheelAngle: 0, leftAt: -10,
    }
  }, [gltf, aniso, settings, data])

  useEffect(() => {
    if (!rig) return
    // the focus light adds a light to every shader; the low tier does without it
    // (the low tier keeps the task light but drops its shadow and the fill)
    // compile its programs in the background (the room's light set, the composer's half-float target), so the first
    // visit does not stall; textures and uniforms are warmed frame by frame while the map is out of view
    {
      const was = gltf.scene.visible
      gltf.scene.visible = true
      const prev = gl.getRenderTarget()
      const rt = settings.post ? new THREE.WebGLRenderTarget(4, 4, { type: THREE.HalfFloatType }) : null
      if (rt) gl.setRenderTarget(rt)
      const compiled = gl.compileAsync(gltf.scene, camera, world as THREE.Scene)
      gl.setRenderTarget(prev)
      gltf.scene.visible = was
      void compiled.catch(() => {})
      rt?.dispose()
    }
    mapReady = true
    if (import.meta.env.DEV) {
      // test hook: screen position of a pin (by venue id) or any map node (by name)
      const w = window as unknown as { __jazz?: Record<string, unknown> }
      w.__jazz = { ...w.__jazz, mapRig: rig, mapProject: (key: string) => {
        const pin = rig.pins.find((p) => p.v.id === key)
        const o = pin ? pin.pin.getObjectByName('JT_Map_PinHead') : gltf.scene.getObjectByName(key)
        if (!o) return null
        const v = o.getWorldPosition(new THREE.Vector3()).project(camera)
        const r = gl.domElement.getBoundingClientRect()
        return { x: r.left + (v.x * 0.5 + 0.5) * r.width, y: r.top + (-v.y * 0.5 + 0.5) * r.height }
      } }
    }
    const paint = () => {
      const s = useJazz.getState()
      const v = s.selectedVenue ? venueIndex.get(s.selectedVenue) ?? null : null
      drawCard(rig.cardTex.g, v, s.mapRange, !!v && s.savedVenues.includes(v.id))
      rig.cardTex.t.needsUpdate = true
      drawDate(rig.dateTex.g, s.mapRange)
      rig.dateTex.t.needsUpdate = true
    }
    paint()
    void document.fonts?.ready.then(paint)
    const unsub = useJazz.subscribe((s, p) => {
      if (s.selectedVenue !== p.selectedVenue || s.mapRange !== p.mapRange || s.savedVenues !== p.savedVenues) paint()
    })
    return () => {
      unsub()
    }
  }, [rig, world, gltf, camera, gl, settings])

  // ---- interaction
  const down = useRef<{ id: string | null; x: number; y: number }>({ id: null, x: 0, y: 0 })
  // magnifier: wheel / trackpad pinch zooms toward the cursor, drag pans once zoomed in
  useEffect(() => {
    const el = gl.domElement
    const viewFrac = (e: { clientX: number; clientY: number }) => {
      const r = el.getBoundingClientRect()
      const vh = Math.max(1, r.height - consoleHeightPx())
      return [(e.clientX - r.left) / r.width, Math.min(1, (e.clientY - r.top) / vh)] as const
    }
    const onWheel = (e: WheelEvent) => {
      if (useJazz.getState().station !== 'map' || isOverConsole(e.clientY, el)) return
      e.preventDefault()
      const [sx, sy] = viewFrac(e)
      zoomAt(Math.exp(-e.deltaY * (e.ctrlKey ? 0.01 : 0.0018)), sx, sy)
    }
    let drag: { x: number; y: number; moved: boolean } | null = null
    const onDown = (e: PointerEvent) => {
      if (useJazz.getState().station === 'map' && mapView.target > 1.01 && !isOverConsole(e.clientY, el)) drag = { x: e.clientX, y: e.clientY, moved: false }
    }
    const onMove = (e: PointerEvent) => {
      if (!drag) return
      const r = el.getBoundingClientRect()
      const dx = e.clientX - drag.x
      const dy = e.clientY - drag.y
      if (!drag.moved && Math.hypot(dx, dy) < 5) return
      drag.moved = true
      document.body.style.cursor = 'grabbing'
      panBy(dx / r.width, dy / Math.max(1, r.height - consoleHeightPx()))
      drag.x = e.clientX
      drag.y = e.clientY
    }
    const onUp = () => {
      if (drag?.moved) document.body.style.cursor = ''
      drag = null
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    el.addEventListener('pointerdown', onDown)
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    const unsub = useJazz.subscribe((s, p) => s.station !== p.station && p.station === 'map' && resetMapView())
    return () => {
      el.removeEventListener('wheel', onWheel)
      el.removeEventListener('pointerdown', onDown)
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      unsub()
    }
  }, [gl])
  const pick = (o: THREE.Object3D): string | null => {
    for (let p: THREE.Object3D | null = o; p; p = p.parent) {
      if (p.userData.venueId) return `pin:${p.userData.venueId}`
      const n = p.name.replace(/^COL_/, '')
      if (/^(MapFilter|JT_Map_Filter)/.test(n)) return 'map-filter'
      if (/^(MapDate|JT_Map_Date)/.test(n)) return 'map-date'
      if (/^(MapCard|JT_Map_Card$)/.test(n)) return 'map-card'
      if (/^JT_Map(Table|_)/.test(n)) return 'map-table'
    }
    return null
  }
  const onMove = (e: ThreeEvent<PointerEvent>) => {
    if (isOverConsole(e.clientY, gl.domElement)) return
    e.stopPropagation()
    const id = pick(e.object)
    const s = useJazz.getState()
    const shown = s.station === 'map' ? id : id ? 'map-table' : null
    if (s.hovered !== shown) s.set({ hovered: shown })
    document.body.style.cursor = shown && shown !== 'map-table' ? 'pointer' : shown ? (s.station === 'map' && mapView.target > 1.01 ? 'grab' : 'zoom-in') : ''
  }
  const onDown = (e: ThreeEvent<PointerEvent>) => {
    if (isOverConsole(e.clientY, gl.domElement)) return
    e.stopPropagation()
    down.current = { id: pick(e.object), x: e.clientX, y: e.clientY }
  }
  const onUp = (e: ThreeEvent<PointerEvent>) => {
    if (isOverConsole(e.clientY, gl.domElement)) return
    e.stopPropagation()
    const id = pick(e.object)
    const d = down.current
    if (!id || id !== d.id || Math.hypot(e.clientX - d.x, e.clientY - d.y) > 5) return
    audio.ensure()
    const s = useJazz.getState()
    if (s.station !== 'map') {
      s.set({ station: 'map' })
      return
    }
    if (id.startsWith('pin:')) {
      const v = venueIndex.get(id.slice(4))
      if (v && matchesFilter(v, s.mapFilter)) mapActions.select(v.id)
    } else if (id === 'map-filter') mapActions.cycleFilter()
    else if (id === 'map-date') mapActions.cycleRange()
    else if (id === 'map-card' && s.selectedVenue) {
      // the collider wraps the card; read the UV from the card face itself
      const uv = e.intersections.find((i) => i.object.name === 'JT_Map_Card')?.uv
      if (uv && uv.x >= SAVE_RECT.u0 && uv.x <= SAVE_RECT.u1 && 1 - uv.y >= SAVE_RECT.v0 && 1 - uv.y <= SAVE_RECT.v1)
        mapActions.toggleSave(s.selectedVenue)
      else mapActions.select(null)
    }
  }

  // ---- animation
  useFrame((state, dtRaw) => {
    if (!rig) return
    const dt = Math.min(dtRaw, 0.05)
    const s = useJazz.getState()
    const t = state.clock.elapsedTime
    const here = s.station === 'map'
    rig.focus.visible = s.station !== 'museum' // part of the room's light set, not the museum's
    rig.fill.visible = s.station !== 'museum' && settings.tier !== 'low'
    if (here && rig.arrivedAt < 0) rig.arrivedAt = t + (s.reducedMotion ? 0 : 0.85)
    if (!here) rig.arrivedAt = -1
    // hide the whole station once the camera has left it (no draw / cull cost in the other stations)
    if (here) rig.leftAt = Infinity
    else if (rig.leftAt === Infinity) rig.leftAt = t
    gltf.scene.visible = here || t - rig.leftAt < 1.5
    gltf.scene.matrixWorldAutoUpdate = gltf.scene.visible
    if (!gltf.scene.visible) rig.warm(performance.now()) // upload its textures / uniforms while away
    const k = (rate: number) => 1 - Math.exp(-rate * dt)
    stepMapView(s.reducedMotion ? 1 : k(9))

    // brighter as the room gets darker: night and a dimmed lamp raise the task light, the fill only works at night
    rig.night += ((s.resolvedMode === 'NIGHT' ? 1 : s.resolvedMode === 'DUSK' ? 0.45 : 0) - rig.night) * k(1.5)
    const dark = rig.night * (1 - 0.5 * s.lampLevel)
    rig.focus.intensity += ((here ? 11 * (1 + 1.6 * dark) : 0) - rig.focus.intensity) * k(3)
    rig.fill.intensity += ((here ? 0.6 + 3.2 * dark : 0) - rig.fill.intensity) * k(3)
    const fi = FILTERS.indexOf(s.mapFilter)
    rig.dial.rotation.y += (rig.dial0 + THREE.MathUtils.degToRad(-FILTER_ANGLES[fi]) - rig.dial.rotation.y) * k(10)
    for (const f of FILTERS) {
      const m = rig.leds[f].material as THREE.MeshStandardMaterial
      m.emissiveIntensity += ((f === s.mapFilter ? 5 : 0.05) - m.emissiveIntensity) * k(8)
    }
    const wantWheel = RANGES.indexOf(s.mapRange) * (Math.PI * 2 / 3)
    rig.wheelAngle += (wantWheel - rig.wheelAngle) * k(8)
    rig.wheel.quaternion.copy(rig.wheelQ).multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), rig.wheelAngle))

    // pins resolve one after another once the camera has arrived; filtered pins sink into the map
    rig.pins.forEach((p, i) => {
      const visible = rig.arrivedAt >= 0 && t > rig.arrivedAt + i * 0.07 && matchesFilter(p.v, s.mapFilter)
      p.rise += ((visible ? 1 : 0.08) - p.rise) * k(visible ? 7 : 5)
      p.pin.scale.set(1, Math.max(0.05, p.rise), 1)
      const sel = s.selectedVenue === p.v.id
      const hov = s.hovered === `pin:${p.v.id}`
      const jm = p.jewel.material as THREE.MeshStandardMaterial
      const glow = !visible ? 0 : sel ? 7 + Math.sin(t * 4) * 1.5 : hov ? 4 : s.savedVenues.includes(p.v.id) ? 2.6 : 1.2
      jm.emissiveIntensity += (glow - jm.emissiveIntensity) * k(8)
      p.pin.rotation.y = sel ? p.pin.rotation.y + dt * 1.2 : p.pin.rotation.y * (1 - k(4))
    })

    // archival card rises from its slot and leans back toward the reader
    const want = here && s.selectedVenue ? 1 : 0
    rig.cardRise += (want - rig.cardRise) * k(want ? 5 : 7)
    const r = rig.cardRise
    rig.card.position.y = rig.cardBase.y + r * rig.cardRiseH
    rig.card.rotation.x = rig.cardBase.rx + Math.max(0, r * 1.4 - 0.4) * CARD_TILT
  })

  if (!rig) return null
  return <primitive object={gltf.scene} onPointerMove={onMove} onPointerDown={onDown} onPointerUp={onUp}
    onPointerOut={() => useJazz.getState().set({ hovered: null })} />
}
