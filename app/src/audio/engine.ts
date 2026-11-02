// Web Audio engine: streamed record playback (licensed MP3s), VU analysers and tactile hardware sound effects.
// One side of a record = its tracks in order with a 2 s silent band between them (positions are side-time;
// the band lengths come from the catalogue's track start offsets).
import { trackAt, type Album } from '../data/albums'
import { useJazz } from '../state/store'

class AudioEngine {
  ctx: AudioContext | null = null
  private master!: GainNode
  private music!: GainNode
  private trackGain!: GainNode
  private sfxBus!: GainNode
  private anL!: AnalyserNode
  private anR!: AnalyserNode
  private noise!: AudioBuffer
  private dry!: GainNode
  private verbIn!: ConvolverNode
  private wet!: GainNode
  private space = 0
  private el: HTMLAudioElement | null = null
  private album: Album | null = null
  private index = 0
  private playing = false
  private gap: { from: number; at: number } | null = null // in the band between tracks
  private gapTimer = 0
  private offset = 0
  private rate = 1
  private token = 0
  private preloads = new Map<string, HTMLAudioElement>()
  private bufL = new Float32Array(1024)
  private bufR = new Float32Array(1024)
  playingAlbum: string | null = null
  onEnded: (() => void) | null = null
  onTrack: ((albumId: string, trackId: string) => void) | null = null

  /** Must be called from a user gesture the first time (no sound is ever started without one). */
  ensure() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') void this.ctx.resume()
      return this.ctx
    }
    const ctx = new AudioContext({ latencyHint: 'playback' })
    this.ctx = ctx
    this.master = ctx.createGain()
    this.master.connect(ctx.destination)
    this.music = ctx.createGain()
    // acoustics: the listening room is dry; the museum adds a panelled-hall reverb (synthetic IR, ~2.3 s RT60)
    this.dry = ctx.createGain()
    this.wet = ctx.createGain()
    this.wet.gain.value = 0.32 * this.space // setSpace may have run before the first gesture
    this.dry.gain.value = 1 - 0.22 * this.space
    const verb = ctx.createConvolver()
    verb.buffer = this.hallIR(ctx)
    this.music.connect(this.dry).connect(this.master)
    this.music.connect(verb)
    verb.connect(this.wet).connect(this.master)
    this.verbIn = verb
    this.trackGain = ctx.createGain()
    this.trackGain.gain.value = 0
    this.trackGain.connect(this.music)
    this.sfxBus = ctx.createGain()
    this.sfxBus.gain.value = 0.45
    this.sfxBus.connect(this.master)
    this.sfxBus.connect(this.verbIn)
    const split = ctx.createChannelSplitter(2)
    this.anL = ctx.createAnalyser()
    this.anR = ctx.createAnalyser()
    this.anL.fftSize = this.anR.fftSize = 1024
    this.music.connect(split)
    split.connect(this.anL, 0)
    split.connect(this.anR, 1)
    const el = new Audio()
    el.preload = 'auto'
    ;(el as HTMLAudioElement & { preservesPitch: boolean }).preservesPitch = false // 45 rpm sounds like 45 rpm
    ctx.createMediaElementSource(el).connect(this.trackGain)
    el.addEventListener('ended', () => this.trackEnded())
    this.el = el
    this.noise = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate)
    const d = this.noise.getChannelData(0)
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1
    return ctx
  }

  private hallIR(ctx: AudioContext) {
    const len = Math.floor(ctx.sampleRate * 2.6)
    const b = ctx.createBuffer(2, len, ctx.sampleRate)
    for (let c = 0; c < 2; c++) {
      const d = b.getChannelData(c)
      let lp = 0
      for (let i = 0; i < len; i++) {
        const t = i / ctx.sampleRate
        lp += (Math.random() * 2 - 1 - lp) * Math.max(0.08, 0.55 - t * 0.2) // wood and velvet: highs die first
        const early = t < 0.09 && Math.random() < 0.004 ? (Math.random() * 2 - 1) * 2.5 : 0
        d[i] = (lp + early) * Math.exp(-t * 2.65) * Math.min(1, t / 0.012)
      }
    }
    return b
  }

  /** Cross-fade the acoustics: 0 = listening room (dry), 1 = museum hall. The music itself never stops. */
  setSpace(v: number, seconds = 0.2) {
    const ctx = this.ctx
    this.space = v
    if (!ctx) return
    const tc = Math.max(0.01, seconds / 3)
    this.wet.gain.setTargetAtTime(0.32 * v, ctx.currentTime, tc)
    this.dry.gain.setTargetAtTime(1 - 0.22 * v, ctx.currentTime, tc)
  }

  /** Warm the browser cache for the first track of a record (metadata + first seconds). */
  prepare(album: Album, index = 0) {
    const src = album.tracks[index]?.src
    if (src && !this.preloads.has(src)) {
      const a = new Audio()
      a.preload = 'auto'
      a.src = src
      this.preloads.set(src, a)
    }
    return Promise.resolve()
  }

  async play(album: Album, from: number) {
    this.ensure()
    const token = ++this.token
    this.cancelGap()
    const at = Math.max(0, Math.min(from, album.duration - 0.5))
    const { track, index, offset } = trackAt(album, at)
    this.album = album
    this.index = index
    this.playingAlbum = album.id
    this.playing = true
    if (at > track.start + track.duration) {
      // dropped in the band after a track: silence until the next one
      this.startGap(at)
      return
    }
    await this.startTrack(index, offset, token)
  }

  private async startTrack(index: number, offset: number, token: number) {
    const ctx = this.ctx!
    const el = this.el!
    const track = this.album!.tracks[index]
    const url = new URL(track.src, location.href).href
    if (el.src !== url) {
      el.src = url
      await new Promise<void>((res, rej) => {
        const ok = () => (cleanup(), res())
        const bad = () => (cleanup(), rej(new Error('audio load failed: ' + track.src)))
        const cleanup = () => { el.removeEventListener('loadedmetadata', ok); el.removeEventListener('error', bad) }
        el.addEventListener('loadedmetadata', ok)
        el.addEventListener('error', bad)
      })
    }
    if (token !== this.token) return
    el.currentTime = offset
    el.playbackRate = this.rate
    const g = this.trackGain.gain
    const target = Math.pow(10, track.gainDb / 20)
    g.cancelScheduledValues(ctx.currentTime)
    g.setValueAtTime(0, ctx.currentTime)
    g.linearRampToValueAtTime(target, ctx.currentTime + 0.06)
    this.onTrack?.(this.album!.id, track.id)
    // the next track loads while this one plays: the band between tracks stays the pressed record's 2 s, not 2 s plus
    // however long the next file takes to buffer
    if (index + 1 < this.album!.tracks.length) void this.prepare(this.album!, index + 1)
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        await el.play()
        return
      } catch (e) {
        // superseded by a pause / a new play: nothing to do; anything else (a stalled load) gets one more try
        if (token !== this.token || (e as DOMException)?.name === 'AbortError') return
        await new Promise((r) => setTimeout(r, 250))
        if (token !== this.token) return
      }
    }
  }

  private trackEnded() {
    const a = this.album
    if (!a || !this.playing) return
    const track = a.tracks[this.index]
    if (this.index + 1 >= a.tracks.length) {
      this.playing = false
      this.offset = a.duration
      this.onEnded?.()
      return
    }
    this.startGap(track.start + track.duration)
  }

  private startGap(fromPos: number) {
    const a = this.album!
    const next = a.tracks.findIndex((t) => t.start > fromPos - 0.01)
    if (next < 0) {
      this.playing = false
      this.onEnded?.()
      return
    }
    this.gap = { from: fromPos, at: performance.now() }
    const wait = Math.max(0, (a.tracks[next].start - fromPos) / this.rate) * 1000
    const token = this.token
    this.gapTimer = window.setTimeout(() => {
      if (token !== this.token) return
      this.gap = null
      this.index = next
      void this.startTrack(next, 0, token)
    }, wait)
  }

  private cancelGap() {
    window.clearTimeout(this.gapTimer)
    this.gap = null
  }

  /** Stops playback and returns the side position (seconds). */
  pause(fade = 0.08) {
    const pos = this.position()
    this.token++
    this.cancelGap()
    this.playing = false
    this.offset = pos
    if (this.ctx && this.el) {
      const g = this.trackGain.gain
      const t = this.ctx.currentTime
      g.cancelScheduledValues(t)
      g.setValueAtTime(g.value, t)
      g.linearRampToValueAtTime(0, t + fade)
      const el = this.el
      window.setTimeout(() => !this.playing && el.pause(), fade * 1000 + 20)
    }
    return pos
  }

  get isPlaying() {
    return this.playing
  }

  position() {
    const a = this.album
    if (!a || !this.playing) return this.offset
    if (this.gap) return this.gap.from + ((performance.now() - this.gap.at) / 1000) * this.rate
    return a.tracks[this.index].start + (this.el?.currentTime ?? 0)
  }

  /** Side length (tracks + bands) - known from the catalogue, no decoding needed. */
  async duration(album: Album) {
    return album.duration
  }

  setVolume(v: number) {
    if (!this.ctx) return
    this.master.gain.setTargetAtTime(v * v, this.ctx.currentTime, 0.05)
  }

  /** 33⅓ ↔ 45 easter egg: honest pitch shift, like the real thing. */
  setRate(rate: number) {
    this.rate = rate
    if (this.el) this.el.playbackRate = rate
  }

  levels(): [number, number] {
    if (!this.ctx || !this.playing) return [0, 0]
    this.anL.getFloatTimeDomainData(this.bufL)
    this.anR.getFloatTimeDomainData(this.bufR)
    const rms = (b: Float32Array) => {
      let s = 0
      for (let i = 0; i < b.length; i++) s += b[i] * b[i]
      return Math.sqrt(s / b.length)
    }
    return [rms(this.bufL), rms(this.bufR)]
  }

  // ------------------------------------------------------------- hardware sounds
  private burst(t: number, freq: number, q: number, dur: number, gain: number, type: BiquadFilterType = 'bandpass') {
    const ctx = this.ctx!
    const src = ctx.createBufferSource()
    src.buffer = this.noise
    const f = ctx.createBiquadFilter()
    f.type = type
    f.frequency.value = freq
    f.Q.value = q
    const g = ctx.createGain()
    g.gain.setValueAtTime(gain, t)
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur)
    src.connect(f).connect(g).connect(this.sfxBus)
    src.start(t, Math.random() * 0.5)
    src.stop(t + dur + 0.02)
  }

  private thump(t: number, freq: number, dur: number, gain: number) {
    const ctx = this.ctx!
    const o = ctx.createOscillator()
    o.frequency.setValueAtTime(freq * 1.6, t)
    o.frequency.exponentialRampToValueAtTime(freq, t + dur * 0.5)
    const g = ctx.createGain()
    g.gain.setValueAtTime(gain, t)
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur)
    o.connect(g).connect(this.sfxBus)
    o.start(t)
    o.stop(t + dur + 0.02)
  }

  sfx(kind: 'button' | 'relay' | 'needle' | 'cue' | 'slide' | 'detent' | 'curtain' | 'switch' | 'lever' | 'lift' | 'handle' | 'latch' | 'door') {
    const ctx = this.ensure()
    const t = ctx.currentTime + 0.005
    const prefs = useJazz.getState().prefs
    this.sfxBus.gain.setTargetAtTime(0.75 * prefs.sfxLevel, ctx.currentTime, 0.02)
    switch (kind) {
      case 'button':
        this.burst(t, 2600, 2, 0.03, 0.5)
        this.thump(t, 140, 0.05, 0.35)
        break
      case 'relay':
        this.burst(t + 0.07, 4200, 4, 0.015, 0.4)
        this.burst(t + 0.085, 1800, 3, 0.02, 0.25)
        break
      case 'needle': {
        this.thump(t, 70, 0.12, 0.2)
        if (prefs.needleCrackle) for (let i = 0; i < 5; i++) this.burst(t + 0.02 + Math.random() * 0.5, 2500 + Math.random() * 3000, 6, 0.003, 0.05 * (1 - i / 6))
        break
      }
      case 'lift':
        this.burst(t, 3000, 3, 0.02, 0.12)
        break
      case 'cue':
        this.burst(t, 1200, 2, 0.05, 0.3)
        this.thump(t, 220, 0.04, 0.15)
        break
      case 'slide':
        this.burst(t, 700, 0.6, 0.25, 0.12, 'lowpass')
        this.thump(t + 0.22, 330, 0.05, 0.12)
        break
      case 'detent':
        this.burst(t, 3800, 5, 0.012, 0.35)
        break
      case 'curtain':
        this.burst(t, 500, 0.5, 1.4, 0.18, 'lowpass')
        break
      case 'switch':
        this.burst(t, 3200, 3, 0.02, 0.5)
        this.thump(t, 180, 0.03, 0.2)
        break
      case 'handle': // brass lever turning against its spring
        this.burst(t, 1400, 2, 0.14, 0.16, 'lowpass')
        this.burst(t + 0.13, 4200, 5, 0.01, 0.22)
        break
      case 'latch': // the bolt clearing the strike plate
        this.burst(t, 2600, 6, 0.012, 0.5)
        this.thump(t, 120, 0.06, 0.3)
        break
      case 'door': // a heavy walnut leaf: low hinge groan + air
        this.burst(t, 160, 0.8, 1.2, 0.22, 'lowpass')
        this.burst(t + 0.05, 420, 4, 0.5, 0.05)
        this.thump(t, 55, 0.4, 0.18)
        break
      case 'lever':
        this.burst(t, 900, 1, 0.12, 0.2, 'lowpass')
        this.burst(t + 0.1, 3000, 4, 0.015, 0.3)
        break
    }
  }
}

export const audio = new AudioEngine()
