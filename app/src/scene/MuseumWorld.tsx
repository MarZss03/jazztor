// The JazzTor Museum: a separate interior reached through a real walnut door (blender/scripts/build_museum.py).
// Lighting is a Cycles bake (door closed / open lightmaps blended by the door angle) + Cycles room panoramas.
// The vestibule leads to two independent wings: World Jazz History (data/worldJazz.ts) and Toronto Jazz Legacy
// (data/archive.ts) - separate camera anchors, objects, selection state and content.
import * as THREE from 'three'
import { useEffect, useMemo, useState } from 'react'
import { useFrame, useLoader, useThree, type ThreeEvent } from '@react-three/fiber'
import { RGBELoader } from 'three/examples/jsm/loaders/RGBELoader.js'
import { initLoaders, useTierGLTF } from './loaders'
import { prepareScenes } from './prepare'
import { consoleHeightPx, isOverConsole } from './PlayerConsole'
import { useJazz, type MuseumRoom } from '../state/store'
import { TIERS } from '../quality'
import { audio } from '../audio/engine'
import { WORLD } from '../data/worldJazz'
import { CHAPTERS } from '../data/archive'
import { loadMapData, project, type Projection, type Venue } from '../data/venues'
import { EXHIBITS, exhibitById, exhibitForChapter, type ImageCredit } from '../data/exhibits'
import { EXHIBIT_CARD_PX } from '../ui/ExhibitCard'
import { placardEntries, placardText, WING_INTRO, WING_TITLE, type Wing } from '../data/placards'
import { buildExterior } from './museumExterior'
import { compileInBatches, createWarmup } from './warmup'
import { pmrem } from './bakedLighting'
import { museumInstruments, place, sway, type Placed } from './instruments'
import { makeWalk, type Walk } from './museumWalk'
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js'

const BASE = '/assets/museum'
const b2t = (x: number, y: number, z: number) => new THREE.Vector3(x, z, -y) // Blender (Z up) -> three (Y up)
type Meta = {
  mx: number
  world: { cx: number; y: number; cz: number; w: number; h: number; lat0: number; lat1: number }
  timeline: { x0: number; x1: number; y: number; z: number; year0: number; year1: number }
  toronto: { cx: number; y: number; cz: number } & Projection
  exhibits: ExhibitMeta[]
  instruments?: { id: string; c: number[]; along: number[]; face: number[] }[]
  seats?: { id: string; c: number[]; w: number; d: number; face: number[] }[]
}
type Rect = { c: number[]; w: number; h: number }
type ExhibitMeta = { id: string; wall: string; kind: 'picture' | 'text'; normal: number[]; right: number[]
  picture?: Rect; frame?: Rect; text?: Rect; group: Rect }
type WebLight = { name: string; type: 'point' | 'spot' | 'rect'; pos: number[]; dir?: number[]; quat?: number[]; size?: number[]
  power: number; color: number[]; angle?: number; blend?: number }
type BakeMeta = { objects: string[]; maps: Record<'closed' | 'open', { file: string; fileLow?: string; scale: number }>; lights?: WebLight[] }
type Pose = { pos: THREE.Vector3; quat: THREE.Quaternion; fov: number }

/** Resolves once the museum's model is parsed and its rig built (the room's loading screen waits for it). */
let markBuilt: () => void = () => {}
export const museumBuilt = new Promise<void>((r) => { markBuilt = r })
if (import.meta.env.DEV) void museumBuilt.then(() => { (window as unknown as { __museumBuiltAt: number }).__museumBuiltAt = performance.now() })

// ------------------------------------------------------------------ controller (module state, driven by useFrame)
const m = {
  ready: null as null | (() => void),
  readyP: null as null | Promise<void>,
  busy: false,
  fade: 0, handle: 0, latch: 0, door: 0, space: 0,
  pose: null as Pose | null,
  tweens: [] as { key: string; from: number; to: number; t0: number; ms: number; ease: (t: number) => number; done: () => void }[],
  camT: null as null | { from: Pose; to: Pose; t0: number; ms: number; done: () => void },
  anchors: {} as Record<string, Pose>,
  now: 0,
  fadeEl: null as HTMLDivElement | null,
  savedEnv: undefined as THREE.Texture | null | undefined,
  shift: 0, // view offset (px) beside the reading card
  walk: null as Walk | null,
  /** free-walk pose to return to after opening an exhibit from it */
  walkReturn: false,
}
const easeIO = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2)

/** a heavy leaf: gentle start (inertia), even swing, soft settle with a 0.8 % overshoot - smootherstep + damped tail */
const easeDoor = (t: number) => t * t * t * (t * (6 * t - 15) + 10) + 0.008 * Math.sin(Math.PI * t) * t ** 4
const easeSoft = (t: number) => t * t * (3 - 2 * t)
const wait = (ms: number) => new Promise<void>((r) => setTimeout(r, ms))
const frames = (n: number) => new Promise<void>((r) => { const f = () => (--n <= 0 ? r() : requestAnimationFrame(f)); requestAnimationFrame(f) })

function tween(key: 'fade' | 'handle' | 'latch' | 'door' | 'space', to: number, ms: number, ease = easeIO) {
  return new Promise<void>((done) => {
    m.tweens = m.tweens.filter((t) => t.key !== key)
    if (ms <= 0) { m[key] = to; done(); return }
    m.tweens.push({ key, from: m[key], to, t0: m.now, ms, ease, done })
  })
}
function flyTo(anchor: string, ms: number) {
  return new Promise<void>((done) => {
    const to = m.anchors[anchor]
    if (!to || !m.pose) { done(); return }
    m.camT = { from: { pos: m.pose.pos.clone(), quat: m.pose.quat.clone(), fov: m.pose.fov }, to, t0: m.now, ms, done }
  })
}
const reduced = () => useJazz.getState().reducedMotion
const anchorOf = (r: MuseumRoom, ex: string | null = useJazz.getState().museumExhibit) =>
  r === 'explore' ? 'explore' : r === 'exhibit' ? `ex:${ex}` : r === 'instrument' ? `in:${useJazz.getState().instrument}` : ({ door: 'door', vestibule: 'vestibule', world: 'world', toronto: 'toronto', 'world-read': 'worldRead', 'toronto-read': 'torontoRead' })[r]
/** which space a museum position belongs to (lighting, environment, routing between wings) */
export const spaceOf = (r: MuseumRoom, ex: string | null): 'vestibule' | 'world' | 'toronto' =>
  r === 'explore' ? m.walk?.space() ?? 'vestibule' : r === 'exhibit' ? exhibitById.get(ex ?? '')?.room ?? 'vestibule' : r === 'instrument' ? 'vestibule' : r.startsWith('world') ? 'world' : r.startsWith('toronto') ? 'toronto' : 'vestibule'

/** the free-walk state (ui/MuseumExplore drives it) */
export const museumWalk = () => m.walk

export const museum = {
  /** Listening room -> museum, through the door. */
  async enter(room: MuseumRoom = 'vestibule') {
    const s = useJazz.getState()
    if (m.busy) return
    if (s.station === 'museum') return museum.go(room)
    m.busy = true
    audio.ensure()
    s.set({ museumRequested: true, panel: null })
    if (!m.readyP) m.readyP = new Promise((r) => (m.ready = r))
    // fade to black first: if the museum is still loading (not yet prefetched), it finishes under the black,
    // not as stutter in the room the listener is looking at
    let pending = true
    void m.readyP.then(() => { pending = false })
    await tween('fade', 1, reduced() ? 150 : 300)
    if (pending) s.showToast('Opening the museum…')
    const ok = await Promise.race([m.readyP.then(() => true), wait(45000).then(() => false)])
    if (!ok) {
      useJazz.getState().showToast('The museum could not be opened on this device')
      await tween('fade', 0, 300)
      m.busy = false
      return
    }
    m.pose = { ...m.anchors.door, pos: m.anchors.door.pos.clone(), quat: m.anchors.door.quat.clone() }
    m.door = m.handle = m.latch = 0
    useJazz.getState().set({ station: 'museum', museumInside: true, museumRoom: 'door' })
    // the first museum frame (first-use GPU work) is drawn while the screen is still black
    await frames(3)
    if (reduced()) {
      m.door = 1
      m.pose = { ...m.anchors[anchorOf(room)] }
      m.space = 1
      audio.setSpace(1)
      useJazz.getState().set({ museumRoom: room })
      await tween('fade', 0, 200)
      m.busy = false
      return
    }
    await tween('fade', 0, 380)
    await wait(250)
    // handle 0.22 s -> latch 0.12 s -> door 1.25 s (overlap) -> camera dolly 1.6 s (overlap); acoustics cross-fade
    audio.sfx('handle')
    void tween('handle', 1, 260, easeSoft)
    await wait(170)
    audio.sfx('latch')
    await tween('latch', 1, 130, easeSoft)
    audio.sfx('door')
    const door = tween('door', 1, 1400, easeDoor)
    await wait(260)
    void tween('handle', 0, 380, easeSoft)
    await wait(200)
    audio.setSpace(1, 1.8)
    const cam = flyTo('vestibule', 1800)
    await Promise.all([door, cam])
    useJazz.getState().set({ museumRoom: 'vestibule' })
    m.busy = false
    if (room !== 'vestibule') await museum.go(room)
  },
  /** Move between the vestibule, the wings and the reading views. */
  go(room: MuseumRoom) {
    return goTo(room, room === 'exhibit' ? useJazz.getState().museumExhibit : null)
  },
  /** Walk up to a framed picture / wall text (from anywhere in the museum). */
  view(exhibit: string) {
    return goTo('exhibit', exhibit)
  },
  /** Walk up to one of the legendary instruments on its plinth (the vestibule). */
  async viewInstrument(id: string) {
    const s = useJazz.getState()
    if (m.busy || s.station !== 'museum' || !m.anchors[`in:${id}`] || (s.museumRoom === 'instrument' && s.instrument === id)) return
    m.busy = true
    if (s.museumRoom === 'explore' && m.walk) { m.walkReturn = true; m.walk.st.on = false }
    if (spaceOf(s.museumRoom, s.museumExhibit) !== 'vestibule' && !reduced() && !m.walkReturn) await flyTo('vestibule', 900)
    useJazz.getState().set({ museumRoom: 'instrument', instrument: id })
    audio.sfx('detent')
    if (reduced()) m.pose = { ...m.anchors[`in:${id}`] }
    else await flyTo(`in:${id}`, 1150)
    m.busy = false
  },
  /** Free exploration: walk from where the camera stands (or back to the guided stops). */
  explore(on = true) {
    const s = useJazz.getState()
    if (m.busy || s.station !== 'museum' || !m.walk || !m.pose) return
    if (on) {
      m.camT = null
      m.walk.enter(m.pose.pos, m.pose.quat)
      m.walkReturn = false
      useJazz.getState().set({ museumRoom: 'explore' })
      audio.sfx('detent')
    } else {
      m.walk.st.on = false
      void goTo(m.walk.space(), null)
    }
  },
  /** Sit down on a bench (from the guided tour or the free walk): the camera walks over and lowers; walking stands you up. */
  async sit(id: string) {
    const s = useJazz.getState()
    const w = m.walk
    if (m.busy || s.station !== 'museum' || !w || !m.pose) return
    m.busy = true
    if (s.museumRoom !== 'explore') w.enter(m.pose.pos, m.pose.quat)
    w.st.on = false
    if (!w.sit(id)) { m.busy = false; return }
    const pose = { pos: new THREE.Vector3(), quat: new THREE.Quaternion(), fov: 46 }
    w.st.eye = 1.14
    w.step(0, pose)
    m.anchors.explore = pose
    m.walkReturn = false
    audio.sfx('detent')
    useJazz.getState().set({ museumRoom: 'explore' })
    if (reduced()) m.pose = { ...pose }
    else await flyTo('explore', 1300)
    w.st.on = true
    m.busy = false
  },
  /** Previous / next exhibit through the whole museum (vestibule, World, Toronto), wrapping round. */
  step(dir: 1 | -1) {
    const s = useJazz.getState()
    const cur = exhibitById.get(s.museumExhibit ?? '')
    if (!cur) return
    const next = EXHIBITS[(EXHIBITS.indexOf(cur) + dir + EXHIBITS.length) % EXHIBITS.length]
    return goTo('exhibit', next.id)
  },
  /** Back out: reading -> wing -> vestibule -> through the door -> listening room. */
  async back() {
    const r = useJazz.getState().museumRoom
    if (m.walkReturn && (r === 'exhibit' || r === 'instrument' || r.endsWith('-read'))) return resumeWalk()
    if (r === 'explore') return museum.explore(false)
    if (r === 'exhibit') return museum.go(spaceOf(r, useJazz.getState().museumExhibit))
    if (r === 'instrument') return museum.go('vestibule')
    if (r === 'world-read') return museum.go('world')
    if (r === 'toronto-read') return museum.go('toronto')
    if (r === 'world' || r === 'toronto') return museum.go('vestibule')
    return museum.exit()
  },
  async exit(then?: () => void) {
    const s = useJazz.getState()
    if (m.busy || s.station !== 'museum') return
    m.busy = true
    if (!reduced()) {
      if (s.museumRoom !== 'vestibule' && s.museumRoom !== 'door') await flyTo('vestibule', 900)
      const cam = flyTo('door', 1500)
      await wait(600)
      audio.sfx('door')
      const door = tween('door', 0, 1300, easeDoor)
      audio.setSpace(0, 1.4)
      await Promise.all([cam, door])
      audio.sfx('latch')
      await tween('fade', 1, 300)
    } else {
      await tween('fade', 1, 150)
      audio.setSpace(0)
    }
    useJazz.getState().set({ station: 'home', museumInside: false, museumRoom: 'door' })
    await wait(60)
    m.busy = false
    then?.()
    await tween('fade', 0, reduced() ? 150 : 380)
  },
}

/** back from an exhibit to the spot (and the view) where the visitor stood while walking */
async function resumeWalk() {
  const w = m.walk
  if (!w || m.busy) return
  m.busy = true
  const pose = { pos: new THREE.Vector3(), quat: new THREE.Quaternion(), fov: 46 }
  w.st.vx = w.st.vy = 0
  w.step(0, pose)
  m.anchors.explore = pose
  if (reduced()) m.pose = { ...pose }
  else await flyTo('explore', 800)
  w.st.on = true
  m.walkReturn = false
  useJazz.getState().set({ museumRoom: 'explore' })
  m.busy = false
}

async function goTo(room: MuseumRoom, exhibit: string | null) {
  const s = useJazz.getState()
  if (m.busy || s.station !== 'museum' || (room === s.museumRoom && exhibit === s.museumExhibit)) return
  if (room === 'exhibit' && !m.anchors[`ex:${exhibit}`]) return
  m.busy = true
  // opening an exhibit from the free walk remembers where you stood; any other move ends the walk
  const opens = ['exhibit', 'instrument', 'world-read', 'toronto-read'].includes(room)
  if (s.museumRoom === 'explore' && m.walk) { m.walkReturn = opens; m.walk.st.on = false }
  else if (!opens) m.walkReturn = false
  const from = spaceOf(s.museumRoom, s.museumExhibit)
  const to = spaceOf(room, exhibit)
  if (from !== to && from !== 'vestibule' && to !== 'vestibule' && !reduced()) await flyTo('vestibule', 900)
  const near = room === 'exhibit' && s.museumRoom === 'exhibit' && from === to // the next picture along the same wall run
  useJazz.getState().set({ museumRoom: room, museumExhibit: room === 'exhibit' ? exhibit : s.museumExhibit })
  audio.sfx('detent')
  const key = anchorOf(room, exhibit)
  if (reduced()) m.pose = { ...m.anchors[key] }
  else await flyTo(key, near ? 950 : room.endsWith('read') || s.museumRoom.endsWith('read') ? 700 : 1200)
  m.busy = false
}

// ------------------------------------------------------------------ placard / portrait artwork
const SERIF = '"Cormorant Garamond", Georgia, serif'

function wrap(g: CanvasRenderingContext2D, text: string, x: number, y: number, w: number, lh: number, maxLines = 99) {
  const words = text.split(/\s+/)
  let line = ''
  let n = 0
  for (const word of words) {
    const test = line ? `${line} ${word}` : word
    if (g.measureText(test).width > w && line) {
      g.fillText(line, x, y)
      y += lh
      line = word
      if (++n >= maxLines) return y
    } else line = test
  }
  if (line) { g.fillText(line, x, y); y += lh }
  return y
}

function paper(g: CanvasRenderingContext2D) {
  const { width: w, height: h } = g.canvas
  g.fillStyle = '#ece2cc'
  g.fillRect(0, 0, w, h)
  g.fillStyle = g.createPattern(paperGrain(), 'repeat')!
  g.fillRect(0, 0, w, h)
  const grd = g.createRadialGradient(w / 2, h / 2, h * 0.3, w / 2, h / 2, h)
  grd.addColorStop(0, 'rgba(0,0,0,0)')
  grd.addColorStop(1, 'rgba(110,80,40,0.18)')
  g.fillStyle = grd
  g.fillRect(0, 0, w, h)
  g.strokeStyle = 'rgba(120,90,50,0.55)'
  g.lineWidth = 4
  g.strokeRect(34, 34, w - 68, h - 68)
}

/** Lines of `text` wrapped to width `w` in the current font (measured, not drawn). */
function lines(g: CanvasRenderingContext2D, text: string, w: number) {
  const out: string[] = []
  let line = ''
  for (const word of text.split(/\s+/)) {
    const test = line ? `${line} ${word}` : word
    if (g.measureText(test).width > w && line) { out.push(line); line = word } else line = test
  }
  if (line) out.push(line)
  return out
}

/** The lectern placard: the wing's contents page (nothing chosen yet), or the chosen entry set to fit the sheet. */
function drawPlacard(g: CanvasRenderingContext2D, wing: Wing, id: string | null) {
  const { width: w, height: h } = g.canvas
  paper(g)
  const X = 96
  const W = w - 2 * X
  g.textBaseline = 'alphabetic'
  const list = placardEntries(wing)
  const t = placardText(wing, id)
  const folio = (txt: string) => {
    g.fillStyle = '#7b5a33'
    g.font = `500 26px Jost, sans-serif`
    g.textAlign = 'right'
    g.fillText(txt, w - X, h - 82)
    g.textAlign = 'left'
  }
  if (!t) {
    // contents: kicker, wing title, a line of introduction, then the entries in two columns (year · title)
    g.fillStyle = '#7b5a33'
    g.font = `500 30px Jost, sans-serif`
    g.fillText(`${WING_TITLE[wing].toUpperCase()}  ·  GUIDE TO THE ROOM`, X, 140)
    g.fillStyle = '#1d1712'
    g.font = `600 84px ${SERIF}`
    g.fillText('In this room', X, 232)
    g.fillStyle = '#4a3a2c'
    g.font = `italic 500 38px ${SERIF}`
    let y = wrap(g, WING_INTRO[wing], X, 292, W, 46, 3)
    g.fillStyle = 'rgba(120,90,50,0.6)'
    g.fillRect(X, y - 6, W, 3)
    y += 52
    const cols = list.length > 8 ? 2 : 1
    const colW = (W - (cols - 1) * 56) / cols
    const rows = Math.ceil(list.length / cols)
    const lh = Math.min(64, (h - 150 - y) / rows)
    list.forEach((e, i) => {
      const c = Math.floor(i / rows)
      const cx = X + c * (colW + 56)
      const cy = y + (i % rows) * lh
      g.fillStyle = '#8a6438'
      g.font = `500 26px Jost, sans-serif`
      g.fillText(e.year, cx, cy)
      g.fillStyle = '#211a14'
      let size = 36
      g.font = `500 ${size}px ${SERIF}`
      while (g.measureText(e.title).width > colW - 96 && size > 26) g.font = `500 ${(size -= 2)}px ${SERIF}`
      g.fillText(e.title, cx + 96, cy)
    })
    g.fillStyle = '#5a4a3a'
    g.font = `italic 500 32px ${SERIF}`
    g.fillText(wing === 'world' ? 'Choose a year on the timeline or a pin on the map — or turn the pages with Next.'
      : 'Choose a venue pin or a portrait — or turn the pages with Next.', X, h - 82)
    return
  }
  const n = list.findIndex((e) => e.id === id) + 1
  g.fillStyle = '#7b5a33'
  g.font = `500 30px Jost, sans-serif`
  g.fillText(t.kicker.toUpperCase(), X, 140)
  g.fillStyle = '#1d1712'
  let size = 96
  g.font = `600 ${size}px ${SERIF}`
  while (g.measureText(t.title).width > W && size > 56) g.font = `600 ${(size -= 4)}px ${SERIF}`
  g.fillText(t.title, X, 240)
  let y = 300
  if (t.sub) {
    g.fillStyle = '#5a4026'
    g.font = `italic 500 44px ${SERIF}`
    y = wrap(g, t.sub, X, y, W, 52, 2)
  }
  if (t.people) {
    g.fillStyle = '#4a3a2c'
    g.font = `italic 500 40px ${SERIF}`
    y = wrap(g, t.people, X, y + 6, W, 48, 2)
  }
  g.fillStyle = 'rgba(120,90,50,0.6)'
  g.fillRect(X, y + 8, W, 3)
  y += 70
  // body: the largest size at which every paragraph fits above the footnote
  const bottom = h - 200
  let bs = 46
  const fits = (px: number) => {
    g.font = `500 ${px}px ${SERIF}`
    let yy = y
    for (const p of t.body) yy += lines(g, p, W).length * px * 1.26 + 16
    return yy <= bottom
  }
  while (bs > 28 && !fits(bs)) bs -= 2
  g.fillStyle = '#211a14'
  g.font = `500 ${bs}px ${SERIF}`
  for (const p of t.body) {
    for (const l of lines(g, p, W)) { if (y > bottom + bs) break; g.fillText(l, X, y); y += bs * 1.26 }
    y += 16
  }
  g.fillStyle = '#5a4a3a'
  g.font = `italic 500 32px ${SERIF}`
  wrap(g, [t.foot, t.note].filter(Boolean).join('  ·  '), X, h - 150, W - 160, 38, 1)
  g.fillStyle = '#7b5a33'
  g.font = `500 24px Jost, sans-serif`
  g.fillText(`SOURCES  ${t.sources.map((x) => x.label.replace(/^Wikipedia: /, '')).join('  ·  ')}  (WIKIPEDIA)`.slice(0, 110), X, h - 82)
  folio(`${n} / ${list.length}`)
}

/** Gallery wall text: chapter text beside its picture, a tombstone label under a portrait, or a text-only panel.
 * Typeset at a scale that fits the panel (largest first), in the museum's serif on warm paper. */
function drawWallText(g: CanvasRenderingContext2D, id: string, credit?: ImageCredit) {
  const { width: w, height: h } = g.canvas
  const ex = exhibitById.get(id)
  if (!ex) return
  const world = WORLD.find((c) => c.id === ex.chapter)
  const tor = CHAPTERS.find((c) => c.id === ex.chapter)
  const blocks: { font: (s: number) => string; color: string; text: string; gap: number; lh: number }[] = []
  const add = (font: (s: number) => string, color: string, text: string | undefined, gap = 0.4, lh = 1.28) =>
    text && blocks.push({ font, color, text, gap, lh })
  const sans = (wt: number) => (s: number) => `${wt} ${s * 0.62}px Jost, sans-serif`
  const serif = (style: string) => (s: number) => `${style} ${s}px ${SERIF}`
  const creditLine = credit ? `${credit.author || 'Unknown author'} · ${credit.licence} · Wikimedia Commons` : ''
  if (ex.title) {
    add(sans(500), '#7b5a33', 'JAZZTOR MUSEUM', 0)
    add(serif('600'), '#1d1712', ex.title, 0.5, 1.1)
    for (const p of ex.body ?? []) add(serif('500'), '#2a211a', p, 0.7)
  } else if (world || tor) {
    add(sans(500), '#7b5a33', (world ? `${world.date} · ${world.location.city}` : tor!.era).toUpperCase(), 0)
    add(serif('600'), '#1d1712', world?.title ?? tor!.title, 0.35, 1.1)
    if (world) add(serif('italic 500'), '#5a4026', world.movement, 0.3)
    add(serif('italic 500'), '#4a3a2c', (world?.artists ?? tor!.artists).join(' · '), 0.35)
    for (const p of world?.body ?? tor!.body) add(serif('500'), '#211a14', p, 0.75)
    if (world?.recording) add(serif('italic 500'), '#4a3a2c', `${world.recording}. ${world.rights}.`, 0.6)
    add(serif('italic 500'), '#3a2e24', ex.caption, 0.9)
    add(sans(400), '#6b5a48', creditLine, 0.35)
    add(sans(400), '#7b5a33', `Sources: ${(world?.sources ?? tor!.sources).map((x) => x.label.replace(/^Wikipedia: /, '')).join(', ')} (Wikipedia)`, 0.35)
  } else {
    add(serif('600'), '#1d1712', ex.caption, 0, 1.15)
    add(sans(400), '#6b5a48', creditLine, 0.45)
  }
  const pad = w * 0.075
  const W = w - 2 * pad
  // word widths measured once at 100 px per block (type scales linearly), so fitting is arithmetic, not measuring
  const metrics = blocks.map((b) => {
    g.font = b.font(100)
    const words = b.text.split(/\s+/)
    return { words, widths: words.map((x) => g.measureText(x).width / 100), space: g.measureText(' ').width / 100 }
  })
  const scaleOf = (i: number, size: number) => (i === 1 && blocks.length > 2 ? size * 1.75 : size)
  const lay = (size: number) => {
    const lines: { i: number; text: string; y: number; s: number }[] = []
    let y = pad + size * 0.9
    blocks.forEach((b, i) => {
      const s = scaleOf(i, size)
      if (i) y += b.gap * size
      const { words, widths, space } = metrics[i]
      let line = ''
      let lw = 0
      words.forEach((word, k) => {
        const ww = widths[k] * s
        if (line && lw + space * s + ww > W) {
          lines.push({ i, text: line, y, s })
          y += s * b.lh
          line = word
          lw = ww
        } else {
          lw = line ? lw + space * s + ww : ww
          line = line ? `${line} ${word}` : word
        }
      })
      lines.push({ i, text: line, y, s })
      y += s * b.lh
    })
    return { lines, bottom: y }
  }
  // fit: binary search for the largest size whose layout fits (short labels end up large, long texts shrink)
  let lo = 8
  let hi = Math.min(h * 0.16, w * 0.075)
  for (let k = 0; k < 9; k++) {
    const mid = (lo + hi) / 2
    if (lay(mid).bottom > h - pad * 0.6) hi = mid
    else lo = mid
  }
  const { lines } = lay(lo)
  // paper (a shared grain pattern), hairline border, then the text
  g.fillStyle = '#ece3cf'
  g.fillRect(0, 0, w, h)
  g.fillStyle = g.createPattern(paperGrain(), 'repeat')!
  g.fillRect(0, 0, w, h)
  g.strokeStyle = 'rgba(123,90,51,0.45)'
  g.lineWidth = Math.max(2, w * 0.002)
  g.strokeRect(pad * 0.45, pad * 0.45, w - pad * 0.9, h - pad * 0.9)
  g.textBaseline = 'alphabetic'
  let cur = -1
  for (const ln of lines) {
    if (ln.i !== cur) {
      cur = ln.i
      g.font = blocks[ln.i].font(ln.s)
      g.fillStyle = blocks[ln.i].color
    }
    g.fillText(ln.text, pad, ln.y)
  }
}

let grain: HTMLCanvasElement | null = null
/** 256 px tile of faint paper fibres, made once and used as a fill pattern by every wall text. */
function paperGrain() {
  if (grain) return grain
  grain = document.createElement('canvas')
  grain.width = grain.height = 256
  const g = grain.getContext('2d')!
  for (let i = 0; i < 300; i++) {
    g.fillStyle = `rgba(90,70,40,${Math.random() * 0.035})`
    g.fillRect(Math.random() * 256, Math.random() * 256, 2, 2)
  }
  return grain
}

/** The photograph row on the Toronto wing's outer wall: Toronto jazz places and people (Wikimedia Commons, CC BY 2.0 -
 * the credit line is printed on the mount: title, author, source, licence). Clicking one opens its chapter / musician. */
export const TORONTO_ROW: { id: string; link: { kind: 'chapter' | 'figure'; id: string }; title: string; caption: string }[] = [
  { id: 't-row-massey', link: { kind: 'chapter', id: 'massey-1953' }, title: 'Massey Hall',
    caption: 'Shuter Street, 2016. On 15 May 1953 Parker, Gillespie, Powell, Mingus and Roach played Jazz at Massey Hall here.' },
  { id: 't-row-yonge', link: { kind: 'chapter', id: 'colonial' }, title: 'Yonge Street',
    caption: 'Looking south from Shuter Street, 2009 - the stretch of Yonge where the Colonial Tavern (203 Yonge) presented jazz.' },
  { id: 't-row-mcconnell', link: { kind: 'figure', id: 'mcconnell' }, title: 'Rob McConnell',
    caption: 'With saxophonist Fraser MacPherson, Otter Crest, Oregon, May 1989. McConnell led Toronto\u2019s Boss Brass from 1968.' },
  { id: 't-row-festival', link: { kind: 'chapter', id: 'festival' }, title: 'Toronto Jazz Festival',
    caption: 'June 2008: Salif Keita on stage at the festival founded in 1987.' },
]

/** a framed photograph on a dark mount: the picture fitted at the top, title, caption and credit beneath */
function drawRowPhoto(g: CanvasRenderingContext2D, item: (typeof TORONTO_ROW)[number], img: HTMLImageElement | null, credit: ImageCredit | undefined, on: boolean) {
  const { width: w, height: h } = g.canvas
  g.save()
  g.translate(w, 0)
  g.scale(-1, 1) // mesh UVs run right-to-left as seen from the room
  g.fillStyle = on ? '#2a2420' : '#1f1b18'
  g.fillRect(0, 0, w, h)
  const M = 38
  const boxW = w - 2 * M, boxH = h * 0.58
  if (img && img.naturalWidth) {
    const k = Math.min(boxW / img.naturalWidth, boxH / img.naturalHeight)
    const iw = img.naturalWidth * k, ih = img.naturalHeight * k
    const ix = (w - iw) / 2, iy = M + (boxH - ih) / 2
    g.fillStyle = '#0c0a09'
    g.fillRect(ix - 6, iy - 6, iw + 12, ih + 12)
    g.drawImage(img, ix, iy, iw, ih)
  }
  g.textAlign = 'left'
  let y = M + boxH + 70
  g.fillStyle = 'rgba(236,226,204,0.95)'
  g.font = `600 50px ${SERIF}`
  g.fillText(item.title, M, y)
  y += 46
  g.fillStyle = 'rgba(236,226,204,0.78)'
  g.font = `italic 500 29px ${SERIF}`
  y = wrap(g, item.caption, M, y, w - 2 * M, 35, 4) + 10
  if (credit) {
    g.fillStyle = 'rgba(214,179,122,0.75)'
    g.font = `500 18px Jost, sans-serif`
    wrap(g, `Photo: ${credit.author} \u00b7 ${credit.licence} \u00b7 Wikimedia Commons`, M, h - 52, w - 2 * M, 22, 2)
  }
  g.restore()
}

// ------------------------------------------------------------------ baked lighting
const musUniforms = { musLmOpen: { value: null as THREE.Texture | null }, uMusW: { value: new THREE.Vector2() } }
const MUS_CHUNK = /* glsl */ `
#if defined( RE_IndirectDiffuse )
	#ifdef USE_LIGHTMAP
		irradiance = texture2D( lightMap, vLightMapUv ).rgb * uMusW.x + texture2D( musLmOpen, vLightMapUv ).rgb * uMusW.y;
		reflectedLight.directDiffuse *= 0.0;
	#endif
#endif
#if defined( USE_ENVMAP ) && defined( RE_IndirectSpecular )
	#ifdef USE_ANISOTROPY
		radiance += getIBLAnisotropyRadiance( geometryViewDir, geometryNormal, material.roughness, material.anisotropyB, material.anisotropy );
	#else
		radiance += getIBLRadiance( geometryViewDir, geometryNormal, material.roughness );
	#endif
	#ifdef USE_CLEARCOAT
		clearcoatRadiance += getIBLRadiance( geometryViewDir, geometryClearcoatNormal, material.clearcoatRoughness );
	#endif
#endif
`
/** materials already given the HDR ceiling / NaN guard (a WeakSet: clone() would copy a userData flag) */
const capped = new WeakSet<THREE.Material>()
// (scripts/probe-tor-angles.mjs + probe-tor-sight.mjs: unturned, the tower stands 33 deg east of north; the guided view
// and the middle of the wing see 26-44 deg through the window, a visitor standing at it -25..25 deg. 13 deg puts the
// tower at ~20 deg - in view from the window too - and the Financial District's towers in the guided view)
const TORONTO_VIEW_TURN = 13 // deg, see the exterior placement
const todW = new THREE.Vector3(0, 0, 1) // eased day / dusk / night weights for the window view
const EXPOSURE = 1.32 // the Cycles reference renders use +0.4 stop

export function MuseumWorld() {
  const { gl, camera, scene, size } = useThree()
  initLoaders(gl)
  const tier = useJazz((s) => s.tier)
  const settings = TIERS[tier]
  const [gltf, skyGltf, instGltf] = useTierGLTF(settings.assets, ['JT_Museum', 'JT_Skyline', 'JT_Instruments'])
  const aniso = useLoader(THREE.TextureLoader, '/assets/textures/JT_Vinyl_Anisotropy.png')
  // parse once per file (a fresh object every render would rebuild the whole rig below on each re-render)
  const metaSrc = useLoader(THREE.FileLoader, '/data/museum.json') as string
  const bakeSrc = useLoader(THREE.FileLoader, `${BASE}/lightmaps.json`) as string
  const meta = useMemo(() => JSON.parse(metaSrc) as Meta, [metaSrc])
  const creditSrc = useLoader(THREE.FileLoader, '/data/museum-images.json') as string
  const credits = useMemo(() => JSON.parse(creditSrc) as Record<string, ImageCredit>, [creditSrc])
  const bakeMeta = useMemo(() => JSON.parse(bakeSrc) as BakeMeta, [bakeSrc])
  const low = settings.tier === 'low'
  // lightmaps decode off the main thread (ImageBitmap): a 2048 JPEG decoded during texImage2D is a long frame
  const lmBitmaps = useLoader(THREE.ImageBitmapLoader, (['closed', 'open'] as const).map((k) => `${BASE}/${low && bakeMeta.maps[k].fileLow ? bakeMeta.maps[k].fileLow : bakeMeta.maps[k].file}`)) as unknown as ImageBitmap[]
  const lm = useMemo(() => lmBitmaps.map((b) => { const t = new THREE.Texture(b); t.needsUpdate = true; return t }), [lmBitmaps])
  const envs = useLoader(RGBELoader, ['vestibule', 'world', 'toronto'].map((k) => `${BASE}/env-${k}.hdr`))
  const [venues, setVenues] = useState<Venue[] | null>(null)
  useEffect(() => { void loadMapData().then((d) => setVenues(d.venues)) }, [])

  const rig = useMemo(() => {
    if (!venues) return null
    // idempotent (StrictMode runs this twice on the same cached GLTF): drop what a previous run added
    for (const o of gltf.scene.children.filter((c) => c.userData.musRuntime)) gltf.scene.remove(o)
    const { nodes } = prepareScenes([gltf.scene], aniso, settings, gl.capabilities.getMaxAnisotropy())
    const get = <T extends THREE.Object3D>(n: string) => nodes[n] as T
    // lightmaps (TEXCOORD_1)
    for (const t of lm) {
      t.colorSpace = THREE.SRGBColorSpace
      t.flipY = false
      t.channel = 1
    }
    musUniforms.musLmOpen.value = lm[1]
    const clones = new Map<THREE.Material, THREE.Material>()
    for (const name of bakeMeta.objects) {
      const o = nodes[name] as THREE.Mesh | undefined
      const list = (o?.isMesh ? [o] : (o?.children.filter((c) => (c as THREE.Mesh).isMesh) ?? [])) as THREE.Mesh[]
      for (const mesh of list) {
        if (!mesh.geometry.attributes.uv1) continue
        const unique = /^JT_Mus_Ex(Pic|Text)_/.test(mesh.name)
        const swap = (mat: THREE.Material) => {
          let c = unique ? undefined : clones.get(mat)
          if (!c) {
            const b = mat.clone() as THREE.MeshStandardMaterial
            b.lightMap = lm[0]
            b.aoMap = null
            b.onBeforeCompile = (sh) => {
              Object.assign(sh.uniforms, musUniforms)
              sh.fragmentShader = sh.fragmentShader.replace('#include <lights_fragment_maps>', MUS_CHUNK)
                .replace('void main() {', 'uniform sampler2D musLmOpen;\nuniform vec2 uMusW;\nvoid main() {')
            }
            b.customProgramCacheKey = () => 'jt-museum-baked'
            c = b
            if (!unique) clones.set(mat, c)
          }
          return c
        }
        mesh.material = Array.isArray(mesh.material) ? mesh.material.map(swap) : swap(mesh.material)
        mesh.castShadow = mesh.receiveShadow = false
      }
    }
    // emissive fixtures: warm, never clipping; the chandelier glass is lit from inside, not refractive
    gltf.scene.traverse((o) => {
      const mesh = o as THREE.Mesh
      if (!mesh.isMesh) return
      mesh.castShadow = mesh.receiveShadow = false
      const mat = mesh.material as THREE.MeshStandardMaterial
      if (!mat || Array.isArray(mat)) return
      if (/JT_Mus_(ChandelierGlass|SconceGlass)/.test(mat.name)) {
        const e = new THREE.MeshStandardMaterial({ name: mat.name, color: '#f6e7cf', emissive: new THREE.Color('#ffc98e'),
          emissiveIntensity: mat.name.includes('Chand') ? 2.6 : 3.2, roughness: 0.4, transparent: true, opacity: 0.94 })
        mesh.material = e
      }
    })
    // camera anchors
    const anchors: Record<string, Pose> = {}
    for (const [k, n] of [['door', 'JT_MusCam_Door'], ['vestibule', 'JT_MusCam_Vestibule'], ['world', 'JT_MusCam_World'], ['toronto', 'JT_MusCam_Toronto']]) {
      const node = get(n)
      const c = ((node as THREE.PerspectiveCamera).isPerspectiveCamera ? node : node.children.find((x) => (x as THREE.PerspectiveCamera).isPerspectiveCamera)) as THREE.PerspectiveCamera
      const src = c ?? node
      src.updateWorldMatrix(true, false)
      anchors[k] = { pos: src.getWorldPosition(new THREE.Vector3()), quat: src.getWorldQuaternion(new THREE.Quaternion()), fov: c?.fov ?? 45 }
    }
    // the visible area beside the reading card (see the view offset in useFrame)
    const visW = size.width >= 900 ? size.width - EXHIBIT_CARD_PX - 40 : size.width
    const viewAspect = Math.max(1.0, visW / Math.max(1, size.height - consoleHeightPx()))
    // the placard sheet must sit proud of its desk's top face (an older build left it 2 mm inside the walnut)
    const liftClear = (sheet: string, desk: string) => {
      const p = get<THREE.Mesh>(sheet)
      const d = nodes[desk] as THREE.Mesh | undefined
      if (!d) return
      p.updateWorldMatrix(true, false)
      d.updateWorldMatrix(true, false)
      const n = new THREE.Vector3(0, 1, 0)
      const nAttr = d.geometry.attributes.normal
      for (let i = 0, best = -2; i < nAttr.count; i++) {
        const v = new THREE.Vector3().fromBufferAttribute(nAttr, i).transformDirection(d.matrixWorld)
        if (v.y > best && v.y < 0.999) { best = v.y; n.copy(v) }
      }
      const top = (mesh: THREE.Mesh) => {
        const pos = mesh.geometry.attributes.position
        let mx = -Infinity
        for (let i = 0; i < pos.count; i++) mx = Math.max(mx, new THREE.Vector3().fromBufferAttribute(pos, i).applyMatrix4(mesh.matrixWorld).dot(n))
        return mx
      }
      const gap = top(d) + 0.0015 - top(p)
      if (gap <= 0) return
      const local = n.clone().multiplyScalar(gap)
      if (p.parent) local.applyQuaternion(p.parent.getWorldQuaternion(new THREE.Quaternion()).invert())
      p.position.add(local)
      p.updateWorldMatrix(true, false)
    }
    liftClear('JT_Mus_WorldPlacard', 'JT_Mus_WorldLecternDesk')
    liftClear('JT_Mus_TorPlacard', 'JT_Mus_TorLecternDesk')
    // reading views: square onto each placard, the page upright on screen. The sheet's own text axes come from its UVs
    // (right = +u, up = +v for a flipY canvas), so the view and the print agree whatever the modelling; a mirrored
    // UV layout is flipped back in the texture (see placard())
    const mirrored = new Set<string>()
    const readAnchor = (name: string) => {
      const p = get<THREE.Mesh>(name)
      p.updateWorldMatrix(true, false)
      // the reading face = the vertex normal pointing most upward (a slanted thin box)
      const nAttr = p.geometry.attributes.normal
      const n = new THREE.Vector3(0, 1, 0)
      for (let i = 0, best = -2; i < nAttr.count; i++) {
        const v = new THREE.Vector3().fromBufferAttribute(nAttr, i).transformDirection(p.matrixWorld)
        if (v.y > best && v.y < 0.999) { best = v.y; n.copy(v) }
      }
      // dP/du and dP/dv on a triangle of that face
      const pos3 = p.geometry.attributes.position
      const uv = p.geometry.attributes.uv
      const idx = p.geometry.index
      const tri = idx ? idx.count / 3 : pos3.count / 3
      const right = new THREE.Vector3(1, 0, 0)
      const up = new THREE.Vector3().crossVectors(n, right).normalize()
      const P = [0, 1, 2].map(() => new THREE.Vector3())
      const fn = new THREE.Vector3()
      for (let t = 0; t < tri; t++) {
        const k = [0, 1, 2].map((j) => (idx ? idx.getX(t * 3 + j) : t * 3 + j))
        k.forEach((v, j) => P[j].fromBufferAttribute(pos3, v).applyMatrix4(p.matrixWorld))
        const e1 = P[1].clone().sub(P[0])
        const e2 = P[2].clone().sub(P[0])
        if (fn.crossVectors(e1, e2).normalize().dot(n) < 0.95) continue
        const du1 = uv.getX(k[1]) - uv.getX(k[0]), dv1 = uv.getY(k[1]) - uv.getY(k[0])
        const du2 = uv.getX(k[2]) - uv.getX(k[0]), dv2 = uv.getY(k[2]) - uv.getY(k[0])
        const det = du1 * dv2 - du2 * dv1
        if (Math.abs(det) < 1e-6) continue
        right.copy(e1).multiplyScalar(dv2).addScaledVector(e2, -dv1).divideScalar(det).normalize()
        up.copy(e2).multiplyScalar(du1).addScaledVector(e1, -du2).divideScalar(det).normalize()
        break
      }
      if (new THREE.Vector3().crossVectors(right, up).dot(n) < 0) { mirrored.add(name); right.negate() }
      // the sheet's extent along its own axes, to frame it whole beside the reading card
      let w = 0, h = 0
      const c = new THREE.Box3().setFromObject(p).getCenter(new THREE.Vector3())
      for (let i = 0; i < pos3.count; i++) {
        const d = new THREE.Vector3().fromBufferAttribute(pos3, i).applyMatrix4(p.matrixWorld).sub(c)
        w = Math.max(w, Math.abs(d.dot(right)) * 2)
        h = Math.max(h, Math.abs(d.dot(up)) * 2)
      }
      const FOV = 30
      const tv = Math.tan(THREE.MathUtils.degToRad(FOV / 2))
      const dist = Math.max(h * 0.74 / tv, w * 0.74 / (tv * viewAspect))
      // a few degrees off square (from the reader's side), so it reads as a sheet on a lectern, not a flat scan; stepped
      // sideways if anything in the room (a vitrine beside the lectern) stands between the eye and the sheet's corners
      const solid: THREE.Object3D[] = []
      gltf.scene.traverse((o) => { if ((o as THREE.Mesh).isMesh && o.visible && o !== p && !o.name.startsWith('COL_') && !/Placard|LecternDesk/.test(o.name)) solid.push(o) })
      const ray = new THREE.Raycaster()
      const corners = [[-1, -1], [1, -1], [-1, 1], [1, 1], [0, 0]].map(([a, b]) => c.clone().addScaledVector(right, a * w * 0.48).addScaledVector(up, b * h * 0.48))
      const clear = (eyePos: THREE.Vector3) => corners.every((k) => {
        const d = eyePos.clone().sub(k)
        ray.set(k, d.clone().normalize())
        ray.far = d.length()
        return ray.intersectObjects(solid, false).length === 0
      })
      let pos = c.clone()
      for (const side of [0, 0.18, -0.18, 0.34, -0.34]) {
        pos = c.clone().addScaledVector(n.clone().addScaledVector(up, -0.12).addScaledVector(right, side).normalize(), dist)
        if (clear(pos)) break
      }
      // aim a touch below centre: the sheet sits above the wayfinding strip
      const aim = c.clone().addScaledVector(up, -0.05 * h)
      const q = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().lookAt(pos, aim, up))
      return { pos, quat: q, fov: FOV }
    }
    anchors.worldRead = readAnchor('JT_Mus_WorldPlacard')
    anchors.torontoRead = readAnchor('JT_Mus_TorPlacard')
    m.anchors = anchors
    m.walk = makeWalk(meta.instruments ?? [], meta.mx, meta.seats ?? [])
    for (const st of meta.seats ?? []) { const c = nodes[`COL_MusSeat_${st.id}`]; if (c) c.userData.pick = { kind: 'seat', id: st.id } }
    // placards (canvas)
    const canvasTex = (w: number, h: number, flipY = true) => {
      const c = document.createElement('canvas')
      c.width = w
      c.height = h
      const t = new THREE.CanvasTexture(c)
      t.colorSpace = THREE.SRGBColorSpace
      t.flipY = flipY
      t.anisotropy = gl.capabilities.getMaxAnisotropy()
      return { c, t, g: c.getContext('2d')! }
    }
    const placard = (name: string) => {
      const mesh = get<THREE.Mesh>(name)
      const tex = canvasTex(1792, 1280)
      if (mirrored.has(name)) { tex.t.repeat.x = -1; tex.t.offset.x = 1 }
      // paper under the reading light: a little self-glow keeps it legible in the dim wing
      mesh.material = new THREE.MeshStandardMaterial({ map: tex.t, roughness: 0.82, envMapIntensity: 0.9,
        emissive: new THREE.Color('#ffffff'), emissiveMap: tex.t, emissiveIntensity: 0.22 })
      return tex
    }
    const worldPlacard = placard('JT_Mus_WorldPlacard')
    const torPlacard = placard('JT_Mus_TorPlacard')
    // the photograph row (the outer wall's four frames)
    const portraits = TORONTO_ROW.map((item, k) => {
      const mesh = get<THREE.Mesh>(`JT_Mus_Portrait${k}`)
      const tex = canvasTex(640, 880, false)
      mesh.material = new THREE.MeshStandardMaterial({ map: tex.t, roughness: 0.55, emissive: new THREE.Color('#ffffff'),
        emissiveMap: tex.t, emissiveIntensity: 0.25 })
      mesh.userData.pick = item.link
      get(`COL_MusPortrait${k}`).userData.pick = item.link
      const img = new Image()
      const out = { item, tex, img: null as HTMLImageElement | null }
      img.onload = () => { out.img = img; drawRowPhoto(tex.g, item, img, credits[item.id], false); tex.t.needsUpdate = true }
      img.src = credits[item.id]?.file ?? ''
      return out
    })
    // exhibits: photographs on their baked carriers, wall text on canvas, a reading viewpoint per exhibit
    const VFOV = 36
    const exhibitTex: { id: string; text?: ReturnType<typeof canvasTex> }[] = []
    for (const ex of meta.exhibits ?? []) {
      const c = b2t(ex.group.c[0], ex.group.c[1], ex.group.c[2])
      const n = b2t(ex.normal[0], ex.normal[1], ex.normal[2]).normalize()
      const tv = Math.tan(THREE.MathUtils.degToRad(VFOV / 2))
      // frame + lamp + wall text with room for the controls under the view
      const d = Math.max(1.0, Math.max((ex.group.h + 0.3) / 2 / tv, ex.group.w / 2 / (tv * viewAspect)) * 1.3)
      const pos = c.clone().addScaledVector(n, d)
      // aim a little below centre: the exhibit sits higher in frame, clear of the wayfinding strip at the bottom
      const aim = c.clone().add(new THREE.Vector3(0, -0.07 * d, 0))
      const q = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().lookAt(pos, aim, new THREE.Vector3(0, 1, 0)))
      anchors[`ex:${ex.id}`] = { pos, quat: q, fov: VFOV }
      const col = nodes[`COL_MusEx_${ex.id}`]
      if (col) col.userData.pick = { kind: 'exhibit', id: ex.id }
      const pic = nodes[`JT_Mus_ExPic_${ex.id}`] as THREE.Mesh | undefined
      const credit = credits[ex.id]
      if (pic && credit) {
        const mat = pic.material as THREE.MeshStandardMaterial
        mat.color.set('#ffffff')
        new THREE.ImageBitmapLoader().setOptions(low ? { resizeWidth: Math.min(1024, credit.width), resizeQuality: 'high' } : {}).load(credit.file, (bmp) => { // decoded off the main thread
          const t = new THREE.Texture(bmp)
          t.needsUpdate = true
          t.colorSpace = THREE.SRGBColorSpace
          t.flipY = false
          t.anisotropy = gl.capabilities.getMaxAnisotropy()
          mat.map = t
          mat.needsUpdate = true
        })
      }
      const txt = nodes[`JT_Mus_ExText_${ex.id}`] as THREE.Mesh | undefined
      let text: ReturnType<typeof canvasTex> | undefined
      if (txt && ex.text) {
        // 1200 px per metre: sharp at viewing distance (the reading card carries the text at full size)
        const k = Math.min(low ? 800 : 1200, (low ? 1024 : 1536) / Math.max(ex.text.w, ex.text.h))
        text = canvasTex(Math.round(ex.text.w * k), Math.round(ex.text.h * k), false)
        const mat = txt.material as THREE.MeshStandardMaterial
        mat.color.set('#ffffff')
        mat.map = text.t
        mat.needsUpdate = true
      }
      exhibitTex.push({ id: ex.id, text })
    }
    get('COL_MusWorldPlacard').userData.pick = { kind: 'read', id: 'world' }
    get('COL_MusTorPlacard').userData.pick = { kind: 'read', id: 'toronto' }

    // dynamic brass: timeline markers, world pins, Toronto venue pins
    const brass = new THREE.MeshStandardMaterial({ color: '#d6b37a', metalness: 1, roughness: 0.22 })
    const jewelMat = () => new THREE.MeshStandardMaterial({ color: '#5a2a08', emissive: new THREE.Color('#ffae4a'), emissiveIntensity: 0.4, roughness: 0.3 })
    const group = new THREE.Group()
    group.userData.musRuntime = true
    gltf.scene.add(group)
    // the legendary instruments on their plinths: long axis along the wall, the visitor's side toward the room
    const instruments: Placed[] = []
    const studio = pmrem(gl).fromScene(new RoomEnvironment(), 0.04).texture
    for (const inst of museumInstruments) {
      const pl = meta.instruments?.find((p) => p.id === inst.id)
      if (!pl) continue
      const at = b2t(pl.c[0], pl.c[1], pl.c[2])
      const face = b2t(pl.face[0], pl.face[1], pl.face[2]).normalize()
      // model: long axis +x, visitor side +z -> turn so +x runs along the wall and +z faces the room
      const yaw = Math.atan2(face.x, face.z)
      const p = place(instGltf.scene, inst, at, yaw, face.clone().add(new THREE.Vector3(0, 0.95, 0)), 1.35, inst.where, { env: studio, envIntensity: 0.55 })
      if (!p) continue
      group.add(p.obj)
      anchors[`in:${inst.id}`] = p.pose
      instruments.push(p)
      // the plinth's own pick volume opens it too (a click anywhere on the display)
      const col = nodes[`COL_MusInst_${inst.id.charAt(0).toUpperCase()}${inst.id.slice(1)}`]
      if (col) col.userData.pick = { kind: 'instrument', id: inst.id }
    }
    const pin = (at: THREE.Vector3, id: string, kind: string, r = 0.014) => {
      const g = new THREE.Group()
      const shaft = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.22, r * 0.22, r * 2.2, 12), brass)
      shaft.rotation.x = Math.PI / 2
      shaft.position.z = r * 1.1
      const head = new THREE.Mesh(new THREE.SphereGeometry(r, 24, 16), brass)
      head.position.z = r * 2.3
      const jewel = new THREE.Mesh(new THREE.SphereGeometry(r * 0.55, 16, 12), jewelMat())
      jewel.position.z = r * 3.05
      g.add(shaft, head, jewel)
      g.position.copy(at)
      g.traverse((o) => (o.userData.pick = { kind, id }))
      group.add(g)
      return { g, jewel }
    }
    const w = meta.world
    const worldPins = WORLD.map((c) => {
      const x = w.cx + (c.location.lon / 180) * (w.w / 2)
      const z = w.cz + ((c.location.lat - (w.lat0 + w.lat1) / 2) / (w.lat1 - w.lat0)) * w.h
      return { id: c.id, ...pin(b2t(x + (Math.random() - 0.5) * 0.02, w.y, z), c.id, 'world') }
    })
    const tl = meta.timeline
    const markers = WORLD.map((c) => {
      const x = tl.x0 + ((c.year - tl.year0) / (tl.year1 - tl.year0)) * (tl.x1 - tl.x0)
      const g = new THREE.Group()
      const body = new THREE.Mesh(new THREE.BoxGeometry(0.034, 0.07, 0.03), brass)
      const cap = new THREE.Mesh(new THREE.SphereGeometry(0.009, 16, 12), jewelMat())
      cap.position.set(0, 0.044, 0.006)
      g.add(body, cap)
      g.position.copy(b2t(x, tl.y - 0.01, tl.z + 0.02))
      g.traverse((o) => (o.userData.pick = { kind: 'world', id: c.id }))
      const label = canvasTex(256, 96)
      label.g.fillStyle = '#d6b37a'
      label.g.font = '600 64px Jost, sans-serif'
      label.g.textAlign = 'center'
      label.g.fillText(String(c.year), 128, 70)
      label.t.needsUpdate = true
      const lab = new THREE.Mesh(new THREE.PlaneGeometry(0.09, 0.034), new THREE.MeshBasicMaterial({ map: label.t, transparent: true }))
      lab.position.set(0, -0.06, 0.017)
      g.add(lab)
      group.add(g)
      return { id: c.id, g, cap }
    })
    const t = meta.toronto
    const venueById = new Map(venues.map((v) => [v.id, v]))
    const torPins = CHAPTERS.filter((c) => c.venueId && venueById.get(c.venueId)).map((c) => {
      const v = venueById.get(c.venueId!)!
      const [px, py] = project(t, v.lon, v.lat)
      return { id: c.id, ...pin(b2t(t.cx + px, t.y, t.cz + py), c.id, 'chapter', 0.016) }
    })
    // real-time lights: the condensed Cycles rig exported by bake_museum.py (web_lights). On baked surfaces the shader
    // keeps only their specular (the lightmap is the diffuse); dynamic objects get full lighting. Units match the bake:
    // point / spot P/(4 pi) W/sr, rect radiance P/(pi A), all x EXPOSURE.
    // the view from the Toronto window: the modelled skyline at night over a reflective lake (not a photograph)
    const outside = buildExterior(skyGltf.scene, { reflective: !low, cheap: low, maxAniso: gl.capabilities.getMaxAnisotropy() })
    outside.root.position.copy(b2t(meta.mx + 2.7, 7.55, -8)) // centred on the wing's viewpoint; the shore ~2 deg below the eye
    // the model's skyline is laid out round its own viewpoint, the downtown core ~33 deg east of north: turned so the tower
    // and the Financial District stand in the window from wherever the visitor looks out (see TORONTO_VIEW_TURN)
    outside.root.rotation.y = THREE.MathUtils.degToRad(TORONTO_VIEW_TURN)
    // the window glass: a few percent of room reflection at night, not a mirror of the warm wall
    const wg = nodes.JT_Mus_TorWindowGlass as THREE.Mesh | undefined
    if (wg) {
      wg.material = (wg.material as THREE.MeshStandardMaterial).clone()
      const gm = wg.material as THREE.MeshStandardMaterial
      gm.envMapIntensity = 0.35 // (no diffuse: glass reflects, it does not glow under the room lights)
      gm.color.set('#000000')
      gm.opacity = 0.14
      gm.roughness = 0.22 // a soft sheen: the room lamps do not sit in the glass as sharp mirror images
      gm.depthWrite = false
    }
    gltf.scene.add(outside.root)
    // Fixed light SLOTS (1 point, 1 spot, 3 rect) re-aimed at the current room's set: the camera sees one room at a time,
    // and a constant light count keeps the shaders small (three unrolls every light loop) and never recompiles.
    const lights = new THREE.Group()
    lights.userData.musRuntime = true
    const toThree = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), -Math.PI / 2) // Blender Z-up -> Y-up
    const slots = {
      point: [new THREE.PointLight('#fff', 0, 14, 2)],
      // (the low tier keeps the chandelier only: on integrated GPUs every real-time light costs ~20 % of the frame,
      // and on baked surfaces they only add highlights - the lightmap carries the lighting)
      spot: low ? [] : [new THREE.SpotLight('#fff', 0, 10, 0.6, 0.5, 2)],
      rect: (low ? [] : [0, 1, 2]).map(() => new THREE.RectAreaLight('#fff', 0, 1, 1)),
    }
    for (const l of [...slots.point, ...slots.spot, ...slots.rect]) lights.add(l)
    if (slots.spot[0]) lights.add(slots.spot[0].target)
    const byName = new Map((bakeMeta.lights ?? []).map((L) => [L.name, L]))
    const SETS: Record<'vestibule' | 'world' | 'toronto', string[]> = {
      vestibule: ['JT_MusL_Chandelier', 'JT_MusL_Ante', 'JT_MusL_Picture', 'JT_MusL_Sign-1', 'JT_MusL_Sign1'],
      world: ['JT_MusL_Chandelier', 'WorldTrack', 'JT_MusL_WorldFill', 'JT_MusL_Vitrine'],
      toronto: ['JT_MusL_Chandelier', 'TorontoTrack', 'JT_MusL_TorontoFill', 'Portraits'],
    }
    type Slot = { l: THREE.Light; target: number }
    const applySet = (room: keyof typeof SETS): Slot[] => {
      const used: Slot[] = []
      const free = { point: [...slots.point], spot: [...slots.spot], rect: [...slots.rect] }
      for (const name of SETS[room]) {
        const L = byName.get(name)
        const l = L && free[L.type].shift()
        if (!L || !l) continue
        l.color.setRGB(L.color[0], L.color[1], L.color[2])
        l.position.copy(b2t(L.pos[0], L.pos[1], L.pos[2]))
        let target: number
        if (L.type === 'rect') {
          const r = l as THREE.RectAreaLight
          ;[r.width, r.height] = L.size!
          const [qw, qx, qy, qz] = L.quat!
          r.quaternion.copy(toThree).multiply(new THREE.Quaternion(qx, qy, qz, qw))
          target = (L.power / (Math.PI * r.width * r.height)) * EXPOSURE
        } else {
          target = (L.power / (4 * Math.PI)) * EXPOSURE
          if (L.type === 'spot') {
            const sp = l as THREE.SpotLight
            sp.angle = (L.angle ?? 1) / 2
            sp.penumbra = L.blend ?? 0.5
            sp.target.position.copy(l.position).add(b2t(L.dir![0], L.dir![1], L.dir![2]))
            sp.target.updateMatrixWorld()
          }
        }
        used.push({ l, target })
      }
      for (const l of [...free.point, ...free.spot, ...free.rect]) l.intensity = 0
      return used
    }
    gltf.scene.add(lights)
    // HDR ceiling: three's point lights have no radius, so a 300 W chandelier on polished marble makes a 700x
    // pin-point; inside the half-float post chain (N8AO variance) that overflows to Inf -> NaN and blacks out the frame.
    // Cycles' drum shade gives a broad highlight instead (it is in the room panorama), so cap direct output at 48.
    gltf.scene.traverse((o) => {
      const mesh = o as THREE.Mesh
      if (!mesh.isMesh) return
      for (const mat of (Array.isArray(mesh.material) ? mesh.material : [mesh.material]) as THREE.Material[]) {
        if (capped.has(mat)) continue
        capped.add(mat)
        const prev = mat.onBeforeCompile.bind(mat)
        mat.onBeforeCompile = (sh, r) => {
          prev(sh, r)
          sh.fragmentShader = sh.fragmentShader.replace('#include <tonemapping_fragment>',
            'gl_FragColor.rgb = any( isnan( gl_FragColor.rgb ) ) || any( isinf( gl_FragColor.rgb ) ) ? vec3( 0.0 ) : min( gl_FragColor.rgb, vec3( 48.0 ) );\n#include <tonemapping_fragment>')
        }
        const key = mat.customProgramCacheKey.bind(mat)
        mat.customProgramCacheKey = () => key() + '|hdrcap'
        mat.needsUpdate = true
      }
    })
    // environments
    // room panoramas: the vestibule's now (the shaders need an environment), the wings' one per frame after
    const pm = pmrem(gl) // (shared with the room: its blur program is already compiled)
    const first = pm.fromEquirectangular(envs[0]).texture
    const env: Record<'vestibule' | 'world' | 'toronto', THREE.Texture> = { vestibule: first, world: first, toronto: first }
    requestAnimationFrame(() => {
      env.world = pm.fromEquirectangular(envs[1]).texture
      requestAnimationFrame(() => { env.toronto = pm.fromEquirectangular(envs[2]).texture })
    })
    return {
      doorL: get('JT_Mus_DoorRig_L'), doorR: get('JT_Mus_DoorRig_R'),
      handles: (['L', 'R'] as const).flatMap((s) => [-1, 1].map((f) => ({ s, o: get(`JT_Mus_HandleRig_${s}${f}`) }))),
      latches: { L: get('JT_Mus_Latch_L'), R: get('JT_Mus_Latch_R') }, latchX: { L: get('JT_Mus_Latch_L').position.x, R: get('JT_Mus_Latch_R').position.x },
      warm: createWarmup(gl, gltf.scene), outside, instruments, worldPlacard, torPlacard, portraits, worldPins, markers, torPins, env, lights, applySet, exhibitTex,
      lightRoom: '' as string, lightSet: [] as Slot[], lightT: 0,
    }
  }, [gltf, skyGltf, instGltf, aniso, settings, gl, venues, lm, envs, bakeMeta, meta, credits])

  // ready for the door sequence once everything is built
  useEffect(() => {
    if (!rig) return
    let live = true
    // (begins ~1.5 s after the room is revealed - its first frames stay clean - or at once if the museum is entered)
    const begin = () => {
    // compile every museum program up front (KHR_parallel_shader_compile) so the door choreography never plays
    // through a multi-second first-frame stall; the controller waits for this before the fade
    let root: THREE.Object3D = gltf.scene
    while (root.parent) root = root.parent
    // ...with the museum's own light set (the room's lights are hidden while inside, see Experience)
    const wasVisible = gltf.scene.visible
    const prevEnv = scene.environment
    const roomLights: THREE.Light[] = []
    root.traverse((o) => { if ((o as THREE.Light).isLight && o.visible && !rig.lights.getObjectById(o.id)) roomLights.push(o as THREE.Light) })
    for (const l of roomLights) l.visible = false
    gltf.scene.visible = true
    scene.environment = rig.env.vestibule
    // the composer renders the scene into a half-float target (linear, no tone mapping in the material): compile for
    // that target, or the first real frame compiles every program a second time
    const prevTarget = gl.getRenderTarget()
    const post = TIERS[useJazz.getState().tier].post
    const probeTarget = post ? new THREE.WebGLRenderTarget(4, 4, { type: THREE.HalfFloatType }) : null
    if (probeTarget) gl.setRenderTarget(probeTarget)
    // target = an empty stand-in scene carrying only the environment: three gathers lights from BOTH the target and the
    // compiled object, so passing the real root (the museum's parent) would count the museum lights twice
    const stand = new THREE.Scene()
    stand.environment = rig.env.vestibule
    // (the stand carries copies of the museum's light slots: the batches are compiled with the museum's light set)
    for (const l of rig.lights.children) if ((l as THREE.Light).isLight) stand.add(l.clone())
    gl.setRenderTarget(prevTarget)
    const compiled = compileInBatches(gl, gltf.scene, camera, stand,
      () => { gl.setRenderTarget(probeTarget); scene.environment = rig.env.vestibule },
      () => { gl.setRenderTarget(prevTarget); scene.environment = prevEnv }, 2, () => live)
      .finally(() => probeTarget?.dispose())
    gltf.scene.visible = wasVisible
    scene.environment = prevEnv
    for (const l of roomLights) l.visible = true
    // then upload every texture the museum uses to the GPU, one per frame (KTX2 materials, lightmaps, the city):
    // otherwise they all upload on the first frame that draws them - a visible hitch as the door opens
    const textures = new Set<THREE.Texture>()
    gltf.scene.traverse((o) => {
      const mesh = o as THREE.Mesh
      if (!mesh.isMesh) return
      for (const mat of (Array.isArray(mesh.material) ? mesh.material : [mesh.material]) as unknown as Record<string, unknown>[]) {
        for (const v of Object.values(mat)) if ((v as THREE.Texture)?.isTexture) textures.add(v as THREE.Texture)
      }
    })
    if (musUniforms.musLmOpen.value) textures.add(musUniforms.musLmOpen.value)
    const uploads = [...textures]
    const uploaded = new Promise<void>((done) => {
      const step = () => {
        if (!live) return done()
        const t = uploads.shift()
        if (!t) return done()
        try { gl.initTexture(t) } catch { /* not ready yet (still decoding): uploads on first use instead */ }
        requestAnimationFrame(step)
      }
      requestAnimationFrame(step)
    })
    void Promise.all([compiled.catch(() => {}), uploaded]).then(() => {
      if (!live) return
      if (!m.readyP) m.readyP = Promise.resolve()
      else m.ready?.()
    })
    }
    let loadedAt = 0
    const gate = window.setInterval(() => {
      if (!live) return
      if (useJazz.getState().loaded && !loadedAt) loadedAt = performance.now()
      if (m.readyP || (loadedAt && performance.now() - loadedAt > 1500)) { window.clearInterval(gate); begin() }
    }, 100)
    if (import.meta.env.DEV) {
      // test hook: controller state + screen position of a museum pin / marker / node
      const w = window as unknown as { __jazz?: Record<string, unknown> }
      w.__jazz = { ...w.__jazz, museum, museumState: m, museumWalkState: () => m.walk?.st, museumRig: rig, museumScene: gltf.scene, museumCamera: camera, museumGl: gl, THREE, museumProject: (key: string) => {
        const [kind, id] = key.split(':')
        const o = kind === 'world' ? rig.worldPins.find((p) => p.id === id)?.g : kind === 'marker' ? rig.markers.find((p) => p.id === id)?.g
          : kind === 'chapter' ? rig.torPins.find((p) => p.id === id)?.g : gltf.scene.getObjectByName(key)
        if (!o) return null
        const v = o.getWorldPosition(new THREE.Vector3()).project(camera)
        const r = gl.domElement.getBoundingClientRect()
        return { x: r.left + (v.x * 0.5 + 0.5) * r.width, y: r.top + (-v.y * 0.5 + 0.5) * r.height }
      } }
    }
    return () => { live = false; window.clearInterval(gate); m.readyP = null }
  }, [rig, camera, gl, gltf, scene])

  // repaint placards / portraits on selection
  useEffect(() => {
    if (!rig) return
    const paint = () => {
      const s = useJazz.getState()
      drawPlacard(rig.worldPlacard.g, 'world', s.museumWorld)
      rig.worldPlacard.t.needsUpdate = true
      const tsel = s.museumToronto
      drawPlacard(rig.torPlacard.g, 'toronto', tsel)
      rig.torPlacard.t.needsUpdate = true
      for (const p of rig.portraits) {
        drawRowPhoto(p.tex.g, p.item, p.img, credits[p.item.id], p.item.link.id === tsel)
        p.tex.t.needsUpdate = true
      }
    }
    paint()
    // wall texts: one panel per frame (painting all at once was a long frame in the listening room during prefetch)
    let queue: typeof rig.exhibitTex = []
    let raf = 0
    const pump = () => {
      const e = queue.shift()
      if (e?.text) {
        drawWallText(e.text.g, e.id, credits[e.id])
        e.text.t.needsUpdate = true
      }
      raf = queue.length ? requestAnimationFrame(pump) : 0
      // the room's loading screen waits for the walls too: painting them in the first seconds after the reveal was a
      // run of long frames on integrated GPUs
      if (!raf) markBuilt()
    }
    const paintWalls = () => {
      queue = rig.exhibitTex.filter((e) => e.text)
      if (!raf) raf = requestAnimationFrame(pump)
    }
    // load the exact faces the canvases use first (async): a face's first use in a canvas is set up synchronously
    // (a ~0.5 s frame per panel), and painting before the fonts arrive means painting everything twice
    const faces = ['500 40px "Cormorant Garamond"', '600 40px "Cormorant Garamond"', 'italic 500 40px "Cormorant Garamond"',
      '500 20px Jost', '400 20px Jost']
    void Promise.all(faces.map((x) => document.fonts?.load(x).catch(() => []))).then(() => { paint(); paintWalls() })
    const unsub = useJazz.subscribe((s, p) => (s.museumWorld !== p.museumWorld || s.museumToronto !== p.museumToronto) && paint())
    return () => { unsub(); cancelAnimationFrame(raf) }
  }, [rig, credits])

  // keyboard: Escape steps back out of the museum (captured before the room's own handler)
  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || useJazz.getState().station !== 'museum' || useJazz.getState().panel) return
      e.stopImmediatePropagation()
      void museum.back()
    }
    window.addEventListener('keydown', k, true)
    return () => window.removeEventListener('keydown', k, true)
  }, [])

  // ---- interaction
  const pick = (e: ThreeEvent<PointerEvent>) => {
    for (const i of e.intersections) {
      const p = i.object.userData.pick as { kind: string; id: string } | undefined
      if (p) return p
    }
    return null
  }
  const onMove = (e: ThreeEvent<PointerEvent>) => {
    if (useJazz.getState().station !== 'museum' || isOverConsole(e.clientY, gl.domElement)) return
    e.stopPropagation()
    const s = useJazz.getState()
    const p = pick(e)
    const nav = s.museumRoom === 'vestibule' && -e.point.z > 5.4 && p?.kind !== 'exhibit'
    document.body.style.cursor = p || nav ? 'pointer' : ''
    const h = p ? `${p.kind}:${p.id}` : nav ? (e.point.x < meta.mx ? 'nav:world' : 'nav:toronto') : null
    if (s.hovered !== h) s.set({ hovered: h })
  }
  const onUp = (e: ThreeEvent<PointerEvent>) => {
    const s = useJazz.getState()
    if (s.station !== 'museum' || m.busy || isOverConsole(e.clientY, gl.domElement)) return
    e.stopPropagation()
    if (s.museumRoom === 'explore' && m.walk?.st.dragged) return // that press was a look-drag
    const p = pick(e)
    audio.ensure()
    if (p?.kind === 'exhibit') { void museum.view(p.id); return }
    if (p?.kind === 'instrument') { void museum.viewInstrument(p.id); return }
    if (p?.kind === 'seat') { void museum.sit(p.id); return }
    if (s.museumRoom === 'vestibule') {
      if (-e.point.z > 5.4) void museum.go(e.point.x < meta.mx ? 'world' : 'toronto')
      return
    }
    if (!p) return
    const walk = (chapter: string) => { const ex = exhibitForChapter.get(chapter); if (ex) void museum.view(ex) }
    if (p.kind === 'world') { s.set({ museumWorld: p.id }); audio.sfx('slide'); walk(p.id) }
    else if (p.kind === 'chapter' || p.kind === 'figure') { s.set({ museumToronto: p.id }); audio.sfx('slide'); walk(p.id) }
    else if (p.kind === 'read') void museum.go(s.museumRoom.endsWith('read') ? (p.id as MuseumRoom) : (`${p.id}-read` as MuseumRoom))
  }

  // ---- per frame: tweens, door, camera, lighting
  useFrame((state, dt) => {
    if (!rig) return
    m.now = performance.now()
    for (const tw of [...m.tweens]) {
      const k = Math.min(1, (m.now - tw.t0) / tw.ms)
      ;(m as unknown as Record<string, number>)[tw.key] = tw.from + (tw.to - tw.from) * tw.ease(k)
      if (k >= 1) { m.tweens.splice(m.tweens.indexOf(tw), 1); tw.done() }
    }
    if (m.fadeEl) {
      m.fadeEl.style.opacity = String(m.fade)
      m.fadeEl.style.pointerEvents = m.fade > 0.01 ? 'auto' : 'none'
    }
    const s = useJazz.getState()
    const inside = s.station === 'museum'
    gltf.scene.visible = inside
    gltf.scene.matrixWorldAutoUpdate = inside // a hidden museum is not walked every frame
    if (!inside) {
      if (!m.busy) rig.warm(m.now, // (paused once the door sequence starts: uploads would hitch the fade)
        musUniforms.musLmOpen.value ? [musUniforms.musLmOpen.value] : [])
      if (m.savedEnv !== undefined) { scene.environment = m.savedEnv; m.savedEnv = undefined }
      return
    }
    if (m.savedEnv === undefined) m.savedEnv = scene.environment
    // door hardware
    // the leaves swing out toward the visitor (the antechamber side, as a public room's doors open); each lever
    // points toward its hinge and is pressed down: free end down about the axis through the door
    const open = THREE.MathUtils.degToRad(102) * m.door
    rig.doorL.rotation.y = -open
    rig.doorR.rotation.y = open
    for (const h of rig.handles) h.o.rotation.z = (h.s === 'L' ? 1 : -1) * THREE.MathUtils.degToRad(34) * m.handle
    rig.latches.L.position.x = rig.latchX.L - 0.012 * m.latch * (1 - m.door * 0)
    rig.latches.R.position.x = rig.latchX.R + 0.012 * m.latch
    // baked light: closed -> open as the leaves clear the opening (light spills in early)
    const spill = THREE.MathUtils.smoothstep(m.door, 0, 0.55)
    const sc = bakeMeta.maps
    musUniforms.uMusW.value.set((1 - spill) * sc.closed.scale * Math.PI * EXPOSURE, spill * sc.open.scale * Math.PI * EXPOSURE)
    const room = spaceOf(s.museumRoom, s.museumExhibit)
    scene.environment = rig.env[room]
    if (rig.lightRoom !== room) {
      rig.lightRoom = room
      rig.lightSet = rig.applySet(room)
      rig.lightT = m.door > 0.5 ? 0 : 1 // inside: highlights ease in; at the door: already on
    }
    rig.lightT = Math.min(1, rig.lightT + dt / 0.6)
    for (const sl of rig.lightSet) sl.l.intensity = sl.target * rig.lightT
    ;(scene as THREE.Scene & { environmentIntensity: number }).environmentIntensity = EXPOSURE
    // selection glow
    const t = state.clock.elapsedTime
    // the time switch works in the museum too: the window's sky, city and lake follow it (the interior is lamp-lit)
    const want = s.resolvedMode === 'DAY' ? [1, 0, 0] : s.resolvedMode === 'DUSK' ? [0, 1, 0] : [0, 0, 1]
    const kw = s.reducedMotion ? 1 : Math.min(1, dt * 1.2)
    todW.set(todW.x + (want[0] - todW.x) * kw, todW.y + (want[1] - todW.y) * kw, todW.z + (want[2] - todW.z) * kw)
    rig.outside.update(t, todW)
    for (const p of rig.instruments) sway(p, s.museumRoom === 'instrument' && s.instrument === p.inst.id, t, dt)
    for (const p of rig.worldPins) (p.jewel.material as THREE.MeshStandardMaterial).emissiveIntensity = p.id === s.museumWorld ? 5 + Math.sin(t * 4) : s.hovered === `world:${p.id}` ? 2.5 : 0.5
    for (const mk of rig.markers) {
      const on = mk.id === s.museumWorld
      ;(mk.cap.material as THREE.MeshStandardMaterial).emissiveIntensity = on ? 5 : s.hovered === `world:${mk.id}` ? 2.5 : 0.4
      mk.g.position.y += ((on ? 0.012 : 0) - (mk.g.userData.lift ?? 0)) * Math.min(1, dt * 10)
      mk.g.userData.lift = (mk.g.userData.lift ?? 0) + ((on ? 0.012 : 0) - (mk.g.userData.lift ?? 0)) * Math.min(1, dt * 10)
    }
    for (const p of rig.torPins) (p.jewel.material as THREE.MeshStandardMaterial).emissiveIntensity = p.id === s.museumToronto ? 5 + Math.sin(t * 4) : s.hovered === `chapter:${p.id}` ? 2.5 : 0.5
    // camera
    if (!m.pose) m.pose = { ...m.anchors.door }
    if (s.museumRoom === 'explore' && m.walk?.st.on && !m.camT) {
      const p = { pos: m.pose.pos.clone(), quat: m.pose.quat.clone(), fov: 46 }
      m.walk.step(Math.min(dt, 0.05), p)
      m.pose = p
    }
    if (m.camT) {
      const k = Math.min(1, (m.now - m.camT.t0) / m.camT.ms)
      const e = easeIO(k)
      m.pose = { pos: m.camT.from.pos.clone().lerp(m.camT.to.pos, e), quat: m.camT.from.quat.clone().slerp(m.camT.to.quat, e),
        fov: THREE.MathUtils.lerp(m.camT.from.fov, m.camT.to.fov, e) }
      if (k >= 1) { const d = m.camT.done; m.camT = null; d() }
    }
    const cam = camera as THREE.PerspectiveCamera
    const viewH = Math.max(1, size.height - consoleHeightPx())
    const aspectFix = Math.max(1, (16 / 9) / (size.width / viewH))
    cam.position.copy(m.pose.pos)
    cam.quaternion.copy(m.pose.quat)
    cam.fov = Math.min(80, THREE.MathUtils.radToDeg(2 * Math.atan(Math.tan(THREE.MathUtils.degToRad(m.pose.fov) / 2) * aspectFix)))
    cam.aspect = size.width / viewH
    // the reading card takes the right side in an exhibit view: slide the picture left beside it
    const card = (s.museumRoom === 'exhibit' || s.museumRoom === 'instrument' || s.museumRoom.endsWith('-read')) && size.width >= 900 ? EXHIBIT_CARD_PX + 40 : 0
    m.shift += (card / 2 - m.shift) * (s.reducedMotion ? 1 : Math.min(1, dt * 6))
    cam.setViewOffset(size.width, viewH, m.shift, 0, size.width, size.height)
    cam.updateProjectionMatrix()
  })

  if (!rig) return null
  return <primitive object={gltf.scene} onPointerMove={onMove} onPointerUp={onUp}
    onPointerOut={() => (document.body.style.cursor = '')} />
}

/** Full-screen black for the door transition's dip (no content, purely a fade). */
export function MuseumFade() {
  return <div className="museum-fade" aria-hidden ref={(el) => { m.fadeEl = el }} />
}
