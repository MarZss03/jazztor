// Free exploration of the museum: walk anywhere on the floor at eye height and look around, instead of the guided
// stops. Desktop: W A S D / arrow keys to walk, drag (or Q / E) to turn, the wheel to step forward and back.
// Touch: a virtual stick (bottom left) to walk, drag anywhere else to look. Collision is a 2D floor plan built from the
// museum's own dimensions (blender/scripts/build_museum.py) - walls, arches, plinths and furniture as boxes and
// circles - so the visitor slides along walls and never walks through an exhibit. Clicking a picture, instrument or
// placard still opens it; leaving one returns to where you stood.
import * as THREE from 'three'

// museum-local metres (Blender: x across, y into the building); MX is the museum's x offset in the scene
const VW = 3.6, VD = 6.6, T = 0.25, ARCH_X = 2.45, ARCH_W = 1.9
const WING = { x0: 0.7, x1: 6.2, y0: 6.6, y1: 10.8 }
const R = 0.45 // the visitor's radius (a comfortable distance: never face-first into a wall or a frame)
export const EYE = 1.62
const SEATED_EYE = 1.14
export type Seat = { id: string; c: number[]; w: number; d: number; face: number[] }

type Rect = { x0: number; x1: number; y0: number; y1: number }
type Disc = { x: number; y: number; r: number }

/** where you may stand: the vestibule, the two arches, the two wings (minus the visitor's radius) */
const FLOOR: Rect[] = [
  { x0: -VW, x1: VW, y0: 0.15, y1: VD },
  ...[-1, 1].map((s) => ({ x0: s * ARCH_X - ARCH_W / 2 + 0.12, x1: s * ARCH_X + ARCH_W / 2 - 0.12, y0: VD - R - 0.15, y1: VD + T + R + 0.15 })), // overlaps both rooms
  { x0: -WING.x1, x1: -WING.x0, y0: VD + T, y1: WING.y1 },
  { x0: WING.x0, x1: WING.x1, y0: VD + T, y1: WING.y1 },
]
/** what stands on the floor (plinths, table, benches, lecterns, vitrine, globe, drawers) */
function obstacles(plinths: { c: number[] }[], mx: number): { rects: Rect[]; discs: Disc[] } {
  const rects: Rect[] = [
    { x0: VW - 0.66, x1: VW, y0: 2.7, y1: 4.1 },                                   // vestibule bench (east)
    { x0: -WING.x0 - 0.75, x1: -WING.x0, y0: 7.9, y1: 9.5 },                       // world vitrine
    { x0: -ARCH_X - 0.8 - 0.75, x1: -ARCH_X - 0.8 + 0.75, y0: WING.y1 - 1.9, y1: WING.y1 - 1.4 }, // world bench (before the map)
    { x0: WING.x0, x1: WING.x0 + 0.7, y0: 7.72, y1: 9.67 },                         // toronto drawers
    { x0: 4.7, x1: 5.6, y0: WING.y0 + 1.2, y1: WING.y0 + 2.0 },                     // toronto club chair
    ...plinths.map((p) => ({ x0: p.c[0] - mx - 0.3, x1: p.c[0] - mx + 0.3, y0: p.c[1] - 0.45, y1: p.c[1] + 0.45 })),
  ]
  const discs: Disc[] = [
    { x: 0, y: 3.35, r: 0.7 },                     // pedestal table
    { x: -2.65, y: 1.3, r: 0.32 },                 // globe
    { x: -ARCH_X + 0.6, y: WING.y1 - 1.35, r: 0.36 }, // world lectern
    { x: ARCH_X - 0.6, y: WING.y1 - 1.45, r: 0.36 },  // toronto lectern
  ]
  return { rects, discs }
}

export function makeWalk(plinths: { c: number[] }[], mx: number, seats: Seat[] = []) {
  const ob = obstacles(plinths, mx)
  const inside = (x: number, y: number) => FLOOR.some((f) => x >= f.x0 + R && x <= f.x1 - R && y >= f.y0 + R && y <= f.y1 - R)
    // the arch passages are narrow: inside them only the side margins count (they join the rooms front and back)
    || FLOOR.slice(1, 3).some((f) => x >= f.x0 + R * 0.5 && x <= f.x1 - R * 0.5 && y >= f.y0 && y <= f.y1)
  const blocked = (x: number, y: number) => !inside(x, y)
    || ob.rects.some((r) => x > r.x0 - R && x < r.x1 + R && y > r.y0 - R && y < r.y1 + R)
    || ob.discs.some((d) => Math.hypot(x - d.x, y - d.y) < d.r + R)

  /** nearest free position: out of discs (radially) and boxes (shortest way), back onto the walkable floor */
  const resolve = (x: number, y: number): [number, number] => {
    for (let it = 0; it < 4; it++) {
      for (const d of ob.discs) {
        const dx = x - d.x, dy = y - d.y, l = Math.hypot(dx, dy), min = d.r + R
        if (l < min) { const k = l > 1e-6 ? min / l : 1; x = d.x + dx * k; y = d.y + (l > 1e-6 ? dy * k : min) }
      }
      for (const r of ob.rects) {
        const x0 = r.x0 - R, x1 = r.x1 + R, y0 = r.y0 - R, y1 = r.y1 + R
        if (x > x0 && x < x1 && y > y0 && y < y1) {
          const pen = [x - x0, x1 - x, y - y0, y1 - y]
          const i = pen.indexOf(Math.min(...pen))
          if (i === 0) x = x0; else if (i === 1) x = x1; else if (i === 2) y = y0; else y = y1
        }
      }
      if (!inside(x, y)) {
        // clamp into the nearest walkable rectangle (inset by the radius; the arch passages by half of it)
        let best: [number, number] = [x, y], bd = Infinity
        FLOOR.forEach((f, i) => {
          const m = i === 1 || i === 2 ? R * 0.5 : R
          const ym = i === 1 || i === 2 ? 0 : R
          const cx = Math.min(Math.max(x, f.x0 + m), f.x1 - m), cy = Math.min(Math.max(y, f.y0 + ym), f.y1 - ym)
          const dd = Math.hypot(cx - x, cy - y)
          if (dd < bd) { bd = dd; best = [cx, cy] }
        })
        ;[x, y] = best
      }
    }
    return [x, y]
  }

  const st = {
    on: false,
    x: 0, y: 1.2, yaw: 0, pitch: -0.04, // museum-local; yaw 0 looks into the building (+y)
    vx: 0, vy: 0,
    keys: new Set<string>(),
    stick: { x: 0, y: 0 },             // touch stick, -1..1
    dragged: false,                    // the last press was a look-drag, not a click
    seat: null as Seat | null,         // sitting on this bench
    eye: EYE,                          // eased eye height (sitting / standing)
  }

  /** start from the current camera (museum-local x / y from the scene position, yaw / pitch from its direction) */
  const enter = (pos: THREE.Vector3, quat: THREE.Quaternion) => {
    st.x = pos.x - mx
    st.y = -pos.z
    const f = new THREE.Vector3(0, 0, -1).applyQuaternion(quat)
    st.yaw = Math.atan2(f.x, -f.z)
    st.pitch = THREE.MathUtils.clamp(Math.asin(f.y), -0.6, 0.5) * 0.5
    // a guided stop can stand outside the walkable floor (close to a wall): step back onto it
    for (let k = 0; k < 40 && blocked(st.x, st.y); k++) { st.x -= Math.sin(st.yaw) * 0.08; st.y -= Math.cos(st.yaw) * 0.08 }
    if (blocked(st.x, st.y)) { st.x = 0; st.y = 1.2 }
    st.vx = st.vy = 0
    st.seat = null
    st.eye = pos.y
    st.on = true
  }

  const look = (dx: number, dy: number) => {
    st.yaw += dx
    st.pitch = THREE.MathUtils.clamp(st.pitch + dy, -0.75, 0.6)
  }

  /** one frame: input -> velocity (eased) -> collide axis by axis (slides along walls) -> pose */
  const step = (dt: number, out: { pos: THREE.Vector3; quat: THREE.Quaternion }) => {
    const k = st.keys
    const input = [...k].some((x) => x !== 'shift' && x !== 'q' && x !== 'e' && x !== 'arrowleft' && x !== 'arrowright') || Math.hypot(st.stick.x, st.stick.y) > 0.2
    if (st.seat && input) stand()
    if (st.seat) {
      // seated: the eye eases down onto the bench, turning to look is free, the body stays put
      if (k.has('arrowleft') || k.has('q')) st.yaw -= dt * 1.6
      if (k.has('arrowright') || k.has('e')) st.yaw += dt * 1.6
      st.eye += (SEATED_EYE - st.eye) * Math.min(1, dt * 4)
      out.pos.set(st.x + mx, st.eye, -st.y)
      out.quat.setFromEuler(new THREE.Euler(st.pitch, -st.yaw, 0, 'YXZ'))
      return
    }
    st.eye += (EYE - st.eye) * Math.min(1, dt * 4)
    let fwd = (k.has('w') || k.has('arrowup') ? 1 : 0) - (k.has('s') || k.has('arrowdown') ? 1 : 0) - st.stick.y
    let side = (k.has('d') ? 1 : 0) - (k.has('a') ? 1 : 0) + st.stick.x
    if (k.has('arrowleft') || k.has('q')) st.yaw -= dt * 1.6
    if (k.has('arrowright') || k.has('e')) st.yaw += dt * 1.6
    const len = Math.hypot(fwd, side)
    if (len > 1) { fwd /= len; side /= len }
    const speed = k.has('shift') ? 2.4 : 1.35
    const sx = Math.sin(st.yaw), sy = Math.cos(st.yaw)
    const tx = (sx * fwd + sy * side) * speed
    const ty = (sy * fwd - sx * side) * speed
    const a = Math.min(1, dt * 9)
    st.vx += (tx - st.vx) * a
    st.vy += (ty - st.vy) * a
    // move, then push the visitor back out of anything it entered: slides along walls and round obstacles alike
    const [rx, ry] = resolve(st.x + st.vx * dt, st.y + st.vy * dt)
    if (dt > 0) { st.vx = (rx - st.x) / dt; st.vy = (ry - st.y) / dt }
    st.x = rx
    st.y = ry
    // a gentle head bob while walking
    const moving = Math.hypot(st.vx, st.vy)
    const bob = Math.sin(performance.now() / 1000 * 7.5) * 0.012 * Math.min(1, moving / 1.35)
    out.pos.set(st.x + mx, st.eye + bob, -st.y)
    out.quat.setFromEuler(new THREE.Euler(st.pitch, -st.yaw, 0, 'YXZ'))
  }

  /** sit on a bench: on its centre line, facing what it faces (the world map / the room) */
  const sit = (id: string) => {
    const s = seats.find((x) => x.id === id)
    if (!s) return false
    st.seat = s
    st.x = s.c[0] - mx - s.face[0] * 0.05
    st.y = s.c[1] - s.face[1] * 0.05
    st.yaw = Math.atan2(s.face[0], s.face[1])
    st.pitch = 0.06
    st.vx = st.vy = 0
    st.on = true
    return true
  }
  /** stand up: a step forward off the bench (the collision then places you clear of it) */
  const stand = () => {
    const s = st.seat
    if (!s) return
    st.seat = null
    st.x += s.face[0] * 0.6
    st.y += s.face[1] * 0.6
    ;[st.x, st.y] = resolve(st.x, st.y)
  }

  /** which space the visitor is in (lighting / environment follow it) */
  const space = (): 'vestibule' | 'world' | 'toronto' => (st.y < VD + T * 0.5 ? 'vestibule' : st.x < 0 ? 'world' : 'toronto')

  /** floor plan for the minimap: walkable rects and obstacles, museum-local */
  const plan = { floor: FLOOR, ...ob }

  return { st, enter, look, step, space, plan, blocked, sit, stand }
}
export type Walk = ReturnType<typeof makeWalk>
