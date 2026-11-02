// Night look-dev: home, record (platter) and map views at NIGHT with the lamp on and off.
//   node scripts/night-shots.mjs [out-dir]
import { chromium } from 'playwright-core'
import { mkdirSync } from 'node:fs'

const OUT = (process.argv[2] ?? 'D:/Jazztor/blender/renders/web/night') + '/'
mkdirSync(OUT, { recursive: true })
const browser = await chromium.launch({ channel: 'msedge', headless: true,
  args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist', '--force_high_performance_gpu'] })
const page = await browser.newPage({ viewport: { width: 1600, height: 900 } })
page.on('pageerror', (e) => console.log('PAGEERROR', String(e).slice(0, 300)))
await page.goto(`${process.env.JT_URL ?? 'http://localhost:5174/'}?quality=high`, { waitUntil: 'commit' })
await page.waitForFunction(() => window.__jazz?.useJazz.getState().loaded, null, { timeout: 120000 })
const set = (p) => page.evaluate((x) => window.__jazz.useJazz.getState().set(x), p)
await set({ timeSetting: 'NIGHT', resolvedMode: 'NIGHT', reducedMotion: true })
for (const [station, lamp] of [['home', 0.7], ['platter', 0.7], ['platter', 0], ['map', 0.7], ['map', 0]]) {
  await set({ station, lampLevel: lamp, mapRequested: true })
  await page.waitForTimeout(station === 'map' ? 9000 : 4000)
  await page.screenshot({ path: `${OUT}${station}-lamp${lamp ? 'on' : 'off'}.png` })
  console.log('shot', station, lamp)
}
await browser.close()
