// Where is the placard, and what covers it? Lists the placard meshes and every mesh whose box overlaps them.
import { chromium } from 'playwright-core'

const browser = await chromium.launch({ channel: 'msedge', headless: true,
  args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist', '--force_high_performance_gpu'] })
const page = await browser.newPage({ viewport: { width: 1600, height: 900 } })
await page.goto(process.env.JT_URL ?? 'http://localhost:5174/', { waitUntil: 'commit' })
await page.waitForFunction(() => window.__jazz?.useJazz.getState().loaded, null, { timeout: 120000 })
await page.waitForFunction(() => window.__jazz?.museumScene, null, { timeout: 60000 })
const out = await page.evaluate(() => {
  const { museumScene: s, THREE } = window.__jazz
  s.updateMatrixWorld(true)
  const r = (v) => v.toArray().map((x) => +x.toFixed(3))
  const res = {}
  for (const name of ['JT_Mus_WorldPlacard', 'JT_Mus_TorPlacard']) {
    const p = s.getObjectByName(name)
    if (!p) { res[name] = 'missing'; continue }
    const box = new THREE.Box3().setFromObject(p)
    const hits = []
    s.traverse((o) => {
      if (!o.isMesh || o === p) return
      const b = new THREE.Box3().setFromObject(o)
      if (b.intersectsBox(box.clone().expandByScalar(0.02))) hits.push([o.name, o.visible, r(b.min), r(b.max), o.material?.name])
    })
    res[name] = { visible: p.visible, parentVisible: p.parent?.visible, min: r(box.min), max: r(box.max), mat: p.material?.type, map: !!p.material?.map,
      side: p.material?.side, verts: p.geometry.attributes.position.count, uv: !!p.geometry.attributes.uv, hits }
  }
  return res
})
console.log(JSON.stringify(out, null, 1))
await browser.close()
