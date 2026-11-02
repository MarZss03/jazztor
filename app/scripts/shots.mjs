// Comparison screenshots: Home in Day / Dusk / Night at 2560x1440 and 3840x2160 (RTX, high tier).
// Usage (inside Use-JazztorEnv): node scripts/shots.mjs <out-dir> [url]
import { chromium } from 'playwright-core'
import { mkdirSync } from 'node:fs'

const out = process.argv[2] ?? 'D:/Jazztor/reports/shots'
const url = process.argv[3] ?? process.env.JT_URL ?? 'http://127.0.0.1:5174/'
mkdirSync(out, { recursive: true })
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const browser = await chromium.launch({ channel: 'msedge', headless: true,
  args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist', '--force_high_performance_gpu'] })
const timings = []
for (const [w, h] of [[2560, 1440], [3840, 2160]]) {
  const page = await browser.newPage({ viewport: { width: w, height: h } })
  page.on('pageerror', (e) => console.log('pageerror', String(e).slice(0, 300)))
  const t0 = Date.now()
  await page.goto(`${url}?quality=high`, { waitUntil: 'commit' })
  await page.waitForFunction(() => window.__jazz?.useJazz.getState().loaded, null, { timeout: 180000 })
  timings.push(`${w}x${h} loaded in ${((Date.now() - t0) / 1000).toFixed(1)} s`)
  await sleep(6000) // let shader compilation / texture uploads settle so the first crossfade runs at full rate
  for (const mode of ['DAY', 'DUSK', 'NIGHT']) {
    await page.evaluate((m) => window.__jazz.useJazz.getState().set({ timeSetting: m, lampLevel: m === 'DAY' ? 0 : 0.7 }), mode)
    await sleep(4500)
    await page.screenshot({ path: `${out}/home-${mode.toLowerCase()}-${w}.png` })
  }
  const fps = await page.evaluate(() => new Promise((r) => {
    let n = 0
    const t = performance.now()
    const f = () => (++n, performance.now() - t < 3000 ? requestAnimationFrame(f) : r(n / ((performance.now() - t) / 1000)))
    requestAnimationFrame(f)
  }))
  timings.push(`${w}x${h} ${fps.toFixed(1)} fps (${(1000 / fps).toFixed(1)} ms/frame)`)
  await page.close()
}
await browser.close()
console.log(timings.join('\n'))
