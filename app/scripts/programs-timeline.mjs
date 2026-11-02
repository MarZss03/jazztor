// When does each shader program first appear (and which material)? Idle in the room for N ms after load.
import { chromium } from 'playwright-core'

const MS = Number(process.argv[2] ?? 22000)
const browser = await chromium.launch({ channel: 'msedge', headless: true,
  args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist', '--force_high_performance_gpu'] })
const page = await browser.newPage({ viewport: { width: 1600, height: 900 } })
await page.goto(process.env.JT_URL ?? 'http://localhost:5174/', { waitUntil: 'commit' })
await page.waitForFunction(() => window.__jazz?.gl, null, { timeout: 120000 })
await page.evaluate((v) => { window.__lfThreshold = v }, Number(process.env.LF ?? 100))
const t0 = await page.evaluate(() => performance.now())
const rows = await page.evaluate((ms) => new Promise((done) => {
  const seen = new Set()
  const out = []
  let last = performance.now()
  const f = () => {
    const now = performance.now()
    for (const p of window.__jazz.gl.info.programs ?? []) {
      if (seen.has(p)) continue
      seen.add(p)
      out.push([Math.round(now), p.name, p.cacheKey.split(',').slice(0, 3).join(',').slice(0, 60)])
    }
    if (now - last > Number(window.__lfThreshold ?? 100)) out.push([Math.round(now), "--- long frame", Math.round(now - last) + " ms"])
    last = now
    if (now - t > ms) done(out)
    else requestAnimationFrame(f)
  }
  const t = performance.now()
  requestAnimationFrame(f)
}), MS)
for (const r of rows) console.log(String(r[0] - Math.round(t0)).padStart(6), r[1], r[2])
await browser.close()
