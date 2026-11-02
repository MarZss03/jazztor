// Paints the museum skyline in flat colours (facades light, roofs mid, land/water/trees distinct) to see its geometry
// through the Toronto window, and prints each part's world bounds.
import { chromium } from 'playwright-core'
const OUT = 'D:/Jazztor/blender/renders/web/toronto-window/'
const browser = await chromium.launch({ channel: 'msedge', headless: true, args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist', '--force_high_performance_gpu'] })
const page = await browser.newPage({ viewport: { width: 1600, height: 900 } })
await page.goto(`${process.env.JT_URL ?? 'http://localhost:5174/'}?quality=high`, { waitUntil: 'commit' })
await page.waitForFunction(() => window.__jazz?.useJazz.getState().loaded, null, { timeout: 120000 })
await page.getByRole('button', { name: 'MUSEUM', exact: true }).click()
await page.waitForFunction(() => window.__jazz.useJazz.getState().station === 'museum' && !window.__jazz.museumState.busy, null, { timeout: 120000 })
await page.evaluate(() => window.__jazz.museum.go('toronto'))
await page.waitForFunction(() => window.__jazz.useJazz.getState().museumRoom === 'toronto' && !window.__jazz.museumState.busy, null, { timeout: 20000 })
await page.waitForTimeout(1200)
console.log(await page.evaluate(() => {
  const { museumScene: s, THREE } = window.__jazz
  const rows = []
  s.getObjectByName('JT_Mus_Outside').traverse((o) => {
    if (!o.isMesh || !o.name) return
    const b = new THREE.Box3().setFromObject(o)
    const f = (v) => v.toArray().map((x) => +x.toFixed(1)).join(',')
    if (/Skyline_(Concrete|Dark|Glass)_1|Land|Water|Trees|Dome|CNTower_Core/.test(o.name)) rows.push(`${o.name.padEnd(24)} ${f(b.min)} .. ${f(b.max)}`)
    const col = /Facade/.test(o.material.name) ? '#f2e6c8' : /Roof/.test(o.material.name) ? '#a08060' : /Land/.test(o.material.name) ? '#30a030' : /Water/.test(o.material.name) ? '#2040ff' : /Trees/.test(o.material.name) ? '#106010' : null
    if (col) o.material = new THREE.MeshBasicMaterial({ color: col })
  })
  return rows.join('\n')
}))
await page.waitForTimeout(600)
await page.screenshot({ path: `${OUT}silhouette.png` })
await browser.close()
