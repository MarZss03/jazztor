// Angles (deg, about the vertical) from the Toronto window's centre to the window normal, the CN Tower and the
// skyline's centre of mass (by building volume) - to aim the outside view.
import { chromium } from 'playwright-core'
const browser = await chromium.launch({ channel: 'msedge', headless: true, args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist', '--force_high_performance_gpu'] })
const page = await browser.newPage({ viewport: { width: 1600, height: 900 } })
await page.goto(process.env.JT_URL ?? 'http://localhost:5174/', { waitUntil: 'commit' })
await page.waitForFunction(() => window.__jazz?.museumScene?.getObjectByName('JT_Mus_Outside'), null, { timeout: 180000 })
console.log(await page.evaluate(() => {
  const { museumScene: s, THREE } = window.__jazz
  s.updateMatrixWorld(true)
  const g = s.getObjectByName('JT_Mus_TorWindowGlass')
  const c = new THREE.Box3().setFromObject(g).getCenter(new THREE.Vector3())
  const ang = (p) => +(THREE.MathUtils.radToDeg(Math.atan2(p.x - c.x, -(p.z - c.z)))).toFixed(1) // 0 = -z (north), + = east
  const out = s.getObjectByName('JT_Mus_Outside')
  const tower = s.getObjectByName('JT_CNTower_Core')
  const tp = new THREE.Box3().setFromObject(tower).getCenter(new THREE.Vector3())
  const root = out.position
  const res = { windowCentre: c.toArray().map((v) => +v.toFixed(2)), outsideRoot: root.toArray().map((v) => +v.toFixed(2)),
    tower: ang(tp), towerDist: +tp.clone().sub(c).length().toFixed(0) }
  for (const n of ['JT_Skyline_Glass_1', 'JT_Skyline_Concrete_1', 'JT_Skyline_Dark_1']) {
    const o = s.getObjectByName(n); const pos = o.geometry.attributes.position; const v = new THREE.Vector3(); const angs = []
    for (let i = 0; i < pos.count; i += 37) { v.fromBufferAttribute(pos, i).applyMatrix4(o.matrixWorld); angs.push(ang(v)) }
    angs.sort((a, b) => a - b)
    res[n] = [angs[Math.floor(angs.length * 0.1)], angs[Math.floor(angs.length * 0.5)], angs[Math.floor(angs.length * 0.9)]]
  }
  return JSON.stringify(res)
}))
await browser.close()
