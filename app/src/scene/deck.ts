// Turntable mechanics + playback orchestration. Pure TS; the scene reads these values each frame.
// Geometry constants mirror blender/scripts/jt_turntable.py (Blender local XY of JT_Turntable_Root).
import { albumById } from '../data/albums'
import { audio } from '../audio/engine'
import { useJazz } from '../state/store'

const PIVOT = { x: 0.155, y: 0.105 }
const SPINDLE = { x: -0.06, y: 0.025 }
const ARM_LEN = 0.2444
export const R_LEAD_IN = 0.146
export const R_RUN_OUT = 0.062
export const RPM = 100 / 3
const D = { x: PIVOT.x - SPINDLE.x, y: PIVOT.y - SPINDLE.y }
const D_LEN = Math.hypot(D.x, D.y)
const DELTA = Math.atan2(D.y, D.x)

/** Tonearm yaw (radians, +CCW about up axis) that puts the stylus at groove radius r. */
export function yawForRadius(r: number) {
  const k = (r * r - D_LEN * D_LEN - ARM_LEN * ARM_LEN) / (2 * ARM_LEN)
  return DELTA + Math.asin(Math.max(-1, Math.min(1, k / D_LEN)))
}
export function radiusForYaw(yaw: number) {
  const sx = PIVOT.x + ARM_LEN * Math.sin(yaw) - SPINDLE.x
  const sy = PIVOT.y - ARM_LEN * Math.cos(yaw) - SPINDLE.y
  return Math.hypot(sx, sy)
}
/** Yaw that points the stylus at a local (Blender XY) point. */
export function yawTowards(x: number, y: number) {
  return Math.atan2(x - PIVOT.x, -(y - PIVOT.y))
}
export const YAW_LEAD_IN = yawForRadius(R_LEAD_IN)
export const YAW_RUN_OUT = yawForRadius(R_RUN_OUT)
export const YAW_MIN = YAW_RUN_OUT - 0.05

const easeInOut = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2)
const easeOut = (t: number) => 1 - Math.pow(1 - t, 3)

type Tween = { key: keyof Deck; from: number; to: number; t0: number; ms: number; ease: (t: number) => number;
  resolve: () => void }

class Deck {
  // animated hardware values
  platterSpeed = 0 // 0..1 of nominal
  platterTarget = 0
  platterAngle = 0
  speed45 = false
  armYaw = 0
  armLift = 1 // 1 = raised on cue, 0 = resting / playing
  buttonDepth = 0
  cueLever = 1
  private tweens: Tween[] = []
  private now = 0
  private duration = 180
  private busy = false

  private motion(ms: number) {
    return useJazz.getState().reducedMotion ? Math.min(ms, 160) : ms
  }

  animate(key: keyof Deck, to: number, ms: number, ease = easeInOut) {
    this.tweens = this.tweens.filter((t) => t.key !== key)
    return new Promise<void>((resolve) => {
      const from = this[key] as number
      if (ms <= 0 || from === to) {
        ;(this as Record<string, unknown>)[key] = to
        resolve()
        return
      }
      this.tweens.push({ key, from, to, t0: this.now, ms: this.motion(ms), ease, resolve })
    })
  }

  tick(dtSec: number, nowMs: number) {
    this.now = nowMs
    for (const tw of [...this.tweens]) {
      const k = Math.min(1, (nowMs - tw.t0) / tw.ms)
      ;(this as Record<string, unknown>)[tw.key] = tw.from + (tw.to - tw.from) * tw.ease(k)
      if (k >= 1) {
        this.tweens.splice(this.tweens.indexOf(tw), 1)
        tw.resolve()
      }
    }
    // platter inertia: quick motor spin-up, slow coast-down
    const tau = this.platterTarget > this.platterSpeed ? 0.35 : 0.9
    this.platterSpeed += (this.platterTarget - this.platterSpeed) * (1 - Math.exp(-dtSec / tau))
    const rpm = RPM * (this.speed45 ? 1.35 : 1)
    this.platterAngle -= this.platterSpeed * (rpm / 60) * Math.PI * 2 * dtSec
    // stylus tracks the groove while playing
    const deck = useJazz.getState().deck
    if (deck === 'playing') {
      const pos = audio.position()
      this.armYaw = this.yawForTime(pos)
      if (Math.floor(nowMs / 1000) !== Math.floor((nowMs - dtSec * 1000) / 1000))
        useJazz.getState().setPosition(useJazz.getState().albumId, pos)
    }
  }

  yawForTime(t: number) {
    const f = Math.max(0, Math.min(1, t / this.duration))
    return yawForRadius(R_LEAD_IN - (R_LEAD_IN - R_RUN_OUT) * f)
  }
  timeForYaw(yaw: number) {
    const r = radiusForYaw(yaw)
    return Math.max(0, Math.min(1, (R_LEAD_IN - r) / (R_LEAD_IN - R_RUN_OUT))) * this.duration
  }
  onRecord(yaw: number) {
    const r = radiusForYaw(yaw)
    return r <= R_LEAD_IN + 0.004 && r >= R_RUN_OUT - 0.002
  }

  private async loadDuration() {
    const album = albumById(useJazz.getState().albumId)
    this.duration = await audio.duration(album)
    return album
  }

  /** One-click play: press, motor, arm lift, swing, cue down, music. */
  async start() {
    const s = useJazz.getState()
    if (this.busy || s.deck === 'playing') return
    this.busy = true
    audio.ensure()
    s.set({ deck: 'starting' })
    audio.sfx('button')
    audio.sfx('relay')
    this.press()
    this.platterTarget = 1
    const album = await this.loadDuration()
    let pos = s.positions[album.id] ?? 0
    if (pos > this.duration - 2) pos = 0
    if (this.armLift < 0.9) {
      audio.sfx('lift')
      await this.animate('armLift', 1, 260)
    }
    await this.animate('armYaw', this.yawForTime(pos), 900)
    audio.sfx('cue')
    await this.animate('armLift', 0, 420, easeOut)
    audio.sfx('needle')
    await audio.play(album, pos)
    audio.setRate(this.speed45 ? 1.35 : 1)
    useJazz.getState().set({ deck: 'playing' })
    this.busy = false
  }

  /** Lift, return to rest, motor off. */
  async stop() {
    const s = useJazz.getState()
    if (this.busy || (s.deck !== 'playing' && s.deck !== 'manual')) return
    this.busy = true
    s.set({ deck: 'stopping' })
    const pos = audio.pause()
    s.setPosition(s.albumId, pos)
    audio.sfx('lift')
    await this.animate('armLift', 1, 280)
    await this.animate('armYaw', 0, 950)
    await this.animate('armLift', 0, 300)
    this.platterTarget = 0
    useJazz.getState().set({ deck: 'stopped' })
    this.busy = false
  }

  async toggle(fromButton = true) {
    const deck = useJazz.getState().deck
    if (fromButton) {
      audio.ensure()
      if (deck === 'playing') {
        audio.sfx('button')
        this.press()
      }
    }
    if (deck === 'playing') await this.stop()
    else if (deck === 'stopped') await this.start()
  }

  press() {
    void this.animate('buttonDepth', 1, 90, easeOut).then(() => this.animate('buttonDepth', 0, 160))
  }

  /** Move the needle to t seconds (from the progress groove). */
  async seek(t: number) {
    const s = useJazz.getState()
    s.setPosition(s.albumId, t)
    if (s.deck !== 'playing' || this.busy) return
    this.busy = true
    audio.pause(0.05)
    audio.sfx('lift')
    await this.animate('armLift', 0.6, 160)
    await this.animate('armYaw', this.yawForTime(t), 380)
    await this.animate('armLift', 0, 220, easeOut)
    audio.sfx('needle')
    await audio.play(albumById(s.albumId), t)
    this.busy = false
  }

  /** Change record: stop if playing, switch, optionally restart. */
  async changeAlbum(id: string, autoplay: boolean) {
    const s = useJazz.getState()
    if (id === s.albumId) {
      if (autoplay && s.deck === 'stopped') await this.start()
      return
    }
    const wasPlaying = s.deck === 'playing'
    if (wasPlaying) await this.stop()
    useJazz.getState().set({ albumId: id })
    void audio.prepare(albumById(id))
    if (wasPlaying || autoplay) await this.start()
  }

  // ---- manual needle ritual
  async beginManual() {
    const s = useJazz.getState()
    if (this.busy) return false
    audio.ensure()
    if (s.deck === 'playing') s.setPosition(s.albumId, audio.pause(0.05))
    s.set({ deck: 'manual' })
    this.platterTarget = 1
    void this.loadDuration()
    audio.sfx('lift')
    await this.animate('armLift', 1, 160)
    return true
  }
  dragYaw(yaw: number) {
    this.tweens = this.tweens.filter((t) => t.key !== 'armYaw')
    this.armYaw = Math.max(YAW_MIN, Math.min(0.02, yaw))
  }
  async endManual() {
    if (useJazz.getState().deck !== 'manual') return
    this.busy = true
    if (this.onRecord(this.armYaw)) {
      const t = this.timeForYaw(this.armYaw)
      audio.sfx('cue')
      await this.animate('armLift', 0, 520, easeOut)
      audio.sfx('needle')
      const s = useJazz.getState()
      s.setPosition(s.albumId, t)
      await audio.play(albumById(s.albumId), t)
      useJazz.getState().set({ deck: 'playing' })
    } else {
      await this.animate('armYaw', 0, 600)
      await this.animate('armLift', 0, 260)
      this.platterTarget = 0
      useJazz.getState().set({ deck: 'stopped' })
    }
    this.busy = false
  }

  toggleSpeed() {
    this.speed45 = !this.speed45
    audio.setRate(this.speed45 ? 1.35 : 1)
    audio.sfx('detent')
    return this.speed45
  }
}

export const deck = new Deck()

audio.onTrack = (albumId, trackId) => useJazz.getState().logPlay(albumId, trackId)

audio.onEnded = () => {
  // run-out groove: auto-return, then advance to the next record in the crate
  const s = useJazz.getState()
  s.setPosition(s.albumId, 0)
  void deck.stop()
}
