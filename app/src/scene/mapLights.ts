// The Jazz Map's task spot and fill exist in the room from the first frame (at zero intensity). Every shader's key
// includes the scene's light counts: adding them when the map loads would recompile every room material at once
// (a 1-2 s freeze while the listener is simply sitting in the room). The map station only aims and drives them.
import * as THREE from 'three'
import { TIERS, type Tier } from '../quality'

let lights: { focus: THREE.SpotLight; fill: THREE.PointLight; tier: Tier } | null = null

export function mapLights(tier: Tier) {
  if (lights && lights.tier === tier) return lights
  const s = TIERS[tier]
  const focus = new THREE.SpotLight('#ffc48e', 0, 5, 0.42, 0.7, 2)
  focus.castShadow = s.keyShadow && s.tier !== 'low'
  focus.shadow.mapSize.set(1024, 1024)
  focus.shadow.bias = -0.0004
  const fill = new THREE.PointLight('#ffcb98', 0, 3.2, 2)
  fill.visible = s.tier !== 'low' // (the low tier keeps the task light only)
  lights = { focus, fill, tier }
  return lights
}
