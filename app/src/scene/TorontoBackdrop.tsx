// Toronto window environment from the three matched photographs (Day / Dusk / Night, same viewpoint).
// Three concentric cylinders at different depths (sky plate, city, water) sample the photo by the
// direction from a reference eye point, so from the Home camera they compose exactly into the photograph,
// while camera movement yields a very light, physically consistent parallax.
// Calibration (degrees per pixel from the CN Tower height) comes from blender/scripts/gen_environment.py.
import * as THREE from 'three'
import { useMemo } from 'react'
import { useFrame, useLoader } from '@react-three/fiber'
import { useJazz } from '../state/store'
import type { LightPreset } from './timeMode'
import { TIERS } from '../quality'

const BASE = '/assets/environment'
const MODES = ['day', 'dusk', 'night'] as const
/** Home camera position (three.js world) — the eye point the photo is projected from. */
const EYE = new THREE.Vector3(-0.135, 1.04, 0.66)
const YAW_CENTER = 25 // deg, right of the window normal (-Z): puts the CN Tower in the centre pane
const SHORE_ELEV = -2.5 // deg below eye level: high-rise view down to the waterfront

type EnvMeta = { width: number; height: number; pxPerDeg: number; shoreRow: number }

const vert = /* glsl */ `
  varying vec3 vWorld;
  void main() {
    vec4 w = modelMatrix * vec4(position, 1.0);
    vWorld = w.xyz;
    gl_Position = projectionMatrix * viewMatrix * w;
  }`

const frag = /* glsl */ `
  uniform sampler2D tDay, tDusk, tNight, tMask;
  uniform vec3 uW;            // day / dusk / night weights
  uniform vec3 uEye;
  uniform float uLayer;       // 0 sky plate, 1 city, 2 water
  uniform float uSingle;      // 1: the low tier draws the whole photograph on one layer (it gets the lake too)
  uniform vec3 uCalmD, uCalmK, uCalmN; // the lake's average colour per photograph (day / dusk / night), measured once
  uniform float uYaw0, uPxDeg, uWpx, uHpx, uShoreRow, uShoreElev, uTime, uExposure, uRipple, uGlow;
  varying vec3 vWorld;
  void main() {
    vec3 d = normalize(vWorld - uEye);
    float yaw = degrees(atan(d.x, -d.z));
    float pitch = degrees(asin(clamp(d.y, -1.0, 1.0)));
    float px = uWpx * 0.5 + (yaw - uYaw0) * uPxDeg;
    float row = uShoreRow + (uShoreElev - pitch) * uPxDeg;
    vec2 uv = vec2(px / uWpx, 1.0 - row / uHpx);
    float below = 0.0;
    float nearW = 0.0;
    float glint = 0.0;
    uv.x = 1.0 - abs(mod(uv.x, 2.0) - 1.0);                    // mirrored continuation beyond the frame
    if (uLayer > 1.5 || (uSingle > 0.5 && row > uShoreRow)) {
      // water continues below the frame by folding within the photo's own lake band (shoreline .. bottom edge):
      // mirroring the whole photo stood the skyline on its head in steep views (the map table looks down)
      // (and, further below, settles into calm open water of the same colour: no repeated light streaks)
      if (uv.y < 0.0) {
        float band = max(0.02, 1.0 - (uShoreRow + 40.0) / uHpx);
        below = -uv.y;
        float t = mod(below, 2.0 * band);
        uv.y = t < band ? t : 2.0 * band - t;
      }
      float r = sin(uv.y * 1400.0 + uTime * 1.1) * sin(uv.x * 37.0 - uTime * 0.4);
      uv.x += r * 0.00045 * uRipple;
      // near the window the photograph's own lake is magnified into soft blotches: there the ripples are procedural, on
      // the lake plane (view ray / depth below the eye - perspective-correct: finer with distance, crisp at any screen
      // size) - several incommensurate wind wavelets whose slope distorts the reflection and catches glints
      nearW = smoothstep(uShoreRow + 0.3 * (uHpx - uShoreRow), uHpx - 0.05 * (uHpx - uShoreRow), row);
      if (nearW > 0.0) {
        vec2 P = d.xz / max(-d.y, 0.03);
        vec2 grad = vec2(0.0);
        float hgt = 0.0;
        for (int i = 0; i < 5; i++) {
          float fi = float(i);
          float a = 0.6 + fi * 1.37;
          vec2 k = vec2(sin(a), cos(a)) * (8.0 + fi * 5.1);
          float ph = dot(P, k) + uTime * (1.1 + fi * 0.37);
          float amp = 1.0 / (1.0 + fi * 0.8);
          hgt += sin(ph) * amp;
          grad += k * cos(ph) * amp;
        }
        uv += vec2(grad.x * 0.00028, grad.y * 0.00009) * nearW * uRipple;
        glint = hgt;
      }
      uv.y = max(uv.y, 0.001);
    } else {
      uv.y = clamp(uv.y, 0.001, 0.999);
    }
    vec4 m = texture2D(tMask, uv);
    vec3 c = texture2D(tDay, uv).rgb * uW.x + texture2D(tDusk, uv).rgb * uW.y + texture2D(tNight, uv).rgb * uW.z;
    if (below > 0.0) {
      // open water beyond the photograph: the lake's own colour (a heavily blurred mip of its bottom band), gently rippled
      vec3 calm = uCalmD * uW.x + uCalmK * uW.y + uCalmN * uW.z;
      float rip = 0.94 + 0.06 * sin(below * 900.0 + uv.x * 60.0 + uTime * 0.8) * sin(uv.x * 210.0 - uTime * 0.5);
      c = mix(c, calm * rip, smoothstep(0.0, 0.18, below));
    }
    if (nearW > 0.0) {
      // crisp wavelet crests (anti-aliased with the pixel footprint): light crests catch the reflected city / sky,
      // troughs fall darker - local contrast on the magnified photo instead of soft blotches
      float w = fwidth(glint) + 1e-3;
      float crest = smoothstep(0.9 - w, 0.9 + w, glint) - 0.5 * smoothstep(-0.6 - w, -0.6 + w, -glint);
      float lum = dot(c, vec3(0.2126, 0.7152, 0.0722));
      c *= 1.0 + nearW * (0.32 * crest);
      c += nearW * max(crest, 0.0) * lum * 0.45 * (uW.y + uW.z + 0.4 * uW.x);
      // crests also catch the open sky: a lift of the lake's own colour, so the texture reads in the dark water too
      vec3 calmC = uCalmD * uW.x + uCalmK * uW.y + uCalmN * uW.z;
      c += nearW * max(crest, 0.0) * calmC * 1.1;
    }
    float a = 1.0;
    if (uLayer > 0.5 && uLayer < 1.5) a = (1.0 - m.r) * (1.0 - m.b);
    if (uLayer > 1.5) a = row > uHpx ? 1.0 : m.b;
    c *= uExposure;
    // window lights feed a restrained bloom at dusk / night only
    c *= 1.0 + m.g * uGlow * (uW.z * 1.6 + uW.y * 0.6) * (1.0 - step(1.5, uLayer));
    gl_FragColor = vec4(c, a);
  }`

/**
 * Window-sized panel inside the <Environment> cube showing the Toronto photograph, so brass, glass and vinyl
 * reflect the real view; three stacked layers crossfade with the time of day.
 */
export function WindowReflection({ live }: { live: React.MutableRefObject<LightPreset> }) {
  const tex = useLoader(THREE.TextureLoader, MODES.map((m) => `${BASE}/toronto-${m}.webp`))
  const mats = useMemo(() => tex.map((t) => {
    t.colorSpace = THREE.SRGBColorSpace
    return new THREE.MeshBasicMaterial({ map: t, transparent: true, depthWrite: false, toneMapped: false,
      side: THREE.DoubleSide })
  }), [tex])
  useFrame(() => {
    const p = live.current
    const w = [p.envDay, p.envDusk, p.envNight]
    // brightness of the window as a light source (photo values are display-referred)
    mats.forEach((m, i) => {
      m.opacity = w[i]
      m.color.setScalar(1.6 * p.envExposure)
    })
  })
  return (
    <group position={[1.9, 1.45, -2.55]}>
      {mats.map((m, i) => (
        <mesh key={i} material={m} renderOrder={i}>
          <planeGeometry args={[3.6, 2.9]} />
        </mesh>
      ))}
    </group>
  )
}

export function TorontoBackdrop({ live }: { live: React.MutableRefObject<LightPreset> }) {
  const tier = useJazz((s) => s.tier)
  const reduced = useJazz((s) => s.reducedMotion)
  const layered = TIERS[tier].tier !== 'low' // the low tier draws the photo once (no parallax layers)
  // parsed once: a fresh object per render re-ran the layer setup below, re-uploading the three photographs each time
  const metaSrc = useLoader(THREE.FileLoader, `${BASE}/environment.json`) as string
  const meta = useMemo(() => JSON.parse(metaSrc) as EnvMeta, [metaSrc])
  const urls = useMemo(() => [
    ...MODES.map((m) => `${BASE}/toronto-${m}.webp`),
    ...(layered ? MODES.map((m) => `${BASE}/toronto-${m}-sky.webp`) : []),
    `${BASE}/toronto-layers.png`,
  ], [layered])
  const tex = useLoader(THREE.TextureLoader, urls)

  const layers = useMemo(() => {
    tex.forEach((t, i) => {
      t.colorSpace = i === tex.length - 1 ? THREE.NoColorSpace : THREE.SRGBColorSpace
      t.wrapS = THREE.MirroredRepeatWrapping
      t.anisotropy = 8
      t.generateMipmaps = true
      t.minFilter = THREE.LinearMipmapLinearFilter
      t.needsUpdate = true
    })
    const photo = tex.slice(0, 3)
    const sky = layered ? tex.slice(3, 6) : photo
    const mask = tex[tex.length - 1]
    // the lake's colour per photograph: the average of its bottom water band (linear), measured once on a small canvas
    const calm = photo.map((t) => {
      const img = t.image as CanvasImageSource & { width: number; height: number }
      const c = document.createElement('canvas')
      c.width = 64
      c.height = 36
      const g = c.getContext('2d', { willReadFrequently: true })!
      g.drawImage(img, 0, 0, 64, 36)
      const d = g.getImageData(0, 33, 64, 3).data
      let r = 0, gg = 0, b = 0
      for (let i = 0; i < d.length; i += 4) { r += d[i]; gg += d[i + 1]; b += d[i + 2] }
      const n = d.length / 4
      return new THREE.Color().setRGB(r / n / 255, gg / n / 255, b / n / 255, THREE.SRGBColorSpace)
    })
    const make = (layer: number, set: THREE.Texture[], radius: number) => {
      const mat = new THREE.ShaderMaterial({
        vertexShader: vert, fragmentShader: frag, side: THREE.BackSide, depthWrite: layer === 0, fog: false,
        transparent: layer > 0,
        uniforms: {
          tDay: { value: set[0] }, tDusk: { value: set[1] }, tNight: { value: set[2] }, tMask: { value: mask },
          uW: { value: new THREE.Vector3(0, 1, 0) }, uEye: { value: EYE }, uLayer: { value: layer },
          uYaw0: { value: YAW_CENTER }, uPxDeg: { value: meta.pxPerDeg }, uWpx: { value: meta.width },
          uHpx: { value: meta.height }, uShoreRow: { value: meta.shoreRow }, uShoreElev: { value: SHORE_ELEV },
          uTime: { value: 0 }, uExposure: { value: 1 }, uRipple: { value: 1 }, uGlow: { value: 1 }, uSingle: { value: layered ? 0 : 1 },
          uCalmD: { value: calm[0] }, uCalmK: { value: calm[1] }, uCalmN: { value: calm[2] },
        },
      })
      const h = radius * 2.4
      const geo = new THREE.CylinderGeometry(radius, radius, h, 96, 1, true)
      const mesh = new THREE.Mesh(geo, mat)
      mesh.position.copy(EYE)
      // the opaque sky / photo layer is drawn AFTER the room: the depth test then discards every pixel the room covers,
      // so this shader runs only inside the window (drawn first, it ran for the whole screen); the transparent city and
      // water layers keep their order within the transparent pass, before the window glass
      mesh.renderOrder = layer === 0 ? 10 : -10 + layer
      mesh.frustumCulled = false
      mesh.raycast = () => {}
      return mesh
    }
    // the low tier: one opaque cylinder with the full photograph
    if (!layered) return [make(0, photo, 120)]
    return [make(0, sky, 150), make(1, photo, 95), make(2, photo, 40)]
  }, [tex, meta, layered])

  useFrame((state) => {
    const p = live.current
    for (const l of layers) {
      const u = (l.material as THREE.ShaderMaterial).uniforms
      u.uW.value.set(p.envDay, p.envDusk, p.envNight)
      u.uExposure.value = p.envExposure
      u.uTime.value = state.clock.elapsedTime
      u.uRipple.value = reduced ? 0 : 1
    }
  })

  return (
    <>
      {layers.map((m, i) => (
        <primitive key={i} object={m} />
      ))}
    </>
  )
}
