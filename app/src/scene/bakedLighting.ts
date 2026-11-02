// Photoreal lighting from the Cycles bake (blender/scripts/bake_lighting.py).
//
// Static meshes: diffuse lighting comes ONLY from four blended lightmaps (day / dusk / night natural light through
// the window, plus the practical lamp); the real-time lights keep their specular highlights but not their diffuse
// (that is in the bake), and IBL / hemisphere diffuse is dropped (also in the bake).
// Moving parts: lit by the HDR room panorama rendered in Cycles (IBL) plus a sun matching the bake rig.
import * as THREE from 'three'
import { RGBELoader } from 'three/examples/jsm/loaders/RGBELoader.js'

const BASE = '/assets/lighting'
export type BakeMeta = { size: number; objects: string[]
  maps: Record<'day' | 'dusk' | 'night' | 'lamp', { file: string; fileLow?: string; scale: number }> }

/** Shared uniforms: every baked material reads the same textures and weights. */
export const bakeUniforms = {
  lmDusk: { value: null as THREE.Texture | null },
  lmNight: { value: null as THREE.Texture | null },
  lmLamp: { value: null as THREE.Texture | null },
  uLmW: { value: new THREE.Vector4() }, // weights for day (the material's own lightMap), dusk, night, lamp
  uDirectDiffuse: { value: 0 },
  // the golden east light (Experience): not in the bake, so its diffuse is added here analytically - same cone,
  // inverse-square falloff and Lambert term three uses for a SpotLight (view space; colour premultiplied by intensity)
  uGoldPos: { value: new THREE.Vector3() },
  uGoldDir: { value: new THREE.Vector3(0, -1, 0) },
  uGoldCol: { value: new THREE.Vector3() },
  uGoldCone: { value: new THREE.Vector2(0.95, 0.98) }, // cos(outer), cos(inner)
}

const MAPS_CHUNK = /* glsl */ `
#if defined( RE_IndirectDiffuse )
	#ifdef USE_LIGHTMAP
		// Cycles-baked irradiance: natural light by time of day + the practical lamp (replaces ambient / IBL diffuse)
		vec3 lightMapIrradiance = texture2D( lightMap, vLightMapUv ).rgb * uLmW.x
			+ texture2D( lmDusk, vLightMapUv ).rgb * uLmW.y
			+ texture2D( lmNight, vLightMapUv ).rgb * uLmW.z
			+ texture2D( lmLamp, vLightMapUv ).rgb * uLmW.w;
		irradiance = lightMapIrradiance;
		reflectedLight.directDiffuse *= uDirectDiffuse;
		{
			vec3 toL = uGoldPos - geometryPosition;
			float d = max( length( toL ), 1e-3 );
			vec3 L = toL / d;
			float spot = smoothstep( uGoldCone.x, uGoldCone.y, dot( -L, uGoldDir ) );
			irradiance += uGoldCol * spot * max( dot( geometryNormal, L ), 0.0 ) / max( d * d, 0.01 );
		}
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

type BakeData = Awaited<ReturnType<typeof loadBake>>
const bakeCache = new Map<boolean, { p: Promise<void>; v?: BakeData; done: boolean }>()
/** Suspends (React Suspense) until the bake is loaded, so the room's first frame already uses baked materials:
 * applying it after the first frames recompiled every room material at once (a multi-second freeze). */
export function useBakeData(low: boolean): BakeData {
  let e = bakeCache.get(low)
  if (!e) {
    const entry: { p: Promise<void>; v?: BakeData; done: boolean } = { p: Promise.resolve(), done: false }
    entry.p = loadBake(low).then((v) => { entry.v = v }, () => { entry.v = null }).finally(() => { entry.done = true })
    bakeCache.set(low, entry)
    e = entry
  }
  if (!e.done) throw e.p
  return e.v ?? null
}

export async function loadBake(low = false): Promise<{ meta: BakeMeta; maps: Record<string, THREE.Texture>; envs: Record<string, THREE.DataTexture> } | null> {
  try {
    const meta = (await (await fetch(`${BASE}/lightmaps.json`)).json()) as BakeMeta
    // ImageBitmaps decode off the main thread: a 4096 JPEG decoded inside texImage2D is ~120 ms per lightmap
    const bl = new THREE.ImageBitmapLoader()
    const maps: Record<string, THREE.Texture> = {}
    await Promise.all(Object.entries(meta.maps).map(async ([k, m]) => {
      const t = new THREE.Texture(await bl.loadAsync(`${BASE}/${low && m.fileLow ? m.fileLow : m.file}`))
      t.needsUpdate = true
      t.colorSpace = THREE.SRGBColorSpace // stored as sRGB(E / scale)
      t.flipY = false // glTF UV convention
      t.channel = 1 // TEXCOORD_1 = the 'Lightmap' UV layer
      t.anisotropy = 4
      maps[k] = t
    }))
    const rl = new RGBELoader()
    const envs: Record<string, THREE.DataTexture> = {}
    await Promise.all(['day', 'dusk', 'night'].map(async (k) => {
      const t = await rl.loadAsync(`${BASE}/env-${k}.hdr`)
      t.mapping = THREE.EquirectangularReflectionMapping
      envs[k] = t
    }))
    bakeUniforms.lmDusk.value = maps.dusk
    bakeUniforms.lmNight.value = maps.night
    bakeUniforms.lmLamp.value = maps.lamp
    return { meta, maps, envs }
  } catch (e) {
    console.warn('baked lighting unavailable, using real-time lighting only', e)
    return null
  }
}

/** Give every baked mesh its own material clone carrying the lightmap patch. */
export function applyBake(nodes: Record<string, THREE.Object3D>, meta: BakeMeta, dayMap: THREE.Texture) {
  const clones = new Map<THREE.Material, THREE.Material>()
  let count = 0
  for (const name of meta.objects) {
    const mesh = nodes[name] as THREE.Mesh | undefined
    const list: THREE.Mesh[] = mesh?.isMesh ? [mesh] : ((mesh?.children.filter((c) => (c as THREE.Mesh).isMesh) ?? []) as THREE.Mesh[])
    for (const m of list) {
      if (!m.geometry.attributes.uv1) continue
      const swap = (mat: THREE.Material) => {
        let c = clones.get(mat)
        if (!c) {
          const b = mat.clone() as THREE.MeshStandardMaterial
          b.lightMap = dayMap
          b.lightMapIntensity = 1
          b.aoMap = null // occlusion is in the bake
          b.onBeforeCompile = (shader) => {
            Object.assign(shader.uniforms, bakeUniforms)
            shader.fragmentShader = shader.fragmentShader
              .replace('#include <lights_fragment_maps>', MAPS_CHUNK)
              .replace('void main() {', 'uniform sampler2D lmDusk;\nuniform sampler2D lmNight;\nuniform sampler2D lmLamp;\nuniform vec4 uLmW;\nuniform float uDirectDiffuse;\nuniform vec3 uGoldPos;\nuniform vec3 uGoldDir;\nuniform vec3 uGoldCol;\nuniform vec2 uGoldCone;\nvoid main() {')
          }
          b.customProgramCacheKey = () => 'jt-baked'
          b.userData.baked = true
          c = b
          clones.set(mat, c)
        }
        return c
      }
      m.material = Array.isArray(m.material) ? m.material.map(swap) : swap(m.material)
      m.userData.baked = true
      count++
    }
  }
  return count
}

/** Per-frame weights: time-of-day blend x curtain shading for natural light, dimmer for the lamp, x exposure. */
export function updateBakeWeights(meta: BakeMeta, w: { day: number; dusk: number; night: number }, lamp: number, shade: number,
  exposure: number) {
  const k = Math.PI * exposure // three: indirect diffuse = albedo / PI * irradiance; the bake stores albedo-free radiance
  bakeUniforms.uLmW.value.set(
    w.day * meta.maps.day.scale * shade * k,
    w.dusk * meta.maps.dusk.scale * shade * k,
    w.night * meta.maps.night.scale * shade * k,
    lamp * meta.maps.lamp.scale * k,
  )
}

let sharedPM: THREE.PMREMGenerator | null = null
/** One PMREM generator for the whole app, never disposed: disposing it destroys its compiled blur program, and the
 * museum's panoramas (prefetched later) then recompiled it - a ~120 ms frame in the listening room. */
export function pmrem(gl: THREE.WebGLRenderer) {
  return (sharedPM ??= new THREE.PMREMGenerator(gl))
}

/** PMREM the three room panoramas once; the scene switches between them with the time of day. */
export function buildEnvs(gl: THREE.WebGLRenderer, envs: Record<string, THREE.DataTexture>) {
  const pm = pmrem(gl)
  const out: Record<string, THREE.Texture> = {}
  for (const [k, t] of Object.entries(envs)) out[k] = pm.fromEquirectangular(t).texture
  return out
}
