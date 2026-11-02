// What is in front of the camera in a placard reading view? Raycasts a few screen points and lists the hits.
import { chromium } from 'playwright-core'

const WING = process.argv[2] ?? 'world'
const browser = await chromium.launch({ channel: 'msedge', headless: true,
  args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist', '--force_high_performance_gpu'] })
const page = await browser.newPage({ viewport: { width: 1600, height: 900 } })
await page.goto(process.env.JT_URL ?? 'http://localhost:5174/', { waitUntil: 'commit' })
await page.waitForFunction(() => window.__jazz?.useJazz.getState().loaded, null, { timeout: 120000 })
await page.getByRole('button', { name: 'MUSEUM', exact: true }).click()
await page.waitForFunction(() => window.__jazz.useJazz.getState().station === 'museum' && !window.__jazz.museumState.busy, null, { timeout: 120000 })
await page.evaluate((w) => window.__jazz.museum.go(`${w}-read`), WING)
await page.waitForFunction((w) => window.__jazz.useJazz.getState().museumRoom === `${w}-read` && !window.__jazz.museumState.busy, WING, { timeout: 20000 })
await page.waitForTimeout(800)
const out = await page.evaluate(() => {
  const { museumScene: s, museumCamera: cam, THREE } = window.__jazz
  const ray = new THREE.Raycaster()
  const res = {}
  for (const [x, y] of [[-0.8, 0.8], [-0.5, 0.5], [-0.2, 0.2], [0, 0]]) {
    ray.setFromCamera(new THREE.Vector2(x, y), cam)
    res[`${x},${y}`] = ray.intersectObject(s, true).slice(0, 4).map((h) => [h.object.name, +h.distance.toFixed(3), h.object.parent?.name, h.object.visible])
  }
  return { cam: cam.position.toArray().map((v) => +v.toFixed(3)), res }
})
console.log(JSON.stringify(out, null, 1))
await browser.close()
