// Scans the pointer across the cabinet's sleeves and prints which sleeve each pixel hovers: every record on the
// shelf must own a reachable strip. Also prints each sleeve collider's screen box.
import { chromium } from 'playwright-core'

const browser = await chromium.launch({ channel: 'msedge', headless: true,
  args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist', '--force_high_performance_gpu'] })
const page = await browser.newPage({ viewport: { width: 1600, height: 900 } })
await page.goto(process.env.JT_URL ?? 'http://localhost:5174/', { waitUntil: 'commit' })
await page.waitForFunction(() => window.__jazz?.useJazz.getState().loaded, null, { timeout: 120000 })
await page.evaluate(() => window.__jazz.useJazz.getState().set({ crate: 'FOR_YOU', station: 'cabinet' }))
await page.waitForTimeout(3500)
const boxes = await page.evaluate(() => {
  const { scene, THREE, projectWorld } = window.__jazz
  return Array.from({ length: 8 }, (_, i) => {
    const o = scene.getObjectByName(`COL_Sleeve_${String(i + 1).padStart(3, '0')}`)
    const b = new THREE.Box3().setFromObject(o)
    const pts = []
    for (const x of [b.min.x, b.max.x]) for (const y of [b.min.y, b.max.y]) for (const z of [b.min.z, b.max.z]) pts.push(projectWorld(x, y, z))
    const xs = pts.map((p) => p.x), ys = pts.map((p) => p.y)
    return { i, x0: Math.round(Math.min(...xs)), x1: Math.round(Math.max(...xs)), y0: Math.round(Math.min(...ys)), y1: Math.round(Math.max(...ys)),
      w: +(b.max.x - b.min.x).toFixed(3), d: +(b.max.z - b.min.z).toFixed(3) }
  })
})
console.log(JSON.stringify(boxes))
const y = Math.round((boxes[0].y0 + boxes[0].y1) / 2)
const x0 = Math.min(...boxes.map((b) => b.x0)) - 10
const x1 = Math.max(...boxes.map((b) => b.x1)) + 10
const runs = []
for (let x = x0; x <= x1; x += 2) {
  await page.mouse.move(x, y)
  await page.waitForTimeout(25)
  const h = await page.evaluate(() => window.__jazz.useJazz.getState().hovered)
  if (!runs.length || runs.at(-1)[0] !== h) runs.push([h, x, x]); else runs.at(-1)[2] = x
}
console.log('y', y, runs.map(([h, a, b]) => `${h ?? '-'}:${a}-${b}`).join('  '))
await browser.close()
