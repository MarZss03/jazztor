// Performance tiers. Chosen once from the GPU / device, overridable with ?quality=high|medium|low,
// and stepped down at runtime by the frame-rate monitor when the device can't keep up.
export type Tier = 'high' | 'medium' | 'low'

export type TierSettings = {
  tier: Tier
  assets: Tier // /assets/3d/<assets>/ — LOD0 / LOD1 / LOD2 with matching texture budgets
  dpr: [number, number]
  sunShadow: boolean
  keyShadow: boolean
  shadowMap: number
  post: boolean // EffectComposer (bloom, grain, vignette); off = renderer AgX tone mapping only
  multisampling: number
  bloom: boolean
  grain: boolean
  transmission: boolean // physically refractive crystal; off = alpha glass
  envResolution: number
  ao: 'full' | 'half' | 'off' // N8AO ambient occlusion
  contactShadows: boolean
  waterDetail: number // fbm octaves in the water shader
  clouds: boolean
}

export const TIERS: Record<Tier, TierSettings> = {
  high: { tier: 'high', assets: 'high', dpr: [1, 2], sunShadow: true, keyShadow: true, shadowMap: 2048, post: true,
    multisampling: 4, bloom: true, grain: true, transmission: true, envResolution: 256, ao: 'full', contactShadows: true, waterDetail: 5, clouds: true },
  medium: { tier: 'medium', assets: 'medium', dpr: [1, 1.25], sunShadow: false, keyShadow: true, shadowMap: 1024,
    post: true, multisampling: 2, bloom: true, grain: false, transmission: true, envResolution: 128, ao: 'half',
    contactShadows: true, waterDetail: 3,
    clouds: true },
  low: { tier: 'low', assets: 'low', dpr: [0.65, 0.65], sunShadow: false, keyShadow: false, shadowMap: 512, post: false,
    multisampling: 0, bloom: false, grain: false, transmission: false, envResolution: 64, ao: 'off', contactShadows: false, waterDetail: 2,
    clouds: false },
}

const ORDER: Tier[] = ['high', 'medium', 'low']
export const lowerTier = (t: Tier): Tier => ORDER[Math.min(ORDER.length - 1, ORDER.indexOf(t) + 1)]

export function gpuName(): string {
  try {
    const c = document.createElement('canvas')
    const gl = c.getContext('webgl2') ?? c.getContext('webgl')
    if (!gl) return 'none'
    const ext = gl.getExtension('WEBGL_debug_renderer_info')
    const name = ext ? String(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL)) : String(gl.getParameter(gl.RENDERER))
    gl.getExtension('WEBGL_lose_context')?.loseContext()
    return name
  } catch {
    return 'unknown'
  }
}

/** Heuristic first guess; the runtime monitor corrects it. */
export function detectTier(gpu = gpuName()): Tier {
  const forced = new URLSearchParams(location.search).get('quality')
  if (forced === 'high' || forced === 'medium' || forced === 'low') return forced
  const g = gpu.toLowerCase()
  const mobile = /android|iphone|ipad|mobile/i.test(navigator.userAgent)
  const mem = (navigator as Navigator & { deviceMemory?: number }).deviceMemory ?? 8
  if (/swiftshader|llvmpipe|software|basic render|none/.test(g)) return 'low'
  if (mobile) return mem >= 6 && /apple gpu|adreno \(tm\) 7|mali-g7[1-9]|immortalis/.test(g) ? 'medium' : 'low'
  if (/nvidia|geforce|quadro|rtx|radeon rx|radeon pro|apple m\d (pro|max|ultra)/.test(g)) return 'high'
  if (/iris xe|iris\(r\) xe|apple m\d|radeon\(tm\) (graphics|7\d0m)|arc/.test(g)) return 'medium'
  if (/intel|uhd|hd graphics|mali|adreno|powervr/.test(g)) return 'low'
  return mem >= 8 ? 'medium' : 'low'
}
