// The view from the museum's Toronto window: modelled, not a photograph. The procedural Toronto skyline
// (blender/scripts/build_home.py: build_skyline - ~550 buildings, CN Tower, Rogers Centre dome, cranes, beacons)
// at night, over a reflective lake under a city-glow sky. The asset is exported at 1/10 scale about the viewer
// (CN Tower 55 m at ~285 m): angular sizes match the real view and everything fits inside the camera's far plane.
// The lake mirror renders only the OUTSIDE layer, so the museum's own walls never block the reflection.
import * as THREE from 'three'
import { Reflector } from 'three/examples/jsm/objects/Reflector.js'

export const OUTSIDE_LAYER = 3

const skyVert = /* glsl */ `
  varying vec3 vDir;
  void main() {
    vDir = normalize(position);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }`
const skyFrag = /* glsl */ `
  varying vec3 vDir;
  uniform float uTime;
  uniform vec3 uW; // day / dusk / night weights (the time switch)
  float hash(vec2 p) { return fract(sin(dot(p, vec2(41.3, 289.1))) * 43758.5453); }
  vec3 sky(float h, vec3 zen, vec3 mid, vec3 glow, float k) {
    vec3 c = mix(mid, zen, smoothstep(0.05, 0.6, h));
    return mix(c, glow, exp(-max(h, 0.0) * k) * 0.85);
  }
  void main() {
    float h = clamp(vDir.y, -0.2, 1.0);
    // night: deep navy zenith, violet mid-sky, the warm sodium glow of the city along the horizon
    vec3 night = sky(h, vec3(0.004, 0.007, 0.022), vec3(0.020, 0.022, 0.060), vec3(0.16, 0.085, 0.055), 22.0);
    // dusk: indigo overhead, a rose-orange band over the lake
    vec3 dusk = sky(h, vec3(0.03, 0.04, 0.12), vec3(0.18, 0.12, 0.22), vec3(0.95, 0.42, 0.16), 9.0);
    // day: a clear lake-shore blue, pale toward the horizon
    vec3 day = sky(h, vec3(0.16, 0.32, 0.70), vec3(0.42, 0.60, 0.88), vec3(0.78, 0.85, 0.92), 6.0);
    vec3 c = day * uW.x + dusk * uW.y + night * uW.z;
    // a few faint stars high up at night (city skies hide most)
    vec2 g = floor(vDir.xz / max(0.05, vDir.y) * 180.0);
    float s = step(0.9965, hash(g)) * smoothstep(0.25, 0.6, h) * uW.z;
    c += s * (0.35 + 0.25 * sin(uTime * 1.7 + hash(g + 3.1) * 40.0));
    gl_FragColor = vec4(c, 1.0);
  }`

/** Lake: Reflector's mirror with a moving ripple distortion, fresnel and a deep-water tint. */
const lakeShader = {
  name: 'JTLakeShader',
  uniforms: {
    color: { value: null as THREE.Color | null },
    tDiffuse: { value: null as THREE.Texture | null },
    textureMatrix: { value: null as THREE.Matrix4 | null },
    uTime: { value: 0 },
  },
  vertexShader: /* glsl */ `
    uniform mat4 textureMatrix;
    varying vec4 vUv;
    varying vec3 vWorld;
    void main() {
      vUv = textureMatrix * vec4(position, 1.0);
      vec4 w = modelMatrix * vec4(position, 1.0);
      vWorld = w.xyz;
      gl_Position = projectionMatrix * viewMatrix * w;
    }`,
  fragmentShader: /* glsl */ `
    uniform vec3 color;
    uniform sampler2D tDiffuse;
    uniform float uTime;
    varying vec4 vUv;
    varying vec3 vWorld;
    void main() {
      vec2 p = vWorld.xz;
      float d = length(cameraPosition - vWorld);
      // wind ripples: stretched along the view (long vertical light streaks, like the real lake at night)
      // several incommensurate wave trains (no regular zigzag), fading with distance (no stripe aliasing far out)
      vec2 rip = vec2(
        sin(p.x * 0.37 + p.y * 0.11 + uTime * 0.9) * 0.5 + sin(p.y * 1.13 - p.x * 0.29 - uTime * 1.3) * 0.35
          + sin((p.x * 2.3 + p.y * 1.7) + uTime * 2.1) * 0.2,
        sin(p.y * 0.23 - uTime * 0.7) * 0.6 + sin(p.x * 0.61 + p.y * 0.4 + uTime * 1.1) * 0.4);
      float fade = clamp(1.0 - d / 420.0, 0.12, 1.0);
      vec4 uv = vUv;
      uv.x += rip.x * 0.0028 * uv.w * fade;
      uv.y += rip.y * 0.016 * uv.w * fade;
      vec3 refl = texture2DProj(tDiffuse, uv).rgb;
      vec3 v = normalize(cameraPosition - vWorld);
      float fres = 0.04 + 0.96 * pow(1.0 - max(v.y, 0.0), 5.0);
      vec3 c = color + refl * mix(0.35, 1.0, fres);
      gl_FragColor = vec4(c, 1.0);
    }`,
}

/** The time switch, outside the museum's window: daylight on the facades (sun) vs lit windows (night). */
export const outsideTime = { uSun: { value: new THREE.Color(0, 0, 0) }, uNight: { value: 1 } }
const DAY_SUN = new THREE.Color(1.0, 0.97, 0.92)
const DUSK_SUN = new THREE.Color(0.55, 0.36, 0.26)

/** facades and the rest of the city: night emission scaled by uNight, plus their own colour lit by the (flat) daylight */
function timeOfDay(m: THREE.Material) {
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, outsideTime)
    sh.fragmentShader = sh.fragmentShader
      .replace('void main() {', 'uniform vec3 uSun;\nuniform float uNight;\nvoid main() {')
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
        vec3 nW = normalize( ( vec4( normal, 0.0 ) * viewMatrix ).xyz );
        float sunSide = 0.45 + 0.55 * max( dot( nW, normalize( vec3( -0.55, 0.6, 0.35 ) ) ), 0.0 ) + 0.25 * max( nW.y, 0.0 );
        // (plus a cool sky fill: the shaded faces of a city by day are blue-grey, not black)
        vec3 skyFill = vec3( 0.55, 0.66, 0.85 ) * dot( uSun, vec3( 0.33 ) ) * 0.35;
        totalEmissiveRadiance = totalEmissiveRadiance * uNight + diffuseColor.rgb * ( uSun * sunSide + skyFill );`)
  }
  m.customProgramCacheKey = () => 'jt-outside-tod'
}

export function buildExterior(city: THREE.Object3D, opts: { reflective: boolean; cheap?: boolean; maxAniso: number }) {
  const root = new THREE.Group()
  root.name = 'JT_Mus_Outside'
  root.userData.musRuntime = true
  const onOutside = (o: THREE.Object3D) => o.traverse((x) => x.layers.enable(OUTSIDE_LAYER))

  // the city at night: lit windows, pod lights, beacons; body materials barely touched by the room's reflections
  const beacons: THREE.MeshStandardMaterial[] = []
  city.traverse((o) => {
    const mesh = o as THREE.Mesh
    if (!mesh.isMesh) return
    for (const m of (Array.isArray(mesh.material) ? mesh.material : [mesh.material]) as THREE.MeshStandardMaterial[]) {
      m.envMapIntensity = 0.04
      timeOfDay(m)
      if (m.name.startsWith('JT_Facade')) {
        m.emissive.set('#ffffff')
        m.emissiveIntensity = m.name.includes('Concrete') ? 2.6 : 3.2
        if (m.emissiveMap) m.emissiveMap.anisotropy = opts.maxAniso
      } else if (m.name === 'JT_Sky_PodLights') m.emissiveIntensity = 5
      else if (m.name === 'JT_Sky_Beacon') beacons.push(m)
      else if (m.name === 'JT_Sky_Concrete') {
        // the CN Tower's and the dome's architectural uplighting (cool white with a violet cast, as lit most nights)
        m.color.multiplyScalar(0.35)
        m.emissive.set('#8f86c9')
        m.emissiveIntensity = 0.55
      }
    }
  })
  // the Rogers Centre dome: its own, softer uplight (sharing the CN Tower's made it a bright blue blob in the view)
  const dome = city.getObjectByName('JT_Skyline_Dome') as THREE.Mesh | undefined
  if (dome) {
    const dm = (dome.material as THREE.MeshStandardMaterial).clone()
    dm.emissive.set('#9a8f86')
    dm.emissiveIntensity = 0.16
    timeOfDay(dm)
    dome.material = dm
  }
  // the low tier: unlit night materials (lit windows from the emissive maps, dark bodies) - integrated GPUs
  if (opts.cheap) {
    city.traverse((o) => {
      const mesh = o as THREE.Mesh
      if (!mesh.isMesh) return
      const m = mesh.material as THREE.MeshStandardMaterial
      if (Array.isArray(m)) return
      const lit = m.emissiveMap ?? null
      const b = new THREE.MeshBasicMaterial({ name: m.name, map: lit, color: new THREE.Color(m.emissive).multiplyScalar(lit ? m.emissiveIntensity * 0.9 : 0)
        .add(new THREE.Color(m.color).multiplyScalar(0.05)) })
      // daylight: the facade's own colour map (or flat colour) under the sun, crossfaded with the night look
      const dayMap = m.map ?? null
      const dayCol = new THREE.Color(m.color)
      b.onBeforeCompile = (sh) => {
        Object.assign(sh.uniforms, outsideTime, { tDayMap: { value: dayMap }, uDayCol: { value: dayCol } })
        sh.fragmentShader = sh.fragmentShader
          .replace('void main() {', `uniform vec3 uSun;\nuniform float uNight;\nuniform vec3 uDayCol;\n${dayMap ? 'uniform sampler2D tDayMap;\n' : ''}void main() {`)
          .replace('#include <map_fragment>', `#include <map_fragment>
            vec3 dayC = uDayCol${dayMap && lit ? ' * texture2D( tDayMap, vMapUv ).rgb' : ''};
            diffuseColor.rgb = diffuseColor.rgb * uNight + dayC * uSun;`)
      }
      b.customProgramCacheKey = () => `jt-outside-tod-basic-${!!dayMap && !!lit}`
      if (m.name === 'JT_Sky_Beacon') beacons.push(b as unknown as THREE.MeshStandardMaterial)
      mesh.material = b
    })
  }
  root.add(city)

  const sky = new THREE.Mesh(new THREE.SphereGeometry(1350, 48, 24),
    new THREE.ShaderMaterial({ vertexShader: skyVert, fragmentShader: skyFrag, side: THREE.BackSide, depthWrite: false,
      uniforms: { uTime: { value: 0 }, uW: { value: new THREE.Vector3(0, 0, 1) } } }))
  sky.renderOrder = 10 // after the opaque museum: the depth test keeps this shader to the window
  root.add(sky)

  const lakeGeo = new THREE.CircleGeometry(1400, 96)
  let lake: THREE.Mesh
  if (opts.reflective) {
    const r = new Reflector(lakeGeo, { textureWidth: 1024, textureHeight: 512, color: 0x05070c, clipBias: 0.002, multisample: 0,
      shader: lakeShader })
    r.camera.layers.set(OUTSIDE_LAYER) // the mirror sees only the outside world
    lake = r
  } else {
    // (unlit: a lit lake picks up the museum's warm interior environment and reads as a pale brown floor)
    lake = new THREE.Mesh(lakeGeo, new THREE.MeshBasicMaterial({ color: '#06080f' }))
  }
  lake.rotation.x = -Math.PI / 2
  // at the city's own water level: the scale model stands below the viewer (its ground is ~14 m down, a high window);
  // a lake at the museum floor would drown every building lower than that and leave only the towers showing
  const water = city.getObjectByName('JT_Water')
  const waterY = water ? new THREE.Box3().setFromObject(water).max.y : 0
  lake.position.y = waterY + 0.02
  if (water) water.visible = false // the mirror replaces the model's flat water plane
  root.add(lake)
  onOutside(root)

  const lakeNight = new THREE.Color(0x05070c)
  const lakeDusk = new THREE.Color(0x0d0f1c)
  const lakeDay = new THREE.Color(0x0e2a40)
  /** t: seconds; w: day / dusk / night weights (eased by the caller) */
  const update = (t: number, w: THREE.Vector3 = new THREE.Vector3(0, 0, 1)) => {
    ;(sky.material as THREE.ShaderMaterial).uniforms.uTime.value = t
    ;(sky.material as THREE.ShaderMaterial).uniforms.uW.value.copy(w)
    outsideTime.uSun.value.setRGB(0, 0, 0).add(DAY_SUN.clone().multiplyScalar(w.x * 2.5)).add(DUSK_SUN.clone().multiplyScalar(w.y))
    outsideTime.uNight.value = w.z + w.y * 0.75
    const lc = (lake.material as THREE.ShaderMaterial).uniforms?.color?.value as THREE.Color | undefined
    const target = lakeNight.clone().multiplyScalar(w.z).add(lakeDusk.clone().multiplyScalar(w.y)).add(lakeDay.clone().multiplyScalar(w.x))
    if (lc) lc.copy(target)
    else if ((lake.material as THREE.MeshBasicMaterial).isMeshBasicMaterial) (lake.material as THREE.MeshBasicMaterial).color.copy(target)
    const lm = lake.material as THREE.ShaderMaterial
    if (lm.uniforms?.uTime) lm.uniforms.uTime.value = t
    const blink = (2.5 + 2.5 * Math.max(0, Math.sin(t * 2.2))) * (0.25 + 0.75 * (w.z + w.y))
    for (const b of beacons) {
      if ((b as THREE.Material as THREE.MeshBasicMaterial).isMeshBasicMaterial) (b as THREE.Material as THREE.MeshBasicMaterial).color.setRGB(blink / 5, 0.02, 0.02)
      else b.emissiveIntensity = blink
    }
  }
  return { root, update }
}
