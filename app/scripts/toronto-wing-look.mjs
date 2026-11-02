// Look around the Toronto wing in free walk: the window (night + day), the right (outer) wall, and the World wing's bench.
import { chromium } from 'playwright-core'
import { mkdirSync } from 'node:fs'

const OUT = 'D:/Jazztor/blender/renders/web/toronto-wing/'
mkdirSync(OUT, { recursive: true })
const browser = await chromium.launch({ channel: 'msedge', headless: true,
  args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist', '--force_high_performance_gpu'] })
const page = await browser.newPage({ viewport: { width: 1600, height: 900 } })
await page.goto(`${process.env.JT_URL ?? 'http://localhost:5174/'}?quality=high`, { waitUntil: 'commit' })
await page.waitForFunction(() => window.__jazz?.useJazz.getState().loaded, null, { timeout: 120000 })
await page.evaluate(() => window.__jazz.useJazz.getState().set({ timeSetting: 'NIGHT' }))
await page.getByRole('button', { name: 'MUSEUM', exact: true }).click()
await page.waitForFunction(() => window.__jazz.useJazz.getState().museumRoom === 'vestibule' && !window.__jazz.museumState.busy, null, { timeout: 120000 })
await page.getByRole('button', { name: 'Explore freely' }).click()
await page.waitForTimeout(400)
const put = (x, y, yaw, pitch = -0.05) => page.evaluate(([x, y, yaw, pitch]) => Object.assign(window.__jazz.museumWalkState(), { x, y, yaw, pitch, vx: 0, vy: 0 }), [x, y, yaw, pitch])
const views = {
  'tor-window': [3.2, 7.4, 0.6], 'tor-at-window': [4.75, 9.4, 0], 'tor-right-wall': [3.4, 8.7, 1.57], 'tor-back': [3.4, 7.4, 0], 'tor-left': [3.4, 8.7, -1.57],
  'world-bench': [-3.0, 7.4, -0.2], 'world-overview': [-1.3, 7.3, -1.0],
}
for (const [n, [x, y, yaw]] of Object.entries(views)) {
  await put(x, y, yaw)
  await page.waitForTimeout(1200)
  await page.screenshot({ path: `${OUT}${n}.png` })
}
await page.evaluate(() => window.__jazz.useJazz.getState().set({ timeSetting: 'DAY' }))
await put(3.2, 7.4, 0.6)
await page.waitForTimeout(3000)
await page.screenshot({ path: `${OUT}tor-window-day.png` })
await browser.close()
