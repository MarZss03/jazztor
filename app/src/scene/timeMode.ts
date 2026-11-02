import * as THREE from 'three'
import type { TimeMode } from '../state/store'

// Approximate Toronto sunrise / sunset (local clock, DST-aware) by month — good to ~15 min.
const SUNRISE = [7.8, 7.3, 7.4, 6.7, 6.0, 5.7, 5.8, 6.3, 6.9, 7.5, 7.1, 7.6]
const SUNSET = [17.0, 17.7, 19.3, 19.9, 20.5, 20.9, 20.9, 20.3, 19.4, 18.4, 16.9, 16.7]

export function torontoClock(now = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Toronto', month: 'numeric', hour: 'numeric', minute: 'numeric', hourCycle: 'h23',
  }).formatToParts(now)
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value ?? 0)
  return { month: get('month') - 1, hour: get('hour') + get('minute') / 60 }
}

export function resolveTorontoMode(now = new Date()): TimeMode {
  const { month, hour } = torontoClock(now)
  const rise = SUNRISE[month]
  const set = SUNSET[month]
  if (hour >= set - 0.9 && hour < set + 0.8) return 'DUSK'
  if (hour >= rise - 0.4 && hour < rise + 0.6) return 'DUSK'
  if (hour >= rise + 0.6 && hour < set - 0.9) return 'DAY'
  return 'NIGHT'
}

export type LightPreset = {
  skyTop: THREE.Color
  skyHorizon: THREE.Color
  skyGround: THREE.Color
  sunColor: THREE.Color
  sunIntensity: number
  sunDir: THREE.Vector3 // towards the sun, three.js space
  sunGlow: number
  windowFill: number
  windowColor: THREE.Color
  ambient: number
  envIntensity: number
  keyIntensity: number
  facadeEmissive: number
  beacon: number
  water: THREE.Color
  waterLights: number
  exposure: number
  clouds: number
  fogFar: number
  envDay: number // photo layer weights (crossfaded with everything else)
  envDusk: number
  envNight: number
  envExposure: number
}

const c = (hex: string) => new THREE.Color(hex)
// Blender (x, y, z) -> three (x, z, -y)
const dirFromAzEl = (azDeg: number, elDeg: number) => {
  const az = THREE.MathUtils.degToRad(azDeg)
  const el = THREE.MathUtils.degToRad(elDeg)
  const bx = Math.sin(az) * Math.cos(el)
  const by = Math.cos(az) * Math.cos(el)
  return new THREE.Vector3(bx, Math.sin(el), -by).normalize()
}

// Matched to the Toronto photographs (see TorontoBackdrop): the day frame is lit from the upper left, the dusk
// sun sits on the left (west) horizon behind the orange glow, the night frame has no sun - only city light.
// sunDir az: degrees from the window normal towards +X (right); negative = left of the window.
export const PRESETS: Record<TimeMode, LightPreset> = {
  DAY: {
    skyTop: c('#4f86c6'), skyHorizon: c('#cddff0'), skyGround: c('#6f8796'),
    sunColor: c('#fff0dc'), sunIntensity: 4.2, sunDir: dirFromAzEl(20, 34), sunGlow: 0.25,
    windowFill: 4.4, windowColor: c('#dbe8f6'), ambient: 0.5, envIntensity: 1.3, keyIntensity: 0.5,
    facadeEmissive: 0.0, beacon: 0.0, water: c('#2c5876'), waterLights: 0.0, exposure: 1.0, clouds: 1.0,
    fogFar: 2200, envDay: 1, envDusk: 0, envNight: 0, envExposure: 1.05,
  },
  DUSK: {
    skyTop: c('#22336b'), skyHorizon: c('#e0905a'), skyGround: c('#2a2230'),
    sunColor: c('#ff9248'), sunIntensity: 1.5, sunDir: dirFromAzEl(18, 5), sunGlow: 1.0,
    windowFill: 1.0, windowColor: c('#9fa4cf'), ambient: 0.16, envIntensity: 0.5, keyIntensity: 2.2,
    facadeEmissive: 0.5, beacon: 3.0, water: c('#1f1d2e'), waterLights: 0.2, exposure: 1.1, clouds: 0.6,
    fogFar: 1600, envDay: 0, envDusk: 1, envNight: 0, envExposure: 1.0,
  },
  NIGHT: {
    skyTop: c('#05070f'), skyHorizon: c('#1d2a4f'), skyGround: c('#06070b'),
    sunColor: c('#9fb4ff'), sunIntensity: 0.0, sunDir: dirFromAzEl(-40, 35), sunGlow: 0.0,
    windowFill: 0.28, windowColor: c('#6878b0'), ambient: 0.06, envIntensity: 0.2, keyIntensity: 3.2,
    facadeEmissive: 1.6, beacon: 6.0, water: c('#06080e'), waterLights: 0.6, exposure: 1.15, clouds: 0.15,
    fogFar: 1400, envDay: 0, envDusk: 0, envNight: 1, envExposure: 1.0,
  },
}

/** Mutable preset that eases towards a target preset (never swaps geometry). */
export function makeLivePreset(from: LightPreset): LightPreset {
  return {
    ...from,
    skyTop: from.skyTop.clone(), skyHorizon: from.skyHorizon.clone(), skyGround: from.skyGround.clone(),
    sunColor: from.sunColor.clone(), sunDir: from.sunDir.clone(), windowColor: from.windowColor.clone(),
    water: from.water.clone(),
  }
}

export function easePreset(live: LightPreset, target: LightPreset, k: number) {
  for (const key of Object.keys(target) as (keyof LightPreset)[]) {
    const t = target[key]
    const l = live[key]
    if (typeof t === 'number') (live as Record<string, unknown>)[key] = (l as number) + (t - (l as number)) * k
    else if (t instanceof THREE.Color) (l as THREE.Color).lerp(t, k)
    else if (t instanceof THREE.Vector3) (l as THREE.Vector3).lerp(t, k).normalize()
  }
}
