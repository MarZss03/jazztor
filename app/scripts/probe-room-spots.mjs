// Where do candidate spots land in the home and cabinet views? (screen px; off-screen if outside 0..1600 x 0..780)
import { chromium } from 'playwright-core'
const browser = await chromium.launch({ channel: 'msedge', headless: true, args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist', '--force_high_performance_gpu'] })
const page = await browser.newPage({ viewport: { width: 1600, height: 900 } })
await page.goto(process.env.JT_URL ?? 'http://localhost:5174/', { waitUntil: 'commit' })
await page.waitForFunction(() => window.__jazz?.useJazz.getState().loaded, null, { timeout: 120000 })
const spots = { shelfTopL: [-0.62, 1.09, -2.18], shelfTopR: [-0.42, 1.09, -2.18], consoleL: [-0.55, 0.74, 0.25], consoleBackL: [-0.5, 0.74, -0.2],
  floorCol: [-0.05, 0.3, -1.7], floorColTop: [-0.05, 0.75, -1.7], consoleFrontL: [-0.45, 0.74, 0.45], consoleR: [0.9, 0.74, 0.0], cabinetTopL: [-1.9, 0.72, -2.15],
  sillL: [0.6, 0.1, -2.3], sillLtop: [0.6, 0.72, -2.3] }
for (const st of ['home', 'cabinet']) {
  await page.evaluate((s) => window.__jazz.useJazz.getState().set({ station: s }), st)
  await page.waitForTimeout(2500)
  const out = await page.evaluate((sp) => Object.fromEntries(Object.entries(sp).map(([k, [x, y, z]]) => { const p = window.__jazz.projectWorld(x, y, z); return [k, [Math.round(p.x), Math.round(p.y)]] })), spots)
  console.log(st, JSON.stringify(out))
}
await browser.close()
