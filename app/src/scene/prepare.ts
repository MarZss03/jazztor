// Post-load preparation of the Blender GLBs: material upgrades, colliders, node registry.
import * as THREE from 'three'
import type { TierSettings } from '../quality'

/** The record's soft-box reflection, computed in the vinyl's own shader (no extra scene light: a real rect light made
 * every room shader larger - ~1.8 s more cold compile - for one object's gloss). Updated each frame by the room. */
export const vinylBox = { uBoxDir: { value: new THREE.Vector3(0, 1, 0) }, uBoxGain: { value: 0 } }
const addSoftBox = (m: THREE.Material) => {
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, vinylBox)
    sh.fragmentShader = sh.fragmentShader
      .replace('void main() {', 'uniform vec3 uBoxDir;\nuniform float uBoxGain;\nvoid main() {')
      .replace('#include <opaque_fragment>', `{
        // a warm soft box above and behind the deck, seen in the lacquer: a broad lobe around the mirror direction
        vec3 V = normalize( vViewPosition );
        vec3 R = reflect( -V, normal );
        float c = max( dot( R, uBoxDir ), 0.0 );
        float lobe = smoothstep( 0.91, 0.99, c ) * 0.7 + pow( c, 160.0 ) * 0.7;
        float fres = 0.04 + 0.96 * pow( 1.0 - max( dot( normal, V ), 0.0 ), 5.0 );
        outgoingLight += vec3( 1.0, 0.82, 0.62 ) * uBoxGain * lobe * ( 0.25 + fres );
      }
      #include <opaque_fragment>`)
  }
  m.customProgramCacheKey = () => 'jt-vinyl-softbox'
}

/** Crystal glass without transmission (the whiskey inside already uses it, and three cannot see transmission through
 * transmission): premultiplied blending, so reflections and glints ADD over what is behind while the body stays clear;
 * coverage rises with Fresnel toward the rims and wherever a reflection is bright, and the rims carry a faint spectral
 * fringe (cut crystal's dispersion). */
const addCrystal = (m: THREE.Material, body: number) => {
  m.blending = THREE.CustomBlending
  m.blendSrc = THREE.OneFactor
  m.blendDst = THREE.OneMinusSrcAlphaFactor
  m.onBeforeCompile = (sh) => {
    sh.fragmentShader = sh.fragmentShader.replace('#include <opaque_fragment>', `{
        vec3 V = normalize( vViewPosition );
        float fr = pow( 1.0 - clamp( abs( dot( normal, V ) ), 0.0, 1.0 ), 3.0 );
        vec3 fringe = 0.5 + 0.5 * cos( 6.2832 * ( fr * 1.6 + vec3( 0.0, 0.33, 0.67 ) ) );
        outgoingLight *= mix( vec3( 1.0 ), fringe * 1.25, fr * 0.45 );
        outgoingLight += vec3( 0.86, 0.93, 1.0 ) * ${body.toFixed(3)} * ( 0.6 + fr ); // faint cool body
        float lum = dot( outgoingLight, vec3( 0.2126, 0.7152, 0.0722 ) );
        float a = clamp( ${body.toFixed(3)} + fr * 0.55 + lum * 0.35, 0.0, 0.92 );
        gl_FragColor = vec4( outgoingLight, a ); // premultiplied: rgb adds, a darkens what is behind
      }
      #if 0
      #include <opaque_fragment>
      #endif`)
  }
  m.customProgramCacheKey = () => `jt-crystal-${body}`
}

export type Nodes = Record<string, THREE.Object3D>

const physical = (m: THREE.MeshStandardMaterial) => {
  const p = new THREE.MeshPhysicalMaterial()
  THREE.MeshStandardMaterial.prototype.copy.call(p, m)
  // Standard.copy() also copies `defines` and drops PHYSICAL (ior, transmission, clearcoat... fail to compile)
  p.defines = { STANDARD: '', PHYSICAL: '' }
  p.name = m.name
  return p
}

export function prepareScenes(scenes: THREE.Group[], aniso: THREE.Texture, settings: TierSettings, maxAnisotropy = 8) {
  const nodes: Nodes = {}
  const materials = new Map<string, THREE.Material>()
  const upgraded = new Map<string, THREE.Material>()
  // drawn-but-invisible so the raycaster still picks colliders
  const invisible = new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, colorWrite: false, depthWrite: false })

  for (const scene of scenes) {
    scene.traverse((o) => {
      if (o.name && !nodes[o.name]) nodes[o.name] = o
      const mesh = o as THREE.Mesh
      if (!mesh.isMesh) return
      const owner = mesh.name.startsWith('COL_') ? mesh : mesh.parent?.name.startsWith('COL_') ? mesh.parent : null
      if (owner) {
        mesh.material = invisible
        mesh.castShadow = mesh.receiveShadow = false
        mesh.userData.collider = true
        return
      }
      const isSky = /Skyline|CNTower|JT_Water/.test(mesh.name) || /Skyline|CNTower/.test(mesh.parent?.name ?? '')
      mesh.castShadow = !isSky && !/Glass|Window_Glass/.test(mesh.name)
      mesh.receiveShadow = !isSky

      const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material]
      const out = mats.map((raw) => {
        const m = raw as THREE.MeshStandardMaterial
        if (upgraded.has(m.name)) return upgraded.get(m.name)!
        let r: THREE.Material = m
        switch (true) {
          // low tier: keep MeshStandardMaterial (no clearcoat / anisotropy) - integrated GPUs are fragment-bound
          case settings.tier === 'low' && /^JT_(Vinyl|Brass_Satin|Brass_Aged|Walnut)$/.test(m.name):
            if (m.name === 'JT_Vinyl') { // glossy black even without clearcoat: smooth, so it mirrors the room
              m.roughness = Math.min(m.roughness, 0.2)
              m.color.set('#26262b')
              addSoftBox(m)
            }
            break
          case m.name === 'JT_Vinyl': {
            const p = physical(m)
            // lacquer-glossy vinyl: a full, very smooth clear coat mirrors the room and the window (strongest at the
            // oblique angles the room is seen from), the grooves keep their anisotropic streaks underneath
            p.anisotropy = 0.8
            p.anisotropyMap = aniso
            p.clearcoat = 1.0
            p.clearcoatRoughness = 0.24 // a lustrous sheen rather than a hard mirror image (and no LTC edge speckle)
            p.color.set('#26262b') // charcoal rather than pure black: the record and its grooves read in the room light
            p.sheen = 0.35 // a faint cool sheen across the grooves
            p.sheenRoughness = 0.45
            p.sheenColor.set('#59606e')
            addSoftBox(p)
            r = p
            break
          }
          case m.name === 'JT_Brass_Satin' || m.name === 'JT_Brass_Aged': {
            const p = physical(m)
            p.anisotropy = m.name === 'JT_Brass_Satin' ? 0.6 : 0.35     // brushed along the turning direction
            p.roughness = m.name === 'JT_Brass_Satin' ? 1.0 : 1.25     // factor on the brushed roughness map
            r = p
            break
          }
          case m.name === 'JT_Marble_Black':
            // polished stone is optically flat: veins differ in colour and roughness, not relief. A normal map
            // here breaks the key light's highlight into bloom fireflies ("glitter").
            m.normalMap = null
            m.roughness = 1.15
            m.needsUpdate = true
            break
          case m.name === 'JT_Brass_Polished':
            m.roughness = 0.13
            break
          case m.name === 'JT_Walnut': {
            const p = physical(m)
            p.normalScale.multiplyScalar(0.4) // grain reads as pores under raking light, not bark
            p.clearcoat = 0.18                                           // thin satin lacquer, not a plastic shell
            p.clearcoatRoughness = 0.38
            r = p
            break
          }
          // Whiskey layering (three.js cannot see transmission through transmission):
          //   liquid = true transmission + volume absorption; ice = non-transmissive frosted solid, so it is
          //   visible inside the liquid's refraction; crystal = thin alpha shell drawn last with strong Fresnel.
          case m.name === 'JT_Whiskey_Liquid' && settings.transmission: {
            const p = physical(m)
            // transmitted light is multiplied by the base colour AND absorbed over the volume path
            p.color.set('#f0a24e')
            p.transmission = 1
            p.ior = 1.36
            p.thickness = 0.03
            p.roughness = 0.03
            p.metalness = 0
            p.attenuationColor = new THREE.Color('#c0601a')
            p.attenuationDistance = 0.06
            p.clearcoat = 1 // the surface and meniscus catch the room highlights
            p.clearcoatRoughness = 0.02
            p.emissive.set('#2a0e02') // faint inner glow: light scattered inside the amber volume
            p.specularIntensity = 1
            p.envMapIntensity = 1.2
            r = p
            break
          }
          case m.name === 'JT_Whiskey_Liquid': {
            const p = physical(m)
            p.transmission = 0
            p.transparent = true
            p.opacity = 0.86
            p.color.set('#9c4610')
            p.roughness = 0.04
            p.clearcoat = 1
            p.clearcoatRoughness = 0.02
            p.emissive.set('#3a1404')
            r = p
            break
          }
          case m.name === 'JT_Ice_Frosted': {
            const p = physical(m)
            p.color.set('#e8c89a')                                       // lit from inside by the whiskey
            p.clearcoat = 1
            p.clearcoatRoughness = 0.12
            p.sheen = 0.6
            p.sheenColor = new THREE.Color('#fff2dc')
            p.sheenRoughness = 0.5
            p.envMapIntensity = 1.4
            r = p
            break
          }
          case m.name === 'JT_Crystal': {
            const p = physical(m)
            p.transmission = 0
            p.transparent = true
            p.color.set('#000000') // no diffuse body: crystal shows only what it reflects, plus a faint cool tint
            p.roughness = 0.015
            p.metalness = 0
            p.ior = 1.56 // lead crystal
            p.specularIntensity = 1
            p.clearcoat = 1
            p.clearcoatRoughness = 0.01
            p.envMapIntensity = 2.6 // cut facets and rims glint with the window
            p.depthWrite = false
            addCrystal(p, settings.tier === 'low' ? 0.05 : 0.035)
            r = p
            break
          }
          case m.name === 'JT_Whiskey_Caustic': {
            // projected caustic: additive amber light on the marble, intensity driven by the scene lighting
            r = new THREE.MeshBasicMaterial({ name: m.name, map: m.map, transparent: true, depthWrite: false,
              blending: THREE.AdditiveBlending, toneMapped: true, opacity: 0, side: THREE.DoubleSide })
            break
          }
          case m.name === 'JT_Window_Glass': {
            // low-iron float glass: real 12 mm panes, faint green-white tint, reflections only at grazing angles
            const p = physical(m)
            p.transparent = true
            p.opacity = 0.035
            p.color.set('#e4eeea')
            p.roughness = 0.04
            p.ior = 1.5
            p.specularIntensity = 1
            p.envMapIntensity = 0.12 // the env cube contains the bright window itself; more reads as a white veil
            p.depthWrite = false
            r = p
            break
          }
          case m.name.startsWith('JT_Facade') || m.name === 'JT_Sky_PodLights' || m.name === 'JT_Sky_Beacon': {
            if (m.name.startsWith('JT_Facade')) m.emissive.set('#ffffff')
            else m.emissive.set(m.name === 'JT_Sky_Beacon' ? '#ff1a10' : '#ffd6a0')
            m.emissiveIntensity = 0
            break
          }
          case m.name === 'JT_Lamp_Diffuser':
            m.emissive.set('#ffbe78')
            break
        }
        // sharp textures at grazing angles: records, wood grain and marble are viewed obliquely
        const sm = r as THREE.MeshStandardMaterial
        for (const t of [sm.map, sm.normalMap, sm.roughnessMap, sm.metalnessMap, sm.aoMap, sm.emissiveMap]) {
          if (t) t.anisotropy = maxAnisotropy
        }
        upgraded.set(m.name, r)
        materials.set(r.name, r)
        return r
      })
      mesh.material = Array.isArray(mesh.material) ? out : out[0]
    })
  }

  // per-object materials for individually lit indicators
  for (const [name, o] of Object.entries(nodes)) {
    if (/^JT_Turntable_(TimeLED_|Indicator$)/.test(name) && (o as THREE.Mesh).isMesh) {
      const mesh = o as THREE.Mesh
      mesh.material = (mesh.material as THREE.MeshStandardMaterial).clone()
    }
  }
  return { nodes, materials }
}

/** Resolve the interactive target for any picked object. */
export function interactiveId(o: THREE.Object3D | null): string | null {
  for (let p = o; p; p = p.parent) {
    const n = p.name.replace(/^COL_/, '')
    let m: RegExpMatchArray | null
    if ((m = n.match(/Sleeve_(\d{3})/))) return `sleeve:${Number(m[1]) - 1}`
    if (/^(PlayButton|JT_Turntable_PlayButton)/.test(n)) return 'play'
    if (/^(TimeKnob|JT_Turntable_TimeKnob|JT_Turntable_TimeLED|JT_Turntable_Label_(AUTO|DAY|DUSK|NIGHT))/.test(n)) return 'time'
    if (/^(RoomKnob|JT_Turntable_RoomKnob)/.test(n)) return 'room'
    if (/^(SpeedSelector|JT_Turntable_SpeedSelector)/.test(n)) return 'speed'
    if (/^(Tonearm|JT_Tonearm_(Arm|Headshell|Cartridge|FingerLift|Collar|Stylus))$/.test(n)) return 'tonearm'
    if (/^(CueLever|JT_Turntable_Cue)/.test(n)) return 'cue'
    if (/^(Record|JT_Turntable_Record|JT_Turntable_Mat|JT_Turntable_Platter$)/.test(n)) return 'record'
    if (/^(CabinetSelector|JT_Cabinet_Selector)/.test(n)) return 'crate'
    if (/^(DisplaySleeve|JT_Cabinet_(DisplaySleeve|CaptionCard|SleevesBulk)|JT_Shelf_)/.test(n)) return 'cabinet'
    if (/^(Lamp|LampSwitch|JT_Lamp_)/.test(n)) return 'lamp'
    if (/^(CurtainCord|JT_Curtain_(Cord|Left|Right))/.test(n)) return 'curtain'
    if (/^(Whiskey|JT_Whiskey_)/.test(n)) return 'whiskey'
  }
  return null
}

export const LABELS: Record<string, string> = {
  play: 'Play',
  time: 'Time of day',
  room: 'Lamp dimmer',
  speed: '33⅓ / 45',
  tonearm: 'Tonearm — drag to drop the needle',
  cue: 'Cue lever',
  record: 'Record — view from above',
  crate: 'For You / My Crate',
  cabinet: 'Browse the cabinet',
  lamp: 'Lamp',
  curtain: 'Curtains',
  whiskey: 'Display turntable',
  'map-filter': 'Show: all / live / halls / historic',
  'map-date': 'When',
  'map-card': 'Save, or tap to put the card away',
  'map-table': 'Open the Jazz Map',
}
