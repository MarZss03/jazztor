// The time switch inside the museum: click DAY / DUSK / NIGHT in the Toronto wing and shoot the window each time.
//   node scripts/museum-time.mjs [high|low]
import { chromium } from 'playwright-core'
import { mkdirSync } from 'node:fs'

const Q = process.argv[2] ?? 'high'
const OUT = `D:/Jazztor/blender/renders/web/museum-time-${Q}/`
mkdirSync(OUT, { recursive: true })
const browser = await chromium.launch({ channel: 'msedge', headless: true,
  args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist', ...(Q === 'low' ? [] : ['--force_high_performance_gpu'])] })
const page = await browser.newPage({ viewport: { width: 1600, height: 900 } })
const errors = []
page.on('pageerror', (e) => errors.push(String(e.stack).slice(0, 500)))
await page.goto(`${process.env.JT_URL ?? 'http://localhost:5174/'}?quality=${Q}`, { waitUntil: 'commit' })
await page.waitForFunction(() => window.__jazz?.useJazz.getState().loaded, null, { timeout: 120000 })
await page.getByRole('button', { name: 'MUSEUM', exact: true }).click()
await page.waitForFunction(() => window.__jazz.useJazz.getState().museumRoom === 'vestibule' && !window.__jazz.museumState.busy, null, { timeout: 120000 })
await page.evaluate(() => window.__jazz.museum.go('toronto'))
await page.waitForFunction(() => window.__jazz.useJazz.getState().museumRoom === 'toronto' && !window.__jazz.museumState.busy, null, { timeout: 20000 })
for (const mode of ['DAY', 'DUSK', 'NIGHT']) {
  await page.getByRole('radio', { name: mode }).click()
  await page.waitForTimeout(3500)
  const st = await page.evaluate(() => ({ setting: window.__jazz.useJazz.getState().timeSetting, mode: window.__jazz.useJazz.getState().resolvedMode }))
  console.log(mode, JSON.stringify(st))
  await page.screenshot({ path: `${OUT}${mode.toLowerCase()}.png` })
}
console.log('errors', errors.length ? errors.join('\n') : 'none')
await browser.close()
