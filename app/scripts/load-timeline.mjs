// Where does page-load time go? Navigation -> scene mounted -> first frames -> loaded, with long frames and programs.
import { chromium } from 'playwright-core'

const browser = await chromium.launch({ channel: 'msedge', headless: true,
  args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist', '--force_high_performance_gpu'] })
const page = await browser.newPage({ viewport: { width: 1600, height: 900 } })
await page.addInitScript(() => {
  window.__lt = []
  let last = 0
  const f = (t) => {
    if (last && t - last > 80) window.__lt.push(['frame', Math.round(last), Math.round(t - last), window.__jazz?.gl?.info?.programs?.length ?? 0])
    last = t
    requestAnimationFrame(f)
  }
  requestAnimationFrame(f)
})
const t0 = Date.now()
await page.goto(process.env.JT_URL ?? 'http://localhost:5174/', { waitUntil: 'commit' })
await page.waitForFunction(() => window.__jazz?.useJazz.getState().loaded, null, { timeout: 120000 })
console.log('loaded after', Date.now() - t0, 'ms (wall)', 'museum built at', await page.evaluate(() => Math.round(window.__museumBuiltAt ?? -1)), 'loaded at', await page.evaluate(() => Math.round(performance.now())))
const res = await page.evaluate(() => ({ lt: window.__lt, nav: performance.getEntriesByType('navigation')[0]?.duration,
  res: performance.getEntriesByType('resource').map((r) => [r.name.split('/').slice(-2).join('/'), Math.round(r.startTime), Math.round(r.responseEnd), r.transferSize])
    .sort((a, b) => b[2] - a[2]).slice(0, 12), now: Math.round(performance.now()) }))
console.log('now', res.now, 'long frames (start, ms, programs):', JSON.stringify(res.lt))
console.log('latest resources (name, start, end, bytes):')
for (const r of res.res) console.log('  ', r.join('  '))
await browser.close()
