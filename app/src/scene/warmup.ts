// GPU warm-up for spaces that are loaded but not on screen (the museum, the Jazz Map): one texture upload per frame -
// a texture that is new or changed (photographs loading late, canvases repainted when fonts arrive).
// Spread over idle frames, none of it lands on the first frame that shows the space.
import * as THREE from 'three'

type Props = { get(o: object): Record<string, unknown> }

export function createWarmup(gl: THREE.WebGLRenderer, root: THREE.Object3D) {
  const props = (gl as unknown as { properties: Props }).properties
  let textures: THREE.Texture[] = []
  let scanAt = -1
  const scan = () => {
    const set = new Set<THREE.Texture>()
    root.traverse((o) => {
      const mesh = o as THREE.Mesh
      if (!mesh.isMesh) return
      for (const m of (Array.isArray(mesh.material) ? mesh.material : [mesh.material]) as unknown as Record<string, unknown>[]) {
        for (const v of Object.values(m)) if ((v as THREE.Texture)?.isTexture) set.add(v as THREE.Texture)
        const u = (m as { uniforms?: Record<string, { value: unknown }> }).uniforms
        if (u) for (const x of Object.values(u)) if ((x?.value as THREE.Texture)?.isTexture) set.add(x.value as THREE.Texture)
      }
    })
    textures = [...set]
  }
  const pending = (t: THREE.Texture) => {
    const img = (t as THREE.Texture & { image?: { width?: number; complete?: boolean } }).image
    if (!img || (img as { complete?: boolean }).complete === false || !(img.width ?? (t as unknown as { mipmaps?: unknown[] }).mipmaps)) return false
    return props.get(t).__version !== t.version
  }
  /** Do at most one piece of work; call once per frame while the space is NOT visible. */
  return function step(now: number, extra: THREE.Texture[] = []) {
    if (scanAt < 0 || now - scanAt > 1000) { scan(); scanAt = now }
    const t = [...extra, ...textures].find(pending)
    if (t) {
      try { gl.initTexture(t) } catch { /* not decodable yet */ }
      return
    }
    // (program uniforms are left to first use: querying them early waits behind the GPU process's background
    // shader compiles - a stall in the room; the first museum frame is drawn under the door fade instead)
  }
}

/** Compile a subtree's programs a few at a time (KHR_parallel_shader_compile), waiting for each batch: handing ~50
 * programs to the GPU process at once stalls the visible room's frames behind them (a ~0.8 s hitch). Proxies share
 * each mesh's geometry and material, so the programs are exactly the ones the real meshes will use.
 * `target` supplies the lights and environment; `prepare` / `restore` wrap each synchronous compile call (render
 * target, visibility). */
export async function compileInBatches(gl: THREE.WebGLRenderer, root: THREE.Object3D, camera: THREE.Camera,
  target: THREE.Scene, prepare: () => void, restore: () => void, batch = 4, alive: () => boolean = () => true) {
  // start a few frames after the caller's own (heavy) setup frame, so the two never share one frame
  for (let k = 0; k < 3; k++) await new Promise((r) => requestAnimationFrame(r))
  const seen = new Set<string>()
  const proxies: THREE.Mesh[] = []
  root.traverse((o) => {
    const mesh = o as THREE.Mesh
    if (!mesh.isMesh || !mesh.material) return
    for (const mat of (Array.isArray(mesh.material) ? mesh.material : [mesh.material]) as THREE.Material[]) {
      const g = mesh.geometry
      const sig = `${mat.uuid}|${Object.keys(g.attributes).sort().join(',')}|${(mesh as THREE.InstancedMesh).isInstancedMesh ? 'i' : ''}`
      if (seen.has(sig)) continue
      seen.add(sig)
      const p = new THREE.Mesh(g, mat)
      p.matrixWorld.copy(mesh.matrixWorld)
      proxies.push(p)
    }
  })
  for (let i = 0; i < proxies.length && alive(); i += batch) {
    const group = new THREE.Group()
    for (const p of proxies.slice(i, i + batch)) group.add(p)
    prepare()
    const done = gl.compileAsync(group, camera, target)
    restore()
    await done.catch(() => {})
    await new Promise((r) => requestAnimationFrame(r))
  }
}
