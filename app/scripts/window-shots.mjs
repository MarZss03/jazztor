// The home window from several viewports and stations (looking for gaps in the layered Toronto backdrop).
import { chromium } from 'playwright-core'
import { mkdirSync } from 'node:fs'

const OUT = (process.argv[2] ?? 'D:/Jazztor/blender/renders/web/window') + '/'
mkdirSync(OUT, { recursive: true })
const browser = await chromium.launch({ channel: 'msedge', headless: true,
  args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist', '--force_high_performance_gpu'] })
for (const [w, h] of (process.env.SIZES ? JSON.parse(process.env.SIZES) : [[2560, 1080], [1280, 1024], [900, 1300], [1600, 900]])) {
  const page = await browser.newPage({ viewport: { width: w, height: h } })
  await page.goto(`${process.env.JT_URL ?? 'http://localhost:5174/'}?quality=high`, { waitUntil: 'commit' })
  await page.waitForFunction(() => window.__jazz?.useJazz.getState().loaded, null, { timeout: 120000 })
  await page.evaluate(() => window.__jazz.useJazz.getState().set({ timeSetting: 'DAY', resolvedMode: 'DAY', reducedMotion: true }))
  for (const st of w === 1600 ? ['home', 'platter', 'cabinet', 'map'] : ['home']) {
    await page.evaluate((s) => window.__jazz.useJazz.getState().set({ station: s, mapRequested: true }), st)
    await page.waitForTimeout(st === 'map' ? 8000 : 3000)
    // pointer parallax at the extremes of the window too
    if (st === 'home') { await page.mouse.move(w - 5, 5); await page.waitForTimeout(800) }
    await page.screenshot({ path: `${OUT}${st}-${w}x${h}.png` })
    console.log('shot', st, w, h)
  }
  await page.close()
}
await browser.close()
