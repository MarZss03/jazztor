// Home view look-dev: DAY / DUSK / NIGHT at 1600x900 (high tier), lamp at its default.
//   node scripts/home-shots.mjs [out-dir]
import { chromium } from 'playwright-core'
import { mkdirSync } from 'node:fs'

const OUT = (process.argv[2] ?? 'D:/Jazztor/blender/renders/web/home') + '/'
mkdirSync(OUT, { recursive: true })
const browser = await chromium.launch({ channel: 'msedge', headless: true,
  args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist', '--force_high_performance_gpu'] })
const page = await browser.newPage({ viewport: { width: 1600, height: 900 } })
page.on('pageerror', (e) => console.log('PAGEERROR', String(e).slice(0, 300)))
await page.goto(`${process.env.JT_URL ?? 'http://localhost:5174/'}?quality=${process.env.Q ?? 'high'}`, { waitUntil: 'commit' })
await page.waitForFunction(() => window.__jazz?.useJazz.getState().loaded, null, { timeout: 120000 })
for (const mode of ['DAY', 'DUSK', 'NIGHT']) {
  await page.evaluate((m) => window.__jazz.useJazz.getState().set({ timeSetting: m, resolvedMode: m, reducedMotion: true }), mode)
  await page.waitForTimeout(3500)
  await page.screenshot({ path: `${OUT}home-${mode.toLowerCase()}.png` })
  console.log('shot', mode)
}
await browser.close()
