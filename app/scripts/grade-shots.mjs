// Museum grade look-dev: shoots the vestibule and a silver instrument under several candidate museum looks.
import { chromium } from 'playwright-core'
import { mkdirSync } from 'node:fs'
const OUT = 'D:/Jazztor/blender/renders/web/grade/'
mkdirSync(OUT, { recursive: true })
const browser = await chromium.launch({ channel: 'msedge', headless: true, args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist', '--force_high_performance_gpu'] })
const page = await browser.newPage({ viewport: { width: 1600, height: 900 } })
await page.goto(process.env.JT_URL ?? 'http://localhost:5174/', { waitUntil: 'commit' })
await page.waitForFunction(() => window.__jazz?.useJazz.getState().loaded, null, { timeout: 120000 })
await page.getByRole('button', { name: 'MUSEUM', exact: true }).click()
await page.waitForFunction(() => window.__jazz.useJazz.getState().museumRoom === 'vestibule' && !window.__jazz.museumState.busy, null, { timeout: 120000 })
const looks = {
  a: { gain: [0.86, 0.97, 1.16], sat: 0.93, contrast: 1.1, lift: 0.004 },
  b: { gain: [0.8, 0.96, 1.3], sat: 0.88, contrast: 1.12, lift: 0.004 },
  c: { gain: [0.76, 0.95, 1.42], sat: 0.82, contrast: 1.14, lift: 0.005 },
}
for (const [k, v] of Object.entries(looks)) {
  await page.evaluate((l) => Object.assign(window.__jazzLooks.museum, l), v)
  await page.waitForTimeout(2500)
  await page.screenshot({ path: `${OUT}vestibule-${k}.png` })
}
await page.evaluate(() => window.__jazz.museum.viewInstrument('gillespie'))
await page.waitForFunction(() => !window.__jazz.museumState.busy, null, { timeout: 20000 })
for (const [k, v] of Object.entries(looks)) {
  await page.evaluate((l) => Object.assign(window.__jazzLooks.museum, l), v)
  await page.waitForTimeout(2500)
  await page.screenshot({ path: `${OUT}gillespie-${k}.png`, clip: { x: 200, y: 150, width: 800, height: 560 } })
}
await browser.close()
