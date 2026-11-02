// A09 physical player console: a real 3D asset (JT_Player.glb) rendered as a bottom strip over the room.
// Modules from Blender are laid out to the viewport width; text zones are live canvas textures.
import * as THREE from 'three'
import { useEffect, useMemo, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { initLoaders, useTierGLTF } from './loaders'
import { useJazz } from '../state/store'
import { albumById, trackAt } from '../data/albums'
import { audio } from '../audio/engine'
import { deck } from './deck'
import { actions } from './Experience'
import { TIERS } from '../quality'

/** Screen rectangle (CSS px) of the console's cover + title module; updated every frame. */
export const nowPlayingZone = { x0: 0, x1: 0, y0: 0, y1: 0, ok: false }
export const consoleHeightPx = () => (window.innerWidth < 760 ? 96 : 116)
export function isOverConsole(clientY: number, el?: HTMLElement | null) {
  const r = (el ?? document.querySelector('canvas'))?.getBoundingClientRect()
  return !!r && clientY > r.bottom - consoleHeightPx()
}

const VIEW_H = 0.112 // world height of the strip (console is 0.096 incl. trims)
const CAP_W = 0.018
const GAP = 0.012
const W = { Plaque: 0.3, Time: 0.11, Meters: 0.25, Transport: 0.24 }
const MIN_GROOVE = 0.14
const TILT = 0.2

const fmt = (t: number) => `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, '0')}`

function canvasTexture(w: number, h: number) {
  const c = document.createElement('canvas')
  c.width = w
  c.height = h
  const t = new THREE.CanvasTexture(c)
  t.colorSpace = THREE.SRGBColorSpace
  t.flipY = false
  t.anisotropy = 8
  // CPU-backed: re-uploaded while playing; a GPU-accelerated canvas copied into WebGL forces a GPU sync (~67 ms
  // each second on integrated graphics), a CPU canvas is a plain memory upload
  return { c, t, g: c.getContext('2d', { willReadFrequently: true })! }
}

function drawVU(g: CanvasRenderingContext2D, label: string) {
  const { width: w, height: h } = g.canvas
  const grad = g.createRadialGradient(w / 2, h * 1.05, 10, w / 2, h * 0.9, w * 0.75)
  grad.addColorStop(0, '#f7e2b6')
  grad.addColorStop(1, '#c99b5d')
  g.fillStyle = grad
  g.fillRect(0, 0, w, h)
  const cx = w / 2
  const cy = h * 0.93
  const r = h * 0.66
  const ang = (a: number) => (-90 + a) * (Math.PI / 180)
  g.lineWidth = 2
  g.strokeStyle = '#3a2a1a'
  g.beginPath()
  g.arc(cx, cy, r, ang(-48), ang(30))
  g.stroke()
  g.strokeStyle = '#a5312a'
  g.lineWidth = 6
  g.beginPath()
  g.arc(cx, cy, r + 3, ang(30), ang(48))
  g.stroke()
  const marks: [number, string][] = [[-48, '20'], [-30, '10'], [-14, '5'], [0, '3'], [12, '0'], [30, '+1'], [48, '+3']]
  g.font = '500 20px Jost, sans-serif'
  g.textAlign = 'center'
  for (let a = -48; a <= 48; a += 4) {
    const big = marks.some(([m]) => Math.abs(m - a) < 2)
    g.strokeStyle = a > 30 ? '#a5312a' : '#3a2a1a'
    g.lineWidth = big ? 2.5 : 1.2
    g.beginPath()
    g.moveTo(cx + Math.cos(ang(a)) * r, cy + Math.sin(ang(a)) * r)
    g.lineTo(cx + Math.cos(ang(a)) * (r - (big ? 18 : 10)), cy + Math.sin(ang(a)) * (r - (big ? 18 : 10)))
    g.stroke()
  }
  for (const [a, txt] of marks) {
    g.fillStyle = a > 30 ? '#a5312a' : '#3a2a1a'
    g.fillText(txt, cx + Math.cos(ang(a)) * (r + 22), cy + Math.sin(ang(a)) * (r + 22) + 7)
  }
  g.fillStyle = '#3a2a1a'
  g.font = '500 30px Jost, sans-serif'
  g.fillText('VU', cx, cy - r * 0.38)
  g.font = '500 16px Jost, sans-serif'
  g.fillText(label, w - 26, h - 16)
}

export function PlayerConsole() {
  const tier = useJazz((s) => s.tier)
  const settings = TIERS[tier]
  const { gl, scene: mainScene, camera: mainCamera } = useThree()
  initLoaders(gl)
  const [gltf] = useTierGLTF(settings.assets, ['JT_Player'])

  const rig = useMemo(() => {
    const scene = new THREE.Scene()
    const root = new THREE.Group()
    root.rotation.x = TILT
    scene.add(root)
    const src = gltf.scene.clone(true)
    const mods: Record<string, THREE.Object3D> = {}
    for (const child of [...src.children]) {
      const name = child.name.replace('JT_Player_Mod_', '')
      mods[name] = child
      root.add(child)
    }
    const cap2 = mods.EndCap.clone(true)
    root.add(cap2)
    const find = <T extends THREE.Object3D>(name: string) => root.getObjectByName(name) as T
    const matOf = (name: string) => {
      let found: THREE.MeshStandardMaterial | null = null
      root.traverse((o) => {
        const m = (o as THREE.Mesh).material as THREE.MeshStandardMaterial | undefined
        if (!found && m && !Array.isArray(m) && m.name === name) found = m
      })
      return found as THREE.MeshStandardMaterial | null
    }
    root.traverse((o) => {
      const m = o as THREE.Mesh
      if (m.isMesh && m.name.startsWith('COL_')) m.material = new THREE.MeshBasicMaterial({ colorWrite: false, depthWrite: false, transparent: true, opacity: 0 })
    })

    const meta = canvasTexture(1024, 292)
    const time = canvasTexture(512, 172)
    const vuL = canvasTexture(512, 296)
    const vuR = canvasTexture(512, 296)
    drawVU(vuL.g, 'L')
    drawVU(vuR.g, 'R')
    const metaMat = matOf('JT_Player_MetaFace')!
    metaMat.map = meta.t
    const timeMat = matOf('JT_Player_TimeFace')!
    timeMat.map = time.t
    timeMat.emissiveMap = time.t
    timeMat.emissive.set('#ffffff')
    timeMat.emissiveIntensity = 1.4
    const vuMat = matOf('JT_Player_VUFace')!
    vuMat.map = vuL.t
    vuMat.emissiveMap = vuL.t
    vuMat.emissive.set('#ffd9a0')
    vuMat.emissiveIntensity = 0.35
    const vuMatR = vuMat.clone()
    vuMatR.map = vuR.t
    vuMatR.emissiveMap = vuR.t
    ;(find<THREE.Mesh>('JT_Player_VUFace_R')).material = vuMatR
    for (const m of [metaMat, timeMat, vuMat, vuMatR]) m.needsUpdate = true // new maps need a shader recompile
    const coverMesh = find<THREE.Mesh>('JT_Player_Cover')
    let metaMesh: THREE.Mesh | null = null
    root.traverse((o) => { const mm = (o as THREE.Mesh).material as THREE.Material | undefined; if (!metaMesh && mm && !Array.isArray(mm) && mm.name === 'JT_Player_MetaFace') metaMesh = o as THREE.Mesh })
    const coverMat = (coverMesh.material as THREE.MeshStandardMaterial).clone()
    coverMesh.material = coverMat
    const insertMat = matOf('JT_Player_Insert')!
    const pilot = find<THREE.Mesh>('JT_Player_PlayPilot')
    pilot.material = (pilot.material as THREE.MeshStandardMaterial).clone()
    const crateLed = find<THREE.Mesh>('JT_Player_CrateLED')
    crateLed.material = (crateLed.material as THREE.MeshStandardMaterial).clone()
    for (const n of ['JT_Player_VUGlass_L', 'JT_Player_VUGlass_R']) {
      const m = find<THREE.Mesh>(n).material as THREE.MeshStandardMaterial
      m.transparent = true
      m.depthWrite = false
    }

    const cam = new THREE.OrthographicCamera(-1, 1, VIEW_H / 2, -VIEW_H / 2, 0.01, 3)
    cam.position.set(0, 0, 1)
    scene.add(new THREE.AmbientLight('#ffe6c8', 0.35))
    const key = new THREE.DirectionalLight('#ffe2bf', 2.4)
    key.position.set(-0.5, 0.9, 1)
    const fill = new THREE.DirectionalLight('#cfd8ff', 0.5)
    fill.position.set(0.8, -0.2, 1)
    scene.add(key, fill)

    const buttons: Record<string, { obj: THREE.Object3D; z: number }> = {}
    for (const n of ['Prev', 'Play', 'Next', 'Crate']) {
      const obj = find(`JT_Player_Btn_${n}`)
      buttons[n] = { obj, z: obj.position.z }
    }
    return {
      scene, root, mods, cap2, cam, meta, zoneMeshes: [coverMesh, metaMesh].filter(Boolean) as THREE.Mesh[], zoneAt: -1 as number, time, vuL, vuR, metaMat, timeMat, coverMat, insertMat, pilot, crateLed,
      buttons, find,
      needleL: find('JT_Player_VUNeedle_L'), needleR: find('JT_Player_VUNeedle_R'),
      slider: find('JT_Player_Slider'), fill: find('JT_Player_RailFill_Stretch'),
      volume: find('JT_Player_VolumeKnob'),
      stretch: {
        chassis: ['JT_Player_Chassis_Stretch', 'JT_Player_TrimTop_Stretch', 'JT_Player_TrimBottom_Stretch'].map(find),
        panel: find('JT_Player_RailPanel_Stretch'),
        rail: ['JT_Player_Rail_Stretch', 'JT_Player_RailLipTop_Stretch', 'JT_Player_RailLipBottom_Stretch'].map(find),
        col: find('COL_Player_Rail'),
      },
      layout: { railLen: 0.5, w: 1, h: 1 },
      covers: new Map<string, THREE.Texture>(),
      trackIndex: -1,
      repaint: (() => {}) as () => void,
      press: {} as Record<string, number>,
      drag: null as null | { kind: 'seek' | 'volume'; x: number; y: number; v: number; p: number },
      seekPreview: -1,
      duration: 180,
      vu: [0, 0],
      accent: new THREE.Color(),
    }
  }, [gltf])

  if (import.meta.env.DEV) {
    // test hook: screen position of a console part (used by scripts/verify.mjs)
    const consoleProject = (name: string) => {
      const o = rig.root.getObjectByName(name)
      if (!o) return null
      const v = o.getWorldPosition(new THREE.Vector3()).project(rig.cam)
      const r = gl.domElement.getBoundingClientRect()
      const hPx = consoleHeightPx()
      return { x: r.left + (v.x * 0.5 + 0.5) * r.width, y: r.bottom - hPx + (-v.y * 0.5 + 0.5) * hPx }
    }
    Object.assign((window as unknown as { __jazz: object }).__jazz ?? {}, { console: rig, consoleProject })
  }

  // ---- layout to the viewport width
  const layout = (wPx: number, hPx: number) => {
    const worldW = (VIEW_H * wPx) / hPx
    const cam = rig.cam
    cam.left = -worldW / 2
    cam.right = worldW / 2
    cam.updateProjectionMatrix()
    const L = worldW - 0.02
    for (const o of rig.stretch.chassis) o.scale.x = L - 2 * CAP_W
    rig.mods.EndCap.position.x = -L / 2 + CAP_W / 2
    rig.cap2.position.x = L / 2 - CAP_W / 2
    const content = L - 2 * CAP_W - 2 * GAP
    const fixed = (names: (keyof typeof W)[]) => names.reduce((s, n) => s + W[n], 0) + names.length * GAP
    let shown: (keyof typeof W)[] = ['Plaque', 'Time', 'Meters', 'Transport']
    if (content - fixed(shown) < MIN_GROOVE) shown = ['Plaque', 'Time', 'Transport']
    if (content - fixed(shown) < MIN_GROOVE) shown = ['Plaque', 'Transport']
    for (const n of Object.keys(W) as (keyof typeof W)[]) rig.mods[n].visible = shown.includes(n)
    const groove = Math.max(MIN_GROOVE, content - fixed(shown))
    let x = -content / 2
    const place = (name: string, width: number) => {
      rig.mods[name].position.x = x + width / 2
      x += width + GAP
    }
    place('Plaque', W.Plaque)
    place('Groove', groove)
    for (const n of shown.slice(1)) place(n, W[n])
    rig.stretch.panel.scale.x = groove
    rig.layout.railLen = groove - 0.026
    for (const o of rig.stretch.rail) o.scale.x = rig.layout.railLen
    rig.stretch.col.scale.x = groove
    rig.fill.position.x = -rig.layout.railLen / 2
    rig.layout.w = wPx
    rig.layout.h = hPx
  }

  // ---- texts and album-reactive materials
  useEffect(() => {
    const paint = () => {
      const s = useJazz.getState()
      const a = albumById(s.albumId)
      const pos = audio.isPlaying && audio.playingAlbum === a.id ? audio.position() : s.positions[a.id] ?? 0
      const { track, index } = trackAt(a, pos)
      rig.trackIndex = index
      const line2 = a.tracks.length > 1 ? `${track.title}  \u00b7  ${a.title}` : track.title
      const g = rig.meta.g
      const { width: w, height: h } = rig.meta.c
      g.fillStyle = '#eadfc8'
      g.fillRect(0, 0, w, h)
      for (let i = 0; i < 1800; i++) {
        g.fillStyle = `rgba(90,70,40,${Math.random() * 0.05})`
        g.fillRect(Math.random() * w, Math.random() * h, 2, 2)
      }
      g.fillStyle = '#1d1712'
      let size = 118
      g.font = `600 ${size}px "Cormorant Garamond", Georgia, serif`
      while (g.measureText(a.artist).width > w - 80 && size > 50) g.font = `600 ${(size -= 4)}px "Cormorant Garamond", Georgia, serif`
      g.fillText(a.artist, 36, 130)
      // the track in a firm upright face (the italic dissolved at console size); attribution: Now Playing card + credits
      g.fillStyle = '#3a2c20'
      size = 96
      g.font = `600 ${size}px "Cormorant Garamond", Georgia, serif`
      while (g.measureText(line2).width > w - 72 && size > 52) g.font = `600 ${(size -= 4)}px "Cormorant Garamond", Georgia, serif`
      g.fillText(line2, 38, 246)
      rig.meta.t.needsUpdate = true
      let tex = rig.covers.get(a.cover)
      if (!tex) {
        tex = new THREE.TextureLoader().load(a.cover)
        tex.anisotropy = 16
        tex.minFilter = THREE.LinearMipmapLinearFilter
        tex.colorSpace = THREE.SRGBColorSpace
        tex.flipY = false
        rig.covers.set(a.cover, tex)
      }
      rig.coverMat.map = tex
      rig.coverMat.needsUpdate = true
      rig.accent.set(a.accent)
      void audio.duration(a).then((d) => (rig.duration = d))
    }
    rig.repaint = paint
    paint()
    void document.fonts?.ready.then(paint)
    return useJazz.subscribe((s, p) => s.albumId !== p.albumId && paint())
  }, [rig])

  // ---- pointer interaction (DOM-level: this strip is outside R3F's raycaster)
  useEffect(() => {
    const el = gl.domElement
    const ray = new THREE.Raycaster()
    const pick = (e: PointerEvent) => {
      const r = el.getBoundingClientRect()
      const hPx = consoleHeightPx()
      const top = r.bottom - hPx
      if (e.clientY < top) return null
      const ndc = new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - top) / hPx) * 2 + 1)
      ray.setFromCamera(ndc, rig.cam)
      const hit = ray.intersectObject(rig.root, true).find((h) => h.object.visible && (h.object.parent?.visible ?? true))
      if (!hit) return { id: 'console' as const, hit: null }
      let id = 'console'
      for (let o: THREE.Object3D | null = hit.object; o; o = o.parent) {
        const n = o.name
        const btn = n.match(/Btn_(Prev|Play|Next|Crate)/)
        if (btn) id = btn[1].toLowerCase()
        else if (/PlayPilot/.test(n)) id = 'play'
        else if (/CrateLED/.test(n)) id = 'crate'
        else if (/Arrow_0/.test(n)) id = 'prev'
        else if (/Arrow_1/.test(n)) id = 'next'
        else if (/Volume/.test(n)) id = 'volume'
        else if (/Rail|Slider/.test(n)) id = 'seek'
        if (id !== 'console') break
      }
      return { id, hit }
    }
    const progressAt = (e: PointerEvent) => {
      const r = el.getBoundingClientRect()
      const ndcX = ((e.clientX - r.left) / r.width) * 2 - 1
      const worldX = THREE.MathUtils.lerp(rig.cam.left, rig.cam.right, (ndcX + 1) / 2)
      const local = worldX - rig.mods.Groove.position.x
      return THREE.MathUtils.clamp((local + rig.layout.railLen / 2) / rig.layout.railLen, 0, 1)
    }
    const press = (name: string) => (rig.press[name] = performance.now())
    const down = (e: PointerEvent) => {
      const p = pick(e)
      if (!p) return
      e.stopImmediatePropagation()
      e.stopPropagation()
      audio.ensure()
      const s = useJazz.getState()
      if (p.id === 'play') {
        press('Play')
        void deck.toggle(true)
      } else if (p.id === 'prev' || p.id === 'next') {
        press(p.id === 'prev' ? 'Prev' : 'Next')
        actions.step(p.id === 'prev' ? -1 : 1)
      } else if (p.id === 'crate') {
        press('Crate')
        audio.sfx('switch')
        s.toggleCrateAlbum(s.albumId)
      } else if (p.id === 'seek') {
        rig.drag = { kind: 'seek', x: e.clientX, y: e.clientY, v: 0, p: progressAt(e) }
        rig.seekPreview = rig.drag.p
      } else if (p.id === 'volume') {
        rig.drag = { kind: 'volume', x: e.clientX, y: e.clientY, v: s.volume, p: 0 }
      }
    }
    const move = (e: PointerEvent) => {
      const d = rig.drag
      if (d?.kind === 'seek') rig.seekPreview = progressAt(e)
      else if (d?.kind === 'volume') {
        const v = THREE.MathUtils.clamp(d.v + ((e.clientX - d.x) - (e.clientY - d.y)) * 0.006, 0, 1)
        useJazz.getState().set({ volume: v })
      }
      const p = d ? null : pick(e)
      if (p) el.style.cursor = p.id === 'console' ? '' : p.id === 'seek' || p.id === 'volume' ? 'ew-resize' : 'pointer'
    }
    const up = () => {
      const d = rig.drag
      if (d?.kind === 'seek' && rig.seekPreview >= 0) void deck.seek(rig.seekPreview * rig.duration)
      rig.drag = null
      rig.seekPreview = -1
    }
    const wheel = (e: WheelEvent) => {
      const p = pick(e as unknown as PointerEvent)
      if (p?.id !== 'volume') return
      e.preventDefault()
      const s = useJazz.getState()
      s.set({ volume: THREE.MathUtils.clamp(s.volume - e.deltaY * 0.0008, 0, 1) })
    }
    el.addEventListener('pointerdown', down, { capture: true })
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
    el.addEventListener('wheel', wheel, { passive: false })
    return () => {
      el.removeEventListener('pointerdown', down, { capture: true })
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
      el.removeEventListener('wheel', wheel)
    }
  }, [gl, rig])

  // ---- per frame: animate + render the strip after the room (priority 2 runs after the composer)
  const lastTime = useRef('')
  useFrame((state, dt) => {
    const s = useJazz.getState()
    const size = state.size
    const hPx = consoleHeightPx()
    if (rig.layout.w !== size.width || rig.layout.h !== hPx) layout(size.width, hPx)
    // the cover + title module on screen (for the Now Playing card; a few times a second is plenty)
    const zb = new THREE.Box3()
    const zoneDue = state.clock.elapsedTime - (rig.zoneAt ?? -1) > 0.25
    if (zoneDue) { rig.zoneAt = state.clock.elapsedTime; for (const zm of rig.zoneMeshes) zb.expandByObject(zm) }
    if (zoneDue && !zb.isEmpty()) {
      const r = state.gl.domElement.getBoundingClientRect()
      const a = zb.min.clone().project(rig.cam)
      const b = zb.max.clone().project(rig.cam)
      nowPlayingZone.x0 = r.left + (Math.min(a.x, b.x) * 0.5 + 0.5) * r.width
      nowPlayingZone.x1 = r.left + (Math.max(a.x, b.x) * 0.5 + 0.5) * r.width
      nowPlayingZone.y0 = r.bottom - hPx + (-Math.max(a.y, b.y) * 0.5 + 0.5) * hPx
      nowPlayingZone.y1 = r.bottom - hPx + (-Math.min(a.y, b.y) * 0.5 + 0.5) * hPx
      nowPlayingZone.ok = true
    }

    // progress + time readout
    const pos = audio.isPlaying && audio.playingAlbum === s.albumId ? audio.position() : s.positions[s.albumId] ?? 0
    if (trackAt(albumById(s.albumId), pos).index !== rig.trackIndex) rig.repaint() // next track on the side
    const prog = rig.seekPreview >= 0 ? rig.seekPreview : THREE.MathUtils.clamp(pos / rig.duration, 0, 1)
    rig.slider.position.x = -rig.layout.railLen / 2 + prog * rig.layout.railLen
    rig.fill.scale.x = Math.max(1e-4, prog * rig.layout.railLen)
    const txt = `${fmt(rig.seekPreview >= 0 ? prog * rig.duration : pos)}  /  ${fmt(rig.duration)}`
    if (txt !== lastTime.current) {
      lastTime.current = txt
      const g = rig.time.g
      const { width: w, height: h } = rig.time.c
      g.fillStyle = '#0b0705'
      g.fillRect(0, 0, w, h)
      g.font = '500 66px Jost, sans-serif'
      g.textAlign = 'center'
      // amber glow without a blur filter: soft wide strokes under the digits
      g.lineJoin = 'round'
      g.strokeStyle = 'rgba(255,150,60,0.22)'
      g.lineWidth = 14
      g.strokeText(txt, w / 2, h / 2 + 23)
      g.strokeStyle = 'rgba(255,150,60,0.35)'
      g.lineWidth = 6
      g.strokeText(txt, w / 2, h / 2 + 23)
      g.fillStyle = '#ffb45a'
      g.fillText(txt, w / 2, h / 2 + 23)
      rig.time.t.needsUpdate = true
    }

    // VU ballistics: fast attack, slow release
    const lv = audio.levels()
    for (let i = 0; i < 2; i++) {
      const db = 20 * Math.log10(lv[i] + 1e-5)
      const target = THREE.MathUtils.clamp((db + 32) / 30, 0, 1)
      rig.vu[i] += (target - rig.vu[i]) * (target > rig.vu[i] ? 0.35 : 0.08)
    }
    rig.needleL.rotation.z = THREE.MathUtils.degToRad(48 - rig.vu[0] * 96)
    rig.needleR.rotation.z = THREE.MathUtils.degToRad(48 - rig.vu[1] * 96)

    // hardware states
    const now = performance.now()
    for (const [n, b] of Object.entries(rig.buttons)) {
      const t = (now - (rig.press[n] ?? -1e9)) / 1000
      const depth = t < 0.08 ? t / 0.08 : t < 0.26 ? 1 - (t - 0.08) / 0.18 : 0
      b.obj.position.z = b.z - depth * 0.0018
    }
    const playing = s.deck === 'playing' || s.deck === 'starting'
    const pm = rig.pilot.material as THREE.MeshStandardMaterial
    pm.emissiveIntensity += ((playing ? 5 : 0.15) - pm.emissiveIntensity) * Math.min(1, dt * 8)
    const cm = rig.crateLed.material as THREE.MeshStandardMaterial
    cm.emissiveIntensity = s.myCrate.includes(s.albumId) ? 3.5 : 0.1
    rig.volume.rotation.z = THREE.MathUtils.degToRad(135 - s.volume * 270)
    rig.insertMat.color.lerp(rig.accent, Math.min(1, dt * 3))
    rig.scene.environment = mainScene.environment
    ;(rig.scene as THREE.Scene & { environmentIntensity: number }).environmentIntensity = 0.35

    // render: room first when no composer owns the frame, then the console strip
    const gl = state.gl
    if (!settings.post) {
      gl.toneMapping = THREE.NeutralToneMapping
      gl.render(mainScene, mainCamera)
    }
    const prevTone = gl.toneMapping
    const prevAuto = gl.autoClear
    gl.toneMapping = THREE.NeutralToneMapping
    gl.autoClear = false
    gl.setScissorTest(true)
    gl.setViewport(0, 0, size.width, hPx)
    gl.setScissor(0, 0, size.width, hPx)
    gl.setClearColor('#0b0806', 1)
    gl.clear(true, true, false)
    gl.render(rig.scene, rig.cam)
    gl.setScissorTest(false)
    gl.setViewport(0, 0, size.width, size.height)
    gl.autoClear = prevAuto
    gl.toneMapping = settings.post ? THREE.NoToneMapping : prevTone
  }, 2)

  return null
}
