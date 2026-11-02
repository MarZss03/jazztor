// From the guided Toronto view (and two free-walk spots), which compass directions show through the window?
import { chromium } from 'playwright-core'
const browser = await chromium.launch({ channel: 'msedge', headless: true, args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist', '--force_high_performance_gpu'] })
const page = await browser.newPage({ viewport: { width: 1600, height: 900 } })
await page.goto(process.env.JT_URL ?? 'http://localhost:5174/', { waitUntil: 'commit' })
await page.waitForFunction(() => window.__jazz?.useJazz.getState().loaded, null, { timeout: 120000 })
await page.getByRole('button', { name: 'MUSEUM', exact: true }).click()
await page.waitForFunction(() => window.__jazz.useJazz.getState().museumRoom === 'vestibule' && !window.__jazz.museumState.busy, null, { timeout: 120000 })
await page.evaluate(() => window.__jazz.museum.go('toronto'))
await page.waitForFunction(() => window.__jazz.useJazz.getState().museumRoom === 'toronto' && !window.__jazz.museumState.busy, null, { timeout: 20000 })
console.log(await page.evaluate(() => {
  const { museumScene: s, museumCamera: cam, THREE } = window.__jazz
  const b = new THREE.Box3().setFromObject(s.getObjectByName('JT_Mus_TorWindowGlass'))
  const ang = (from, x, z) => +THREE.MathUtils.radToDeg(Math.atan2(x - from.x, -(z - from.z))).toFixed(1)
  const spots = { guided: cam.position.clone(), centreOfWing: new THREE.Vector3(403.4, 1.62, -8.7), nearWindow: new THREE.Vector3(405.15, 1.62, -9.6) }
  return JSON.stringify(Object.fromEntries(Object.entries(spots).map(([k, p]) => [k, [ang(p, b.min.x, b.min.z), ang(p, b.max.x, b.min.z)]])))
}))
await browser.close()
