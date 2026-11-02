// Builds the runtime asset tiers from the Blender exports:
//   high   <- blender/exports/*.glb        (LOD0)
//   medium <- blender/exports/lod1/*.glb   (LOD1)
//   low    <- blender/exports/lod2/*.glb   (LOD2, textures already capped at 1K)
// Geometry: Draco (meshes with morph targets are left uncompressed). Textures: KTX2 / Basis Universal —
// ETC1S (Basis Universal) for every slot: colour perceptual/sRGB, data linear, normals in normal-map mode.
// Usage: node scripts/compress.mjs [tier ...]
import { NodeIO } from '@gltf-transform/core'
import { ALL_EXTENSIONS, KHRTextureBasisu } from '@gltf-transform/extensions'
import { dedup, draco, prune, weld } from '@gltf-transform/functions'
import { ktx2 } from 'ktx2-encoder/gltf-transform'
import draco3d from 'draco3dgltf'
import jpeg from 'jpeg-js'
import { PNG } from 'pngjs'
import { mkdirSync, readdirSync, rmSync, statSync, existsSync, readFileSync, writeFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { join } from 'node:path'

const root = new URL('../../', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')
const TIERS = { high: 'blender/exports', medium: 'blender/exports/lod1', low: 'blender/exports/lod2' }
// node scripts/compress.mjs [tier ...] [--only NAME]
const argv = process.argv.slice(2)
const onlyAt = argv.indexOf('--only')
const only = onlyAt >= 0 ? argv.splice(onlyAt, 2)[1] : null
const wanted = argv.length ? argv : Object.keys(TIERS)

// pure-JS decoders (Blender writes JPEG; PNG for anything with alpha) -> RGBA raster
const imageDecoder = async (buffer) => {
  const b = Buffer.from(buffer)
  const img = b[0] === 0x89 ? PNG.sync.read(b) : jpeg.decode(b, { useTArray: true, maxMemoryUsageInMB: 1024 })
  return { data: new Uint8Array(img.data), width: img.width, height: img.height }
}

const io = new NodeIO()
  .registerExtensions(ALL_EXTENSIONS)
  .registerDependencies({
    'draco3d.encoder': await draco3d.createEncoderModule(),
    'draco3d.decoder': await draco3d.createDecoderModule(),
  })

// Output: <tier>/<Model>.gltf + <Model>.bin, textures shared across models as <tier>/tex/<Texture>.ktx2
// (walnut, marble and brass appear in five models - the browser now downloads and caches each once).
for (const tier of wanted) {
  const src = join(root, TIERS[tier])
  const out = join(root, 'app/public/assets/3d', tier)
  mkdirSync(join(out, 'tex'), { recursive: true })
  const encoded = new Map() // source-image hash -> { uri, ktx2 bytes } : encode each texture once per tier
  // persistent cache across runs (D:/Jazztor/.cache/ktx2/<tier>/<hash>.ktx2): unchanged textures are never re-encoded
  const cacheDir = join(root, '.cache/ktx2', tier)
  mkdirSync(cacheDir, { recursive: true })
  for (const f of readdirSync(src).filter((n) => n.endsWith('.glb') && (!only || n === `${only}.glb`))) {
    const t0 = Date.now()
    const doc = await io.read(join(src, f))
    const pending = new Map()
    for (const t of doc.getRoot().listTextures()) {
      const hash = createHash('sha1').update(t.getImage()).digest('hex').slice(0, 10)
      const hit = encoded.get(hash)
      const cached = join(cacheDir, hash + '.ktx2')
      if (hit) t.setImage(hit.bytes).setMimeType('image/ktx2').setURI(hit.uri)
      else if (existsSync(cached)) {
        const uri = `tex/${(t.getName() || 'tex').replace(/[^w-]+/g, '_')}_${hash}.ktx2`
        const bytes = new Uint8Array(readFileSync(cached))
        t.setImage(bytes).setMimeType('image/ktx2').setURI(uri)
        encoded.set(hash, { uri, bytes })
      } else pending.set(t, hash)
    }
    await doc.transform(
      dedup(),
      // keep UVs on untextured canvas zones (plaque, caption card) and empty marker nodes (pivots, light points, map origin)
      prune({ keepAttributes: true, keepLeaves: true }),
      weld(),
      ktx2({ slots: /^(baseColorTexture|emissiveTexture)$/, isUASTC: false, qualityLevel: 180, compressionLevel: 2,
        isPerceptual: true, isSetKTX2SRGBTransferFunc: true, generateMipmap: true, imageDecoder }),
      // normals: ETC1S in normal-map mode (UASTC measured 1.6x larger and ~40x slower to encode for this set)
      ktx2({ slots: /^normalTexture$/, isUASTC: false, qualityLevel: tier === 'high' ? 255 : 200, isNormalMap: true,
        isPerceptual: false, generateMipmap: true, imageDecoder }),
      ktx2({ slots: /^(occlusionTexture|metallicRoughnessTexture)$/, isUASTC: false, qualityLevel: 200,
        isPerceptual: false, generateMipmap: true, imageDecoder }),
      draco({ method: 'edgebreaker', quantizePosition: 16, quantizeNormal: 12, quantizeTexcoord: 14 }),
    )
    const used = new Set()
    for (const t of doc.getRoot().listTextures()) {
      const hash = pending.get(t)
      if (hash === undefined) continue
      let name = (t.getName() || 'tex').replace(/[^\w-]+/g, '_')
      if (used.has(name)) name += '_' + hash
      used.add(name)
      const uri = `tex/${name}.ktx2`
      t.setURI(uri)
      encoded.set(hash, { uri, bytes: t.getImage() })
      writeFileSync(join(cacheDir, hash + '.ktx2'), t.getImage())
    }
    // models whose textures were all cache hits never ran the KTX2 transform - declare the extension explicitly
    if (doc.getRoot().listTextures().some((t) => t.getMimeType() === 'image/ktx2')) {
      doc.createExtension(KHRTextureBasisu).setRequired(true)
    }
    doc.getRoot().listBuffers().forEach((b) => b.setURI(f.replace('.glb', '.bin')))
    const outFile = join(out, f.replace('.glb', '.gltf'))
    if (existsSync(join(out, f))) rmSync(join(out, f))           // the old embedded-texture GLB
    await io.write(outFile, doc)
    const kb = (p) => Math.round(statSync(p).size / 1024)
    console.log(`${tier.padEnd(6)} ${f.padEnd(18)} ${String(kb(join(src, f))).padStart(6)} KB -> ${String(kb(outFile) + kb(outFile.replace('.gltf', '.bin'))).padStart(6)} KB + shared textures  (${((Date.now() - t0) / 1000).toFixed(1)} s)`)
  }
  const texKb = readdirSync(join(out, 'tex')).reduce((a, n) => a + statSync(join(out, 'tex', n)).size, 0) / 1024
  console.log(`${tier.padEnd(6)} shared textures: ${Math.round(texKb)} KB`)
}
